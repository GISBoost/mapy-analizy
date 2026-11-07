"""E8: export the dashboard data for the public page mapy-analizy/remonty-lodz/.

Input:  work/dashboard_data.json (E7), work/records_geo.jsonl, work/sections.geojson, work/bzp_sections.geojson,
        work/docs.csv, bzp/bzp_*.csv, deklaracje.json (city statements with URLs, from the B6 chat dashboard)
Output: ../remonty-lodz/data/remonty.json
Every item gets a source URL: BZP notice page (by objectId) or the BIP file the plan item was read from.
"""
import collections, csv, json, sys, datetime as dt
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e10_osm_balance as e10

ROOT = Path(__file__).resolve().parent.parent
WORK, OUT = ROOT / "work", ROOT.parent / "remonty-lodz" / "data" / "remonty.json"
BZP_URL = "https://ezamowienia.gov.pl/mo-client-board/bzp/notice-details/id/{}"


def main(dekl_path):
    D = json.load(open(WORK / "dashboard_data.json", encoding="utf-8"))
    docs = {d["doc_id"]: d for d in csv.DictReader(open(WORK / "docs.csv", encoding="utf-8"))}
    obj = {}
    for b in ("zdit", "zim", "uml"):
        for r in csv.DictReader(open(ROOT / f"bzp/bzp_{b}.csv", encoding="utf-8")):
            obj.setdefault(r["tender_id"], []).append((r["date"], r["notice_type"], r["object_id"], r["notice_number"]))
    recs = [json.loads(l) for l in open(WORK / "records_geo.jsonl", encoding="utf-8")]
    ev_of = {(r.get("doc_id"), r.get("osm_name"), r.get("od_osm"), r.get("do_osm")): r.get("event_id") for r in recs if r.get("odcinek_status") == "ok"}

    items = []
    for i in D["items"]:
        if i["zrodlo"] == "plan":
            ds = [docs[d] for d in i["ref"].split("; ") if d in docs]
            src = [dict(typ="BIP UMŁ", nazwa=d["link_text"] or d["path"].split("::")[-1], url=d["source_url"], plik=d["path"].split("::")[-1]) for d in ds]
        else:
            src = [dict(typ=f"BZP {t.replace('Notice', '')}", nazwa=n, data=dte, url=BZP_URL.format(o))
                   for dte, t, o, n in sorted(obj.get(i["ref"], []))]
        items.append({k: i[k] for k in ("id", "zrodlo", "rok", "status", "ulica", "lat", "lon", "od", "do", "wartosc_zl", "opis")} | {"zrodla": src})

    feats = []
    for f in json.load(open(WORK / "sections.geojson", encoding="utf-8"))["features"]:
        p = f["properties"]
        eid = ev_of.get((p["doc_id"], p["ulica"], p["od"], p["do"]))
        if any(it["id"] == eid for it in items):
            feats.append(dict(type="Feature", properties=dict(id=eid), geometry=f["geometry"]))
    by_ref = {i["ref"]: i["id"] for i in D["items"] if i["zrodlo"] != "plan"}
    for f in json.load(open(WORK / "bzp_sections.geojson", encoding="utf-8"))["features"]:
        if f["properties"]["tender_id"] in by_ref:
            feats.append(dict(type="Feature", properties=dict(id=by_ref[f["properties"]["tender_id"]]), geometry=f["geometry"]))
    for f in feats:
        f["geometry"]["coordinates"] = [[round(x, 5), round(y, 5)] for x, y in f["geometry"]["coordinates"]]

    # OSM "highway under construction" episodes (e9), as a separate layer: >= 7 days, overlapping 2021-01-01..data date
    cand = []
    for f in json.load(open(WORK / "osm_construction.geojson", encoding="utf-8"))["features"]:
        p = f["properties"]
        od, do = p["od"][:10], (p["do"] or "2026-11-07")[:10]
        if do < "2021-01-01" or (dt.date.fromisoformat(do) - dt.date.fromisoformat(od)).days < 7 or f["geometry"]["type"] != "LineString":
            continue
        cand.append(f)
    # E10: clip to the city boundary, classify (unnamed / confirmed by city data / only OSM), balance of "only OSM"
    osm, bal = e10.process(cand, items, feats)
    conf = collections.Counter(f["properties"]["m"] for f in osm if f["properties"]["k"] == "p")
    for it in items:
        if conf.get(it["id"]):
            it["osm"] = conf[it["id"]]
    dekl = json.load(open(dekl_path, encoding="utf-8"))
    out = dict(meta=D["meta"], roczne=D["roczne"], dzienne=D["dzienne"], items=items,
               odcinki=dict(type="FeatureCollection", features=feats), deklaracje=dekl,
               osm=dict(type="FeatureCollection", features=osm), osm_bilans=bal)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"items={len(items)} with_point={sum(1 for i in items if i['lat'])} sections={len(feats)} "
          f"no_source={sum(1 for i in items if not i['zrodla'])} osm={len(osm)} bytes={OUT.stat().st_size}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "deklaracje.json")
