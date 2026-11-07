"""B6 remonty, stages E0 (inventory), E1 (text) and E1b (rule-based doc_type).

Usage (from repo root):  py -I -X utf8 remonty/pipeline/e01_build.py

Fully rebuilds remonty/work/docs.csv and remonty/work/text/ on every run (same input -> same
output). Hand-made OCR pages live in remonty/work/ocr/<doc_id>/pNNN.txt and are copied into
text/ on each run. Pages with < 20 chars and no OCR file are written to work/ocr_queue.csv.
Everything downloaded is untrusted: zips are read in memory / cached under work/cache only,
never extracted next to the inputs.
"""
import csv, hashlib, html.parser, io, os, re, shutil, subprocess, sys, unicodedata, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]          # remonty/
POBRANE = ROOT / "pobrane"
WORK = ROOT / "work"
CACHE = WORK / "cache"
TEXT = WORK / "text"
OCR = WORK / "ocr"
PDFTOTEXT = "C:/Program Files/Git/mingw64/bin/pdftotext.exe"
SOFFICE = "C:/Program Files/LibreOffice/program/soffice.exe"
IMG = ("jpg", "jpeg", "tif", "tiff")
MIN_CHARS = 20            # page with fewer chars -> OCR queue
MAX_MEMBER = 400 * 2**20  # skip zip members larger than this
MAX_DEPTH = 3


def sha1(b):
    return hashlib.sha1(b).hexdigest()


def fix_moji(s):
    """Repair utf-8 text decoded as latin-1/cp1252 (requests default)."""
    if not re.search(r"[ÃÅÄ]", s):
        return s
    for enc in ("latin-1", "cp1252"):
        try:
            return s.encode(enc).decode("utf-8")
        except UnicodeError:
            pass
    return s


def fix_zipname(info):
    n = info.filename
    if info.flag_bits & 0x800:
        return n
    raw = n.encode("cp437", errors="replace")
    try:
        return raw.decode("utf-8")
    except UnicodeError:
        d = raw.decode("cp852", errors="replace")
        return d if re.search("[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]", d) else n


def sniff_ext(head, name, zf_names=None):
    if head.startswith(b"%PDF"):
        return "pdf"
    if head.startswith(b"PK"):
        if zf_names is not None:
            if any(n.startswith("word/") for n in zf_names): return "docx"
            if any(n.startswith("xl/") for n in zf_names): return "xlsx"
            if any(n.startswith("ppt/") for n in zf_names): return "pptx"
            if "content.xml" in zf_names and "mimetype" in zf_names: return "odt"
        return "zip"
    if head.startswith(b"\xd0\xcf\x11\xe0"):
        e = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        return e if e in ("doc", "xls", "ppt") else "doc"
    if head.startswith(b"AC10"):
        return "dwg"
    if re.match(rb"\s*(<!doctype html|<html)", head[:200], re.I):
        return "html"
    e = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return e if re.fullmatch(r"[a-z0-9]{1,5}", e) else "unknown"


# ---------------------------------------------------------------- E0: inventory
def load_index():
    """local_file -> list of dict(source, source_url, link_text, page_url)."""
    out = {}
    for src, f in (("bip_uml", ROOT / "index_fixed.csv"), ("bip_zdit", ROOT / "index_zdit.csv")):
        for r in csv.DictReader(open(f, encoding="utf-8", newline="")):
            lt = fix_moji(r.get("link_text_fixed") or r["link_text"])
            out.setdefault(r["local_file"], []).append(
                dict(source=src, source_url=r["file_url"], link_text=lt, page_url=r["page_url"]))
    return out


