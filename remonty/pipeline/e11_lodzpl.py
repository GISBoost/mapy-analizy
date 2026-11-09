"""E11: traffic restrictions ("utrudnienia") from the city road-works page lodz.pl/remonty (UTRUDNIENIA.md).

Usage:  py e11_lodzpl.py --fetch     download today's snapshot into work/lodzpl/, then build
        py e11_lodzpl.py             rebuild from cached snapshots + ../utrudnienia_seed.json
Output: work/lodzpl/observations.jsonl (append-only, one line per new card version),
        work/utrudnienia.json (current restrictions), work/needs_review.csv
One card = one <article> on the page; one restriction = one relation x one traffic_impact.
Nothing is guessed: unknown lanes/dates stay null, ambiguous cards go to needs_review.
"""
import csv, datetime as dt, hashlib, html, json, re, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "work"
SNAP = WORK / "lodzpl"
URL = "https://lodz.pl/remonty/"
UA = "GISBoost-mapy-analizy/1.0 (road-works research; github.com/GISBoost/mapy-analizy)"
PARSER = "e11-v1"

MONTHS = {m: i + 1 for i, m in enumerate("stycz lut mar kwie maj czerw lip sierp wrze paźdz listop grud".split())}
SEASON = {"wiosna": "03", "lato": "06", "jesień": "09", "zima": "12"}


# ---------- fetch ----------

def fetch():
    SNAP.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            body = urllib.request.urlopen(req, timeout=30).read()
            break
        except OSError:
            if attempt == 2:
                raise
            time.sleep(5 * (attempt + 1))
    now = dt.datetime.now().astimezone()
    p = SNAP / f"{now:%Y%m%dT%H%M%S}.html"
    p.write_bytes(body)
    print("saved", p.name, len(body), "bytes")
    return p


# ---------- parse ----------

def text(s):
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(html.unescape(s))  # page double-escapes some <font> tags
    s = re.sub(r"<[^>]+>", " ", s).replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


LABELS = [("utr", r"zakres utrudnie[ńn]|zmiany w ruchu|utrudnienia"), ("prace", r"zakres prac"),
          ("terminy", r"termin(y)? prac"), ("inwestor", r"inwestor")]


def parse_cards(page):
    """Split the page into cards: {card_id, section, heading, opis, utr[], prace[], terminy[], inwestor}."""
    sections = [(m.start(), text(m.group(1))) for m in re.finditer(r'<h[23] class="[^"]*section-header[^"]*">(.*?)</h[23]>', page, re.S)]
    cards = []
    for m in re.finditer(r'<article[^>]*\bid="(c\d+)"[^>]*>(.*?)</article>', page, re.S):
        sec = next((s for pos, s in reversed(sections) if pos < m.start()), None)
        head = re.search(r'accordion-item-heading[^>]*>(.*?)<span class="icon', m.group(2), re.S)
        body = re.search(r'accordion-item-body[^>]*>(.*)', m.group(2), re.S)
        if not head or not body:
            continue
        c = dict(card_id=m.group(1), section=sec, heading=text(head.group(1)), opis="", utr=[], prace=[], terminy=[], inwestor="")
        key, labelled, items = "opis", False, []
        # walk block elements in order; a <p><strong>Label:</strong></p> switches the current field
        for blk in re.finditer(r"<(p|li)\b[^>]*>(.*?)</\1>", body.group(1), re.S):
            t = text(blk.group(2))
            if not t:
                continue
            if blk.group(1) == "li" and key == "opis":
                items.append(t)
            lab = next((k for k, rx in LABELS if re.fullmatch(rf"(?:{rx})\s*:?", t, re.I)), None)
            if lab:
                key, labelled = lab, True
                continue
            lab_inline = next((k for k, rx in LABELS if re.match(rf"(?:{rx})\s*:", t, re.I)), None)
            if lab_inline:  # "Zakres utrudnień: ..." in one paragraph
                key, t = lab_inline, t.split(":", 1)[1].strip()
                if not t:
                    continue
            if key == "opis":
                c["opis"] = (c["opis"] + " " + t).strip()
            elif key == "inwestor":
                c["inwestor"] = (c["inwestor"] + " " + t).strip()
            else:
                c[key].append(t)
        if not labelled and re.search(r"remont|prace|zmiany w ruchu|aktualiz", c["section"] or "", re.I) \
                and not re.search(r"projekt", c["section"] or "", re.I):
            # pre-April-2026 layout (Wayback snapshots): free text, traffic in <li> or in the paragraph itself
            c["legacy"] = True
            sents = list(sentences([c["opis"]]))
            c["utr"] = items or [s for s in sents if classify([s]) or UNDER_TRAFFIC.search(s)]
            c["terminy"] = [s for s in sents if re.search(r"\b(od|start|rozpocz|zakończ|potrwa|do końca)\b.*\b(\d{1,2}\.\d{1,2}|\d{4}|" + "|".join(MONTHS) + r")", s, re.I)]
        cards.append(c)
    return cards


