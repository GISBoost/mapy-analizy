import csv, collections
from pathlib import Path
W = Path(__file__).resolve().parent.parent / "work"
TYPES = "dokumentacja_projektowa plan_postepowan swz_opz umowa ogloszenie_o_udzieleniu zapytanie_ofertowe ogloszenie_o_wykonaniu ogloszenie_o_zamowieniu korespondencja_zdit nieruchomosci_ZNN".split()
docs = {d["doc_id"]: d for d in csv.DictReader(open(W/"docs.csv", encoding="utf-8"))}
pg = collections.defaultdict(list)
for r in csv.DictReader(open(W/"pages.csv", encoding="utf-8")): pg[r["doc_id"]].append(r)
sel, lines = [], []
for t in TYPES:
    ds = [(sum(int(p["strong"]) for p in v), sum(int(p["candidate"]) for p in v), h) for h, v in pg.items() if v[0]["doc_type"] == t]
    ds.sort(key=lambda x: (-x[0], -x[1], x[2]))
    ns, nc, h = ds[0]
    cands = [p for p in pg[h] if p["candidate"] == "1"]
    cands.sort(key=lambda p: (-(int(p["nA"])+int(p["nB"])+int(p["nC"])), int(p["page"])))
    use = sorted(int(p["page"]) for p in cands[:15])
    note = f"{len(cands)} kandydatów, wzięto {len(use)}" + (" (obcięto do 15 o najwyższym nA+nB+nC)" if len(cands) > 15 else "")
    lines.append(f"| {t} | {h[:10]} | {docs[h]['path'][:70]} | strong {ns}, kand. {nc} | {note} | {use} |")
    sel.append((h, t, use))
(W/"pilot"/"selection.md").write_text("# Wybór pilota (reguła, bez ręcznych poprawek)\n\nDla każdego z 10 typów: dokument z największą liczbą stron silnych (remis: więcej kandydatów, potem doc_id rosnąco). Gdy typ nie ma stron silnych, ta sama reguła wybiera dokument z największą liczbą kandydatów. Czytane tylko strony-kandydaty, max 15 o najwyższym nA+nB+nC. Skrypt: pipeline/pilot_select.py.\n\n| typ | doc_id | path | strony | strony czytane | numery stron |\n|---|---|---|---|---|---|\n" + "\n".join(lines) + "\n", encoding="utf-8")
import json; json.dump(sel, open(W/"pilot"/"selected.json", "w"))
