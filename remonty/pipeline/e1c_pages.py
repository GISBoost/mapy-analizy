"""E1c: keyword scan per page (no model). Reads work/docs.csv + work/text/, writes work/pages.csv, work/pages_summary.md.
Run: py -I -X utf8 remonty/pipeline/e1c_pages.py"""
import csv, re, collections
from pathlib import Path

WORK = Path(__file__).resolve().parent.parent / "work"
F = re.I
A = re.compile(r"remont|przebudow|modernizac|budow(a|y|ie|ę|ą) drogi|nawierzchni|frezowani|utwardzeni|gruntow", F)
B = re.compile(r"jezdni|chodnik|pas(a|ie|em|y|ów) drogow|skrzyżowani|\bul\.|ulic", F)
NUM = r"\d(?:[\d ,.]*\d)?\s*"
C = re.compile(NUM + r"(?:m2|m²|m\^2|km|mb|m\.b\.|m\b)|szerokoś|długoś|pas(?:y|ów|a|ie) ruchu", F)
D = re.compile(r"objazd|zajęci(?:e|a|u) pasa|utrudnieni|termin realizacji|zamknięci", F)

rows = list(csv.DictReader(open(WORK / "docs.csv", encoding="utf-8")))
out, expected = [], 0
for d in rows:
    if d["text_method"] == "none":
        continue
    dd = WORK / "text" / d["doc_id"]
    files = sorted(dd.glob("p*.txt"))
    expected += len(files)
    year = d["year"] if d["year"] not in ("", "null", "None") else "null"
    for f in files:
        t = f.read_text(encoding="utf-8", errors="replace")
        a, b, c, dn = (len(x.findall(t)) for x in (A, B, C, D))
        m = C.search(t)
        ctx = re.sub(r"\s+", " ", t[max(0, m.start() - 40):m.end() + 40]) if m else ""
        cand = a >= 1 and b >= 1
        out.append(dict(doc_id=d["doc_id"], page=int(f.stem[1:]), doc_type=d["doc_type"], year=year,
                        source=d["source"], nA=a, nB=b, nC=c, nD=dn, candidate=int(cand),
                        strong=int(cand and c >= 1), first_C_match=ctx))
with open(WORK / "pages.csv", "w", encoding="utf-8", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
assert len(out) == expected, (len(out), expected)
docs_pages = sum(int(d["pages"] or 1) for d in rows if d["text_method"] != "none")
print("pages.csv rows", len(out), "| sum docs.csv pages (text docs)", docs_pages)
assert len(out) == docs_pages, "pages.csv rows != docs.csv page sum"

def table(key):
    st = collections.defaultdict(lambda: collections.Counter())
    seen = collections.defaultdict(lambda: [set(), set(), set()])
    for r in out:
        k = r[key]; s = st[k]
        s["p"] += 1; s["pc"] += r["candidate"]; s["ps"] += r["strong"]
        seen[k][0].add(r["doc_id"])
        if r["candidate"]: seen[k][1].add(r["doc_id"])
        if r["strong"]: seen[k][2].add(r["doc_id"])
    ks = sorted(st, key=lambda k: (k == "null", str(k)) if key == "year" else -st[k]["ps"])
    L = [f"| {key} | dok. wszystkie | dok. kandydaci | dok. silne | stron wszystkie | stron kandydaci | stron silne |", "|---|---|---|---|---|---|---|"]
    for k in ks:
        s, q = st[k], seen[k]
        L.append(f"| {k} | {len(q[0])} | {len(q[1])} | {len(q[2])} | {s['p']} | {s['pc']} | {s['ps']} |")
    L.append(f"| **razem** | {len({r['doc_id'] for r in out})} | {len({r['doc_id'] for r in out if r['candidate']})} | "
             f"{len({r['doc_id'] for r in out if r['strong']})} | {len(out)} | {sum(r['candidate'] for r in out)} | {sum(r['strong'] for r in out)} |")
    return "\n".join(L)

sc = collections.Counter(r["doc_id"] for r in out if r["strong"])
dm = {d["doc_id"]: d for d in rows}
top = ["| doc_id | path | doc_type | rok | stron silnych |", "|---|---|---|---|---|"]
for h, n in sc.most_common(20):
    d = dm[h]; top.append(f"| {h[:10]} | {d['path'][:90]} | {d['doc_type']} | {d['year'] or 'null'} | {n} |")
(WORK / "pages_summary.md").write_text(
    "# Strony-kandydaci (słowa kluczowe, E1c)\n\nKandydat: A≥1 i B≥1; silna: dodatkowo C≥1.\n\n## Wg doc_type\n\n"
    + table("doc_type") + "\n\n## Wg roku\n\n" + table("year") + "\n\n## 20 dokumentów z największą liczbą stron silnych\n\n" + "\n".join(top) + "\n",
    encoding="utf-8")
