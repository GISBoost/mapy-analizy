"""E4 step 3: cluster record mentions into events (event = street section + period, LEJEK.md).

Input:  work/records_geo.jsonl, work/sections.geojson, work/docs.csv (year fallback)
Output: work/records_geo.jsonl with event_id; work/events.csv
Rule (union-find): same OSM street AND years within WINDOW AND sections compatible
(either side has no section, or the two sections share a point within 30 m).
Records without a matched street stay single-mention events.
"""
import csv, json, sys, collections
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from e4_geocode import WORK, hav

WINDOW = 2  # ponytail: fixed +/-2 year window; tune once dates beyond plan year exist


def year_of(r, doc_year):
    y = r.get("rok_planu") or doc_year.get(r.get("doc_id"))
    return int(y) if str(y).isdigit() else None


def scope(r):  # never merge in-scope road work with out-of-scope items, nor tram track with carriageway
    return ("poza_zakresem" in (r.get("flagi") or []), r.get("typ") == "torowisko")


def overlap(a, b):
    return a is None or b is None or any(hav(p, q) <= 30 for p in a[::3] for q in b)


def main():
    doc_year = {d["doc_id"]: d["year"] for d in csv.DictReader(open(WORK / "docs.csv", encoding="utf-8"))}
    recs = [json.loads(l) for l in open(WORK / "records_geo.jsonl", encoding="utf-8")]
    secs = {}
    for f in json.load(open(WORK / "sections.geojson", encoding="utf-8"))["features"]:
        p = f["properties"]
        secs[(p["doc_id"], p["ulica"], p["od"], p["do"])] = [(la, lo) for lo, la in f["geometry"]["coordinates"]]
    for r in recs:
        # ponytail: >100 mln zl on a non-tram item is almost always a plan subtotal picked up by the script
        if (r.get("wartosc_zl") or 0) > 1e8 and r.get("typ") != "torowisko":
            r["flagi"] = sorted(set((r.get("flagi") or []) + ["wartosc_podejrzana"]))
        r["_year"] = year_of(r, doc_year)
        r["_sec"] = secs.get((r.get("doc_id"), r.get("osm_name"), r.get("od_osm"), r.get("do_osm"))) if r.get("odcinek_status") == "ok" else None

    parent = list(range(len(recs)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    by_street = collections.defaultdict(list)
    for i, r in enumerate(recs):
        if r.get("osm_name"):
            by_street[r["osm_name"]].append(i)
    for idx in by_street.values():
        for a in idx:
            for b in idx:
                ra, rb = recs[a], recs[b]
                if a < b and scope(ra) == scope(rb) and (ra["_year"] is None or rb["_year"] is None or abs(ra["_year"] - rb["_year"]) <= WINDOW) \
                        and overlap(ra["_sec"], rb["_sec"]):
                    parent[find(a)] = find(b)

    groups = collections.defaultdict(list)
    for i in range(len(recs)):
        groups[find(i)].append(i)
    rows = []
    for n, idx in enumerate(sorted(groups.values(), key=lambda g: (recs[g[0]].get("osm_name") or "~", g[0])), 1):
        eid = f"E{n:04d}"
        g = [recs[i] for i in idx]
        for r in g:
            r["event_id"] = eid
        years = sorted({r["_year"] for r in g if r["_year"]})
        vals = [r["wartosc_zl"] for r in g if r.get("wartosc_zl") and "wartosc_podejrzana" not in (r.get("flagi") or [])]
        rows.append(dict(event_id=eid, ulica=g[0].get("osm_name") or g[0].get("ulica") or "",
                         rok_od=years[0] if years else "", rok_do=years[-1] if years else "",
                         statusy="; ".join(sorted({r.get("status") or "" for r in g})),
                         n_wzmianek=len(g), max_wartosc_zl=max(vals) if vals else "",
                         odcinek_m=max((r.get("odcinek_m") or 0 for r in g), default=0) or "",
                         poza_zakresem=all("poza_zakresem" in (r.get("flagi") or []) for r in g),
                         doc_ids="; ".join(sorted({r.get("doc_id") or "" for r in g}))))
    for r in recs:
        r.pop("_year"); r.pop("_sec")
    with open(WORK / "records_geo.jsonl", "w", encoding="utf-8") as f:
        for r in recs:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open(WORK / "events.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    multi = sum(1 for x in rows if x["n_wzmianek"] > 1)
    print(f"records={len(recs)} events={len(rows)} multi_mention={multi} "
          f"in_scope_with_street={sum(1 for x in rows if not x['poza_zakresem'] and x['ulica'])} "
          f"suspicious_values={sum(1 for r in recs if 'wartosc_podejrzana' in (r.get('flagi') or []))}")


if __name__ == "__main__":
    assert overlap(None, [(51, 19)]) and overlap([(51, 19)], [(51.0001, 19)]) and not overlap([(51, 19)], [(51.01, 19)])
    main()
