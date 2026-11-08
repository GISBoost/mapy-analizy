"""Fetch BZP (e-Zamowienia) notices of Zarzad Drog i Transportu w Lodzi (NIP 7251859255).

API has no NIP filter (OrganizationNationalId is silently ignored), so: query by name+city,
filter by NIP locally. Writes remonty/bzp/bzp_zdit.csv (all notices), remonty/bzp/html/<bzp>.html
(road-works notices only) and remonty/bzp/cpv_used.txt.
Usage: py -I -X utf8 remonty/bzp_fetch.py [from_year] [to_year]
"""
import calendar, csv, os, re, sys, time
from urllib.parse import quote
import requests

NIP = "7251859255"
API = "https://ezamowienia.gov.pl/mo-board/api/v1/notice"
TYPES = ["ContractNotice", "TenderResultNotice", "ContractPerformingNotice", "CompetitionNotice", "ConcessionNotice"]
# CPV prefixes treated as road works (documented in cpv_used.txt)
CPV = {"45233": "roboty drogowe", "45221": "mosty, wiadukty, tunele", "45234": "tory kolejowe/tramwajowe",
       "45232": "roboty pomocnicze (sieci)", "45230": "roboty budowlane: drogi, lotniska", "45112": "roboty ziemne",
       "45316": "oswietlenie drog", "71322": "projektowanie drog"}
ROAD_TXT = re.compile(r"remont|przebudow|nawierzch|ulic|chodnik|drog|jezdni|torowisk|wiadukt|estakad", re.I)
H = {"User-Agent": "Mozilla/5.0 (research script)"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bzp")


def get(params):
    for i in range(4):
        time.sleep(3)  # polite; API answered 403 after ~35 fast calls
        r = requests.get(API, params=params, headers=H, timeout=90)
        if r.status_code == 200:
            return r.json()
        print("HTTP", r.status_code, params.get("NoticeType"), params.get("PublicationDateFrom"), flush=True)
        if r.status_code == 403:
            time.sleep(60 * (i + 1))
        else:
            break
    raise SystemExit("API error, stopping (no CAPTCHA bypass)")


BUYERS = {  # key -> (NIP, OrganizationName, output csv)
    "zdit": ("7251859255", "Zarząd Dróg i Transportu", "bzp_zdit.csv"),
    "zim": ("7252132934", "Zarząd Inwestycji Miejskich", "bzp_zim.csv"),
    "uml": ("7250028902", "Urząd Miasta Łodzi", "bzp_uml.csv"),
}


def main():
    # usage: bzp_fetch.py [buyer=zdit|zim|uml] [from_year] [to_year]
    key = sys.argv[1] if len(sys.argv) > 1 else "zdit"
    NIP, NAME, CSV = BUYERS[key]
    y0, y1 = (int(a) for a in sys.argv[2:4]) if len(sys.argv) > 3 else (2021, 2026)
    os.makedirs(os.path.join(OUT, "html"), exist_ok=True)
    rows = []
    for t in TYPES:
        for y in range(y0, y1 + 1):
            for mo in range(1, 13):  # monthly windows: API truncates at PageSize
                end = f"{y}-{mo:02d}-{calendar.monthrange(y, mo)[1]}"
                d = get(dict(NoticeType=t, OrganizationName=NAME, OrganizationCity="Łódź", PageSize=500,
                             PublicationDateFrom=f"{y}-{mo:02d}-01T00:00:00", PublicationDateTo=f"{end}T23:59:59"))
                if len(d) >= 500:
                    print(f"WARNING: window {t} {y}-{mo:02d} returned {len(d)} (truncated?)", flush=True)
                for x in d:
                    if x["organizationNationalId"] != NIP:
                        continue
                    body = x.get("htmlBody") or ""
                    txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body))
                    m = re.search(r"Warto[śs][ćc][^:]{0,60}:\s*([\d\s.,]+\s*(?:PLN|EUR|zł))", txt)
                    cpv = x.get("cpvCode") or ""
                    road_cpv = any(cpv.startswith(p) for p in CPV)
                    road = road_cpv or bool(ROAD_TXT.search(x.get("orderObject") or ""))
                    rows.append(dict(bzp_number=x["bzpNumber"], notice_number=x["noticeNumber"], notice_type=t, date=x["publicationDate"][:10],
                                     order_type=x["orderType"], object=x["orderObject"], cpv=cpv, value=m.group(1).strip() if m else "",
                                     procedure_result=x.get("procedureResult") or "", tender_id=x["tenderId"], object_id=x["objectId"],
                                     contractors="; ".join((c["contractorName"] or "") for c in x.get("contractors") or []),
                                     road_cpv=road_cpv, road_works=road,
                                     api_url=f"{API}?NoticeType={t}&OrganizationName={quote(NAME)}&OrganizationCity=%C5%81%C3%B3d%C5%BA&PublicationDateFrom={y}-{mo:02d}-01T00:00:00&PublicationDateTo={end}T23:59:59 (bzpNumber={x['bzpNumber']})"))
                    if road:
                        open(os.path.join(OUT, "html", x["noticeNumber"].replace("/", "_").replace(" ", "_") + ".html"), "w", encoding="utf-8").write(body)
                print(t, y, mo, len(rows), flush=True)
    rows.sort(key=lambda r: (r["date"], r["notice_number"]))
    with open(os.path.join(OUT, CSV), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, list(rows[0])); w.writeheader(); w.writerows(rows)
    open(os.path.join(OUT, "cpv_used.txt"), "w", encoding="utf-8").write(
        "Road-works flag = CPV prefix below OR keyword in object (remont|przebudow|nawierzch|ulic|chodnik|drog|jezdni|torowisk|wiadukt|estakad)\n"
        + "\n".join(f"{k}* {v}" for k, v in CPV.items()) + "\n")


if __name__ == "__main__":
    main()
