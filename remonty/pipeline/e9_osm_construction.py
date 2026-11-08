#!/usr/bin/env python3
"""E9: OSM construction episodes for Łódź roads, 2018-2026, matched to city data.

Source: ohsome API, endpoint /elementsFullHistory/geometry (one request, full bbox),
filter: (highway=construction or construction:highway=*) and type:way.
Each returned feature is one version of a way in which the filter held; consecutive
versions are merged into an episode (od = first validFrom, do = last validTo).

Outputs:
  work/osm_construction.csv       one row per episode
  work/osm_construction.geojson   same episodes, latest geometry
  work/osm/cache/fullhistory.json raw ohsome response (cache, not re-fetched if present)
  work/osm/match_summary.md       coverage counts and examples

Run:   py -I -X utf8 pipeline/e9_osm_construction.py
Check: the assert block at the end of the run (episode merge + normalisation).
"""
import csv
import json
import math
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work"
CACHE = WORK / "osm" / "cache" / "fullhistory.json"

API = "https://api.ohsome.org/v1/elementsFullHistory/geometry"
UA = "easy-mapy-analizy-research/0.1 (research; contact via repo owner)"
BBOX = "19.32,51.68,19.65,51.86"
FILTER = "(highway=construction or construction:highway=*) and type:way"
TIME = "2018-01-01,2026-07-27"  # ohsome data extent ends 2026-07-27T09:00Z
DATA_END = "2026-07-27"
PAUSE_S = 2.5
SKIPPED_POLYGONS = [0]  # closed-way (area) versions skipped in load_features


def fetch():
    """Fetch the full-history response once and cache it. Stops on any HTTP error."""
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    q = urllib.parse.urlencode({"bboxes": BBOX, "filter": FILTER, "time": TIME,
                                "properties": "tags"})
    req = urllib.request.Request(f"{API}?{q}", headers={"User-Agent": UA})
    time.sleep(PAUSE_S)
    with urllib.request.urlopen(req, timeout=600) as r:  # HTTPError (403, 404...) propagates
        body = r.read()
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_bytes(body)
    return json.loads(body)


def day(ts):
    return ts[:10] if ts else None


def line_length_m(geom):
    """Geodesic length of a LineString / MultiLineString in metres (haversine)."""
    lines = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
    total = 0.0
    for ln in lines:
        for (lon1, lat1), (lon2, lat2) in zip(ln, ln[1:]):
            p1, p2 = math.radians(lat1), math.radians(lat2)
            dp, dl = p2 - p1, math.radians(lon2 - lon1)
            a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
            total += 2 * 6371000 * math.asin(math.sqrt(a))
    return total


def centroid(geom):
    pts = [p for ln in (geom["coordinates"] if geom["type"] == "MultiLineString"
                        else [geom["coordinates"]]) for p in ln]
    lon = sum(p[0] for p in pts) / len(pts)
    lat = sum(p[1] for p in pts) / len(pts)
    return lat, lon


def merge_episodes(features):
    """features: list of dicts with way, from, to, props, geom.
    Returns episodes: one per run of overlapping/touching versions of the same way."""
    by_way = defaultdict(list)
    for f in features:
        by_way[f["way"]].append(f)
    episodes = []
    for way, vs in by_way.items():
        vs.sort(key=lambda f: f["from"])
        cur = None
        for v in vs:
            if cur is not None and v["from"] <= cur["to"]:
                cur["to"] = max(cur["to"], v["to"])
                cur["last"] = v  # latest-starting version gives name/geometry
            else:
                if cur is not None:
                    episodes.append(cur)
                cur = {"way": way, "from": v["from"], "to": v["to"], "last": v}
        if cur is not None:
            episodes.append(cur)
    return episodes


def normalise(name):
    s = (name or "").translate({ord("ł"): "l", ord("Ł"): "L"})
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def overlap(a0, a1, b0, b1):
    return a0 <= b1 and b0 <= a1


def years(a0, a1):
    return set(range(int(a0[:4]), int(a1[:4]) + 1))


