#!/usr/bin/env python3
"""E3 metrics: road-work dimensions (area, length, width, lanes) per page.

Scans pages of selected doc types, finds numbers with units, attaches the
nearest "ul. X" / "ulicy X" on the same page, and writes hits.csv + summary.md.

Run:  py -I -X utf8 pipeline/e3m_metrics.py
Check: py -I -X utf8 pipeline/e3m_metrics.py --selftest
"""
import csv
import json
import random
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work"
TEXT = WORK / "text"
OUT = WORK / "metrics"
PILOT = WORK / "pilot" / "records.jsonl"

DOC_TYPES = {"swz_opz", "dokumentacja_projektowa", "umowa", "zapytanie_ofertowe",
             "ogloszenie_o_wykonaniu", "ogloszenie_o_udzieleniu"}
SEED = 20261107
CTX = 80            # context chars on each side of a hit
STREET_WINDOW = 300  # max gap (chars) between hit and street mention
WIDTH_WINDOW = 60    # chars after "szerokość" to look for a number with m

NUM = r"\d[\d\s.,]*"
RE_AREA = re.compile(rf"({NUM})\s*(m2|m²|m\^2)", re.I)
# longest alternatives first; lookahead stops "m" matching "m2", "m²", "mln"
RE_LEN = re.compile(rf"({NUM})\s*(m\.b\.|mb|km|m)(?![\w²^])", re.I)
RE_WIDTH_KW = re.compile(r"szerokoś\w*", re.I)
RE_M = re.compile(rf"({NUM})\s*m(?![\w²^])", re.I)
RE_LANES = re.compile(r"pas(?:y|ów|ow)\s+ruchu", re.I)
RE_LANES_BEFORE = re.compile(r"(\d{1,2})\s*(?:x\s*)?$")
RE_LANES_AFTER = re.compile(r"[^\d\n]{0,25}?(\d{1,2})(?!\d)")
RE_STREET = re.compile(  # spaces only: a street name never spans a line break
    r"(?i:\bul\.|\bulicy|\bulica)[ \t]+"
    r"((?:(?:\d+[ \t]+)?[A-ZĄĆĘŁŃÓŚŹŻ][\wąćęłńóśźż'\-]*\.?[ \t]*){1,3})"
)
RE_RADIUS = re.compile(r"(?i:\bR[ \t]*=|promie\w*)[ \t]*(?:R[ \t]*=[ \t]*)?$")


def parse_num(raw):
    """Polish number -> float: '2 634 030,00' -> 2634030.0, '3,5' -> 3.5, '1.200' -> 1200.0."""
    s = re.sub(r"\s", "", raw).rstrip(".,")
    if not s:
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def norm_street(name):
    s = name.translate({ord("ł"): "l", ord("Ł"): "L"})  # NFKD does not split ł
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def find_streets(text):
    out = []
    for m in RE_STREET.finditer(text):
        name = m.group(1).strip().rstrip(".").strip()
        if len(name) >= 3:
            out.append((m.start(1), m.end(1), name))
    return out


def is_radius(text, start):
    """True when the number at `start` follows 'R=' or 'promień' (curve radius, not a length)."""
    return bool(RE_RADIUS.search(text[max(0, start - 20):start]))


def find_hits(text):
    """Yield (rodzaj, value, unit, start, end) for every dimension hit on a page."""
    hits, width_starts = [], set()
    for m in RE_AREA.finditer(text):
        v = parse_num(m.group(1))
        if v is not None and not is_radius(text, m.start(1)):
            hits.append(("powierzchnia", v, "m2", m.start(1), m.end()))
    for m in RE_WIDTH_KW.finditer(text):
        n = RE_M.search(text, m.end(), m.end() + WIDTH_WINDOW)
        if n:
            v = parse_num(n.group(1))
            if v is not None:
                width_starts.add(n.start(1))
                hits.append(("szerokosc", v, "m", n.start(1), n.end()))
    for m in RE_LEN.finditer(text):
        if m.start(1) in width_starts or is_radius(text, m.start(1)):  # width or curve radius
            continue
        v = parse_num(m.group(1))
        if v is not None:
            hits.append(("dlugosc", v, m.group(2).lower(), m.start(1), m.end()))
    for m in RE_LANES.finditer(text):
        before = RE_LANES_BEFORE.search(text[max(0, m.start() - 25):m.start()])
        after = RE_LANES_AFTER.match(text, m.end(), m.end() + 25)
        num = before or after
        if num:
            hits.append(("pasy", float(num.group(1)), "pas", m.start(), m.end()))
    return hits


def nearest_street(streets, hs, he):
    best = None
    for ss, se, name in streets:
        if se >= hs and ss <= he:
            gap = 0
        elif se < hs:
            gap = hs - se
        else:
            gap = ss - he
        if gap <= STREET_WINDOW and (best is None or gap < best[0]):
            best = (gap, name)
    return best


def context(text, hs, he):
    return re.sub(r"\s+", " ", text[max(0, hs - CTX):he + CTX]).strip()


