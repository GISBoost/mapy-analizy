#!/usr/bin/env python3
"""E10: OSM "highway under construction" episodes -> web layer + balance category "tylko OSM".

Input : work/osm_construction.geojson (E9), work/osm/lodz_boundary_nominatim.json (city boundary,
        OSM relation 2413295, fetched once from Nominatim), city items + sections (passed in by E8).
Rules (script, no model):
  1. Episodes < 7 days, ending before 2019 or not LineString are dropped (as before).
  2. Geometry is clipped to the Lodz administrative boundary; parts outside are dropped.
  3. k="u"  no name (n empty): stays on the map, counted nowhere.
     k="p"  named, and a city item (BZP / plan; point or section) lies within BUFFER_M of the segment
            in a year within +-1 of the item years: same work, "confirmed in OSM", not counted twice.
     k="x"  named, no such item: category "only OSM". Ways of one street name with periods that
            overlap or are <= 30 days apart form one work (group g).
Run standalone for the self-check: py -I -X utf8 pipeline/e10_osm_balance.py
"""
import collections
import datetime as dt
import json
import re
import unicodedata
from pathlib import Path

import pyproj
from shapely.geometry import LineString, Point, shape
from shapely.ops import transform
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work"
BOUNDARY = WORK / "osm" / "lodz_boundary_nominatim.json"
BUFFER_M, YEAR_TOL, GAP_DAYS, MIN_DAYS = 100, 1, 30, 7
CUTOFF = "2026-11-07"  # data date used by the page; open episodes run to here
_TO_M = pyproj.Transformer.from_crs(4326, 2180, always_xy=True).transform  # PL-1992, metres


def metric(geom):
    return transform(_TO_M, geom)


def norm(name):
    s = (name or "").translate({ord("ł"): "l", ord("Ł"): "L"})
    return re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()).strip()


def years_overlap(a0, a1, b0, b1, tol):
    return a0 - tol <= b1 and b0 - tol <= a1


def city_geoms(items, sect_feats):
    """[(metric geometry, year_from, year_to, item id)] from points and sections of city items."""
    by_id = {i["id"]: i for i in items}
    out = []
    def span(i):
        if i.get("od") and i.get("do"):
            return int(i["od"][:4]), int(i["do"][:4])
        return (int(i["rok"]), int(i["rok"])) if i.get("rok") and str(i["rok"]).isdigit() else None
    for i in items:
        s = span(i)
        if s and i.get("lat"):
            out.append((metric(Point(i["lon"], i["lat"])), *s, i["id"]))
    for f in sect_feats:
        i = by_id.get(f["properties"]["id"]); s = i and span(i)
        if s:
            out.append((metric(shape(f["geometry"])), *s, i["id"]))
    return out


def classify(osm_feats, cgeoms, boundary):
    """osm_feats: E9 GeoJSON features (already time-filtered). Returns (web features, stats)."""
    tree = STRtree([c[0] for c in cgeoms])
    st = collections.Counter()
    web = []
    for f in osm_feats:
        p = f["properties"]
        od, do = p["od"][:10], (p["do"] or CUTOFF)[:10]
        g = shape(f["geometry"])
        st["episodes"] += 1
        inside = g.intersection(boundary)
        if inside.is_empty or inside.length == 0:
            st["outside"] += 1
            continue
        if inside.length < g.length - 1e-9:
            st["clipped"] += 1
        parts = [inside] if inside.geom_type == "LineString" else [x for x in getattr(inside, "geoms", []) if x.geom_type == "LineString"]
        name = (p["name"] or "").strip()
        m = None
        if name:
            near = tree.query(metric(g).buffer(BUFFER_M), predicate="intersects")
            for j in near:
                geo, y0, y1, iid = cgeoms[j]
                if years_overlap(int(od[:4]), int(do[:4]), y0, y1, YEAR_TOL):
                    m = iid
                    break
        k = "u" if not name else "p" if m else "x"
        st["unnamed" if k == "u" else "confirmed" if k == "p" else "only_osm"] += 1
        for part in parts:
            web.append(dict(type="Feature", geometry=dict(type="LineString", coordinates=[[round(x, 5), round(y, 5)] for x, y in part.coords]),
                            properties=dict(n=name, od=od, do=do, w=p["way_id"], o=p["otwarty"], k=k, **({"m": m} if m else {}))))
    st["segments_out"] = len(web)
    return web, st


