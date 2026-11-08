#!/usr/bin/env python3
"""
Skrypt do uruchomienia u siebie (Python 3.9+, pip install requests beautifulsoup4).

Cel: z serwisów BIP / urzędowych Łodzi zebrać dokumenty o remontach dróg
(plany remontów, zajęcia pasa drogowego, organizacja ruchu, przetargi,
raporty o stanie miasta) z lat 2018-2026 i zapisać:
  - pliki (pdf/doc/docx/xls/xlsx/csv/zip) do katalogu ./pobrane/
  - indeks index.csv: url strony, tytuł linku, url pliku, plik lokalny, sha1, data pobrania

Użycie:
  python bip_scraper.py                 # crawl od adresów startowych z SEEDS
  python bip_scraper.py --depth 3 --max-pages 800
  python bip_scraper.py --seed https://bip.uml.lodz.pl/ --seed https://uml.lodz.pl/komunikacja-i-transport/zarzad-drog-i-transportu-bip/

Uwagi:
  - Adresy w SEEDS są punktem wyjścia; jeśli któryś nie działa, dodaj właściwy przez --seed.
  - Skrypt jest grzeczny: opóźnienie między zapytaniami, respektuje robots.txt,
    wznawia pracę (pomija już pobrane pliki).
  - Nie omija CAPTCHA. Jeśli strona ją wyświetla, otwórz ją ręcznie w przeglądarce
    i dodaj dokument do ./pobrane/ ręcznie.
"""
import argparse
import csv
import hashlib
import os
import re
import time
import urllib.robotparser
from collections import deque
from datetime import datetime
from urllib.parse import urljoin, urlparse, urldefrag

import requests
from bs4 import BeautifulSoup

SEEDS = [
    "https://bip.uml.lodz.pl/",
    "https://uml.lodz.pl/",
    "https://lodz.pl/remonty",
    # ZDiT has no own domain (zdit.lodz.pl does not resolve); its BIP lives under uml.lodz.pl
    "https://uml.lodz.pl/komunikacja-i-transport/zarzad-drog-i-transportu-bip/",
]

ALLOWED_HOSTS = {
    "bip.uml.lodz.pl", "uml.lodz.pl", "lodz.pl", "www.lodz.pl",
    "zdit.uml.lodz.pl",  # legacy ZDiT host (redirects), linked from ZDiT BIP pages
    "mapa.lodz.pl", "bip.lodz.pl",
}

FILE_EXT = (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".zip", ".odt", ".ods")

# Słowa kluczowe: link/tytuł/adres musi zawierać przynajmniej jedno, żeby go śledzić lub pobrać.
KEYWORDS = re.compile(
    r"remont|przebudow|modernizac|nawierzchni|zajęci[ae] pasa|zajecie-pasa|pas drogowy|"
    r"organizacj[ai] ruchu|objazd|utrudnien|przetarg|zamówien|zamowien|plan (rzeczow|inwest|remont)|"
    r"raport o stanie|zdit|zarząd dróg|zarzad drog|ulic|wykaz",
    re.I,
)

HEADERS = {"User-Agent": "Mozilla/5.0 (research script; contact: owner of this machine)"}


def sha1(b: bytes) -> str:
    return hashlib.sha1(b).hexdigest()


def safe_name(url: str) -> str:
    p = urlparse(url)
    base = os.path.basename(p.path) or "plik"
    base = re.sub(r"[^\w.\-]+", "_", base)[:120]
    return f"{sha1(url.encode())[:8]}_{base}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", action="append", help="adres startowy (można wielokrotnie)")
    ap.add_argument("--depth", type=int, default=3)
    ap.add_argument("--max-pages", type=int, default=600)
    ap.add_argument("--delay", type=float, default=1.5, help="sekundy między zapytaniami")
    ap.add_argument("--out", default="pobrane")
    ap.add_argument("--index", default="index.csv", help="index file (UTF-8 CSV); use a new name to keep an old index untouched")
    ap.add_argument("--no-keyword-filter", action="store_true", help="śledź wszystkie linki w dozwolonych domenach")
    args = ap.parse_args()

    seeds = args.seed or SEEDS
    os.makedirs(args.out, exist_ok=True)
    s = requests.Session()
    s.headers.update(HEADERS)

    robots = {}

    def allowed(url):
        host = urlparse(url).netloc
        if host not in robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                rp.set_url(f"https://{host}/robots.txt")
                rp.read()
            except Exception:
                rp = None
            robots[host] = rp
        rp = robots[host]
        return True if rp is None else rp.can_fetch(HEADERS["User-Agent"], url)

    index_path = args.index
    seen_files = set()
    if os.path.exists(index_path):
        with open(index_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                seen_files.add(row["file_url"])
    new_index = not os.path.exists(index_path)
    idx = open(index_path, "a", newline="", encoding="utf-8")
    w = csv.writer(idx)
    if new_index:
        w.writerow(["page_url", "link_text", "file_url", "local_file", "sha1", "bytes", "downloaded_at"])

    queue = deque((u, 0) for u in seeds)
    visited = set()
    pages = 0

    while queue and pages < args.max_pages:
        url, depth = queue.popleft()
        url, _ = urldefrag(url)
        url = re.sub(r"^http://", "https://", url)
        if url in visited:
            continue
        visited.add(url)
        host = urlparse(url).netloc
        if host not in ALLOWED_HOSTS or not allowed(url):
            continue
        try:
            time.sleep(args.delay)
            r = s.get(url, timeout=40)
        except Exception as e:
            print("BŁĄD", url, e)
            continue
        ctype = r.headers.get("Content-Type", "")
        if r.status_code != 200 or "html" not in ctype:
            continue
        if re.search(rb"captcha", r.content[:5000], re.I):
            print("CAPTCHA na", url, "- pomijam, pobierz ręcznie")
            continue
        pages += 1
        print(f"[{pages}] d={depth} {url}")
        # parse bytes, not r.text: requests guesses latin-1 when the header has no charset (mojibake)
        soup = BeautifulSoup(r.content, "html.parser")
        for a in soup.find_all("a", href=True):
            href = urljoin(url, a["href"])
            href, _ = urldefrag(href)
            href = re.sub(r"^http://", "https://", href)  # http/https twins caused ~half of the duplicate downloads
            text = " ".join(a.get_text(" ", strip=True).split())
            path = urlparse(href).path.lower()
            is_file = path.endswith(FILE_EXT)
            relevant = args.no_keyword_filter or KEYWORDS.search(text) or KEYWORDS.search(href)
            if is_file and relevant and href not in seen_files:
                try:
                    time.sleep(args.delay)
                    fr = s.get(href, timeout=120)
                    if fr.status_code != 200:
                        continue
                    name = safe_name(href)
                    with open(os.path.join(args.out, name), "wb") as f:
                        f.write(fr.content)
                    w.writerow([url, text, href, name, sha1(fr.content), len(fr.content), datetime.now().isoformat(timespec="seconds")])
                    idx.flush()
                    seen_files.add(href)
                    print("   pobrano", name)
                except Exception as e:
                    print("   BŁĄD pliku", href, e)
            elif not is_file and depth < args.depth and urlparse(href).netloc in ALLOWED_HOSTS and relevant:
                queue.append((href, depth + 1))

    idx.close()
    print(f"Gotowe. Stron: {pages}, plików w indeksie: {len(seen_files)}. Indeks: {index_path}")


if __name__ == "__main__":
    main()
