"""Extract road-work items from UML procurement plans (doc_type plan_postepowan).

Input:  work/docs.csv, work/text/<doc_id>/pNNN.txt
Output: work/plans/plan_items.csv (deduplicated across plan updates), work/plans/summary.md
Every row keeps doc_id + page + raw subject as its quote. Status is always `plan`.
"""
import csv, re, sys, collections
from pathlib import Path

WORK = Path(__file__).resolve().parent.parent / "work"
ITEM = re.compile(r"^\s{0,8}(\d{1,3}(?:\.\d{1,3}){0,3})\.?\s{1,6}(\S.*)$")
CELL_SPLIT = re.compile(r"\s{3,}")
AMOUNT = re.compile(r"(\d{1,3}(?:[  ]\d{3})*(?:,\d{2}))\s*(?:zł|PLN)", re.I)
QUARTER = re.compile(r"\b(I{1,3}V?|IV)\s+kwarta", re.I)
# ponytail: keyword filter; scope per LEJEK.md (carriageway surface + tram tracks)
ROAD = re.compile(r"jezdni|nawierzchn|\bdróg\b|\bdrogi\b|torowisk|sieci tramwaj|skrzyżowa|gruntow"
                  r"|(?:remont|przebudow|budow|moderniz|rozbudow)\w*\s+(?:ul\.|ulic|al\.|alei)", re.I)
WORK_KW = re.compile(r"remont|przebudow|budow|moderniz|utwardz|naprawa|odnow|rozbudow", re.I)
DROP = re.compile(r"budynk|szkoł|przedszkol|plac\w* zabaw|boisk|odpad|koryt|rzek|termomod|hal\w* sport|lokal|kamienic"
                  r"|ekran\w* akust|zieleni|pomnik|park\b|cmentarz|kort|stadion|basen", re.I)
EXCLUDE = re.compile(r"oświetlen|iluminac|chodnik|ścież\w* rowerow|wiat|^opracowanie|dokumentacj\w* projekt", re.I)
HARD_OUT = re.compile(r"odwodnien|kanaliz|sygnaliz|inżynier|nadz[oó]r|przejazd\w* rowerow", re.I)
NOISE = re.compile(r"Zamówienie\s+(?:jest|udzielane|strategiczne|zastrzeżone)[^.]*?(?:NIE|TAK|MŚP:?|w trybie)"
                   r"|\(zielone, społeczne, innowacyjne\):?\s*(?:NIE|TAK)?|podstawie:? art\. ?\d+ ustawy|pkt \d+ ustawy"
                   r"|\d{1,3}(?:[  ]\d{3})*,\d{2}\s*(?:zł|PLN)|Charakter zamówienia:?|zamówienia klasyczne|Informacje dodatkowe:?|robota budowlana|usługa|dostawa|przetargu? nieograniczon\w*|Zamówienie", re.I)
STREET = re.compile(r"\b(?:ul(?:\.|icy|ic)|[Aa]l\.|alei)\s+([A-ZĄĆĘŁŃÓŚŹŻ][\wąćęłńóśźż\-\.]*(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][\wąćęłńóśźż\-]*){0,3})")


def blocks(lines):
    cur = None
    for ln in lines:
        m = ITEM.match(ln)
        if m:
            if cur:
                yield cur
            cur = [m.group(1), [m.group(2)]]
        elif cur is not None:
            cur[1].append(ln)
    if cur:
        yield cur


def subject(block_lines):
    parts = []
    for ln in block_lines:
        cells = [c for c in CELL_SPLIT.split(ln.strip()) if c]
        if cells:
            parts.append(cells[0])
    return re.sub(r"\s+", " ", NOISE.sub(" ", " ".join(parts))).strip()


def classify(subj):
    if not (ROAD.search(subj) and WORK_KW.search(subj)) or DROP.search(subj):
        return None
    head = subj[:60]  # scope is decided by what the item is about, not by side works listed later
    if HARD_OUT.search(head):
        return "poza_zakresem"
    if EXCLUDE.search(head) and not re.search(r"jezdni|nawierzchni(?! chodnik)|torowisk", subj, re.I):
        return "poza_zakresem"
    return "torowisko" if re.search(r"torowisk|sieci tramwaj", subj, re.I) else "jezdnia"


def main():
    docs = [r for r in csv.DictReader(open(WORK / "docs.csv", encoding="utf-8")) if r["doc_type"] == "plan_postepowan"]
    rows, seen = [], {}
    for d in docs:
        for p in sorted((WORK / "text" / d["doc_id"]).glob("p*.txt")):
            text = p.read_text(encoding="utf-8", errors="replace").splitlines()
            for num, bl in blocks(text):
                bl = bl[:12]  # ponytail: block capped at 12 lines; long items may lose tail text
                subj = subject(bl)
                kind = classify(subj)
                if not kind:
                    continue
                joined = " ".join(bl)
                am = AMOUNT.search(" ".join(bl[:3]))  # amount sits on the item's first lines
                q = QUARTER.search(joined)
                key = (d["year"], re.sub(r"\W+", "", subj.lower())[:120])
                if key in seen:
                    seen[key]["n_versions"] += 1
                    continue
                row = dict(year=d["year"], item_no=num, subject=subj[:400],
                           streets="; ".join(dict.fromkeys(STREET.findall(subj))),  # order of mention: first = main street
                           kind=kind, value_pln=(lambda v: v if float(v.replace(",", ".")) >= 5000 else "")(am.group(1).replace(" ", "").replace(" ", "")) if am else "",  # <5000 PLN = amount cut by a line wrap
                           quarter=q.group(1).upper() if q else "", status="plan",
                           doc_id=d["doc_id"], page=int(p.stem[1:]), n_versions=1)
                seen[key] = row
                rows.append(row)
    out = WORK / "plans"
    out.mkdir(exist_ok=True)
    with open(out / "plan_items.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader(); w.writerows(rows)
    by = collections.Counter((r["year"], r["kind"]) for r in rows)
    years = sorted({y for y, _ in by})
    md = ["# Pozycje drogowe z planów postępowań UMŁ", "", f"Dokumenty: {len(docs)}. Unikalne pozycje (rok + temat): {len(rows)}.", "",
          "| rok | jezdnia | torowisko | poza_zakresem |", "|---|---|---|---|"]
    md += [f"| {y} | {by[(y,'jezdnia')]} | {by[(y,'torowisko')]} | {by[(y,'poza_zakresem')]} |" for y in years]
    md += ["", "Filtr: słowa kluczowe (robota i droga/ulica/torowisko); wykluczenia: oświetlenie, chodnik, zieleń, budynki. Status zawsze `plan`."]
    (out / "summary.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    assert classify("Remont nawierzchni jezdni ul. Pomorskiej") == "jezdnia"
    assert classify("Przebudowa torowiska w ul. Kilińskiego") == "torowisko"
    assert classify("Usługa montażu oświetlenia ul. Piotrkowskiej") is None
    assert classify("Naprawa odwodnienia w pasie drogowym Al. X jezdnia północna") == "poza_zakresem"
    assert classify("Remont nawierzchni chodnika na ul. X") == "poza_zakresem"
    assert classify("Rozbudowa placu zabaw przy ul. Mokrej 22") is None
    assert subject(["Remont ul. X      przetarg   1 000,00 zł", "   od A do B   "]) == "Remont ul. X od A do B"
    main()