def load_pages():
    with open(WORK / "pages.csv", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row["doc_type"] in DOC_TYPES:
                yield row


def scan():
    rows, missing, pages = [], 0, 0
    for p in load_pages():
        path = TEXT / p["doc_id"] / f"p{int(p['page']):03d}.txt"
        if not path.exists():
            missing += 1
            continue
        pages += 1
        text = path.read_text(encoding="utf-8", errors="replace")
        streets = find_streets(text)
        for rodzaj, value, unit, hs, he in find_hits(text):
            st = nearest_street(streets, hs, he)
            rows.append({
                "doc_id": p["doc_id"], "page": p["page"], "doc_type": p["doc_type"],
                "year": p["year"], "rodzaj": rodzaj, "wartosc": value, "jednostka": unit,
                "kontekst": context(text, hs, he),
                "ulica": st[1] if st else "",
                "ulica_odleglosc": st[0] if st else "",
                "ulica_klucz": norm_street(st[1]) if st else "",
            })
    return rows, pages, missing


def write_outputs(rows, pages, missing):
    OUT.mkdir(parents=True, exist_ok=True)
    fields = list(rows[0].keys())
    with open(OUT / "hits.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

    with_street = [r for r in rows if r["ulica_klucz"]]
    street_hits = Counter(r["ulica_klucz"] for r in with_street)
    names = defaultdict(Counter)
    for r in with_street:
        names[r["ulica_klucz"]][r["ulica"]] += 1
    hit_keys = set(street_hits)
    hit_doc_keys = {(r["doc_id"], r["ulica_klucz"]) for r in with_street}

    pilot_keys, pilot_match, pilot_doc_match = set(), set(), set()
    with open(PILOT, encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            if rec.get("ulica"):
                key = norm_street(rec["ulica"])
                pilot_keys.add(key)
                if key in hit_keys:
                    pilot_match.add(key)
                if (rec["doc_id"], key) in hit_doc_keys:
                    pilot_doc_match.add(key)

    by_rodzaj = Counter(r["rodzaj"] for r in rows)
    by_type = Counter((r["doc_type"], r["rodzaj"]) for r in rows)
    types = sorted({r["doc_type"] for r in rows})
    rodzaje = sorted(by_rodzaj)

    rng = random.Random(SEED)
    sample = rng.sample(with_street, min(10, len(with_street)))

    L = []
    L.append("# E3 metrics — wielkości robót na stronach\n")
    L.append(f"Skan: {pages} stron (typy: {', '.join(sorted(DOC_TYPES))}); "
             f"brak pliku tekstowego: {missing}.\n")
    L.append("## Trafienia według rodzaju\n")
    L.append("| rodzaj | trafień |\n|---|---|")
    for k in rodzaje:
        L.append(f"| {k} | {by_rodzaj[k]} |")
    L.append(f"| **razem** | **{len(rows)}** |\n")
    L.append("## Trafienia według doc_type i rodzaju\n")
    L.append("| doc_type | " + " | ".join(rodzaje) + " |")
    L.append("|---|" + "---|" * len(rodzaje))
    for t in types:
        L.append(f"| {t} | " + " | ".join(str(by_type[(t, k)]) for k in rodzaje) + " |")
    L.append("")
    L.append(f"- Trafień z przypisaną ulicą: {len(with_street)} z {len(rows)}.")
    L.append(f"- Unikalnych ulic z co najmniej jedną wielkością: **{len(hit_keys)}**.\n")
    L.append("## Pilot (records.jsonl)\n")
    L.append(f"- Unikalnych ulic w pilocie: {len(pilot_keys)}.")
    L.append(f"- Z dopasowaniem w hits.csv (ta sama ulica w dowolnym dokumencie): "
             f"**{len(pilot_match)}** ({len(pilot_match) * 100 // max(1, len(pilot_keys))}%).")
    L.append(f"- Z dopasowaniem w tym samym dokumencie (doc_id + ulica): {len(pilot_doc_match)}.\n")
    L.append("## 20 ulic z największą liczbą trafień\n")
    L.append("| # | ulica (klucz) | nazwa w tekście | trafień |\n|---|---|---|---|")
    for i, (k, n) in enumerate(street_hits.most_common(20), 1):
        disp = names[k].most_common(1)[0][0]
        L.append(f"| {i} | {k} | {disp} | {n} |")
    L.append("")
    L.append("## Sprawdzenie ręczne — 10 losowych trafień z ulicą (seed 20261107)\n")
    L.append("Kolumny: nr, doc_id (8 znaków), strona, ulica, wartość, kontekst. "
             "Ocena (tak / nie / niejasne) dopisana ręcznie poniżej.\n")
    L.append("| nr | doc | str | ulica | wartość | kontekst |\n|---|---|---|---|---|---|")
    for i, r in enumerate(sample, 1):
        ctx = r["kontekst"].replace("|", "/")
        L.append(f"| {i} | {r['doc_id'][:8]} | {r['page']} | {r['ulica']} | "
                 f"{r['wartosc']:g} {r['jednostka']} | {ctx} |")
    (OUT / "summary.md").write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"hits={len(rows)} streets={len(hit_keys)} pilot={len(pilot_match)}/{len(pilot_keys)}")


def selftest():
    assert parse_num("2 634 030,00") == 2634030.0
    assert parse_num("1.200") == 1200.0
    assert parse_num("3,5") == 3.5
    assert not RE_LEN.search("15 m²") and not RE_LEN.search("15 m2")
    assert RE_LEN.search("372 mb") and RE_LEN.search("5 km")
    assert find_streets("ul. Gersona i Zapolskiej")[0][2] == "Gersona"
    assert find_streets("ulicy Piotrkowskiej 12")[0][2] == "Piotrkowskiej"
    t = "Remont ul. Gersona na długości 350 m, szerokość jezdni 6,5 m i 2 pasy ruchu."
    kinds = sorted((h[0], h[1]) for h in find_hits(t))
    assert kinds == [("dlugosc", 350.0), ("pasy", 2.0), ("szerokosc", 6.5)], kinds
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
    else:
        rows, pages, missing = scan()
        write_outputs(rows, pages, missing)
