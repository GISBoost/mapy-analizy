"""E8: export the dashboard data for the public page mapy-analizy/remonty-lodz/.

Input:  work/dashboard_data.json (E7), work/records_geo.jsonl, work/sections.geojson, work/bzp_sections.geojson,
        work/docs.csv, bzp/bzp_*.csv, deklaracje.json (city statements with URLs, from the B6 chat dashboard)
Output: ../remonty-lodz/data/remonty.json
Every item gets a source URL: BZP notice page (by objectId) or the BIP file the plan item was read from.
"""
import collections, csv, json, re, sys, datetime as dt
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
    items = split_contracts(items)

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
        if do < "2019-01-01" or (dt.date.fromisoformat(do) - dt.date.fromisoformat(od)).days < 7 or f["geometry"]["type"] != "LineString":
            continue
        cand.append(f)
    # E10: clip to the city boundary, classify (unnamed / confirmed by city data / only OSM), balance of "only OSM"
    osm, bal = e10.process(cand, items, feats)
    conf = collections.Counter(f["properties"]["m"] for f in osm if f["properties"]["k"] == "p")
    for it in items:
        if conf.get(it["id"]):
            it["osm"] = conf[it["id"]]
    dekl = json.load(open(dekl_path, encoding="utf-8"))
    utr = restrictions(items)
    out = dict(meta=D["meta"], roczne=D["roczne"], dzienne=D["dzienne"], items=items,
               odcinki=dict(type="FeatureCollection", features=feats), deklaracje=dekl,
               osm=dict(type="FeatureCollection", features=osm), osm_bilans=bal, utrudnienia=utr)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"items={len(items)} with_point={sum(1 for i in items if i['lat'])} sections={len(feats)} "
          f"no_source={sum(1 for i in items if not i['zrodla'])} osm={len(osm)} utrudnienia={len(utr)} bytes={OUT.stat().st_size}")


TASK = re.compile(r"zadanie\s*(?:nr\s*)?(\d+)\s*[-–:]?\s*", re.I)
MULTI = re.compile(r"\bul(?:\.|ic[aey]?)\s+\w+\w*\s+(?:i|oraz)\s+(?:ul\.|ulic)|wraz z (?:modernizacją|przebudową|remontem) ul\.|dwie części|\bodc\. od.*\bi ul\.", re.I)


def split_contracts(items):
    """One BZP notice with 'zadanie 1 … ; zadanie 2 …' -> one item per task, same contract_id (UTRUDNIENIA.md, decision 6).
    The first task keeps the original id (existing links keep working); value stays on the first one only.
    Notices naming several streets without that pattern go to work/needs_review_bzp.csv, not split."""
    import e11_lodzpl as e11
    out, extra, review = [], [], []
    for it in items:
        parts = TASK.split(it["opis"] or "") if it["zrodlo"] != "plan" else []
        if len(parts) < 5:  # [head, n1, text1, n2, text2, ...]
            if it["zrodlo"] != "plan" and MULTI.search(it["opis"] or ""):
                review.append((it["id"], it["ulica"], it["opis"]))
            out.append(it)
            continue
        tasks = [(parts[k], parts[k + 1].strip(" ;”\"")) for k in range(1, len(parts) - 1, 2)]
        for n, (num, txt) in enumerate(tasks):
            if n == 0:
                out.append(it | {"contract_id": it["id"], "zadanie": num, "opis_zadania": txt})
                continue
            m = re.search(r"\bul\.\s*([A-ZĄĆĘŁŃÓŚŹŻ][\wąćęłńóśźż]+)", txt)
            g = e11.geocode([dict(ulica=m[1] if m else "", od=None, do=None, heading="")])[0] if m else {}
            pt = (g.get("geom") or {}).get("coordinates") if g.get("geom_typ") == "ulica" else None
            extra.append(it | {"id": f"{it['id']}#z{num}", "contract_id": it["id"], "zadanie": num, "opis_zadania": txt,
                             "ulica": g.get("osm_name") or (m[1].lower() if m else None),
                             "lat": pt[1] if pt else None, "lon": pt[0] if pt else None, "wartosc_zl": None, "osm": None})
    with open(WORK / "needs_review_bzp.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "ulica", "powod", "opis"])
        w.writerows((i, u, "kilka ulic bez wzorca 'zadanie N'; nie rozbito", o) for i, u, o in review)
    return out + extra  # appended, so existing items keep their order (E10 tie-breaks depend on it)


def _end(r):
    """Last day a restriction can be active: planned end padded to the period end, else last time seen on the page."""
    pub = max((o.get("published_at") or "" for o in r.get("obserwacje") or []), default="")  # source says "still ongoing" then
    d = r.get("date_end") or (r.get("last_seen") or pub or r.get("date_start") or "")[:10]
    return (d + ("-12-31" if len(d) == 4 else "-31" if len(d) == 7 else "")) if d else None


def restrictions(items):
    """work/utrudnienia.json (E11) -> compact export + 'auto' links to contracts on the same OSM street with overlapping dates."""
    p = WORK / "utrudnienia.json"
    if not p.exists():
        return []
    rows = json.load(open(p, encoding="utf-8"))
    keep = ("id", "source", "ulica", "od", "do", "kierunek", "jezdnia", "wlot", "pas", "faza", "traffic_impact", "lanes_open", "lanes_closed",
            "date_start", "start_precision", "date_end", "end_precision", "date_status", "zakres_prac", "inwestor", "cytat",
            "confidence", "needs_review", "na_stronie", "last_seen", "geom_typ", "geom", "uwagi")
    out = []
    for r in rows:
        s = (r.get("date_start") or ((r.get("obserwacje") or [{}])[0].get("captured_at") or ""))[:10]
        s = s + ("-01-01" if len(s) == 4 else "-01" if len(s) == 7 else "")
        e = _end(r)
        links = list(r.get("links") or [])
        if r.get("osm_name") and s:
            for it in items:
                if it["zrodlo"] != "plan" and it["ulica"] == r["osm_name"] and it["od"] and it["od"] <= (e or s) and it["do"] >= s[:10] \
                        and not any(l["id"] == it["id"] for l in links):
                    links.append(dict(typ="contract", id=it["id"], how="auto"))
        o = {k: r.get(k) for k in keep}
        o["okres"] = [s or None, e]  # padded window used by the map's day/year filters
        o["obserwacje"] = [{k: x.get(k) for k in ("url", "published_at", "captured_at")} for x in r.get("obserwacje") or []]
        o["links"] = links or None
        out.append(o)
    return out


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "deklaracje.json")
