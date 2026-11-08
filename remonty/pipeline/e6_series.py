"""E6: yearly series of in-scope road works (carriageway + tram track), plans and tenders combined.

Input:  work/events.csv (plans/pilot), work/bzp_tenders.csv, work/event_bzp_links.csv
Output: work/series_yearly.csv
Unit = one investment: an in-scope event from plans, or an in-scope BZP tender. A plan event linked to
a tender counts once, in the tender's year (the tender is the stronger evidence). Year = plan year for
plans, first notice year for tenders. Events without a year are listed in the 'bez_roku' row.
"""
import csv, collections
from pathlib import Path

WORK = Path(__file__).resolve().parent.parent / "work"


def main():
    rd = lambda n: list(csv.DictReader(open(WORK / n, encoding="utf-8")))
    links = rd("event_bzp_links.csv")
    linked_ev = {l["event_id"] for l in links}
    rows = collections.defaultdict(collections.Counter)
    val = collections.Counter()
    for e in rd("events.csv"):
        if e["poza_zakresem"] == "False" and e["event_id"] not in linked_ev:
            y = e["rok_od"] or "bez_roku"
            rows[y]["tylko_plan"] += 1
            rows[y]["z_ulica_osm"] += bool(e["ulica"])
    for t in rd("bzp_tenders.csv"):
        if t["zakres"] in ("jezdnia", "torowisko"):
            y = t["rok"]
            rows[y]["przetarg"] += 1
            rows[y][f"przetarg_{t['zamawiajacy']}"] += 1
            rows[y][f"status_{t['status']}"] += 1
            rows[y]["z_ulica_osm"] += bool(t["ulice_osm"])
            val[y] += float(t["wartosc_zl"] or 0)
    for l in links:  # linked tenders are already counted as tenders; just mark how many were also planned
        rows[l["rok_przetargu"]]["przetarg_tez_w_planie"] += 1
    cols = ["rok", "razem", "tylko_plan", "przetarg", "przetarg_zdit", "przetarg_zim", "przetarg_uml", "przetarg_tez_w_planie",
            "status_ogloszone", "status_udzielone", "status_wykonane", "z_ulica_osm", "wartosc_przetargow_mln_zl", "okres"]
    out = []
    for y in sorted(rows):
        c = rows[y]
        okres = "bilet_wydluzony" if y.isdigit() and 2018 <= int(y) <= 2024 else ("po_bilecie" if y.isdigit() and int(y) >= 2025 else "")
        out.append({"rok": y, "razem": c["tylko_plan"] + c["przetarg"], **{k: c[k] for k in cols[2:12]},
                    "wartosc_przetargow_mln_zl": round(val[y] / 1e6, 1), "okres": okres})
    with open(WORK / "series_yearly.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(out)
    for r in out:
        print(r["rok"], r["razem"], r["tylko_plan"], r["przetarg"], r["przetarg_tez_w_planie"], r["status_wykonane"], r["wartosc_przetargow_mln_zl"])


if __name__ == "__main__":
    main()