def group_only_osm(web):
    """Assign group id g to k="x" features; return [(g, name, od, do)]."""
    by_name = collections.defaultdict(dict)  # name -> way -> (od, do)
    for f in web:
        p = f["properties"]
        if p["k"] == "x":
            w = by_name[norm(p["n"])].setdefault(p["w"], [p["od"], p["do"]])
            w[0], w[1] = min(w[0], p["od"]), max(w[1], p["do"])
    groups = []
    for nm, ways in sorted(by_name.items()):
        cur = None
        for w, (a, b) in sorted(ways.items(), key=lambda kv: kv[1]):
            if cur and dt.date.fromisoformat(a) <= dt.date.fromisoformat(cur[3]) + dt.timedelta(days=GAP_DAYS):
                cur[3] = max(cur[3], b)
            else:
                cur = [f"X{len(groups) + 1:03d}", nm, a, b]; groups.append(cur)
    for f in web:
        p = f["properties"]
        if p["k"] == "x":
            nm = norm(p["n"])
            p["g"] = next(g[0] for g in groups if g[1] == nm and g[2] <= p["od"] <= g[3])
    return groups


def balance(groups):
    """Per-year number of works, days with >= 1 only-OSM work, peak; plus daily series (non-zero days)."""
    delta = collections.Counter()
    for _, _, a, b in groups:
        delta[dt.date.fromisoformat(a)] += 1
        delta[min(dt.date.fromisoformat(b), dt.date.fromisoformat(CUTOFF)) + dt.timedelta(days=1)] -= 1
    daily, run, d = {}, 0, min(delta)
    while d <= dt.date.fromisoformat(CUTOFF):
        run += delta[d]; daily[d] = run; d += dt.timedelta(days=1)
    roczne = []
    for y in range(2019, 2027):
        days = [n for d, n in daily.items() if d.year == y]
        roczne.append(dict(rok=str(y), roboty=sum(1 for g in groups if int(g[2][:4]) <= y <= int(g[3][:4])),
                           dni_ge1=sum(1 for n in days if n >= 1), max_jednoczesnie=max(days, default=0)))
    return roczne, [[d.isoformat(), n] for d, n in sorted(daily.items()) if n and d.year >= 2019]


def process(osm_feats, items, sect_feats):
    boundary = shape(json.load(open(BOUNDARY, encoding="utf-8"))["features"][0]["geometry"])  # lon/lat
    web, st = classify(osm_feats, city_geoms(items, sect_feats), boundary)
    groups = group_only_osm(web)
    roczne, daily = balance(groups)
    st["only_osm_works"] = len(groups)
    # invariant: every kept episode lands in exactly one class
    assert st["unnamed"] + st["confirmed"] + st["only_osm"] == st["episodes"] - st["outside"], st
    return web, dict(roczne=roczne, dzienne=daily, stats=dict(st))


def selftest():
    # buffer: a city point 99 m from an OSM line matches, 101 m does not (metres in EPSG:2180)
    to_ll = pyproj.Transformer.from_crs(2180, 4326, always_xy=True).transform
    x0, y0 = 500000.0, 500000.0
    line = transform(to_ll, LineString([(x0, y0), (x0 + 200, y0)]))
    near, far = transform(to_ll, Point(x0 + 100, y0 + 99)), transform(to_ll, Point(x0 + 100, y0 + 101))
    buf = metric(line).buffer(BUFFER_M)
    assert buf.intersects(metric(near)) and not buf.intersects(metric(far))
    assert years_overlap(2022, 2022, 2023, 2025, 1) and not years_overlap(2021, 2021, 2023, 2025, 1)
    assert norm("Łagiewnicka") == "lagiewnicka"
    g = [["X1", "a", "2022-01-01", "2022-01-10"]]
    r, d = balance(g)
    assert [x for x in r if x["rok"] == "2022"][0]["dni_ge1"] == 10 and len(d) == 10


if __name__ == "__main__":
    selftest()
    print("e10 selftest ok")
