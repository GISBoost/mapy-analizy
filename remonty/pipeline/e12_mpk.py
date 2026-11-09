"""E12: historical traffic restrictions 2019-2024 from MPK Łódź route-change notices (Wayback archive).

MPK notices (mpk.lodz.pl/rozklady/wholemessage.jsp?articleId=N) explain why tram/bus routes change; ~1 in 5
names road works with a street, a section or crossing and dates. Only works that affected public transport
are visible, and the notice describes the detour, not the lane layout, so traffic_impact is mostly 'unknown'.

  py e12_mpk.py fetch   # Wayback CDX + raw pages -> work/mpk/<id>.html (skips existing, ~1 req/s)
  py e12_mpk.py         # parse -> work/mpk/rows.json (merged by e11 build into work/utrudnienia.json)
"""
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "work" / "mpk"
UA = "GISBoost-mapy-analizy/1.0 (road-works research; github.com/GISBoost/mapy-analizy)"
ID_RANGE = (20000, 35500)  # ponytail: articleId range spanning komunikaty 2019-2024, read off CDX; widen for other years
YEARS = range(2019, 2025)
PARSER = "e12-v1"
MONTHS = {m: i + 1 for i, m in enumerate("stycz lut mar kwie maj czerw lip sierp wrze paźdz listop grud".split())}


def get(url, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
                return r.read()
        except Exception:
            time.sleep(5 * (k + 1))
    return None


def fetch():
    OUT.mkdir(parents=True, exist_ok=True)
    cdx = get("https://web.archive.org/cdx/search/cdx?url=mpk.lodz.pl/rozklady/wholemessage.jsp*"
              "&filter=statuscode:200&fl=timestamp,original&limit=200000").decode()
    caps = {}
    for ln in cdx.splitlines():
        ts, url = ln.split(" ", 1)
        m = re.search(r"articleId=(\d+)", url)
        if m and ID_RANGE[0] <= int(m[1]) <= ID_RANGE[1]:
            caps.setdefault(int(m[1]), []).append((ts, url))
    todo = [i for i in sorted(caps) if not (OUT / f"{i}.html").exists()]
    print(f"ids={len(caps)} todo={len(todo)}", flush=True)
    for n, i in enumerate(todo, 1):
        for ts, url in sorted(caps[i])[:3]:  # some captures are empty templates: try the next one
            b = get(f"https://web.archive.org/web/{ts}id_/{url}")
            if b and body(decode(b)):
                (OUT / f"{i}.html").write_bytes(b)
                break
            time.sleep(1)
        else:
            (OUT / f"{i}.html").write_bytes(b"")  # remember the miss
        time.sleep(1)
        if n % 50 == 0:
            print(n, flush=True)


def decode(b):
    t = b.decode("iso-8859-2", "replace")
    return b.decode("utf-8", "replace") if re.search(r"charset=utf-8", t[:4000], re.I) else t


def body(t):
    """Notice text from 'KOMUNIKAT nr/rr' to the hotline footer."""
    t = re.sub(r"(?s)<(script|style).*?</\1>", "", t)
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t)))
    m = re.search(r"KOMUNIKAT (\d+)/(\d\d)\b", t)
    return t[m.start():m.start() + 4000].split("Dodatkowe informacje")[0].split("Wszystkie treści")[0].strip() if m else None


WORKS = re.compile(r"remont\w*|przebudow\w*|robót|roboty|robotami|prac(?:ami|ach|e|a)? (?:drogow|torow|budowl|sieciow|wodoci|kanaliz|ciepł"
                   r"|modernizac|związan|remont|przy budow|w ramach|na )\w*|modernizac\w*|wymian\w* (?:nawierzchni|tor|rozjazd|sieci)\w*"
                   r"|napraw\w* (?:torowisk|nawierzchni|jezdni|sieci|rozjazd)\w*|budow\w* (?:ronda|wiaduktu|torowiska|kanału|sieci)\w*", re.I)
REOPEN = re.compile(r"dopuszczeni\w* do ruchu|przywróceni\w* (?:ruchu|przejazdu|kursowania)|zakończeni\w* (?:prac|robót|remontu)|otwarci\w* (?:ulicy|jezdni|przejazdu)", re.I)
CLOSED = re.compile(r"zamknięci\w*|zamknięt\w*|wyłączeni\w* z ruchu", re.I)
NAME = r"([A-ZŁŚŻŹĆ][\wąęłńóśźżĄĘŁŃÓŚŹŻ.\-]*(?:\s(?:[A-ZŁŚŻŹĆ0-9][\wąęłńóśźżĄĘŁŃÓŚŹŻ.\-]*|i|im\.|gen\.|św\.|ks\.|ul\.)){0,4})"
PRE = r"(?:ul\.|ulic[yaęą]|al\.|alei|aleją|al|pl\.|placu?|rond[ao]?)\s*"


