"""E5: link BZP road-works tenders (ZIM) to events from plans.

Input:  bzp/bzp_zdit.csv + bzp/bzp_zim.csv (road_works=True), work/events.csv, work/osm/lodz_streets.json
Output: work/bzp_tenders.csv (one row per tender_id), work/event_bzp_links.csv
Tender = all notices with one tender_id. Status: wykonane (ContractPerformingNotice),
udzielone (TenderResultNotice with contractor), ogloszone (ContractNotice only).
Link rule: same OSM street, same scope (jezdnia/torowisko vs poza_zakresem),
tender year in [event rok_od - 1, event rok_do + 3] (plan precedes tender; works run 1-3 years).
"""
import csv, json, sys, re, html, collections, datetime as dt
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from e3p_plans import STREET, EXCLUDE, HARD_OUT, DROP
from e4_geocode import WORK, SQUARE, norm
from e4b_sections import resolve, OD_DO, nearest, path_len

ROOT = WORK.parent
STATUS_RANK = {"ContractNotice": 0, "TenderResultNotice": 1, "ContractPerformingNotice": 2}
STATUS_NAME = ["ogloszone", "udzielone", "wykonane"]


OUT_BZP = re.compile(r"rower|elewac|organizacj\w* ruchu|dokumentacj|projekt\w* budowlan", re.I)
# UMŁ notices are matched by text, not CPV only: require a road word and a works word, drop non-road objects
ROAD_POS = re.compile(r"jezdni|nawierzchn|\bdr[oó]g|ulic|\bul\.|torowisk|tramwaj|gruntow|utwardz|skrzyżowa|rond|wiadukt|estakad|układ\w* drogow", re.I)
WORK_POS = re.compile(r"remont|przebudow|budow|moderniz|utwardz|napraw|odnow|rozbudow", re.I)
NOT_ROAD = re.compile(r"park|szkol|szkoł|sal\w* gimnast|most(?:ek|u|ów)?\b|druk|promoc|kampani|publikacj|budynk|lokal|oznakowani|pomieszcze|urządze|zielon|oaza|monitoring|skwer|usterek|ciąg\w* piesz|wód|podczyszczal|dach|balkon|pomocy społ|kanał|osadnik|wodoci|szkół|klatk", re.I)
# city-wide multi-year maintenance (patching, unpaved roads): real works but no single location; kept apart from the series
MAINT = re.compile(r"utrzymani|bieżąc|naprawy\b|remonty dr[oó]g|rejon|w latach \d{4}|na terenie (?:miasta|m\.) ?łodzi\s*(?:–|-)?\s*(?:II|I|\d)?\s*w podziale", re.I)


def scope(obj):
    obj = obj.lstrip(" \"'„”“")
    m = STREET.search(obj)  # the work type is named before the street: "Budowa chodnika na ul. X" vs "Przebudowa ul. X wraz z chodnikiem"
    head = obj[:m.start()] if m else obj
    if not (ROAD_POS.search(obj) and WORK_POS.search(obj)) or NOT_ROAD.search(head):
        return "poza_zakresem"
    if MAINT.search(obj) and not STREET.search(obj):
        return "utrzymanie"
    if DROP.search(obj) or HARD_OUT.search(head) or OUT_BZP.search(head):
        return "poza_zakresem"
    if EXCLUDE.search(head) and not re.search(r"jezdni|nawierzchni(?! chodnik)|torowisk", obj, re.I):
        return "poza_zakresem"
    return "torowisko" if re.search(r"torowisk|tramwaj", obj, re.I) else "jezdnia"


def money(v):
    try:
        return float(v.replace("PLN", "").replace(" ", "").replace(",", "."))
    except ValueError:
        return None


def notice_text(r):
    body = open(ROOT / "bzp/html" / (r["notice_number"].replace("/", "_").replace(" ", "_") + ".html"), encoding="utf-8").read()
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", body)))


