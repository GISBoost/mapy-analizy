# Handoff: B6 – Remonty dróg w Łodzi a wydłużony bilet MPK

Stan na 2026-11-07. Autor: Claude (czat). Odbiorca: Claude Code / kolejny agent.

Dashboard (opublikowany, wersja robocza): https://claude.ai/artifact/EBgsaxF8a4LcQMDzfopGDF
Slug artefaktu: 6ac4cff7-a7a4-461a-8570-5f0673b5c41a (typ Dashboard; dane w datasetach `bilet`, `deklaracje`, `migawki`, `ulice`)

## 1. Cel (doprecyzowany przez Michała)

Nie porównujemy opóźnień (brak danych). Mierzymy, **ile było remontów dróg w Łodzi i gdzie**, w okresie obowiązywania wydłużonego biletu MPK (11.10.2018 – 31.12.2024; 20→40 min, 40→60 min) oraz po nim (do listopada 2026), **per rok**. Zakres: tylko Łódź, każdy remont, drogi obsługiwane przez MPK jako podzbiór.

Dodatkowo (nowe wymaganie): sama liczba remontów jest niewystarczająca (remont drogi gruntowej ≠ remont trzypasmowej obwodnicy). Potrzebne metryki wielkości: **długość zajętej / wyłączonej drogi, powierzchnia, czas trwania, waga ruchu**. Zasada: jeśli rejestru brak, raportujemy to jako wynik, **niczego nie szacujemy bez oznaczenia**.

Standard: rygor jak w tekstach badawczych Michała; każda liczba ma źródło (URL, strona, cytat).

## 2. Co ustalono