def street_of(m_text):
    s = re.sub(r"^(ul\.|al\.|pl\.)\s*", "", m_text.strip())
    return re.sub(r"\s+(i|w|na|od|do|oraz)$", "", s).strip(" .-")


def place(t):
    """(street, od, do, crossing) from the sentence that names the works."""
    m = re.search(PRE + NAME + r"\s*\(?\s*(?:na odcinku\s+)?(?:pomiędzy|między|od)\s+" + r"(?:ul\.|ulic[ąy]|al\.|alej[ąi]|pl\.|rond(?:em|a))?\s*" + NAME
                  + r"\s*(?:a|i|do)\s*(?:ul\.|ulic[ąy]|al\.|alej[ąi]|pl\.|rond(?:em|a))?\s*" + NAME, t)
    if m:
        return street_of(m[1]), street_of(m[2]), street_of(m[3]), None
    m = re.search(r"skrzyżowani\w+\s*(?:ulic\s*|ul\.\s*|al\.\s*)?" + NAME + r"\s*(?:[-–/]|z|i|a)\s*(?:ul\.\s*|al\.\s*|ulicą\s*)?" + NAME, t)
    if m:
        return street_of(m[1]), None, None, street_of(m[2])
    m = re.search(PRE + NAME, t)
    return (street_of(m[1]), None, None, None) if m else (None, None, None, None)


DATE = re.compile(r"(\d{1,2})(?:/\d{1,2})?\s+(" + "|".join(MONTHS) + r")\w*\s+(\d{4})", re.I)
RANGE = re.compile(r"(?:od|w dniach|w okresie od)\s+(?:dnia\s+|nocy\s+)?(\d{1,2})(?:/\d{1,2})?\s*(?:(\w+)\s+(\d{4})?\s*r?\.?\s*)?"
                   r"(?:do|-|–)\s*(?:dnia\s+|nocy\s+)?(\d{1,2})(?:/\d{1,2})?\s+(\w+)\s+(\d{4})", re.I)


def month(w):
    return next((v for k, v in MONTHS.items() if w and w.lower().startswith(k[:3])), None)


def iso(d, mo, y):
    try:
        return dt.date(int(y), mo, int(d)).isoformat()
    except (TypeError, ValueError):
        return None


def dates(t):
    m = RANGE.search(t)
    if m:
        y2, mo2 = m[6], month(m[5])
        mo1 = month(m[2]) or mo2
        return iso(m[1], mo1, m[3] or y2), iso(m[4], mo2, y2)
    m = DATE.search(t)
    return (iso(m[1], month(m[2]), m[3]), None) if m else (None, None)


def parse(i, t):
    b = body(t)
    if not b:
        return None
    nr = re.match(r"KOMUNIKAT (\d+)/(\d\d)", b)
    year = 2000 + int(nr[2])
    w, re_open = WORKS.search(b), REOPEN.search(b)
    if year not in YEARS or not (w or re_open):
        return None
    sent = next((s for s in re.split(r"(?<!ul)(?<!al)(?<!pl)(?<!im)(?<!gen)(?<!św)(?<!ks)(?<!r)(?<=[a-ząęłńóśźż0-9)])\.\s+(?=[A-ZŁŚŻŹĆ])", b) if WORKS.search(s) or REOPEN.search(s)), b)
    ulica, od, do, cross = place(sent)
    if not ulica:
        return None
    s, e = dates(b)
    return dict(id=f"mpk:{i}", nr=f"{nr[1]}/{nr[2]}", year=year, ulica=ulica, od=od, do=do, cross=cross,
                reopen=bool(re_open and not w), closed=bool(CLOSED.search(sent)), start=s, end=e, cytat=sent[:600])