def add_period(start, txt):
    """Contract end from 'Okres realizacji': 'N dni' / 'N miesiące' / 'N tygodni' / 'do RRRR-MM-DD'."""
    m = re.search(r"Okres realizacji[^:]{0,40}:\s*(?:do\s+(\d{4}-\d\d-\d\d)|(\d+)\s*(dni|tyg|miesi))", txt)
    if not m:
        return None
    if m.group(1):
        return dt.date.fromisoformat(m.group(1))
    n, unit = int(m.group(2)), m.group(3)
    return start + dt.timedelta(days=n * {"dni": 1, "tyg": 7, "miesi": 30}[unit])  # ponytail: month = 30 days


def contract_dates(ns):
    """(start, end, source). start = contract signing; end = actual completion (performing notice),
    else start + declared period (result notice). Multi-part tenders: earliest start, latest end."""
    starts, ends, src = [], [], ""
    for r in ns:
        if r["notice_type"] == "ContractNotice":
            continue
        txt = notice_text(r)
        a = [dt.date.fromisoformat(x) for x in re.findall(r"Data zawarcia umowy:\s*(\d{4}-\d\d-\d\d)", txt)]
        b = [dt.date.fromisoformat(x) for x in re.findall(r"Termin wykonania umowy:\s*(\d{4}-\d\d-\d\d)", txt)]
        starts += a
        if b:
            ends += b; src = "termin_wykonania"
        elif a and not src:
            e = add_period(min(a), txt)
            if e:
                ends.append(e); src = "okres_realizacji"
    if not starts or not ends or max(ends) < min(starts):
        return "", "", ""
    return min(starts).isoformat(), max(ends).isoformat(), src


