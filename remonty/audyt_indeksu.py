"""Audit of ../index.csv vs pobrane/: fixes mojibake, tags topic/year/duplicates.

Usage (from repo root): py -I -X utf8 remonty/audyt_indeksu.py
Writes remonty/index_fixed.csv (original index.csv is never touched) and prints stats.
Tags only; nothing is deleted.
"""
import csv, hashlib, os, re, sys, collections as C
from urllib.parse import urlparse, unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, DIR = os.path.join(ROOT, "index.csv"), os.path.join(ROOT, "remonty", "pobrane")
OUT = os.path.join(ROOT, "remonty", "index_fixed.csv")


def fix(s):
    """Undo UTF-8-read-as-latin-1 mojibake; return (text, was_fixed)."""
    if not re.search("[ÂÃÄÅ]", s):
        return s, False
    try:
        return s.encode("latin-1").decode("utf-8"), True
    except UnicodeError:
        return s, False


TOPIC = [  # first match wins; applied to lowercased text of link_text+urls
    ("nieruchomosci", r"nieruchomo|licytac|bip_ss_|bip_mw_|bip_vg_|znn_|dm_wykaz|wykaz"),
    ("plan_zamowien_uml", r"plan(y)?[_ ]postepowan|plany post"),
    ("gasnice_czujki", r"gasnic|czujk"),
    ("posilki_inspektor", r"posilk|inspektor"),
    ("ted_ojs", r"ojs\d+"),
    ("drogi_kandydat", r"julianowsk|plywack|urzednicz|skaln|ul\.|ulic|remont|przebudow|nawierzch|drog|chodnik|przedmiar|projekt"),
    ("wzor_zalacznik_ogolny", r"rodo|formularz|oswiadczenie|wzor_umowy|wzor umowy|zapytanie|adres_strony|opz|odpowiedzi|informacja_o|zawiadomienie|istotne"),
    ("ogloszenie_o_udzieleniu", r"og.oszenie|ogloszenie"),
]


def norm(s):  # strip diacritics crudely for matching
    return s.lower().translate(str.maketrans("ąćęłńóśźż", "acelnoszz"))


def year_of(r):
    for src in (unquote(r["file_url"]), r["link_text"], unquote(r["page_url"])):
        m = re.findall(r"(?<!\d)(20(?:1[89]|2[0-6]))(?!\d)", src)
        if m:
            return m[0]
    m = re.search(r"/(20\d\d)/\d{1,2}/\d{1,2}/?$", r["page_url"])
    return m.group(1) if m else ""


def main():
    rows = list(csv.DictReader(open(SRC, encoding="utf-8", newline="")))
    nfix = 0
    for r in rows:
        r["link_text_fixed"], f = fix(r["link_text"])
        nfix += f
        txt = norm(r["link_text_fixed"] + " " + unquote(r["file_url"]) + " " + unquote(r["page_url"]))
        r["topic"] = next((t for t, p in TOPIC if re.search(p, txt)), "inne")
        r["year_guess"] = year_of(r)
        u = urlparse(r["file_url"])
        parts = u.path.strip("/").split("/")
        r["host"] = u.netloc
        r["source_section"] = "tx_edgeregisters/" + parts[2] if "tx_edgeregisters" in u.path else "/".join(parts[:4])
        r["register_id"] = parts[2] if "tx_edgeregisters" in u.path else ""
        r["ext"] = os.path.splitext(u.path)[1].lower()
        p = os.path.join(DIR, r["local_file"])
        r["on_disk"] = os.path.exists(p)
        r["sha1_ok"] = r["on_disk"] and hashlib.sha1(open(p, "rb").read()).hexdigest() == r["sha1"]
    cnt = C.Counter(r["sha1"] for r in rows)
    first = {}
    for r in rows:
        f = first.setdefault(r["sha1"], r["local_file"])
        r["dup_of_row"] = "" if f == r["local_file"] else f
    cols = list(rows[0].keys())
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, cols)
        w.writeheader(); w.writerows(rows)
    P = lambda t, c: print(f"\n## {t}\n" + "\n".join(f"{k or '(brak)'}: {v}" for k, v in c.most_common()))
    print("rows", len(rows), "mojibake-fixed", nfix, "unique sha1", len(cnt), "extra copies", sum(v - 1 for v in cnt.values()),
          "dup groups", sum(v > 1 for v in cnt.values()), "on_disk", sum(r["on_disk"] for r in rows), "sha1_ok", sum(r["sha1_ok"] for r in rows),
          "unique file_url", len({r["file_url"] for r in rows}), "ufffd left", sum("�" in r["link_text_fixed"] for r in rows))
    P("host", C.Counter(r["host"] for r in rows)); P("ext", C.Counter(r["ext"] for r in rows))
    P("section", C.Counter(r["source_section"] for r in rows if not r["register_id"]))
    print("tx_edgeregisters:", sum(bool(r["register_id"]) for r in rows), "files, register ids", {r["file_url"].split("/")[6] for r in rows if r["register_id"]})
    P("page_url section", C.Counter(urlparse(r["page_url"]).path.split("/")[2] if len(urlparse(r["page_url"]).path.split("/")) > 2 else "" for r in rows))
    P("year_guess", C.Counter(r["year_guess"] for r in rows)); P("topic", C.Counter(r["topic"] for r in rows))
    P("topic x unique sha1", C.Counter({t: len({r['sha1'] for r in rows if r['topic'] == t}) for t in {r['topic'] for r in rows}}))
    P("topic x year", C.Counter(f"{r['topic']} | {r['year_guess'] or '-'}" for r in rows))
    print("\n## drogi_kandydat files")
    for r in rows:
        if r["topic"] == "drogi_kandydat":
            print(r["local_file"], "|", r["link_text_fixed"][:60], "|", r["year_guess"])


if __name__ == "__main__":
    main()