def scan_units():
    """Return units: sha1 -> dict(src=Path, ext, size, paths=[(path, meta_key)])."""
    index = load_index()
    units = {}
    problems = []          # (path, reason) for unreadable zips/members

    def add(data, path, top, nested_name):
        h = sha1(data)
        u = units.get(h)
        if u is None:
            ext = None
            names = None
            if data[:2] == b"PK":
                try:
                    names = set(zipfile.ZipFile(io.BytesIO(data)).namelist())
                except Exception:
                    names = None
            ext = sniff_ext(data[:512], nested_name, names)
            CACHE.mkdir(parents=True, exist_ok=True)
            src = CACHE / f"{h}.{ext}"
            if not src.exists():
                src.write_bytes(data)
            u = units[h] = dict(src=src, ext=ext, size=len(data), paths=[])
        u["paths"].append((path, top))
        return h, u["ext"]

    def walk_zip(data, path, top, depth):
        try:
            zf = zipfile.ZipFile(io.BytesIO(data))
        except Exception as e:
            problems.append((path, f"bad zip: {e}"))
            return
        for info in sorted(zf.infolist(), key=lambda i: i.filename):
            if info.is_dir():
                continue
            name = fix_zipname(info)
            p = f"{path}::{name}"
            if info.file_size > MAX_MEMBER:
                problems.append((p, "member too large, skipped"))
                continue
            try:
                b = zf.read(info)
            except Exception as e:
                problems.append((p, f"unreadable member: {e}"))
                continue
            h, ext = add(b, p, top, name)
            if ext == "zip" and depth < MAX_DEPTH:
                walk_zip(b, p, top, depth + 1)

    for fn in sorted(os.listdir(POBRANE)):
        b = (POBRANE / fn).read_bytes()
        h, ext = add(b, fn, fn, fn)
        if ext == "zip":
            walk_zip(b, fn, fn, 1)
    return units, index, problems


# ---------------------------------------------------------------- year
YEAR_DATE = re.compile(r"(?<!\d)(20[12]\d)(0[1-9]|1[0-2])([0-3]\d)(?!\d)")
YEAR_PLAIN = re.compile(r"(?<!\d)(20[12]\d)(?!\d)")


def year_in(s):
    s = re.sub(r"kwietnia[_ ]+20\d\d", "", s, flags=re.I)   # statute reference, not a date
    for rx in (YEAR_DATE, YEAR_PLAIN):
        for m in rx.finditer(s):
            y = int(m.group(1))
            if 2015 <= y <= 2026:
                return y
    return None


def strip_prefix(fn):
    return re.sub(r"^[0-9a-f]{8}_", "", fn)


def doc_year(paths, urls):
    """Inner member name first, then top-level file name, then file URL."""
    cands = []
    for p, top in paths:
        parts = p.split("::")
        for i, part in enumerate(reversed(parts)):
            part = strip_prefix(part) if i == len(parts) - 1 else part
            cands.append((part, "member_name" if len(parts) > 1 and i < len(parts) - 1 else "filename"))
    for u in urls:
        cands.append((u.rsplit("/", 1)[-1], "url"))
        cands.append((u, "url"))
    for s, how in cands:
        y = year_in(s)
        if y:
            return y, how
    return None, ""


# ---------------------------------------------------------------- text extraction
def clean(t):
    return t.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")


def ex_pdf(path):
    r = subprocess.run([PDFTOTEXT, "-layout", "-enc", "UTF-8", str(path), "-"],
                       capture_output=True, timeout=300)
    if r.returncode != 0:
        return None, r.stderr.decode("utf-8", "replace").strip()[:200] or f"pdftotext rc={r.returncode}"
    t = clean(r.stdout.decode("utf-8", "replace"))
    pages = t.split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    if not pages:
        return None, "pdftotext returned no pages"
    try:   # page count sanity check (stray form feeds in some PDFs shift page numbers)
        import pypdfium2
        n = len(pypdfium2.PdfDocument(str(path)))
    except Exception:
        n = len(pages)
    if n != len(pages):
        pages = []
        for i in range(1, n + 1):
            r = subprocess.run([PDFTOTEXT, "-layout", "-enc", "UTF-8", "-f", str(i), "-l", str(i), str(path), "-"],
                               capture_output=True, timeout=300)
            pages.append(clean(r.stdout.decode("utf-8", "replace")).replace("", ""))
    return pages, ""


def ex_docx(path):
    import docx
    d = docx.Document(str(path))
    lines = []
    for el in d.element.body.iterchildren():
        tag = el.tag.rsplit("}", 1)[-1]
        if tag == "p":
            lines.append("".join(t.text or "" for t in el.iter() if t.tag.endswith("}t")))
        elif tag == "tbl":
            tbl = docx.table.Table(el, d)
            for row in tbl.rows:
                cells = []
                for c in row.cells:
                    tx = c.text.strip().replace("\n", " / ")
                    if not cells or cells[-1] != tx:      # merged cells repeat
                        cells.append(tx)
                lines.append(" | ".join(cells))
    return [clean("\n".join(lines))], ""


