"""E7: days with >=1/3/5 ongoing road works, map points per year, and the dashboard data export.

Input:  work/series_yearly.csv, work/bzp_tenders.csv, work/events.csv, work/records_geo.jsonl, work/event_bzp_links.csv
Output: work/summary_yearly.csv, work/daily_active.csv, work/dashboard_data.json
Interval = BZP contract period [umowa_od, umowa_do] (in-scope tenders only). This is the contract
period, not the physical road closure: an upper bound, and for 'zaprojektuj i wybuduj' it includes design.
Plan items have no dates (quarter at best), so they are on the map but not in the daily count.
"""
import csv, json, collections, datetime as dt
from pathlib import Path

WORK = Path(__file__).resolve().parent.parent / "work"
THRESHOLDS = (1, 3, 5)


def daily_counts(intervals):
    """{date: number of intervals covering it}; intervals are (start, end) inclusive."""
    delta = collections.Counter()
    for a, b in intervals:
        delta[a] += 1
        delta[b + dt.timedelta(days=1)] -= 1
    out, run = {}, 0
    if not delta:
        return out
    d, last = min(delta), max(delta)
    while d < last:
        run += delta[d]
        out[d] = run
        d += dt.timedelta(days=1)
    return out


def main():
    rd = lambda n: list(csv.DictReader(open(WORK / n, encoding="utf-8")))
    tenders = [t for t in rd("bzp_tenders.csv") if t["zakres"] in ("jezdnia", "torowisko")]
    links = rd("event_bzp_links.csv")
    linked_ev = {l["event_id"] for l in links}
    recs = [json.loads(l) for l in open(WORK / "records_geo.jsonl", encoding="utf-8")]
    ev_pt = {}
    for r in recs:
        if r.get("event_id") and r.get("lat") and r["event_id"] not in ev_pt:
            ev_pt[r["event_id"]] = (r["lat"], r["lon"], r.get("cytaty", [r.get("cytat")])[0] if r.get("cytaty") else r.get("cytat"), r.get("doc_id"))

    items = []
    for e in rd("events.csv"):
        if e["poza_zakresem"] == "False" and e["event_id"] not in linked_ev:
            p = ev_pt.get(e["event_id"])
            items.append(dict(id=e["event_id"], zrodlo="plan", rok=e["rok_od"] or None, status="plan", ulica=e["ulica"] or None,
                              lat=p[0] if p else None, lon=p[1] if p else None, od=None, do=None,
                              wartosc_zl=float(e["max_wartosc_zl"]) if e["max_wartosc_zl"] else None,
                              opis=(p[2] if p else None), ref=e["doc_ids"]))
    for t in tenders:
        items.append(dict(id=t["bzp"], zrodlo="bzp_" + t["zamawiajacy"], rok=t["rok"], status=t["status"], ulica=t["ulice_osm"].split("; ")[0] or None,
                          lat=float(t["lat"]) if t["lat"] else None, lon=float(t["lon"]) if t["lon"] else None,
                          od=t["umowa_od"] or None, do=t["umowa_do"] or None,
                          wartosc_zl=float(t["wartosc_zl"]) if t["wartosc_zl"] else None, opis=t["przedmiot"], ref=t["tender_id"]))

    cutoff = dt.date(2026, 11, 7)  # data date; days after it are planned, not observed
    iv = [(dt.date.fromisoformat(i["od"]), min(dt.date.fromisoformat(i["do"]), cutoff)) for i in items if i["od"] and dt.date.fromisoformat(i["od"]) <= cutoff]
    daily = daily_counts(iv)
    with open(WORK / "daily_active.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f); w.writerow(["data", "aktywne"]); w.writerows((d.isoformat(), n) for d, n in sorted(daily.items()))

    series = {r["rok"]: r for r in rd("series_yearly.csv")}
    out = []
    for y in sorted(series, key=lambda y: (not y.isdigit(), y)):
        yi = [i for i in items if (i["rok"] or "bez_roku") == y]
        days = [n for d, n in daily.items() if str(d.year) == y]
        out.append(dict(rok=y, roboty=series[y]["razem"], punkty_na_mapie=sum(1 for i in yi if i["lat"]),
                        z_datami_umowy=sum(1 for i in yi if i["od"]),
                        **{f"dni_ge{k}": sum(1 for n in days if n >= k) for k in THRESHOLDS},
                        max_jednoczesnie=max(days, default=0), okres=series[y]["okres"]))
    with open(WORK / "summary_yearly.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
    meta = dict(wygenerowano=dt.date.today().isoformat(), bilet=dict(od="2018-10-11", do="2024-12-31"),
                uwagi="Przedział dat = okres umowy z BZP (górna granica robót). Pozycje planów bez dat.")
    (WORK / "dashboard_data.json").write_text(json.dumps(dict(meta=meta, roczne=out, items=items,
        dzienne=[[d.isoformat(), n] for d, n in sorted(daily.items())]), ensure_ascii=False), encoding="utf-8")
    for r in out:
        print(r)


if __name__ == "__main__":
    c = daily_counts([(dt.date(2021, 1, 1), dt.date(2021, 1, 3)), (dt.date(2021, 1, 2), dt.date(2021, 1, 2))])
    assert c == {dt.date(2021, 1, 1): 1, dt.date(2021, 1, 2): 2, dt.date(2021, 1, 3): 1}
    main()
