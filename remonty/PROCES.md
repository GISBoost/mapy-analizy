# B6: zbieranie i przetwarzanie danych (opis metody do raportu)

Stan: 2026-11-07. Cel badania: patrz `handoff-b6-remonty-bilet-mpk.md` §1. Projekt lejka: `LEJEK.md`.

## 1. Źródła

| Źródło | Jak pobrane | Zakres | Plik |
|---|---|---|---|
| BIP UMŁ / ZDiT (dokumenty: plany postępowań, ogłoszenia, SWZ, umowy) | crawler `bip_scraper.py` z filtrem słów kluczowych | 273 pliki → 773 jednostki po rozpakowaniu → 383 unikalne (sha1) | `pobrane/`, `index_fixed.csv`, audyt: `audyt_indeksu.md` |
| BZP (ezamowienia.gov.pl, API `mo-board/api/v1/notice`) | `bzp_fetch.py <zdit\|zim\|uml>`, okna miesięczne (limit API 500/zapytanie), filtr NIP lokalnie (API ignoruje NIP) | ZDiT 2021–2026; ZIM 2021–2026: 739 ogłoszeń, 397 robót drogowych | `bzp/bzp_zdit.csv`, `bzp/bzp_zim.csv`, log `bzp_zim.log` |
| OpenStreetMap (Overpass) | zapytanie bbox 51.68,19.32,51.86,19.65, drogi z nazwą, pobrane 2026-11-07 | 11 061 odcinków, 2521 nazw | `work/osm/lodz_streets.json` |
| Komunikaty miasta, Wayback lodz.pl/remonty | ręcznie (czat) | 19 wskaźników, 24 migawki | dashboard, datasety `deklaracje`, `migawki` |

## 2. Przetwarzanie (każdy krok to skrypt w `pipeline/`, deterministyczny, chyba że zaznaczono)

| Etap | Skrypt | Wejście → wyjście | Metoda |
|---|---|---|---|
| E0 inwentarz | `e01_build.py` | `pobrane/` → `work/docs.csv` | sha1 po rozpakowaniu, rok z URL/nazwy, duplikaty jako lista ścieżek |
| E1 tekst | `e01_build.py`, `e1c_pages.py`, `ocr_prepare.py` | → `work/text/<sha1>/pNNN.txt` | pdftotext `-layout`; .doc przez LibreOffice; 17 skanów OCR (Claude vision) |
| E3 pilot | `pilot_*.py` | 35 rekordów | ekstrakcja modelem (Sonnet), każdy rekord z cytatem i stroną |
| E3m metryki | `e3m_metrics.py` | — | regex na m²/mb/szer.: precyzja ok. 0–10%, **odrzucone** |
| E3p plany | `e3p_plans.py` | 234 plany postępowań → `work/plans/plan_items.csv` | regex pozycji planu; reguła zakresu (jezdnia/torowisko w zakresie; chodnik, oświetlenie, odwodnienie, sygnalizacja = `poza_zakresem`) |
| E3x scalenie | `e3x_merge.py` | → `work/records_all.jsonl` (235) | deduplikacja: kwota z pilota; ta sama ulica + kwota między wersjami planów |
| E4 geokodowanie | `e4_geocode.py` | → `work/records_geo.jsonl` | nazwa ulicy → nazwa OSM (dopełniacz → mianownik, dopasowanie po ostatnim słowie) |
| E4b odcinki | `e4b_sections.py` | → `work/sections.geojson` | „od ul. X do ul. Y” → węzły ≤40 m od ulic poprzecznych → najkrótsza ścieżka po ulicy (Dijkstra) |
| E4c zdarzenia | `e4c_events.py` | → `work/events.csv` | union-find: ta sama ulica OSM, ten sam zakres, lata ±2, odcinki nakładające się (≤30 m) |
| E5 BZP ↔ zdarzenia | `e5_bzp_match.py` | `bzp/bzp_zdit.csv` + `bzp/bzp_zim.csv` → `work/bzp_tenders.csv`, `work/event_bzp_links.csv` | ogłoszenia scalone po `tender_id` (ZDiT + ZIM: 164 postępowania); status = najdalsze ogłoszenie (ogłoszone/udzielone/wykonane); zakres jak w E3p + drogi rowerowe, elewacje, organizacja ruchu, dokumentacja = poza zakresem; łączenie: pierwsza ulica przedmiotu = ulica zdarzenia, ten sam zakres, rok przetargu w [rok planu − 1, rok planu + 3] |
| E6 seria roczna | `e6_series.py` | → `work/series_yearly.csv` | jednostka = inwestycja w zakresie: zdarzenie z planu albo postępowanie BZP; zdarzenie połączone z przetargiem liczone raz, w roku przetargu |
| E5 daty i geometria | `e5_bzp_match.py` | HTML ogłoszeń w `bzp/html/` → `umowa_od`, `umowa_do`, `lat/lon`, `work/bzp_sections.geojson` | początek = „Data zawarcia umowy” (pkt 4.1); koniec = „Termin wykonania umowy” (pkt 5.2, ogłoszenie o wykonaniu), a gdy go brak: początek + „Okres realizacji” (ogłoszenie o wyniku; miesiąc = 30 dni). Punkt = środek odcinka od–do albo środek ulicy w OSM |
| E7 dni i eksport | `e7_daily.py` | → `work/daily_active.csv`, `work/summary_yearly.csv`, `work/dashboard_data.json` | liczba umów w toku każdego dnia (suma przedziałów); dni w roku z ≥1/3/5 robotami |
| E8 eksport WWW | `e8_web_export.py` | → `../remonty-lodz/data/remonty.json` | rekordy w zakresie + link do źródła (strona ogłoszenia BZP po `objectId` albo plik BIP), odcinki, seria dzienna i roczna, komunikaty miasta (`deklaracje.json`) |