def is_card(c):
    return bool(c["utr"] or c["prace"] or c["terminy"] or c["inwestor"])


# ---------- classify ----------

# (rule_id, regex on one sentence of "Zakres utrudnień", traffic_impact, lanes_open, lanes_closed)
# Order matters: the first match wins for a sentence. Patterns are matched on lower-cased text.
RULES = [
    ("wahadlo", r"wahadł|na wahadle", "alternating_traffic", None, None),
    ("tymczasowa", r"jezdni[aęą] tymczasow|tymczasow\w* jezdni", "temporary_carriageway", None, None),
    ("bez_dojazdu", r"bez (wjazd|dojazd)\w* docelow", "full_closure", None, None),
    ("dojazd", r"(wjazd|dojazd)\w* docelow", "local_access_only", None, None),
    ("brak_utrudnien", r"brak utrudnień|nie ma utr\w*dnień|bez zmian w ruchu|przejazd bez zmian", "no_impact", None, None),
    ("brak_przejazdu", r"brak (możliwości )?przejazdu", "full_closure", None, None),
    ("zamkniecie", r"(?<!nie )zamknię(ta|ty|te|cie)\b(?!.*\bpas)", "full_closure", None, None),
    ("skret", r"(brak możliwości|zakaz) skrętu|bez możliwości skrętu|nie będzie możliwości [\w ]*skrętu", "turn_ban", None, None),
    ("jeden_kierunek", r"tylko w jednym kierunku|jednokierunkow|w jednym kierunku", "one_direction_only", None, None),
    ("zmienne_pasy", r"raz \w+ pas\w*,? raz|jeden lub dwa pas|jednego lub dwóch pas|dwa pasy.*raz jeden", "lane_narrowing", None, None),
    ("jeden_pas_otwarty", r"(przejazd|ruch)\w*.*?\bjednym pasem|do jednego pasa|zwężon\w*.*jednego pasa", "one_lane_open", 1, None),
    ("jeden_pas_zajety", r"zaj(ęty|ęto|ęli|muje|mie)\w*.*\bjed(en|nego) pas|po jednym pasie|wygrodzen\w* pasa", "one_lane_closed", None, 1),
    ("zwezenie", r"zwęże|zwężon|zawęż|zajęci\w* pasa|zajęte będ\w* poszczególne pasy", "lane_narrowing", None, None),
    ("oba_kierunki", r"(zachowany|utrzymany|możliwy|możlowy|odbywa się)\w*.*w (obu|każdym) kierunk|w obu kierunkach.*(zachowany|utrzymany)|zachowane są wszystkie kierunki", "both_directions_maintained", None, None),
]
UNDER_TRAFFIC = re.compile(r"pod ruchem", re.I)
NOT_TRAFFIC = re.compile(r"przystan|objazd|autobus|tramwaj|mpk|linii|parking|piesi|pieszych|rowerz", re.I)


