"""E4 step 2: cut the od..do section out of the matched OSM street.

Input:  work/records_geo.jsonl, work/osm/lodz_streets.json
Output: work/records_geo.jsonl updated in place with od_osm, do_osm, odcinek_m, odcinek_status;
        work/sections.geojson (one LineString per record with a section)
Method: parse "od ul. X do ul. Y" from the quote; X/Y node = street node closest to the cross street
(<= 40 m); section = shortest path along the street's own ways (Dijkstra).
"""
import json, re, sys, heapq, collections
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from e4_geocode import WORK, norm, variants, hav, SQUARE

OD_DO = re.compile(r"\bod\s+(?:ul\.|ulicy|al\.|alei|ronda|skrzyżowania z)?\s*([A-ZĄĆĘŁŃÓŚŹŻ][\wąćęłńóśźż\.]*(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ0-9][\wąćęłńóśźż\.]*){0,3})"
                   r".{0,60}?\bdo\s+(?:ul\.|ulicy|al\.|alei|ronda)?\s*([A-ZĄĆĘŁŃÓŚŹŻ][\wąćęłńóśźż\.]*(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ0-9][\wąćęłńóśźż\.]*){0,3})")
MAX_GAP_M = 40


def resolve(name, by_last, streets):
    toks = norm(name).split()
    if not toks:
        return None
    if norm(name) in streets:
        return norm(name)
    for k in (toks[-1], toks[0]):  # "Powstańców 1863 r." -> try first word too
        c = sorted({n for v in variants(k) for n in by_last.get(v, ())})
        if len(c) == 1:
            return c[0]
    return None


def path_len(lines, a, b):
    adj = collections.defaultdict(list)
    for ln in lines:
        for p, q in zip(ln, ln[1:]):
            d = hav(p, q); adj[p].append((q, d)); adj[q].append((p, d))
    dist, prev, pq = {a: 0.0}, {}, [(0.0, a)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == b:
            pts = [b]
            while pts[-1] != a:
                pts.append(prev[pts[-1]])
            return d, pts[::-1]
        if d > dist.get(u, 1e18):
            continue
        for v, w in adj[u]:
            if d + w < dist.get(v, 1e18):
                dist[v] = d + w; prev[v] = u; heapq.heappush(pq, (d + w, v))
    return None, None


def nearest(main_pts, cross_pts):
    best = min(((hav(p, q), p) for p in main_pts for q in cross_pts), default=(1e18, None))
    return best[1] if best[0] <= MAX_GAP_M else None


def main():
    streets = collections.defaultdict(list)
    for w in json.load(open(WORK / "osm/lodz_streets.json", encoding="utf-8"))["elements"]:
        if not SQUARE.match(w["tags"]["name"]):
            streets[norm(w["tags"]["name"])].append([(g["lat"], g["lon"]) for g in w["geometry"]])
    by_last = collections.defaultdict(set)
    for n in streets:
        by_last[n.split()[-1]].add(n)

    recs = [json.loads(l) for l in open(WORK / "records_geo.jsonl", encoding="utf-8")]
    stats, feats = collections.Counter(), []
    for r in recs:
        if not r.get("osm_name"):
            continue
        text = " ".join(r.get("cytaty") or [r.get("cytat") or ""] + (r.get("cytat_nazwa") or []))
        street_word = norm(r["ulica"]).split()[-1][:5] if r.get("ulica") else ""
        # take the od..do that follows this record's street, else the first one
        ms = list(OD_DO.finditer(text))
        m = next((m for m in ms if street_word and street_word in text[max(0, m.start() - 80):m.start()].lower()), ms[0] if ms else None)
        if not m:
            r["odcinek_status"] = "brak_od_do"; stats["brak_od_do"] += 1; continue
        a_name, b_name = resolve(m.group(1), by_last, streets), resolve(m.group(2), by_last, streets)
        r.update(od_tekst=m.group(1), do_tekst=m.group(2), od_osm=a_name, do_osm=b_name)
        if not (a_name and b_name) or r["osm_name"] in (a_name, b_name) or a_name == b_name:
            r["odcinek_status"] = "od_do_nieznalezione"; stats["od_do_nieznalezione"] += 1; continue
        main_lines = streets[r["osm_name"]]
        main_pts = {p for ln in main_lines for p in ln}
        pa = nearest(main_pts, [p for ln in streets[a_name] for p in ln])
        pb = nearest(main_pts, [p for ln in streets[b_name] for p in ln])
        if not (pa and pb):
            r["odcinek_status"] = "brak_skrzyzowania"; stats["brak_skrzyzowania"] += 1; continue
        d, pts = path_len(main_lines, pa, pb)
        if d is None:
            r["odcinek_status"] = "przerwana_geometria"; stats["przerwana_geometria"] += 1; continue
        r.update(odcinek_m=round(d), odcinek_status="ok"); stats["ok"] += 1
        feats.append({"type": "Feature", "properties": {"ulica": r["osm_name"], "od": a_name, "do": b_name, "m": round(d),
                      "doc_id": r["doc_id"], "status": r["status"]},
                      "geometry": {"type": "LineString", "coordinates": [[lo, la] for la, lo in pts]}})
    with open(WORK / "records_geo.jsonl", "w", encoding="utf-8") as f:
        for r in recs:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    (WORK / "sections.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
    print(dict(stats))


if __name__ == "__main__":
    m = OD_DO.search("Przebudowa ul. Ozorkowskiej na odcinku od ul. Przybyszewskiego do ul. Zbaraskiej w Łodzi")
    assert m and m.group(1) == "Przybyszewskiego" and m.group(2) == "Zbaraskiej"
    d, pts = path_len([[(51.0, 19.0), (51.001, 19.0), (51.002, 19.0)]], (51.0, 19.0), (51.002, 19.0))
    assert round(d) == 222 and len(pts) == 3
    main()