Publikacja: mapa `mapy-analizy/remonty-lodz/`, raport `mapy-analizy/badanie-remonty-lodz/`.

## 3. Kontrola jakości (dotychczas)

- Próba 12 pozycji planów po zaostrzeniu filtra: 11/12 poprawnych.
- Ręczna kontrola 31 zdarzeń wielowzmiankowych: 5 klas błędów, wszystkie poprawione (lista w `LEJEK.md`, „Stan E3p–E4”).
- Geokodowanie: 133/137 rekordów z ulicą dopasowanych (51 dokładnie, 82 po rdzeniu), 1 niejednoznaczny, 3 bez dopasowania.
- Każda liczba w rekordzie ma cytat i `doc_id` + stronę; wartości z planów mają `rodzaj_wartosci = szacunkowa`.

## 4. Ograniczenia (do sekcji „ograniczenia” raportu)

- Plany postępowań to zamiar, nie wykonanie (status `plan`); rok zdarzenia = rok planu.
- Liczba zdarzeń w roku zależy od tego, ile dokumentów danego roku jest w BIP; to nie jest seria porównywalna rok do roku.
- Odcinek od–do ustalony tylko dla 12 rekordów; metryki wielkości (m², szerokość, pasy) w dokumentach BIP praktycznie nie występują.
- 15 kwot >100 mln zł oznaczono `wartosc_podejrzana` (sumy z planów).
- BZP ZIM: 67 postępowań w zakresie (2021: 16, 2022: 22, 2023: 19, 2024: 10); 17 bez ulicy w OSM. Tylko 3 łączą się ze zdarzeniami z planów (Pomorska, Jaracza, Wierzbowa): plany UMŁ i przetargi ZIM to w większości różne strumienie inwestycji.
- Seria roczna nie jest jednorodna: 2021–2024 = plany + BZP, 2017–2020 i 2025–2026 = tylko plany (BZP dla tych lat niepobrane lub nie istnieje w tej formie przed 2021). 2024: 85,6 mln zł z 144,7 to jedno postępowanie (linia tramwajowa al. Śmigłego-Rydza).
- Dni z robotami w toku liczone tylko z umów BZP (59 z datami); to okres umowy, nie faktyczne zajęcie jezdni (górna granica; przy „zaprojektuj i wybuduj” obejmuje projektowanie). Rok 2021 jest zaniżony (brak umów zawartych przed 2021), 2025 obejmuje tylko umowy z lat wcześniejszych (UMŁ niepobrane).
- Zamawiający zmieniał się: ZDiT (do 2022) → ZIM (2021–2024) → Urząd Miasta Łodzi (2025, niepobrane).

