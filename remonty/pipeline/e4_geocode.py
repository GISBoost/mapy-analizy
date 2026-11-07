"""E4 step 1: match record street names to OSM street names (whole street, no od/do section yet).

Input:  work/records_all.jsonl, work/osm/lodz_streets.json (Overpass, bbox 51.68,19.32,51.86,19.65, fetched 2026-11-07)
Output: work/records_geo.jsonl (records + osm_name, geo_match, osm_len_m, lat, lon), work/streets_geo.geojson
Match: last word of the record street, Polish genitive -> nominative variants, against last word of OSM names.
"""
import json, math, re, collections
from pathlib import Path

WORK = Path(__file__).resolve().parent.parent / "work"
PREFIX = re.compile(r"^(ul\.|ulica|ulicy|al\.|aleja|alei|aleji|os\.)\s*", re.I)
NOISE = re.compile(r"\b(planowane|zamówienie|informacje)\b.*$", re.I)
SQUARE = re.compile(r"^(rondo|plac|pl\.|skwer)\b", re.I)


def norm(s):
    return PREFIX.sub("", s.strip().lower()).strip(" .,")


def variants(word):
    v = {word}
    if word.endswith(("kiej", "giej")):
        v.add(word[:-3] + "a")
    elif word.endswith("ej"):
        v.add(word[:-2] + "a")
    if word.endswith("ą"):  # instrumental, e.g. "z ul. Rajdową"
        v.add(word[:-1] + "a")
    return v


def hav(a, b):
    (la1, lo1), (la2, lo2) = a, b
    p = math.pi / 180
    h = math.sin((la2 - la1) * p / 2) ** 2 + math.cos(la1 * p) * math.cos(la2 * p) * math.sin((lo2 - lo1) * p / 2) ** 2
    return 12742000 * math.asin(math.sqrt(h))


def main():
    ways = json.load(open(WORK / "osm/lodz_streets.json", encoding="utf-8"))["elements"]
    # streets keyed by normalized name, so "Aleja X" and "X" are one street; squares/roundabouts dropped
    geom, length = collections.defaultdict(list), collections.Counter()
    for w in ways:
        if SQUARE.match(w["tags"]["name"]):
            continue
        pts = [(g["lat"], g["lon"]) for g in w["geometry"]]
        geom[norm(w["tags"]["name"])].append(pts)
        length[norm(w["tags"]["name"])] += sum(hav(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
    by_last = collections.defaultdict(set)
    for name in geom:
        by_last[name.split()[-1]].add(name)

    recs = [json.loads(l) for l in open(WORK / "records_all.jsonl", encoding="utf-8")]
    stats, used = collections.Counter(), set()
    for r in recs:
        u = r.get("ulica")
        if not u:
            r["geo_match"] = "brak_ulicy"; stats["brak_ulicy"] += 1; continue
        u = NOISE.sub("", u).split("-")[0].replace("Włokniarzy", "Włókniarzy").replace("Ĕ", "ń").replace(" TAK", "")
        toks = norm(u).split() or ["?"]
        exact = [n for n in geom if n == norm(u)]
        cands = exact or sorted({n for v in variants(toks[-1]) for n in by_last.get(v, ())})
        if len(cands) > 1 and len(toks) > 1:  # disambiguate by first name, e.g. "Gabrieli Zapolskiej"
            cands = [n for n in cands if toks[0] in norm(n)] or cands
        r["geo_match"] = "exact" if len(exact) == 1 else ("stem" if len(cands) == 1 else ("niejednoznaczne" if cands else "brak"))
        r["osm_kandydaci"] = cands[:5] if len(cands) > 1 else None
        if len(cands) == 1:
            n = cands[0]; used.add(n)
            pts = [p for line in geom[n] for p in line]
            r.update(osm_name=n, osm_len_m=round(length[n]), lat=round(sum(p[0] for p in pts) / len(pts), 5),
                     lon=round(sum(p[1] for p in pts) / len(pts), 5))
        stats[r["geo_match"]] += 1
    with open(WORK / "records_geo.jsonl", "w", encoding="utf-8") as f:
        for r in recs:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": n, "len_m": round(length[n])},
         "geometry": {"type": "MultiLineString", "coordinates": [[[lo, la] for la, lo in line] for line in geom[n]]}}
        for n in sorted(used)]}
    (WORK / "streets_geo.geojson").write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")
    print(dict(stats), "streets:", len(used))


if __name__ == "__main__":
    assert "ozorkowska" in variants("ozorkowskiej") and "mokra" in variants("mokrej") and "rajdowa" in variants("rajdową")
    assert norm("Al. Wyszyńskiego") == "wyszyńskiego"
    assert round(hav((51.0, 19.0), (51.001, 19.0))) == 111
    main()