def ex_xlsx(path):
    z = zipfile.ZipFile(path)
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(ns + "si"):
            ss.append("".join(t.text or "" for t in si.iter(ns + "t")))
    out = []
    for n in sorted(x for x in z.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", x)):
        out.append(f"## {n.rsplit('/', 1)[-1]}")
        for row in ET.fromstring(z.read(n)).iter(ns + "row"):
            vals = []
            for c in row.iter(ns + "c"):
                v = c.find(ns + "v")
                if c.get("t") == "s" and v is not None:
                    vals.append(ss[int(v.text)])
                elif c.get("t") == "inlineStr":
                    vals.append("".join(t.text or "" for t in c.iter(ns + "t")))
                elif v is not None:
                    vals.append(v.text or "")
            if any(vals):
                out.append("\t".join(vals))
    return [clean("\n".join(out))], ""


class _H(html.parser.HTMLParser):
    BLOCK = {"p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "table", "section"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script", "head") or (tag == "header" and ("hidden", None) in attrs):
            self.skip += 1
        elif tag in self.BLOCK:
            self.out.append("\n")
        elif tag in ("td", "th"):
            self.out.append(" | ")

    def handle_endtag(self, tag):
        if tag in ("style", "script", "head", "header") and self.skip:
            self.skip -= 1
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, d):
        if not self.skip:
            self.out.append(d)


def ex_html(path):
    raw = Path(path).read_bytes()
    try:
        s = raw.decode("utf-8")
    except UnicodeError:
        s = raw.decode("cp1250", "replace")
    p = _H()
    p.feed(s)
    t = re.sub(r"[ \t\xa0]+", " ", "".join(p.out))
    t = re.sub(r"\n\s*\n+", "\n", t).strip()
    return [clean(t)], ""


def soffice_convert(srcs, fmt):
    """srcs: list of (sha1, Path). Returns {sha1: converted Path or None}. Cached in work/cache."""
    out_dir = CACHE / f"soffice_{fmt}"
    in_dir = CACHE / "soffice_in"
    out_dir.mkdir(parents=True, exist_ok=True)
    in_dir.mkdir(parents=True, exist_ok=True)
    todo = [(h, p) for h, p in srcs if not (out_dir / f"{h}.{fmt}").exists()]
    for i in range(0, len(todo), 15):
        batch = []
        for h, p in todo[i:i + 15]:
            q = in_dir / p.name
            if not q.exists():
                shutil.copy(p, q)
            batch.append(str(q))
        subprocess.run([SOFFICE, f"-env:UserInstallation={(WORK / 'lo_profile').as_uri()}", "--headless",
                        "--convert-to", fmt, "--outdir", str(out_dir)] + batch,
                       capture_output=True, timeout=900)
    return {h: (out_dir / f"{h}.{fmt}" if (out_dir / f"{h}.{fmt}").exists() else None) for h, _ in srcs}


# ---------------------------------------------------------------- E1b: doc_type rules
def norm(s):
    s = s.replace("ł", "l").replace("Ł", "L")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[_\-.\s]+", " ", s)


