# B6: lejek rekordowy (projekt, wersja 0.1, 2026-11-07)

Podstawa: skan Haiku (`scan.csv`) i skan słów kluczowych na pełnym tekście. Skrypty i wyniki są w scratchpadzie sesji orkiestratora.

## Stan korpusu (dane, nie założenia)

| | liczba |
|---|---|
| Pliki w `pobrane/` | 273 (pdf 171, docx 62, doc 14, zip 26) |
| Jednostki po rozpakowaniu zipów | 773 |
| **Unikalne wg sha1** | **383** (w tym pliki najwyższego poziomu: 133; duplikaty powstały, bo crawler traktował http:// i https:// jako różne adresy, patrz `audyt_indeksu.md`) |
| PDF bez warstwy tekstu (wymagają OCR) | 17 (ok. 100 stron: ogłoszenia, zapytania, 2× projekt budowlany, 1× umowa najmu) |
| .doc (stary Word), treść niepotwierdzona | 14 + 4 w zipach, do konwersji przez LibreOffice (zainstalowany) |
| .dwg | 2 (pomijamy, oznaczone) |
| Mojibake w tekście plików | 0; w `index.csv` 21 wierszy `link_text` (naprawialne) |
| Trafienia (remont/przebudowa) ∧ (nawierzchnia/jezdnia/pas drogowy) | 219 z 383 |

Wnioski z danych:
1. Korpus jest mały (383) i ma wysoki odsetek trafień (57%). **Ranking z progiem (etap 2) nic tu nie daje**: przy zbiorze wzorcowym 100–150 dokumentów oznaczylibyśmy ręcznie 1/3 korpusu. Ekstrakcja idzie na wszystkie 383 dokumenty (recall = 100% z definicji). Etap 2 uruchamiamy dopiero wtedy, gdy korpus urośnie (BZP/TED, tysiące dokumentów).
2. Rdzeń trafień to **plany postępowań UMŁ** (zipy 2017–2025). Plan to zamiar, nie wykonanie: status `plan`, nie licz go jako zdarzenia bez potwierdzenia.
3. Dokumentów ZDiT jest w korpusie prawie zero. Zrealizowanych robót z długością i powierzchnią trzeba szukać w BZP/TED i dokumentacji projektowej. To zadanie sesji `b6-crawler`.

## Etapy

**E0. Inwentarz (deterministyczny).** Jedna tabela `docs.csv`: doc_id = sha1 (po rozpakowaniu), ścieżka `plik.zip::member`, źródło (page_url), rok (z URL/nazwy, `null` jeśli brak), rozszerzenie, strony, warstwa tekstu, duplikaty (lista ścieżek). Niczego nie odrzucamy.

**E1. Tekst.** pdftotext `-layout` z podziałem na strony (numer strony zachowany). docx: python-docx (akapity i tabele). doc: konwersja LibreOffice do docx. Skany: OCR przez Claude vision (strony renderowane do PNG, decyzja 2026-11-07). Wynik: `text/<sha1>/p<NNN>.txt`.

**E1b. Etykieta typu dokumentu.** Najpierw reguły (nazwa pliku, nagłówek strony 1), Haiku tylko dla nierozstrzygniętych. Słownik: `plan_postepowan`, `ogloszenie_o_udzieleniu`, `zapytanie_ofertowe`, `swz_opz`, `dokumentacja_projektowa`, `informacja_o_wyborze`, `umowa`, `nieruchomosci_ZNN`, `inne`. Etykieta służy do wyboru szablonu ekstrakcji, nie do odrzucania dokumentów.

**E2. Ranking.** Wyłączony przy obecnym korpusie (wniosek 1). Kiedy go włączymy, zbiór wzorcowy losujemy warstwowo po typie dokumentu.

**E3. Ekstrakcja (Sonnet 5.5, podsesje Claude Code, bez Batch API).** Jeden rekord to jedna wzmianka o robocie drogowej. Pola: ulica, od, do, typ, L_rob_m, szer_m, A_m2, pasy, data_start, data_koniec, status (plan/przetarg/umowa/w toku/zrealizowane), wartość_zł, **cytat, strona, doc_id**. Brak danych zapisujemy jako `null`, bez domysłów. Dokumenty wielostronicowe dzielimy na okna stron. Wersjonujemy prompt i model.

**E4. Walidacja i scalanie.** Reguły: jednostki, zakresy (szerokość 2–40 m), daty 2017–2026, kontrola A ≈ L×szer. Geokodowanie ulicy i odcinka do OSM (Overpass); porównanie zadeklarowanej długości z geometrią. Klasteryzacja wzmianek w zdarzenia: ulica + nakładający się odcinek + okno czasu. Każda wartość ma flagę `deklarowana` albo `wyliczona`.

**E5. Kontrola (Opus 5.5).** Konflikty między wzmiankami, rekordy o niskiej pewności i losowa próba 5% rekordów. Wynik: odsetek błędów potoku z przedziałem ufności.

## Mierniki jakości

- Ekstrakcja: precyzja i kompletność pól na próbie wzorcowej: Opus oznacza, Michał weryfikuje część.
- Recall dokumentów: przy E2 wyłączonym recall = 100%, więc mierzymy tylko recall wzmianek wewnątrz dokumentu (próba stron).

## Decyzje (2026-11-07)

- OCR: Claude vision. Ekstrakcja: podsesje Claude Code. Wzorzec: Opus, weryfikacja Michał.
- Jednostka analizy: zdarzenie = odcinek ulicy + okres robót. Pozycje z planów postępowań idą osobno, ze statusem `plan`.

## Decyzje po pilocie E3 (2026-11-07)

- Robota drogowa = nawierzchnia jezdni (remont, przebudowa, budowa, gruntówka) oraz torowiska tramwajowe. Chodniki, ścieżki rowerowe, odwodnienie, sieci i sygnalizacja nie są liczone (rekordy zostają z flagą `poza_zakresem`).
- Schemat: `cytaty: [...]` zamiast jednego cytatu; `rodzaj_wartosci` (szacunkowa/oferta/umowa/wadium); status `postulat`; typ `torowisko`; wspólna kwota kilku ulic tylko raz (`wartosc_wspolna_id`).
- Metryki wielkości (szer., m², pasy, daty) były puste w 100% rekordów pilota. Następny krok: skrypt szuka stron z m²/mb/szerokością w SWZ/OPZ i przedmiarach.

## Stan E3p–E4 (2026-11-07, skrypty, bez modeli)

- Łańcuch: `e3p_plans.py` → `e3x_merge.py` → `e4_geocode.py` → `e4b_sections.py` → `e4c_events.py`. Wynik: `work/records_geo.jsonl`, `work/events.csv`, `work/sections.geojson`.
- 235 rekordów → 180 zdarzeń; 58 zdarzeń w zakresie z ulicą OSM; odcinek od–do tylko dla 12 rekordów.
- Kontrola ręczna 31 zdarzeń wielowzmiankowych wykazała i naprawiła: łączenie w zakresie z poza zakresem i torowiska z jezdnią; ucięte kwoty (<5000 zł, zawinięcie wiersza); zakres oceniany po całym temacie zamiast po jego początku; brak „al.” w rozpoznawaniu ulicy; rekordy pilota bez flagi `poza_zakresem`.
- Znane ograniczenia: rok = rok planu; 15 kwot >100 mln zł oznaczonych `wartosc_podejrzana`; Łagiewnicka: odcinek 220 m wobec 372 mtp w dokumencie.