def load_features(data):
    """Keep linear ways only. Closed ways come back as Polygon (areas, not road lines);
    they are skipped and counted in SKIPPED_POLYGONS."""
    feats = []
    for f in data["features"]:
        if f["geometry"]["type"] != "LineString":
            SKIPPED_POLYGONS[0] += 1
            continue
        p = f["properties"]
        feats.append({
            "way": p["@osmId"].split("/")[1],
            "from": day(p["@validFrom"]),
            "to": day(p.get("@validTo")) or DATA_END,
            "props": p,
            "geom": f["geometry"],
        })
    return feats


def build_rows(episodes):
    rows, geo = [], []
    for e in episodes:
        p, g = e["last"]["props"], e["last"]["geom"]
        lat, lon = centroid(g)
        row = {
            "way_id": e["way"],
            "name": p.get("name", ""),
            "construction": p.get("construction", ""),
            "od": e["from"],
            "do": "" if e["to"] >= DATA_END else e["to"],
            "dlugosc_m": round(line_length_m(g)),
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "otwarty": int(e["to"] >= DATA_END),
        }
        rows.append(row)
        geo.append({"type": "Feature", "geometry": g, "properties": row})
    return rows, geo


def load_city():
    tenders = list(csv.DictReader(open(WORK / "bzp_tenders.csv", encoding="utf-8", newline="")))
    events = list(csv.DictReader(open(WORK / "events.csv", encoding="utf-8", newline="")))
    t_rows = []
    for t in tenders:
        if t["zakres"] == "poza_zakresem" or not t["ulice_osm"]:
            continue
        if t["umowa_od"] and t["umowa_do"]:
            period = (t["umowa_od"], t["umowa_do"])
            src = "umowa"
        else:  # no contract dates: use the year of the notice
            period = (f"{t['rok']}-01-01", f"{t['rok']}-12-31")
            src = "rok"
        names = {normalise(n) for n in t["ulice_osm"].split(";") if n.strip()}
        for n in names:
            t_rows.append({"src": "bzp", "id": t["tender_id"], "street": n, "period": period,
                           "period_src": src, "label": t["przedmiot"][:90]})
    e_rows = []
    for e in events:
        if e["poza_zakresem"] == "True":
            continue
        period = (f"{e['rok_od']}-01-01", f"{e['rok_do'] or e['rok_od']}-12-31")
        e_rows.append({"src": "plan", "id": e["event_id"], "street": normalise(e["ulica"]),
                       "period": period, "period_src": "rok",
                       "label": e["statusy"]})
    return t_rows, e_rows


def match(episodes_rows, city_rows):
    """Per OSM episode (same index as episodes_rows): city rows with the same
    normalised street and an overlapping period."""
    by_street = defaultdict(list)
    for c in city_rows:
        by_street[c["street"]].append(c)
    out = []
    for r in episodes_rows:
        key = normalise(r["name"])
        out.append([] if not key else  # unnamed ways never match a street
                   [c for c in by_street.get(key, [])
                    if overlap(r["od"], r["do"] or DATA_END, *c["period"])])
    return out


