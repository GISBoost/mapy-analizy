"""Merge pilot E3 records with script-extracted plan items into one record file.

Input:  work/pilot/records.jsonl, work/plans/plan_items.csv
Output: work/records_all.jsonl (pilot records first; plan items converted to the same schema)
Dedup: a plan item is dropped when a pilot record has the same doc_id+page+value (already extracted),
or when an earlier plan item has the same first street + value (same item in another plan version/year).
"""
import csv, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from e3p_plans import classify

WORK = Path(__file__).resolve().parent.parent / "work"


def to_float(v):
    return float(v.replace(",", ".")) if v else None


def main():
    pilot = [json.loads(l) for l in open(WORK / "pilot/records.jsonl", encoding="utf-8")]
    for r in pilot:
        r.setdefault("zrodlo", "pilot_e3")
        q = " ".join([r.get("cytat") or ""] + (r.get("cytat_nazwa") or []) + (r.get("cytaty") or []))
        if q.strip() and classify(q) in ("poza_zakresem", None) and "poza_zakresem" not in (r.get("flagi") or []):
            r["flagi"] = (r.get("flagi") or []) + ["poza_zakresem"]  # same scope rule as plan items
    have = {(r.get("doc_id"), r.get("page", r.get("strona")), r.get("wartosc_zl")) for r in pilot}
    pilot_vals = {r.get("wartosc_zl") for r in pilot if r.get("wartosc_zl")}
    seen, out, n_pilot_dup, n_cross_dup = set(), list(pilot), 0, 0
    for it in csv.DictReader(open(WORK / "plans/plan_items.csv", encoding="utf-8")):
        val, page = to_float(it["value_pln"]), int(it["page"])
        if (it["doc_id"], page, val) in have or val in pilot_vals:  # ponytail: value-only match; exact PLN amounts rarely collide
            n_pilot_dup += 1
            continue
        street = it["streets"].split("; ")[0] or None
        key = (street, val)
        if street and val and key in seen:
            n_cross_dup += 1
            continue
        seen.add(key)
        out.append(dict(doc_id=it["doc_id"], page=page, ulica=street, od=None, do=None,
                        typ="torowisko" if it["kind"] == "torowisko" else None,
                        L_rob_m=None, szer_m=None, A_m2=None, pasy=None, data_start=None, data_koniec=None,
                        status="plan", wartosc_zl=val, rodzaj_wartosci="szacunkowa" if val else None,
                        cytaty=[it["subject"]], rok_planu=int(it["year"]) if it["year"].isdigit() else None,
                        termin_tekst=f"{it['quarter']} kwartał" if it["quarter"] else None,
                        flagi=["poza_zakresem"] if it["kind"] == "poza_zakresem" else [],
                        pewnosc="skrypt", zrodlo="e3p_plans", n_wersji_planu=int(it["n_versions"])))
    with open(WORK / "records_all.jsonl", "w", encoding="utf-8") as f:
        for r in out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"pilot={len(pilot)} plan_added={len(out)-len(pilot)} dup_with_pilot={n_pilot_dup} dup_across_plans={n_cross_dup} total={len(out)}")


if __name__ == "__main__":
    assert to_float("1234,50") == 1234.5 and to_float("") is None
    main()