## 6. Aktualizacja 2026-11-07 wieczór: UMŁ i OSM

- BZP Urzędu Miasta Łodzi (NIP 7250028902), 2021–2026: 4199 ogłoszeń (`bzp/bzp_uml.csv`, log `bzp_uml.log`, bez trafień w limit 500 i bez błędów HTTP). Razem z ZDiT i ZIM: 602 postępowania; w zakresie 157 (jezdnia/torowisko), utrzymanie 36, poza zakresem 409.
- `e5`: dla przetargów wymagane słowo drogowe i słowo o robotach, lista obiektów spoza drogi (`NOT_ROAD`), kategoria `utrzymanie` (umowy ogólnomiejskie bez lokalizacji, poza serią). Próba 20 przetargów UMŁ w zakresie: 17 poprawnych.
- `e7`: seria dzienna obcięta do daty danych 2026-11-07.
- `e9_osm_construction.py` (sesja b6-metryki): historia OSM `highway=construction` z ohsome, 2531 epizodów; pokrycie z danymi urzędu niskie (147 epizodów z odpowiednikiem). W `e8` jako osobna warstwa (≥7 dni, od 2021): 1852 odcinki.
- Wniosek zmieniony: luka po 2024 zamknięta; 2025: 65 robót, 365 dni z ≥5 umowami w toku (2021–2024: średnio 38,5 robót/rok).

## 7. Krok OSM: granica, reguła 100 m, kategoria „tylko OSM” (2026-11-07)

`pipeline/e10_osm_balance.py` (wołany z `e8_web_export.py`; samotest: `py -I -X utf8 pipeline/e10_osm_balance.py`). Skrypt, bez modelu.

1. Wejście: epizody E9 (≥7 dni, kończące się od 2021, tylko linie): 1852.
2. **Przycięcie do granicy Łodzi**: relacja OSM 2413295 (Nominatim, pobrana raz, `work/osm/lodz_boundary_nominatim.json`; 292,9 km², zgodne z powierzchnią miasta). Poza granicą w całości: 266 epizodów (usunięte); częściowo przycięte: 57. Zostaje 1586 epizodów = 1590 odcinków na mapie.
3. **Bez nazwy** (pole `n` puste): 618 epizodów. Zostają na mapie (klasa `u`, półprzezroczyste), nie liczą się do żadnych liczb.
4. **Potwierdzone** (klasa `p`): odcinek z nazwą, w którego buforze **100 m** (EPSG:2180) leży punkt albo odcinek z danych urzędu (BZP/plan), a lata roboty urzędu (okres umowy albo rok planu) różnią się od lat epizodu OSM o najwyżej ±1. Uznany za tę samą robotę: nie liczy się podwójnie, pozycja urzędu dostaje `osm` (liczba odcinków), karta pokazuje „potwierdzone w OSM”. 118 epizodów, 31 pozycji urzędu.
5. **Tylko OSM** (klasa `x`): odcinek z nazwą bez takiego odpowiednika: 850 epizodów. Odcinki o tej samej nazwie, nakładające się lub oddalone o ≤30 dni, to jedna robota (`g`): **252 roboty**. Seria roczna (roboty / dni z ≥1 w trakcie / szczyt) i dzienna w `osm_bilans` w `remonty.json`; roboty tylko OSM wg lat 2021–2026: 75, 80, 63, 81, 67, 49 (2026 do 7 XI).
6. Kontrola: `assert` w skrypcie (bufor: punkt 99 m trafia, 101 m nie; podział epizodów na klasy jest rozłączny i kompletny; liczenie dni).

Ograniczenia: reguła 100 m i ±1 rok jest przybliżeniem (długa ulica z robotą w innym miejscu może „potwierdzić się” cudzym punktem; krótka robota urzędu bez geometrii nie potwierdzi odcinka OSM). Oznaczenie „w budowie” w OSM obejmuje też budowy osiedli i inwestycje prywatne, a bywa usuwane z opóźnieniem (szczyt „tylko OSM” w jednym dniu to kilkadziesiąt robót, więc dni z ≥1 w roku to praktycznie wszystkie dni). Kategoria jest pokazywana osobno i nie jest dodawana do serii z danych urzędu. Dane ohsome kończą się 2026-07-27, otwarte epizody są liczone do 2026-11-07.