def write_outputs(rows, geo, matched_osm, t_rows, e_rows):
    with open(WORK / "osm_construction.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    (WORK / "osm_construction.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": geo}, ensure_ascii=False),
        encoding="utf-8")

    # coverage: OSM episodes with a city-side match, and city rows with an OSM match
    osm_hit = {i for i, m in enumerate(matched_osm) if m}  # episode indices
    city_hit = Counter()
    osm_by_street = defaultdict(list)
    for r in rows:
        if normalise(r["name"]):
            osm_by_street[normalise(r["name"])].append(r)
    for c in t_rows + e_rows:
        for r in osm_by_street.get(c["street"], []) if c["street"] else []:
            if overlap(r["od"], r["do"] or DATA_END, *c["period"]):
                city_hit[(c["src"], c["id"])] += 1
    n_t = len({c["id"] for c in t_rows})
    n_t_hit = len({k[1] for k in city_hit if k[0] == "bzp"})
    n_e = len({c["id"] for c in e_rows})
    n_e_hit = len({k[1] for k in city_hit if k[0] == "plan"})

    per_year = Counter()
    for r in rows:
        for y in years(r["od"], r["do"] or DATA_END):
            per_year[y] += 1

    lines = ["# E9 — epizody OSM (construction) vs dane urzędu\n",
             f"Źródło: ohsome `elementsFullHistory/geometry`, bbox {BBOX}, filtr `{FILTER}`, "
             f"czas {TIME}. Zapytanie wykonane {time.strftime('%Y-%m-%d')} (cache: "
             f"work/osm/cache/fullhistory.json).\n",
             f"- epizodów OSM: **{len(rows)}** ({len({r['way_id'] for r in rows})} dróg)",
             f"- epizodów OSM z dopasowaniem do urzędu: **{len(osm_hit)}** "
             f"({len(osm_hit) * 100 // max(1, len(rows))}%)",
             f"- robót BZP (zakres, z ulicą OSM): {n_t}, z dopasowaniem w OSM: **{n_t_hit}**",
             f"- planów (events, poza_zakresem=False): {n_e}, z dopasowaniem w OSM: **{n_e_hit}**\n",
             "## Epizody na rok (rok obejmowany przez epizod)\n",
             "| rok | epizodów |", "|---|---|"]
    for y in sorted(per_year):
        lines.append(f"| {y} | {per_year[y]} |")
    lines.append("")
    lines.append("## 10 dopasowań (OSM ↔ urząd)\n")
    lines.append("| way | ulica | OSM od–do | źródło | id | okres | opis |\n|---|---|---|---|---|---|---|")
    shown = 0
    for r, ms in zip(rows, matched_osm):
        if ms and shown < 10:
            c = ms[0]
            lines.append(f"| {r['way_id']} | {r['name']} | {r['od']}–{r['do'] or 'otwarty'} | "
                         f"{c['src']} | {c['id']} | {c['period'][0]}–{c['period'][1]} | "
                         f"{c['label']} |".replace("\n", " "))
            shown += 1
    lines.append("")
    lines.append("## 10 epizodów OSM bez odpowiednika w danych urzędu\n")
    lines.append("| way | ulica | OSM od–do | construction | dł. m |\n|---|---|---|---|---|")
    shown = 0
    for r, ms in zip(rows, matched_osm):
        if not ms and shown < 10:
            lines.append(f"| {r['way_id']} | {r['name']} | {r['od']}–{r['do'] or 'otwarty'} | "
                         f"{r['construction']} | {r['dlugosc_m']} |")
            shown += 1
    lines.append("")
    (WORK / "osm" / "match_summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"episodes={len(rows)} osm_matched={len(osm_hit)} bzp={n_t_hit}/{n_t} plan={n_e_hit}/{n_e}")


def selftest():
    def feat(way, a, b):
        return {"way": way, "from": a, "to": b, "props": {}, "geom": {}}
    eps = merge_episodes([feat("1", "2020-01-01", "2020-03-01"),
                          feat("1", "2020-03-01", "2020-06-01"),   # touching -> merged
                          feat("1", "2021-01-01", "2021-02-01"),   # gap -> new episode
                          feat("2", "2020-01-01", "2020-02-01")])
    spans = sorted((e["way"], e["from"], e["to"]) for e in eps)
    assert spans == [("1", "2020-01-01", "2020-06-01"), ("1", "2021-01-01", "2021-02-01"),
                     ("2", "2020-01-01", "2020-02-01")], spans
    assert normalise("Łagiewnicka") == "lagiewnicka"
    assert abs(line_length_m({"type": "LineString", "coordinates": [[19.0, 51.0], [19.0, 51.01]]})
               - 1111.9) < 2


if __name__ == "__main__":
    selftest()
    data = fetch()
    feats = load_features(data)
    episodes = merge_episodes(feats)
    rows, geo = build_rows(episodes)
    t_rows, e_rows = load_city()
    matched = match(rows, t_rows + e_rows)
    assert rows and all(r["od"] for r in rows), "no episodes or empty start dates"
    write_outputs(rows, geo, matched, t_rows, e_rows)
    print(f"features={len(feats)} ways={len({f['way'] for f in feats})} "
          f"skipped_polygons={SKIPPED_POLYGONS[0]}")
