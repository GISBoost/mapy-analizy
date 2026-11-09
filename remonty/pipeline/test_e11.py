"""Regression checks for e11_lodzpl (UTRUDNIENIA.md §6). Run: py test_e11.py  (no framework)."""
import json, shutil, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e11_lodzpl as e

FIX = Path(__file__).resolve().parent / "fixtures" / "lodzpl_remonty_20261109.html"


def by_card(rows, cid):
    return [r for r in rows if r.get("source_card") == cid]


def one(rows, cid, **want):
    rs = [r for r in by_card(rows, cid) if all(r.get(k) == v for k, v in want.items())]
    assert len(rs) == 1, (cid, want, [(r["ulica"], r["traffic_impact"]) for r in by_card(rows, cid)])
    return rs[0]


def run():
    tmp = Path(tempfile.mkdtemp())
    e.WORK, e.SNAP = tmp, tmp / "lodzpl"
    e.SNAP.mkdir()
    shutil.copy(FIX, e.SNAP / "20261109T080000.html")
    rows = e.build()

    # 1. Politechniki/Wróblewskiego: three restrictions
    assert len(by_card(rows, "c266")) == 3
    r = one(rows, "c266", traffic_impact="one_lane_open")
    assert r["ulica"] == "POLITECHNIKI" and r["lanes_open"] == 1 and r["pas"] == "lewy" and "centrum" in r["kierunek"]
    assert r["date_start"] == "2026-11-08" and r["start_precision"] == "exact" and r["date_status"] == "planned"
    r = one(rows, "c266", traffic_impact="full_closure")
    assert r["ulica"] == "WRÓBLEWSKIEGO" and "Wólczańskiej" in r["wlot"]
    one(rows, "c266", traffic_impact="turn_ban")
    assert not by_card(rows, "c268"), "duplicate card c268 must be folded into c266"
    # 2. Stare Złotno: alternating, no lanes, spring 2027
    r = one(rows, "c245")
    assert r["traffic_impact"] == "alternating_traffic" and r["lanes_open"] is None and r["lanes_closed"] is None
    assert (r["date_end"], r["end_precision"]) == ("2027-03", "season")
    # 3. Starorudzka: one direction, never full closure
    r = one(rows, "c198")
    assert r["traffic_impact"] == "one_direction_only" and r["date_start"] == "2026-06-29"
    assert r["kierunek"] == "od Pabianickiej do Przestrzennej"
    # 4. Pojezierska: both directions, lanes unknown
    r = one(rows, "c258")
    assert r["traffic_impact"] == "both_directions_maintained" and r["lanes_open"] is None
    assert (r["date_start"], r["date_end"]) == ("2026-11-04", "2026-11-10") and r["duplikat_kart"] == ["c264"]
    # 5. Paderewskiego: one lane, stage ambiguous -> review, not split
    r = one(rows, "c261")
    assert r["traffic_impact"] == "one_lane_open" and r["date_start"] == "2026-10-23"
    assert r["needs_review"] and "etap" in r["needs_review"] and r["faza"] is None
    # 6. Pabianicka (Ner – rondo): "raz dwa, raz jeden" -> narrowing, no lane count
    r = one(rows, "c175")
    assert r["traffic_impact"] == "lane_narrowing" and r["lanes_closed"] is None and r["lanes_open"] is None
    assert r["jezdnia"] == "jezdnia w kierunku centrum"
    # 7. closed + local access = one local_access_only; "bez wjazdów docelowych" stays a closure
    for cid in ("c265", "c246"):  # Łukowa, Olsztyńska
        assert [x["traffic_impact"] for x in by_card(rows, cid)] == ["local_access_only"], cid
    assert one(rows, "c196")["traffic_impact"] == "full_closure"  # 1 Maja: bez wjazdów docelowych
    # 8. only "pod ruchem" -> unknown
    r = one(rows, "c249")
    assert r["traffic_impact"] == "unknown" and r["rule_id"] == "pod_ruchem"
    # 9. every card yields >= 1 restriction or a review entry; no silent drops
    cards = [c for c in e.parse_cards(FIX.read_text(encoding="utf-8")) if e.is_card(c)]
    kept = e.dedupe(cards)
    assert all(by_card(rows, cid) for cid in kept), [c for c in kept if not by_card(rows, c)]
    # every row carries evidence
    assert all(r.get("obserwacje") and r["obserwacje"][0]["url"] for r in rows)

    # seed (10–13)
    s = {r["id"]: r for r in rows if r["id"].startswith("seed:")}
    r = s["seed:LOD-2025-PAB-01"]
    assert r["traffic_impact"] == "one_lane_closed" and r["start_precision"] == "approximate" and r["date_end"] is None
    assert s["seed:LOD-2025-RZG-01"]["confidence"] == "medium" and s["seed:LOD-2025-RZG-01"]["date_start"] == "2025-07-05"
    assert s["seed:LOD-2025-ZER-01"]["ulica"] == "Żeromskiego"
    assert not any("politechniki" in r["ulica"].lower() for r in rows if r["date_start"] and r["date_start"] < "2026")
    assert s["seed:LOD-2025-WRO-01"]["traffic_impact"] == "unknown"

    # 14. idempotent
    n = len((e.SNAP / "observations.jsonl").read_text(encoding="utf-8").splitlines())
    assert json.dumps(e.build(), sort_keys=True) == json.dumps(rows, sort_keys=True)
    assert len((e.SNAP / "observations.jsonl").read_text(encoding="utf-8").splitlines()) == n
    # 15. changed card -> new observation, old one kept
    page = FIX.read_text(encoding="utf-8").replace("Ruch odbywa się wahadłowo.", "Ulica zamknięta dla ruchu.")
    (e.SNAP / "20261116T080000.html").write_text(page, encoding="utf-8")
    rows2 = e.build()
    r = one(rows2, "c245")
    assert r["traffic_impact"] == "full_closure" and len(r["obserwacje"]) == 2
    assert "wahadłowo" in r["obserwacje"][0]["cytat"]
    shutil.rmtree(tmp)

    # date parser
    assert e.parse_date("Planowane zakończenie: połowa grudnia 2026 r.") == ("2026-12", "month")
    assert e.parse_date("do końca 2026 r.") == ("2026", "year")
    assert e.parse_date("Start prac: 23.10.2026 r.") == ("2026-10-23", "exact")
    print("test_e11: ok")


if __name__ == "__main__":
    run()