STRONG = [   # (type, regex) first match wins; applied to names first, then to page-1 head
    ("plan_postepowan", r"plan(y)? (postepowan|zamowien)"),
    ("nieruchomosci_ZNN", r"\bznn\b|wykaz nieruchomosci|sprzedaz nieruchomosci|nieruchomosc|przetarg ustny|najem lokal|dzierzaw|\blokal(u|e|i)? (uzytkow|mieszkal)|oddani\w+ w uzytkowanie wieczyste"),
    ("ogloszenie_o_udzieleniu", r"ogloszenie o udzieleniu|ogloszenie o wyniku|ogloszenie o udz"),
    ("informacja_o_wyborze", r"informacja o wyborze|info o wyborze|wyborze najkorzystniejsz|wybor najkorzystniejsz|zawiadomienie o wyborze"),
    ("zapytanie_ofertowe", r"zapytanie ofertowe|zaproszenie do (skladania|zlozenia) ofert|zapytanie o cene|zaproszenie do skladania"),
    ("swz_opz", r"\bswz\b|specyfikacja warunkow zamowienia|opis przedmiotu zamowienia|\bopz\b|\bsst\b|specyfikacja techniczna|istotne postanowienia|\bsiwz\b"),
    ("umowa", r"\bumow[aey]\b|wzor umowy|projekt umowy|\baneks"),
    ("dokumentacja_projektowa", r"dokumentacja ul|projekty? (sor|[a-z]\d{3})|projekt budowlan|projekt wykonawcz|przedmiar|kosztorys|dokumentacja projektowa|projekt techniczny|projekt organizacji ruchu|projekt zagospodarowania|\bdwg\b|dokumentacja techniczna"),
    ("ogloszenie_o_zamowieniu", r"ogloszenie o zamowieniu|ogloszenie o konkursie|ogloszenie o zmianie"),
]
WEAK = r"status|stan sprawy|adres strony|bo [a-z]\d{3}|plan dzialania|raport o stanie|zdjec|fotograficzn|karta zgodnosci|dane kontaktowe|zgloszeni|druk|pomiar|lokalizacj|zdit dle? 053|oswiadczeni|rodo|klauzul|formularz|zalacznik|\bzal\b|wzor|petycj|odpowiedz|status sprawy|statut|regulamin|zarzadzeni|uchwal|sprawozdani|wniosek|informacj|zawiadomieni|protokol|wyjasnieni|pytani|komunikat|ogloszeni|harmonogram|zestawienie|lista|wykaz|pelnomocnictw|zgod[ay]|kwot"


# Name-only rules, added after the 'inne' review (bip_zdit, each pattern covers >=5 docs).
# zalaczniki_formalne: RODO/oswiadczenia/formularz ofertowy attachments; they hold no road-work data and
#   swamp 'inne'. korespondencja_zdit: ZDiT-<symbol> letters, status sprawy, odpowiedz, petycje; kept apart
#   because citizen letters can mention street works (e.g. petition about ul. Bratkowa).
NAME_RULES = [
    ("zalaczniki_formalne", r"rodo|klauzul\w* informacyjn|oswiadczeni\w* wykonawc|oswiadczeni\w* art|formularz ofertowy|informacja o kwocie przeznaczon"),
    ("korespondencja_zdit", r"zdit (dle?|dl|tt) \d|status (sprawy|zalatwienia)|tresc petycji"),
]


def classify(names, head):
    n = norm(names)
    for t, rx in STRONG:
        if re.search(rx, n):
            return t, "name"
    for t, rx in NAME_RULES:
        if re.search(rx, n):
            return t, "name"
    h = norm(head[:1500])
    for t, rx in STRONG:
        if re.search(rx, h):
            return t, "text"
    if re.search(WEAK, n):
        return "inne", "name"
    if re.search(r"\bzamowieni|\bprzetarg|postepowani", h):   # procurement text of unclear kind
        return "unknown", ""
    return "unknown", ""


EXT_TYPE = {"zip": "inne", "jpg": "inne", "jpeg": "inne", "tif": "inne", "tiff": "inne", "dwg": "dokumentacja_projektowa"}


