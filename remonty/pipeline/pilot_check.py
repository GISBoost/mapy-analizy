import json, re, sys
from pathlib import Path
W = Path(__file__).resolve().parent.parent / "work"
ws = lambda s: re.sub(r"\s+", " ", s.replace(" ", " ")).strip()
nums = lambda s: {float(re.sub(r"\s", "", m).replace(",", ".")) for m in re.findall(r"\d[\d\s]*(?:[.,]\d+)?", s) if re.sub(r"\s", "", m).replace(",", ".").replace(".", "", 1).isdigit()}
bad, n, docs = [], 0, set()
for line in open(W / "pilot" / "records.jsonl", encoding="utf-8"):
    r = json.loads(line)
    if r.get("brak_rekordow"): continue
    n += 1
    page = ws((W / "text" / r["doc_id"] / f"p{r['page']:03d}.txt").read_text(encoding="utf-8"))
    frags = [r["cytat"]] + r.get("cytat_extra", []) + r.get("cytat_nazwa", [])
    for fr in frags:
        if ws(fr) not in page: bad.append((r["doc_id"][:8], r["page"], "cytat nie wystepuje", fr[:60]))
    if len(r["cytat"]) > 300: bad.append((r["doc_id"][:8], r["page"], "cytat >300", len(r["cytat"])))
    have = nums(" ".join([r["cytat"]] + r.get("cytat_extra", [])))
    for k in ("L_rob_m", "szer_m", "A_m2", "wartosc_zl"):
        if r.get(k) is not None and float(r[k]) not in have: bad.append((r["doc_id"][:8], r["page"], f"{k}={r[k]} brak w cytacie", ""))
print("records", n, "bad", len(bad))
for b in bad: print(b)
sys.exit(1 if bad else 0)