def sentences(lines):
    for ln in lines:
        # split after . or ; but not after abbreviations ("ul.", "Al.", "pl.", "św.", "r.")
        for s in re.split(r"(?<!\bul\.)(?<!\bal\.)(?<!\bAl\.)(?<!\bpl\.)(?<!\bPl\.)(?<!\bśw\.)(?<!\br\.)(?<=[.;])\s+", ln):
            if s.strip(" .;"):
                yield s.strip()


def classify(lines):
    """-> list of (rule_id, impact, lanes_open, lanes_closed, quote); [] means nothing recognised."""
    out = []
    for s in sentences(lines):
        low = s.lower()
        for rid, rx, imp, lo, lc in RULES:
            if re.search(rx, low):
                out.append((rid, imp, lo, lc, s))
                break
    return out


# ---------- dates ----------

def parse_date(s):
    """-> (iso|None, precision). Handles 04.11.2026, '8 listopada 2026', 'październik 2026', 'wiosna 2027', 'koniec 2026'."""
    s = s.lower()
    m = re.search(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", s)
    if m:
        return f"{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}", "exact"
    m = re.search(r"(\d{1,2}) (\w+) (\d{4})", s)
    if m and any(m[2].startswith(k) for k in MONTHS):
        mo = next(v for k, v in MONTHS.items() if m[2].startswith(k))
        return f"{m[3]}-{mo:02d}-{int(m[1]):02d}", "exact"
    for m in re.finditer(r"(\w+) (\d{4})", s):
        w = m[1]
        if any(w.startswith(k) for k in MONTHS):
            mo = next(v for k, v in MONTHS.items() if w.startswith(k))
            return f"{m[2]}-{mo:02d}", "month"
        if w in SEASON:
            return f"{m[2]}-{SEASON[w]}", "season"
    m = re.search(r"\b(20\d\d)\b", s)
    if m:
        return m[1], "year"
    return None, "unknown"


def day_month(s, captured):
    """'od 8 LISTOPADA' (no year) -> ISO date; year from the snapshot date, or the year before when the
    date would fall more than 90 days after the snapshot ('od 17 listopada' read in March = last November)."""
    m = re.search(r"\b(?:od|start\w*:?|rozpocz\w*\s*\w*:?)\s+(\d{1,2}) (\w+)(?! \d{4})", s.lower())
    if not m or not any(m[2].startswith(k) for k in MONTHS):
        return None
    mo, y = next(v for k, v in MONTHS.items() if m[2].startswith(k)), int(captured[:4])
    try:
        d = dt.date(y, mo, int(m[1]))
    except ValueError:
        return None
    if (d - dt.date.fromisoformat(captured[:10])).days > 90:
        d = d.replace(year=y - 1)
    return d.isoformat()


def card_dates(c, captured):
    start = end = (None, "unknown")
    for t in c["terminy"]:
        low = t.lower()
        if re.search(r"start|rozpocz|^od \d", low):
            start = parse_date(t)
            if start[0] is None or start[1] == "year":
                start = (day_month(t, captured), "exact") if day_month(t, captured) else start
        elif re.search(r"zakończ|koniec|potrwa|do końca", low):
            end = parse_date(t)
    if start[0] is None:  # "… od 8 LISTOPADA" in the heading or, in old snapshots, in the text
        d = day_month(c["heading"], captured) or day_month(c["opis"], captured)
        if d:
            start = (d, "exact")
    return start, end


# ---------- relation ----------

def relation(c):
    """Street + section from the heading 'POJEZIERSKA (Brukowa - Włókniarzy) od 4 LISTOPADA'."""
    h = re.sub(r"\s+od \d{1,2} \w+\s*$", "", c["heading"]).strip()
    m = re.match(r"(.*?)\s*\((.*)\)\s*$", h)
    name, sec = (m[1], m[2]) if m else (h, "")
    od = do = None
    if " - " in sec or " – " in sec:
        od, do = [x.strip() for x in re.split(r"\s+[-–]\s+", sec, maxsplit=1)]
    elif not sec:
        m = re.search(r"\bod ([A-ZŁŚŻŹĆ][\w.]*(?: [A-ZŁŚŻŹĆ][\w.]*)*) do ([A-ZŁŚŻŹĆ][\w.]*(?: [A-ZŁŚŻŹĆ][\w.]*)*)", c["opis"])
        if m:
            od, do = m[1], m[2]
    return dict(ulica=name.strip(), od=od, do=do, uwagi=sec if sec and not od else None)


# ---------- build ----------

def restrictions_of(c, captured, url, sha, year_hint):
    rel = relation(c)
    hits = classify(c["utr"])
    start, end = card_dates(c, captured)
    base = dict(source="lodz.pl/remonty", source_card=c["card_id"], heading=c["heading"], **rel,
                kierunek=None, jezdnia=None, wlot=None, faza=None,
                date_start=start[0], start_precision=start[1], date_end=end[0], end_precision=end[1],
                date_status="planned" if end[0] else "unknown",
                zakres_prac=c["prace"], inwestor=c["inwestor"] or None, sekcja=c["section"],
                obserwacje=[dict(url=url, cytat=" ".join(c["utr"]) or None, published_at=None, captured_at=captured, sha256=sha)])
    if start[0] and start[1] == "exact":
        base["start_status"] = "planned" if (c["section"] or "").lower().startswith("planowane") else "observed"
    review = []
    if len(re.findall(r"\b(?:i|ii|iii|iv)\s+etap|\betap\s+(?:i|ii|iii|iv)\b", c["opis"].lower())) >= 2:
        review.append("kilka etapów na jednej karcie; daty i utrudnienie nie są przypisane do etapu")
    if " / " in rel["ulica"] or "skrzyżowanie" in (rel["uwagi"] or "").lower():
        review.append("skrzyżowanie: relacje wydzielone automatycznie, sprawdzić")
    if not hits:
        imp = [("pod_ruchem" if UNDER_TRAFFIC.search(" ".join(c["utr"])) else "brak_frazy", "unknown", None, None,
                " ".join(c["utr"]) or None)]
        if not c["utr"]:
            review.append("brak sekcji 'Zakres utrudnień'")
        elif not UNDER_TRAFFIC.search(" ".join(c["utr"])) and not all(NOT_TRAFFIC.search(s) for s in sentences(c["utr"])):
            review.append("nie rozpoznano typu wpływu")
        hits = imp
    # "Ulica zamknięta dla ruchu. Możliwe wjazdy docelowe." is one restriction (local access), not two
    if any(h[1] == "local_access_only" for h in hits):
        generic = [h for h in hits if h[1] == "full_closure" and re.match(r"ulica\b", h[4], re.I)]
        if generic:
            hits = [h if h[1] != "local_access_only" else (h[0], h[1], h[2], h[3], generic[0][4] + " " + h[4])
                    for h in hits if h not in generic]
    out = []
    for n, (rid, imp, lo, lc, quote) in enumerate(hits, 1):
        r = dict(base, id=f"lodzpl:{c['card_id']}#{n}", traffic_impact=imp, lanes_open=lo, lanes_closed=lc,
                 rule_id=rid, cytat=quote, parser=PARSER)
        r.update(relation_detail(quote, rel))
        m = re.search(r"\bna jezdni w kierunku (\w+)", c["opis"])
        if m:
            r["jezdnia"] = f"jezdnia w kierunku {m[1]}"
        if "lewym" in (quote or "").lower():
            r["pas"] = "lewy"
        rv = list(review)
        r["confidence"] = "low" if rv else ("medium" if rid in ("pod_ruchem", "brak_frazy", "zwezenie") else "high")
        r["needs_review"] = "; ".join(rv) or None
        out.append(r)
    return out


def relation_detail(quote, rel):
    """Narrow a sentence to a street/direction when it names one ('Zamknięta ul. Wróblewskiego od strony ul. Wólczańskiej')."""
    if not quote:
        return {}
    d = {}
    m = re.search(r"\bw (stronę|kierunku) (?:ul\.\s*|al\.\s*)?(\w[\w ]*?)(?:\s+(?:możliwy|jest|odbywa|od)\b|[,.(]|$)", quote, re.I)
    if m:
        d["kierunek"] = f"w {m[1]} {m[2].strip()}"
    m = re.search(r"\bod strony (?:ul\. )?([\w.ąęłńóśźż ]+?)(?:\s+-|[,.(]|$)", quote, re.I)
    if m:
        d["wlot"] = f"od strony {m[1].strip()}"
    m = re.search(r"\bod (\w+) do (\w+)\b", quote)
    if m and "kierun" in quote.lower():
        d["kierunek"] = f"od {m[1]} do {m[2]}"
    m = re.search(r"\bzamknięt\w+(?: jest)? (?:ul\.|al\.)\s*(\w+)", quote, re.I)
    if m and m[1][:5].lower() not in rel["ulica"].lower():  # 'Zamknięta jest ul. Kilińskiego' on the Broniewskiego card
        d["ulica"] = m[1]
    elif " / " in rel["ulica"]:
        parts = [p.strip() for p in rel["ulica"].split("/")]
        for p in parts:  # sentence that names one of the crossing streets
            if re.search(p[:6], quote, re.I):
                d["ulica"] = p
                break
    return d


def geocode(rows):
    """Add geom (GeoJSON) + geom_typ: 'odcinek' (od..do cut along the street, e4b method),
    'skrzyzowanie' (crossing point of 'A / B' cards), 'ulica' (whole-street centroid) or None."""
    import collections
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from e4b_sections import nearest, path_len, SQUARE, norm, hav
    streets = collections.defaultdict(list)
    for w in json.load(open(WORK / "osm/lodz_streets.json", encoding="utf-8"))["elements"]:
        if not SQUARE.match(w["tags"]["name"]):
            streets[norm(w["tags"]["name"])].append([(g["lat"], g["lon"]) for g in w["geometry"]])
    by_last = collections.defaultdict(set)
    for n in streets:
        by_last[n.split()[-1]].add(n)
    from e4b_sections import variants
    ALIAS = {"rydza-śmigłego": "śmigłego-rydza"}

    def clean(s):
        s = re.sub(r"\s+(przy|\+)\s.*$|\s*\(.*$|^(pl\.|plac|rondo)\s.*$", "", s or "", flags=re.I)
        return re.sub(r"^(ul\.|al\.|Al\.)\s*", "", s).strip()

    def cands(s):
        """OSM names a written street may mean; more than one when the name is ambiguous ('Paderewskiego')."""
        n = norm(clean(s))
        n = ALIAS.get(n, n)
        if not n:
            return []
        if n in streets:
            return [n]
        toks = n.split()
        out = {m for k in {toks[-1], toks[0]} for v in variants(k) for m in by_last.get(v, ())}
        return sorted(m for m in out if all(any(w.startswith(t[:4]) for w in m.split()) for t in toks))[:4]

    pts_of = lambda ns: [p for n in ns for ln in streets[n] for p in ln]
    lines_of = lambda ns: [ln for n in ns for ln in streets[n]]
    pick = lambda ns, near: min(ns, key=lambda n: min(hav(p, q) for p in pts_of([n])[::5] for q in near[::5])) if ns and near else None
    cache = {}
    for r in rows:
        main_c = cands(r["ulica"])
        r["osm_name"], r["geom"], r["geom_typ"] = (main_c[0] if len(main_c) == 1 else None), None, None
        if not main_c:
            continue
        a_c, b_c = cands(r.get("od")), cands(r.get("do"))
        cross_c = []
        if " / " in (r.get("heading") or ""):
            cross_c = [c for p in r["heading"].split(" (")[0].split(" / ") for c in cands(p) if c not in main_c]
        key = (tuple(main_c), tuple(a_c), tuple(b_c), tuple(cross_c))
        if key not in cache:
            g, name = None, None
            if a_c and b_c:  # ambiguous names: take the main street closest to both cross streets
                near = pts_of(a_c) + pts_of(b_c)
                name = main_c[0] if len(main_c) == 1 else pick(main_c, near)
                a, b = pick(a_c, pts_of([name])), pick(b_c, pts_of([name]))
                main = set(pts_of([name]))
                if a != b and name not in (a, b):
                    pa, pb = nearest(main, pts_of([a])), nearest(main, pts_of([b]))
                    if pa and pb:
                        d, path = path_len(lines_of([name]), pa, pb)
                        if d:
                            g = ("odcinek", {"type": "LineString", "coordinates": [[round(lo, 5), round(la, 5)] for la, lo in path]})
                        else:  # street ways not connected in OSM (roundabouts are dropped): midpoint of the two crossings
                            g = ("odcinek_punkt", {"type": "Point", "coordinates": [round((pa[1] + pb[1]) / 2, 5), round((pa[0] + pb[0]) / 2, 5)]})
            if not g and cross_c:
                name = main_c[0] if len(main_c) == 1 else pick(main_c, pts_of(cross_c))
                p = nearest(set(pts_of([name])), pts_of([pick(cross_c, pts_of([name]))]))
                if p:
                    g = ("skrzyzowanie", {"type": "Point", "coordinates": [round(p[1], 5), round(p[0], 5)]})
            if not g and len(main_c) == 1:  # ponytail: whole-street centroid, misleading for long streets; flagged as 'ulica'
                ps = pts_of(main_c)
                g = ("ulica", {"type": "Point", "coordinates": [round(sum(p[1] for p in ps) / len(ps), 5), round(sum(p[0] for p in ps) / len(ps), 5)]})
            cache[key] = (g, name or r["osm_name"])
        g, r["osm_name"] = cache[key]
        if g:
            r["geom_typ"], r["geom"] = g
    return rows


def start_missing(r, snaps):
    """Card gives no start date. If it appeared between two snapshots (own or Wayback), start = first snapshot
    showing it (start_po = the one before, i.e. it started after that). If it is already in the oldest snapshot,
    estimate start = planned end minus ~2.5 months (author's rule, 9.11.2026), never later than first_seen."""
    i = snaps.index(r["first_seen"]) if r["first_seen"] in snaps else 0
    lo, hi = (snaps[i - 1][:10] if i > 0 else "2000-01-01"), r["first_seen"][:10]
    end = r.get("date_end")
    if end:  # ponytail: fixed 75 days; clamped to what the snapshots prove (absent at lo, present at hi)
        e = end + ("-12-31" if len(end) == 4 else "-15" if len(end) == 7 else "")
        est = (dt.date.fromisoformat(e) - dt.timedelta(days=75)).isoformat()
        est = min(max(est, lo), hi)
        r.update(date_start=est, start_precision="estimated" if est < hi else "first_seen",
                 start_status="estimated" if est < hi else "observed", start_po=lo if i > 0 else None)
    else:
        r.update(date_start=hi, start_precision="first_seen", start_status="observed", start_po=lo if i > 0 else None)


def seed_rows():
    rows = json.load(open(ROOT / "utrudnienia_seed.json", encoding="utf-8"))
    for r in rows:
        r.setdefault("rule_id", "manual")
        r.setdefault("parser", "seed")
    return rows


def build():
    SNAP.mkdir(parents=True, exist_ok=True)
    obs_path = SNAP / "observations.jsonl"
    known = set()
    if obs_path.exists():
        for ln in open(obs_path, encoding="utf-8"):
            o = json.loads(ln)
            known.add((o["card_id"], o["sha256"]))
    new, snaps, seen_in = 0, [], {}  # seen_in: card_id -> [snapshot timestamps containing it]
    with open(obs_path, "a", encoding="utf-8") as f:
        for snap in sorted(SNAP.glob("*.html")):
            captured = dt.datetime.strptime(snap.stem, "%Y%m%dT%H%M%S").isoformat()
            snaps.append(captured)
            for c in parse_cards(snap.read_text(encoding="utf-8", errors="replace")):
                if not is_card(c):
                    continue
                seen_in.setdefault(c["card_id"], []).append(captured)
                sha = card_sha(c)
                if (c["card_id"], sha) in known:
                    continue
                known.add((c["card_id"], sha)); new += 1
                f.write(json.dumps(dict(card_id=c["card_id"], sha256=sha, url=URL, captured_at=captured, card=c), ensure_ascii=False) + "\n")
    obs = sorted((json.loads(l) for l in open(obs_path, encoding="utf-8")), key=lambda o: o["captured_at"])
    last_snap = snaps[-1] if snaps else None
    latest, history = {}, {}
    for o in obs:
        history.setdefault(o["card_id"], []).append(o)
        latest[o["card_id"]] = o
    keep = dedupe([o["card"] for o in latest.values()])
    rows = []
    for cid, o in latest.items():
        if cid not in keep:
            continue
        rs = restrictions_of(o["card"], o["captured_at"], o["url"], o["sha256"], o["captured_at"][:4])
        for r in rs:
            r["obserwacje"] = [dict(url=h["url"], cytat=" ".join(h["card"]["utr"]) or None, published_at=None,
                                    captured_at=h["captured_at"], sha256=h["sha256"]) for h in history[cid]]
            ts = seen_in.get(cid) or [o["captured_at"]]
            r["first_seen"], r["last_seen"] = ts[0], ts[-1]
            r["na_stronie"] = ts[-1] == last_snap
            r["duplikat_kart"] = keep[cid] or None
            if r["date_start"] is None:
                start_missing(r, snaps)
        rows += rs
    rows += seed_rows()
    mpk = WORK / "mpk/rows.json"  # E12: MPK notices 2019-2024
    if mpk.exists():
        rows += json.load(open(mpk, encoding="utf-8"))
    if (WORK / "osm/lodz_streets.json").exists():
        geocode(rows)
    (WORK / "utrudnienia.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(WORK / "needs_review.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "heading", "traffic_impact", "powod", "cytat"])
        for r in rows:
            if r.get("needs_review"):
                w.writerow([r["id"], r.get("heading"), r["traffic_impact"], r["needs_review"], r.get("cytat")])
    from collections import Counter
    print(f"new_observations={new} cards={len(latest)} restrictions={len(rows)} "
          f"review={sum(1 for r in rows if r.get('needs_review'))}", dict(Counter(r["traffic_impact"] for r in rows)))
    return rows


def card_sha(c, fields=("heading", "opis", "utr", "prace", "terminy", "inwestor")):
    keep = {k: c[k] for k in fields}
    return hashlib.sha256(json.dumps(keep, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def content_key(c):
    """The page repeats some cards in two sections with a different id and heading suffix ('od 4 LISTOPADA')."""
    return card_sha(c, ("opis", "utr", "prace", "terminy", "inwestor"))


def dedupe(cards):
    """-> {kept card_id: [duplicate card_ids]}, keeping the lowest id per identical content."""
    groups = {}
    for c in sorted(cards, key=lambda c: int(c["card_id"][1:])):
        groups.setdefault(content_key(c), []).append(c["card_id"])
    return {g[0]: g[1:] for g in groups.values()}


if __name__ == "__main__":
    if "--fetch" in sys.argv:
        fetch()
    build()