# ---------------------------------------------------------------- main
def main():
    shutil.rmtree(TEXT, ignore_errors=True)
    TEXT.mkdir(parents=True)
    OCR.mkdir(parents=True, exist_ok=True)
    units, index, problems = scan_units()
    print(f"units: {sum(len(u['paths']) for u in units.values())} paths, {len(units)} unique sha1; "
          f"problems: {len(problems)}")

    # soffice conversions (doc/odt -> docx, xls -> xlsx), batched
    conv = {}
    for fmt, exts in (("docx", ("doc", "odt")), ("xlsx", ("xls",))):
        srcs = [(h, u["src"]) for h, u in sorted(units.items()) if u["ext"] in exts]
        if srcs:
            conv.update(soffice_convert(srcs, fmt))

    rows, queue = [], []
    for h in sorted(units):
        u = units[h]
        ext, src = u["ext"], u["src"]
        paths = sorted(p for p, _ in u["paths"])
        metas = []
        for p, top in sorted(u["paths"]):
            metas += index.get(top, [])
        sources = sorted({m["source"] for m in metas})
        urls = sorted({m["source_url"] for m in metas})
        lts = [m["link_text"] for m in metas]
        year, ysrc = doc_year(sorted(u["paths"]), urls)
        pages, method, note = None, "none", ""
        try:
            if ext == "pdf":
                pages, note = ex_pdf(src); method = "pdftotext"
            elif ext == "docx":
                pages, note = ex_docx(src); method = "docx"
            elif ext == "xlsx":
                pages, note = ex_xlsx(src); method = "xlsx"
            elif ext in ("doc", "odt"):
                c = conv.get(h)
                if c: pages, note = ex_docx(c); method = "soffice"
                else: note = "soffice conversion failed"
            elif ext == "xls":
                c = conv.get(h)
                if c: pages, note = ex_xlsx(c); method = "soffice"
                else: note = "soffice conversion failed"
            elif ext == "html":
                pages, note = ex_html(src); method = "html"
            elif ext in IMG:
                pages, note = [""], ""      # image: whole content comes from vision OCR
            elif ext == "dwg":
                note = "dwg: CAD drawing, not text-extractable"
            elif ext == "zip":
                note = "archive; members listed as separate documents"
            else:
                note = f"unsupported format: {ext}"
        except Exception as e:
            pages, note = None, f"extraction failed: {type(e).__name__}: {e}"[:200]
        if pages is None:
            method = "none"
        rows.append(dict(doc_id=h, path=paths[0], all_paths=" | ".join(paths),
                         source_url=urls[0] if urls else "", link_text=lts[0] if lts else "",
                         source=";".join(sources), year=year, year_source=ysrc, ext=ext,
                         _pages=pages, text_method=method, note=note, size_bytes=u["size"],
                         _names=" ".join(p.replace("::", " ") for p in paths) + " " + " ".join(lts),
                         _src=src))

    # extra sources: BZP html (+ metadata) and TED metadata
    bzp_meta = {}
    for r in csv.DictReader(open(ROOT / "bzp" / "bzp_zdit.csv", encoding="utf-8", newline="")):
        bzp_meta[re.sub(r"[^0-9A-Za-z]+", "_", r["notice_number"]).strip("_")] = r
    seen = {r["doc_id"] for r in rows}
    for f in sorted((ROOT / "bzp" / "html").glob("*.html")):
        b = f.read_bytes()
        h = sha1(b)
        m = bzp_meta.get(f.stem, {})
        if h in seen:   # same content as an already inventoried file: add as another path
            r = next(x for x in rows if x["doc_id"] == h)
            r["all_paths"] += " | " + f"bzp/html/{f.name}"
            r["source"] = ";".join(sorted(set(r["source"].split(";")) | {"bzp"} - {""}))
            continue
        seen.add(h)
        pages, note = ex_html(f)
        y = int(m["date"][:4]) if m.get("date") else year_in(f.name)
        rows.append(dict(doc_id=h, path=f"bzp/html/{f.name}", all_paths=f"bzp/html/{f.name}",
                         source_url=m.get("api_url", "").split(" (")[0], link_text=m.get("object", ""),
                         source="bzp", year=y, year_source="metadata" if m.get("date") else "filename",
                         ext="html", _pages=pages, text_method="html", note="", size_bytes=len(b),
                         _names=f.name, _src=f, _forced=dict(
                             ContractNotice="ogloszenie_o_zamowieniu",
                             ContractPerformingNotice="ogloszenie_o_wykonaniu",
                             TenderResultNotice="ogloszenie_o_udzieleniu").get(m.get("notice_type"))))
    for r in csv.DictReader(open(ROOT / "ted" / "ted_zdit.csv", encoding="utf-8", newline="")):
        txt = "\n".join(f"{k}: {v}" for k, v in r.items() if v)
        h = sha1(txt.encode("utf-8"))
        if h in seen:
            continue
        seen.add(h)
        rows.append(dict(doc_id=h, path=f"ted/ted_zdit.csv#{r['publication-number']}",
                         all_paths=f"ted/ted_zdit.csv#{r['publication-number']}", source_url=r["url"],
                         link_text=r["notice-title"], source="ted", year=int(r["publication-date"][:4]),
                         year_source="metadata", ext="metadata", _pages=[txt], text_method="metadata",
                         note="TED: metadata only, no document body", size_bytes=len(txt), _names="",
                         _src=None, _forced=dict({"cn-standard": "ogloszenie_o_zamowieniu"}).get(
                             r["notice-type"], "ogloszenie_o_udzieleniu")))

    # write pages (+OCR overrides), build final columns
    out = []
    for r in rows:
        h, pages = r["doc_id"], r.pop("_pages")
        names, src, forced = r.pop("_names"), r.pop("_src"), r.pop("_forced", None)
        n_ocr, n_pending = 0, 0
        if pages is not None:
            d = TEXT / h
            ocr_dir = OCR / h
            final = []
            for i, t in enumerate(pages, 1):
                if (r["ext"] == "pdf" or r["ext"] in IMG) and len(t.strip()) < MIN_CHARS:
                    o = ocr_dir / f"p{i:03d}.txt"
                    if o.exists():
                        t = o.read_text(encoding="utf-8"); n_ocr += 1
                    else:
                        n_pending += 1
                        queue.append((h, i, str(src)))
                        final.append(None)
                        continue
                final.append(t)
            have = [(i, t) for i, t in enumerate(final, 1) if t is not None]
            if have:
                d.mkdir()
                for i, t in have:
                    (d / f"p{i:03d}.txt").write_text(t, encoding="utf-8", newline="\n")
            r["pages"] = len(pages) if (r["ext"] == "pdf" or r["ext"] in IMG) else ""
            r["chars"] = sum(len(t) for _, t in have)
            if r["ext"] == "pdf" or r["ext"] in IMG:
                if n_ocr and n_ocr == len(pages): r["text_method"] = "vision_ocr"
                elif n_ocr: r["text_method"] = "pdftotext+vision_ocr"
                if n_pending == len(pages): r["text_method"] = "none"; r["note"] = "no text layer, OCR pending"
                elif n_pending: r["note"] = f"{n_pending} pages without text, OCR pending"
            head = final[0] or "" if final else ""
            if r["text_method"] == "none":
                head = ""
        else:
            r["pages"], r["chars"], head = "", 0, ""
        r["ocr_pages"] = n_ocr
        r["pending_ocr_pages"] = n_pending
        if forced:
            r["doc_type"], r["doc_type_rule"] = forced, "metadata"
        else:
            r["doc_type"], r["doc_type_rule"] = classify(names, head)
            if r["doc_type"] == "unknown" and r["ext"] in EXT_TYPE:
                r["doc_type"], r["doc_type_rule"] = EXT_TYPE[r["ext"]], "ext"
        r["year"] = "null" if r["year"] is None else r["year"]
        out.append(r)

    cols = ["doc_id", "path", "all_paths", "source_url", "link_text", "source", "year", "year_source", "ext",
            "pages", "text_method", "chars", "doc_type", "doc_type_rule", "ocr_pages", "pending_ocr_pages",
            "size_bytes", "note"]
    out.sort(key=lambda r: r["doc_id"])
    with open(WORK / "docs.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, cols, extrasaction="ignore", lineterminator="\n")
        w.writeheader(); w.writerows(out)
    with open(WORK / "ocr_queue.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["doc_id", "page", "src"]); w.writerows(sorted(queue))
    with open(WORK / "problems.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["path", "reason"]); w.writerows(problems)

    # self-check
    expected = set(units) | {r["doc_id"] for r in out if r["source"] in ("bzp", "ted")}
    assert len(out) == len({r["doc_id"] for r in out}) == len(expected), "doc count != unique sha1"
    for r in out:
        if r["text_method"] != "none":
            assert any((TEXT / r["doc_id"]).glob("p*.txt")), f"no page files for {r['doc_id']}"
    print(f"docs: {len(out)}; ocr queue: {len(queue)} pages; self-check OK")


if __name__ == "__main__":
    main()