def main():
    streets = collections.defaultdict(list)
    for w in json.load(open(WORK / "osm/lodz_streets.json", encoding="utf-8"))["elements"]:
        if not SQUARE.match(w["tags"]["name"]):
            streets[norm(w["tags"]["name"])].append([(g["lat"], g["lon"]) for g in w["geometry"]])
    by_last = collections.defaultdict(set)
    for n in streets:
        by_last[n.split()[-1]].add(n)

    t = collections.defaultdict(list)
    for buyer in ("zdit", "zim", "uml"):
        for r in csv.DictReader(open(ROOT / f"bzp/bzp_{buyer}.csv", encoding="utf-8")):
            if r["road_works"] == "True":
                r["buyer"] = buyer
                t[r["tender_id"]].append(r)
    tenders, feats = [], []
    for tid, ns in t.items():
        ns.sort(key=lambda r: r["date"])
        obj = " ".join(next(r["object"] for r in ns if r["object"]).split())
        rank = max(STATUS_RANK.get(r["notice_type"], 0) for r in ns)
        vals = [money(r["value"]) for r in ns if money(r["value"])]
        perf = [r for r in ns if r["notice_type"] == "ContractPerformingNotice"]
        osm = list(dict.fromkeys(filter(None, (resolve(s, by_last, streets) for s in STREET.findall(obj)))))
        d_od, d_do, d_src = contract_dates(ns)
        lat = lon = sec_m = ""
        if osm:
            main_lines = streets[osm[0]]
            pts = [p for ln in main_lines for p in ln]
            lat, lon = round(sum(p[0] for p in pts) / len(pts), 5), round(sum(p[1] for p in pts) / len(pts), 5)
            m = OD_DO.search(obj)
            a, b = (resolve(m.group(1), by_last, streets), resolve(m.group(2), by_last, streets)) if m else (None, None)
            if a and b and a != b and osm[0] not in (a, b):
                main_pts = set(pts)
                pa, pb = nearest(main_pts, [p for ln in streets[a] for p in ln]), nearest(main_pts, [p for ln in streets[b] for p in ln])
                d, path = path_len(main_lines, pa, pb) if pa and pb else (None, None)
                if d:
                    sec_m = round(d)
                    lat, lon = path[len(path) // 2]
                    feats.append({"type": "Feature", "properties": {"tender_id": tid, "ulica": osm[0], "od": a, "do": b, "m": sec_m},
                                  "geometry": {"type": "LineString", "coordinates": [[q[1], q[0]] for q in path]}})
        tenders.append(dict(tender_id=tid, zamawiajacy=ns[0]["buyer"], rok=ns[0]["date"][:4], data_ogloszenia=ns[0]["date"],
                            data_wykonania=perf[-1]["date"] if perf else "", status=STATUS_NAME[rank],
                            zakres=scope(obj), wartosc_zl=max(vals) if vals else "",
                            wykonawca=next((r["contractors"] for r in reversed(ns) if r["contractors"]), ""),
                            umowa_od=d_od, umowa_do=d_do, daty_zrodlo=d_src, lat=lat, lon=lon, odcinek_m=sec_m,
                            ulice_osm="; ".join(osm), n_ogloszen=len(ns), przedmiot=obj,
                            bzp=next(r["bzp_number"] for r in ns)))

    events = list(csv.DictReader(open(WORK / "events.csv", encoding="utf-8")))
    links = []
    for e in events:
        if not e["ulica"] or not e["rok_od"]:
            continue
        e_out = e["poza_zakresem"] == "True"
        for x in tenders:
            if e["ulica"] == x["ulice_osm"].split("; ")[0] and (x["zakres"] not in ("jezdnia", "torowisko")) == e_out \
                    and int(e["rok_od"]) - 1 <= int(x["rok"]) <= int(e["rok_do"]) + 3:
                links.append(dict(event_id=e["event_id"], ulica=e["ulica"], rok_planu=e["rok_od"],
                                  tender_id=x["tender_id"], rok_przetargu=x["rok"], status=x["status"],
                                  data_wykonania=x["data_wykonania"], wartosc_zl=x["wartosc_zl"], przedmiot=x["przedmiot"]))
    for name, rows in (("bzp_tenders.csv", tenders), ("event_bzp_links.csv", links)):
        with open(WORK / name, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    (WORK / "bzp_sections.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
    print("dates:", dict(collections.Counter(x["daty_zrodlo"] or "brak" for x in tenders)), "sections:", len(feats))
    c = collections.Counter((x["zakres"], x["status"]) for x in tenders)
    print(f"tenders={len(tenders)} with_osm_street={sum(1 for x in tenders if x['ulice_osm'])} {dict(c)}")
    print(f"links={len(links)} events_linked={len({l['event_id'] for l in links})} tenders_linked={len({l['tender_id'] for l in links})}")


if __name__ == "__main__":
    assert scope("Budowa chodnika na ul. Pienistej") == "poza_zakresem"
    assert scope("Przebudowa ul. Ozorkowskiej wraz z budową chodnika") == "jezdnia"
    assert add_period(dt.date(2021, 5, 28), "Okres realizacji zamówienia: 90 dni 4.3.)") == dt.date(2021, 8, 26)
    assert add_period(dt.date(2021, 1, 1), "Okres realizacji zamówienia: do 2021-12-31") == dt.date(2021, 12, 31)
    assert money("201463,41 PLN") == 201463.41
    assert scope("Remonty dróg o nawierzchni twardych na terenie Miasta Łodzi w latach 2020-2022") == "utrzymanie"
    assert scope("Remont sali gimnastycznej w Szkole Podstawowej Nr 153") == "poza_zakresem"
    assert scope("Druk publikacji 200 lat ulicy Piotrkowskiej") == "poza_zakresem"
    assert scope("Modernizacja nawierzchni ulic na terenie miasta Łodzi – ul. Radwańska na odcinku od ul. Wólczańskiej") == "jezdnia"
    assert scope("„Budowa drogi rowerowej ul. Sikorskiego") == "poza_zakresem"
    assert scope("Remont torowiska w ul. Kilińskiego") == "torowisko"
    main()