def rows():
    """Notices -> restriction rows in the e11 schema. A later 'reopened' notice on the same street closes an open one."""
    notes = []
    for f in sorted(OUT.glob("*.html"), key=lambda p: int(p.stem)):
        if f.stat().st_size:
            n = parse(int(f.stem), decode(f.read_bytes()))
            if n:
                notes.append(n)
    url = "https://mpk.lodz.pl/rozklady/wholemessage.jsp?articleId={}"
    out, open_by_street = [], {}
    for n in sorted(notes, key=lambda n: (n["start"] or f"{n['year']}-12-31")):
        key = n["ulica"].lower()[:8]
        if n["reopen"]:
            r = open_by_street.pop(key, None)
            if r and n["start"] and n["start"] >= r["date_start"]:
                r.update(date_end=n["start"], end_precision="exact", date_status="observed")
                r["obserwacje"].append(dict(url=url.format(n["id"][4:]), cytat=n["cytat"], published_at=n["start"], captured_at=None))
            continue
        heading = f"{n['ulica']} / {n['cross']}" if n["cross"] else n["ulica"] + (f" ({n['od']} - {n['do']})" if n["od"] else "")
        start = n["start"] or f"{n['year']}-01-01"
        end, endp = n["end"], "exact"
        if not end:  # ponytail: no end in the notice and no reopening notice -> 75 days (same rule as lodz.pl cards)
            end, endp = (dt.date.fromisoformat(start) + dt.timedelta(days=75)).isoformat(), "estimated"
        r = dict(id=n["id"], source="MPK Łódź (komunikat)", source_card=n["nr"], heading=heading, ulica=n["ulica"], od=n["od"], do=n["do"],
                 uwagi=None, kierunek=None, jezdnia=None, wlot=None, faza=None,
                 date_start=start, start_precision="exact" if n["start"] else "year", start_status="planned",
                 date_end=end, end_precision=endp, date_status="planned" if endp == "exact" else "estimated",
                 zakres_prac=None, inwestor=None, sekcja=None,
                 traffic_impact="full_closure" if n["closed"] else "unknown", lanes_open=None, lanes_closed=None,
                 rule_id="mpk_zamkniecie" if n["closed"] else "mpk_objazd", cytat=n["cytat"], parser=PARSER,
                 confidence="medium" if n["start"] else "low", needs_review=None if n["start"] else "brak daty w komunikacie",
                 obserwacje=[dict(url=url.format(n["id"][4:]), cytat=n["cytat"], published_at=n["start"], captured_at=None)],
                 na_stronie=False, last_seen=None, first_seen=None)
        out.append(r)
        if endp == "estimated":
            open_by_street[key] = r
    (OUT / "rows.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    from collections import Counter
    print(f"notices={len(notes)} restrictions={len(out)} by_year={dict(sorted(Counter(r['date_start'][:4] for r in out).items()))} "
          f"reopen_matched={sum(1 for r in out if len(r['obserwacje']) > 1)}")
    return out


def _check():
    t = ("KOMUNIKAT 140/20 W związku z rozpoczynającymi się pracami drogowymi na ulicy Gajcego (na odcinku od ulicy Zakładowej "
         "do ulicy Rokicińskiej) na podstawie organizacji ruchu zatwierdzonej przez Zarząd Dróg i Transportu od dnia 1 sierpnia 2020 r. "
         "zmianie ulegną trasy autobusów linii 82A.")
    n = parse(1, t)
    assert (n["ulica"], n["od"], n["do"], n["start"]) == ("Gajcego", "Zakładowej", "Rokicińskiej", "2020-08-01"), n
    t = ("KOMUNIKAT 249/19 W związku z pracami drogowymi prowadzonymi w rejonie skrzyżowania Konspiracyjnego Wojska Polskiego - Śląska "
         "od 10 do 23 grudnia 2019 r. zmianie uległy trasy autobusów linii 75A/B.")
    n = parse(2, t)
    assert (n["ulica"], n["cross"], n["start"], n["end"]) == ("Konspiracyjnego Wojska Polskiego", "Śląska", "2019-12-10", "2019-12-23"), n
    t = ("KOMUNIKAT 267/19 W związku z dopuszczeniem do ruchu kołowego jezdni ul. Dąbrowskiego (pomiędzy ul. Rzgowską a al. Śmigłego Rydza), "
         "na podstawie decyzji Zarządu Dróg i Transportu od nocy 22/23 grudnia 2019r. zmianie ulegnie trasa autobusu.")
    n = parse(3, t)
    assert n["reopen"] and n["ulica"] == "Dąbrowskiego" and n["start"] == "2019-12-22", n
    assert parse(4, "KOMUNIKAT 19/20 Na podstawie decyzji Zarządu Dróg i Transportu od dnia 2 lutego 2020r. zmianie ulegną rozkłady jazdy linii N8.") is None
    print("e12 checks ok")


if __name__ == "__main__":
    _check()
    if sys.argv[1:] == ["fetch"]:
        fetch()
    else:
        rows()