- Bilet: uchwała 19.09.2018, w mocy od 11.10.2018, przedłużany (m.in. XVII/714/19 z 11.12.2019), koniec 1.01.2025. Uzasadnienie miasta: zakończenie głównych remontów, większość pasażerów jeździ ok. 18 min. **Do potwierdzenia**: ciągłość przedłużeń (możliwa przerwa 2022) w Dzienniku Urzędowym.
- Skala wg komunikatów miasta (lodz.pl, uml.lodz.pl; 19 wskaźników w datasecie `deklaracje`, każdy z URL):
  - 2019–2023: 221 ulic łącznie (≈44/rok), 127 km.
  - 2021: >20 ulic (ZDiT, raport); 2022: ~60 ulic w realizacji, 70 km.
  - 2024 (I–VIII): 28 ulic zrealizowanych; plan 2024: 60 lokalizacji.
  - 2025: plan 52; w realizacji 147 ulic; zrealizowane 107 ulic (65 km); 30 gruntówek.
  - 2026: plan 82 ulice + 50 gruntówek.
  - Wniosek ostrożny: **brak spadku po zniesieniu biletu**, ale definicje („ulica", odcinek, km, gruntówka) różnią się między komunikatami, więc nie jest to jednolita seria.
- lodz.pl/remonty: 24 migawki Wayback (XI 2024 – X 2026), 134 różne nagłówki pozycji (41 w 2024 tylko XI–XII, 75 w 2025, 73 w 2026; 34 wspólne 2025/2026). Układ listy zmieniał się (styczeń i sierpień 2025), więc serii nie wolno łączyć bez zastrzeżeń. To lista komunikacyjna, nie rejestr.
- Brak historii przestrzennej: warstwa „Road works (ZDiT)” w ArcGIS REST miasta (mapa.lodz.pl/3/rest/services/Intersit_eng/MapServer, warstwa 1/podwarstwa 2) ma ~10 bieżących rekordów bez atrybutów. Google My Maps „Drogi wyremontowane od 2011 r.” (mid=1YSpnw-ZUb7p2ADEyotH3TZsi-yrmCEI) ma jedną warstwę bez lat.
- Nie sprawdzono (dane wtórne): Mobility Database, Transitland, wydania gtfs-dashboard / easy-GTFS-RT (RT dla Łodzi dopiero od ~VII 2026). QGIS MCP nie wykryto.

## 3. Skrypt BIP i jego wynik

- `bip_scraper.py` (crawler z filtrem słów kluczowych, zapis plików do `pobrane/`, indeks `index.csv`).
- Pierwsze uruchomienie Michała: 278 stron, **273 pliki** w indeksie.
- Błąd: `zdit.lodz.pl` nie istnieje w DNS. ZDiT nie ma własnej domeny: jego BIP jest pod `https://uml.lodz.pl/komunikacja-i-transport/zarzad-drog-i-transportu-bip/`, a dokumenty rejestrów BIP leżą pod wzorcem `https://uml.lodz.pl/uploads/tx_edgeregisters/<id>/<id_rejestru>/<plik>.pdf` (w wynikach dla ZDiT powtarza się `4106` jako drugi segment, **hipoteza**, że to id rejestru ZDiT). Wniosek: usunąć `zdit.lodz.pl` z SEEDS, dodać powyższy adres jako seed i zwiększyć głębokość. Sprawdzić też BZP / TED (np. ogłoszenia „Miasto Łódź – Zarząd Dróg i Transportu”, Piotrkowska 173/Tuwima 36) jako **systematyczne źródło roczne** (przetargi na remonty nawierzchni mają długości i szerokości w OPZ).
- Środowisko czatu nie ma dostępu do powłoki z internetem, więc skrypt uruchamiał Michał lokalnie. Pliki i `index.csv` są u niego.

## 4. Metryki wielkości (do zaprojektowania w danych)

Rejestr zdarzenia „robota drogowa” (jedno zdarzenie = klaster wzmianek z wielu dokumentów), pola:

1. Lokalizacja: ulica, odcinek od–do, geometria (po geokodowaniu do OSM / ewidencji dróg).
2. Typ: remont / przebudowa / modernizacja / gruntówka / awaria sieci / inne.
3. Daty: planowane i faktyczne (start, koniec); status: plan / w toku / zrealizowane.
4. **L_rob**: długość robót (km). **A**: powierzchnia nawierzchni (m²). **L_zaj**: długość zajętego/wyłączonego odcinka (km) i liczba zajętych pasów. **T**: czas zajęcia (dni).
5. Pochodne: **pas-km-dni** (lane-km-days) jako miara ekspozycji; podział według klasy drogi (OSM `highway`, liczba pasów); flaga „trasa MPK”; opcjonalnie liczba kursów MPK/dobę przez odcinek (z GTFS, wtórnie).
6. Pochodzenie każdej liczby: `deklarowana` (cytat + strona) albo `wyliczona` (metoda). Nie mieszać w jednej kolumnie bez flagi.

Uwaga merytoryczna: długość remontu ≠ długość odcinka wyłączonego z ruchu ≠ czas utrudnień. Dla relacji z biletem istotna jest ekspozycja pasażerów, więc trzeba raportować równolegle: liczba, km, m², pas-km-dni, i to samo dla podzbioru tras MPK.

## 5. Ocena pomysłu Michała: kaskada Haiku → model pośredni → Opus

Pomysł: (1) szybki skan treści zamiast tytułów (Haiku 5.5), (2) węższy przegląd modelem pośrednim, (3) Opus czyta w całości wybranych kandydatów.

**Mocne strony**
- Tanio i skalowalnie przy tysiącach plików; modele tańsze robią masową selekcję.
- Czyta treść, nie tytuł (tytuły bywają mylące).
- Dobrze pasuje do Batch API i cache’owania promptów.

**Słabe strony**
- Błąd w pierwszym kroku jest nieodwracalny: dokument odrzucony przez Haiku nigdy nie wróci. Bez zbioru wzorcowego nie wiemy, jaki jest recall. Dla badania, które ma być kompletne („każdy remont”), recall ważniejszy niż koszt.
- „Szybki skan” zwykle widzi początek dokumentu; kluczowa tabela (wykaz ulic, długości, powierzchnie) często jest w załączniku na końcu.
- Cel to **ekstrakcja danych strukturalnych**, nie wybór „ważnych dokumentów”. Opus czytający cały dokument jest drogi i nie daje rekordów, które da się zsumować i zweryfikować.
- Różne typy dokumentów (SWZ/OPZ, zezwolenia na zajęcie pasa, plany roczne, raporty o stanie miasta, komunikaty) mają inne układy; jeden filtr „istotne/nieistotne” zaciera różnicę.
- Skany PDF wymagają OCR; to ukryty etap, który decyduje o jakości wszystkiego dalej.
- Ta sama robota występuje w wielu dokumentach (plan, przetarg, raport, komunikat): bez dopasowania zdarzeń i deduplikacji policzymy ją wielokrotnie.
- Trzy poziomy modeli z arbitralnymi progami są trudne do obrony metodologicznie; dla badania potrzebna jest powtarzalność (wersje modeli, prompty, logi).

**Alternatywa (rekomendowana): lejek rekordowy, nie lejek dokumentowy**
- **Etap 0, deterministyczny:** inwentarz (sha1, rozszerzenie, rok z URL/metadanych), deduplikacja, wydobycie tekstu (pdftotext, OCR dla skanów), klasyfikacja typu dokumentu regułami + Haiku na tytule i pierwszej stronie. Niczego nie odrzucamy, tylko etykietujemy.
- **Etap 1, nastawiony na recall:** punktacja trafności (słowa kluczowe: „ul.”, „m²”, „km”, „remont”, „nawierzchni”, „pas drogowy”, „objazd” + ocena Haiku z pełnych fragmentów). Zbiór wzorcowy 100–150 dokumentów oznaczonych ręcznie, próg dobrany tak, by recall ≥ 95%. Wynik to ranking, nie odcięcie; dokumenty niepewne zostają.
- **Etap 2, ekstrakcja schematem:** Sonnet 5.5 wyciąga rekordy JSON z fragmentów (ulica, od–do, typ, długość, szerokość, powierzchnia, pasy, daty, status) **z cytatem i numerem strony**, a brak danych zapisuje jako null. Batch API + cache.
- **Etap 3, walidacja i scalanie:** reguły (jednostki, zakresy, daty w okresie), geokodowanie ulic do OSM/ewidencji i porównanie deklarowanej długości z geometrią, klasteryzacja wzmianek do zdarzeń.
- **Etap 4, Opus tylko tam, gdzie warto:** rozbieżności między źródłami, niska pewność, losowa próba kontrolna (np. 5%) do oszacowania błędu całego potoku, końcowa synteza i opis metody.
- Mierzyć precyzję i recall na każdym etapie; wersjonować prompty i modele.

## 6. Prompt dla następnego agenta (Claude Code)

> Kontynuujesz projekt „B6: remonty dróg w Łodzi a wydłużony bilet MPK” (handoff: `claude/handoff-b6-remonty-bilet-mpk.md` w Projekcie „GIS”; dashboard: https://claude.ai/artifact/EBgsaxF8a4LcQMDzfopGDF, slug 6ac4cff7-a7a4-461a-8570-5f0673b5c41a). Pracujesz z Michałem (GISBoost, QGIS/GTFS/OTP, Łódź), po polsku, ze standardem badawczym.
>
> **Cel:** ustalić, ile było robót drogowych w Łodzi i gdzie, w okresie biletu wydłużonego (11.10.2018–31.12.2024) i po nim (do XI 2026), per rok, z metrykami wielkości: liczba, długość robót (km), powierzchnia (m²), długość i czas zajęcia pasa (pas-km-dni), klasa drogi, flaga trasy MPK. Nie szacuj bez oznaczenia; brak rejestru raportuj jako wynik.
>
> **Krok 1.** Poproś Michała o ścieżkę do `index.csv` i katalogu `pobrane/` (273 pliki z BIP/UMŁ). Zaudytuj indeks: rozkład lat, typów, rozszerzeń, duplikaty, skany.
> **Krok 2.** Popraw crawler: usuń `zdit.lodz.pl` (nie istnieje), dodaj `https://uml.lodz.pl/komunikacja-i-transport/zarzad-drog-i-transportu-bip/`, sprawdź wzorzec `uml.lodz.pl/uploads/tx_edgeregisters/<id>/<id_rejestru>/` i hipotezę, że 4106 to rejestr ZDiT; dodaj BZP/TED (zamawiający: Miasto Łódź – Zarząd Dróg i Transportu; przetargi na remonty nawierzchni) jako roczne źródło systematyczne. Uwaga: CAPTCHA nie omijaj; uml.lodz.pl potrafi ją pokazywać.
> **Krok 3.** Zaimplementuj potok z sekcji 5 (lejek rekordowy): inwentarz → tekst/OCR → etykiety typu dokumentu → ranking trafności z progiem dobranym na zbiorze wzorcowym (recall ≥95%) → ekstrakcja JSON z cytatem i stroną (Sonnet 5.5, Batch API) → walidacja, geokodowanie (OSM/Overpass lub BDOT10k), klasteryzacja zdarzeń → Opus dla konfliktów i próby kontrolnej. Użyj Haiku 5.5 do masowych etykiet, nie do odrzucania dokumentów bez zbioru wzorcowego.
> **Krok 4.** Policz metryki per rok i dla podzbioru tras MPK (GTFS jako źródło wtórne; Mobility Database/Transitland/gtfs-dashboard sprawdź, jeśli potrzebne do waż­enia). Rozdziel wartości deklarowane od wyliczonych.
> **Krok 5.** Jeśli luki w latach 2018–2023 pozostaną, przygotuj finalną wersję wniosku o informację publiczną do ZDiT (szkic: `wniosek_informacja_publiczna_ZDiT.md`; zakres rozszerz o długość/powierzchnię zajęć pasa).
> **Krok 6.** Zaktualizuj dashboard (db_write do artefaktu; dane jako pliki datasetów) o nowe metryki i mapę (jeśli geometrie są), zachowując sekcję „Ograniczenia”. Sprawdź potwierdzenie ciągłości przedłużeń biletu w Dzienniku Urzędowym Woj. Łódzkiego.
> **Zasady:** każdy wynik z URL/plikiem/stroną/cytatem; kluczowe liczby sprawdź osobno (drugi przebieg lub inny model); nie wysyłaj pism ani nie publikuj poza prywatnym artefaktem bez zgody Michała; raportuj ograniczenia wprost.

## 7. Otwarte pytania

- Dokładna chronologia przedłużeń biletu 2019–2024.
- Czy ZDiT/UMŁ prowadzi wewnętrzną ewidencję zajęć pasa i w jakim systemie (do wniosku).
- Jednostka „remontu” w analizie: ulica, odcinek, zdarzenie? Proponowane: zdarzenie = odcinek ulicy + okres robót.
- Wybór modelu pośredniego jest zbędny w proponowanej alternatywie (Sonnet 5.5 do ekstrakcji), ale do potwierdzenia po teście na zbiorze wzorcowym.
