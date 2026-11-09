# Utrudnienia w ruchu (częściowe zajęcia jezdni): ustalenia wymagań

Status: **zakres v1 zatwierdzony i zaimplementowany 9.11.2026** (zmiany względem planu w §8). Ustalenia z sesji grillowania tego samego dnia.
Wejście: `remonty-lodz/raport_remonty_lodz_luki_i_dane.md` (audyt), `prompt_claude_code_opus_5_5_remonty_lodz.md`,
`rekordy_czesciowe_zajecia_lodz_seed.json` (11 rekordów). Pojęcia są w [CONTEXT.md](CONTEXT.md), decyzja o modelu w [docs/adr/0001](docs/adr/0001-utrudnienie-osobno-od-zdarzenia.md).

## 1. Fakty i hipotezy

### Potwierdzone w repo i danych (9.11.2026)
- `remonty-lodz/app.js:29` filtruje widok „Rok” po `i.rok === year`. Warstwa OSM (`app.js:201`) liczy rok przez przecięcie dat, więc obie warstwy działają różnie.
- W `remonty.json` jest 265 rekordów w źródłach: plan 108, bzp_uml 99, bzp_zim 55, bzp_zdit 3. Nie ma źródła z lodz.pl.
- **21** rekordów ma `rok` poza okresem `od`–`do`, bo rok BZP jest o 1–2 lata późniejszy niż roboty. Wróblewskiego (`2026/BZP 00119821`, od 2025-07-16 do 2025-12-09) to jeden z nich.
- 91 rekordów nie ma `lat`. Na mapie ich nie widać.
- `2026/BZP 00420817` to jeden rekord (`ulica=dubois`, jeden punkt). W `odcinki` nie ma dla niego geometrii. Pabianicka jest tylko w opisie.
- `deklaracje.json` to wskaźniki („co mówi miasto”), a nie rekordy robót.
- Pipeline (`remonty/pipeline/e01–e10`) **nie ma żadnych testów**.
- `LEJEK.md` definiuje „zdarzenie” jako odcinek plus okres i wyklucza z zakresu chodniki, ścieżki rowerowe, sieci i sygnalizację.
- Ekstrakcja E3 ma pole `pasy`, ale metodologia podaje dla niego precyzję 0–10%. BZP/BIP nie nadaje się jako źródło informacji o pasach.

### Potwierdzone na lodz.pl/remonty (pobrane 9.11.2026)
- `robots.txt`: `Allow: /`.
- **Jedna strona, około 61 kart**, bez stron szczegółów, JSON-LD i RSS. Audyt i prompt zakładały crawl stron szczegółowych, a takich stron nie ma.
- Karta ma stałe etykiety: nagłówek „Ulica (Od – Do)”, opis, **„Zakres utrudnień:”** (czasem „Zmiany w ruchu:”), „Zakres prac:”, „Termin(y) prac:” (Start / Rozpoczęcie / Planowane zakończenie), „Inwestor:”. Można więc parsować po etykietach, bez szukania fraz w całym tekście.
- Na stronie są wpisy z seed: Politechniki/Wróblewskiego, Stare Złotno, Starorudzka, Pojezierska, Paderewskiego, Pabianicka (Rudzka – Jana Pawła II). Treść zgadza się z audytem z dwoma wyjątkami opisanymi niżej.

### Błędy i nadinterpretacje w audycie
- **Paderewskiego, „etap II od 23.10.2026, jednym pasem”**: na karcie jest jeden blok „I etap Rzgowska–Karpacka, II etap Karpacka–Ciołkowskiego”. Pod nim jest jedno „Zakres utrudnień” i jeden „Start 23.10.2026”. Karta nie mówi, którego etapu dotyczą data i pas. Zapis trafia do `needs_review` i **nie** jest przypisywany automatycznie do etapu II.
- **„Paderewskiego, etap I start 19.07.2026”** (prompt): data 19.07.2026 należy do innej karty (Inwestor: Łódzkie Inwestycje, odcinek Hipoteczna–Zgierska). To pomyłka audytu, więc ten punkt usuwamy z danych testowych.
- Hipotezy do sprawdzenia przy imporcie seed (nie sprawdzałem źródeł spoza lodz.pl): Pabianicka 2025 (PDF nr 50/2025), Rzgowska (Radio Łódź), Żeromskiego (Portal Rewitalizacji), Pabianicka 3 Maja od 14.09 (Łódź+), zakończenie Wróblewskiego 13.12.2025 (PDF).
- Audyt porównuje typ pola z danych do wartości `under_traffic`, której nie ma na jego własnej liście typów. Prace pod ruchem bez szczegółów dostają typ `unknown`.

## 2. Decyzje

| # | Temat | Decyzja |
|---|---|---|
| 1 | Nazwa bytu | Nowy byt to **utrudnienie** (`traffic_restriction`). „Zdarzenie” zostaje w znaczeniu z LEJKA. Jedno utrudnienie = jedna relacja, jeden typ wpływu, jeden przedział dat. |
| 2 | Źródła v1 | Scraper **lodz.pl/remonty** plus **ręcznie zweryfikowany seed** jako historia 2025–26. Archiwum gazety (PDF), MPK, BIP-TOR i media odkładamy na później. |
| 3 | Historia | Skrypt uruchamiany **ręcznie, lokalnie** (np. raz w tygodniu). Surowy HTML idzie do `remonty/work/` (gitignore), do repo trafiają tylko przetworzone utrudnienia. Luki między przebiegami akceptujemy i opisujemy w metodologii. |
| 4 | Klasyfikacja | **Słownik fraz** stosowany do pola „Zakres utrudnień”. Wynik to typ wpływu, cytat i ID reguły. Przypadki niejednoznaczne trafiają do `needs_review` do ręcznego przeglądu. Bez LLM. |
| 5 | Zakres robót | Utrudnienie widać **niezależnie od zakresu** (np. chodnik zajmujący pas). **Bilans „remonty a bilet MPK” się nie zmienia.** |
| 6 | Wiele ulic w BZP | Reguła „zadanie N” / `;` dzieli opis na fragmenty. Każdy fragment jest osobnym rekordem z tym samym `contract_id` i id `…#z2`, `#z3`. **Pierwszy fragment zachowuje stare id**, więc linki działają. Bez wzorca → `needs_review`. |
| 7 | Deduplikacja | Duplikat obserwacji to ten sam URL **i** hash treści karty. Powiązanie z kontraktem/zdarzeniem to ta sama ulica i przecięcie dat, zapisane jako link `auto`. **Rekordów nigdy nie scalamy, tylko je linkujemy.** Konflikty → `needs_review`. |
| 8 | Pewność | `high`: oficjalne źródło miejskie i jednoznaczna fraza. `medium`: źródło wtórne albo fraza ogólna. `low`: link `auto` albo niejednoznaczność (→ `needs_review`). |
| 9 | Rok | Widok „Rok” i licznik liczą rekordy, których `od`–`do` przecina dany rok (tak jak OSM). Plan bez dat zostaje przy polu `rok`. W dymku pole nazywa się „rok postępowania”. |

## 3. Model danych utrudnienia

Pola (`null` = źródło nie podało; niczego nie zgadujemy):

```
id                 stabilny: "lodzpl:" + slug(nagłówek karty) + "#" + nr relacji
relacja            ulica, od, do, kierunek|null, jezdnia|null, wlot|null
traffic_impact     full_closure | one_lane_closed | one_lane_open | lane_narrowing |
                   alternating_traffic | one_direction_only | both_directions_maintained |
                   temporary_carriageway | local_access_only | turn_ban | unknown
lanes_open, lanes_closed   int|null; tylko gdy podane wprost
faza               tekst etapu|null
date_start, date_end       ISO|null
start_precision, end_precision   exact|approximate|month|season|year|unknown
date_status        planned|observed|actual|cancelled|unknown
zakres_prac        lista z karty (tekst źródłowy)
inwestor           ZDiT | Łódzkie Inwestycje | …
confidence         high|medium|low
rule_id            id reguły słownika / "manual"
obserwacje[]       {url, cytat, published_at|null, captured_at, sha256}
links[]            {typ: contract|zdarzenie, id, how: auto|manual}
needs_review       bool + powód
```

Zmiany względem audytu:
- **`turn_ban`**: przypadek Politechniki („brak lewoskrętu”) nie mieści się na liście z audytu.
- **`season`** w precyzji dat (np. „wiosna 2027”).
- Bez `lanes_total`: tej liczby nie dało się wziąć z żadnego źródła.

Zasady:
- „Prace pod ruchem” bez szczegółów → `unknown` (nie „jeden pas”).
- „Raz jeden, raz dwa pasy” → `lane_narrowing`, `lanes_closed=null`.
- „Zamknięta dla ruchu, możliwe wjazdy docelowe” → jedno utrudnienie `local_access_only` (nie `full_closure`). W filtrze UI oba trafiają do grupy „Pełne zamknięcie / dojazd”.
- Kilka zdań w „Zakres utrudnień” na różne relacje → kilka utrudnień.

## 4. Zmiany w pipeline

1. **Nowy krok `remonty/pipeline/e11_lodzpl.py`**: pobranie strony (UA, timeout, retry, cache w `work/lodzpl/<data>.html` + sha256), podział na karty po strukturze HTML, parsowanie etykiet i słownik fraz → `work/utrudnienia_obs.jsonl` (append-only, deduplikacja po url+sha) i `work/needs_review.csv`.
2. **Seed** `remonty/utrudnienia_seed.json` (wersjonowany, wpisywany ręcznie): 11 rekordów z poprawkami z §1, z `rule_id=manual`.
3. **Krok łączenia** (w e11): obserwacje + seed → bieżący stan utrudnień, linki `auto` do kontraktów i zdarzeń.
4. **Podział kontraktów** (decyzja 6) w `e8_web_export.py`, przed budową `items`.
5. **`e8_web_export.py`**: nowa sekcja `utrudnienia` w `remonty.json`. Obecne `items`, `roczne` i `dzienne` się nie zmieniają, z wyjątkiem podziału kontraktów.
6. **Test** `remonty/pipeline/test_e11.py` (assert, bez frameworka) na zapisanym HTML-u fixture z 9.11.2026 i na tekstach przypadków regresyjnych.

## 5. Zmiany w UI (`remonty-lodz/`)

- Filtr „Wpływ na ruch” (wielokrotny wybór): Częściowe zajęcie (`one_lane_*`, `lane_narrowing`), Ruch wahadłowy, Jeden kierunek, Ruch utrzymany, Pełne zamknięcie / dojazd, Nieustalone.
- Warstwa utrudnień obok kontraktów, z osobną legendą. Istniejące filtry źródła zostają.
- Dymek: relacja, typ wpływu, pasy (tylko jeśli podane), etap, daty ze statusem i precyzją, cytat i link.
- Rok liczony przez przecięcie dat (decyzja 9).
- Rekordy bez geometrii: **poza v1** (patrz §7).

## 6. Kryteria akceptacji / regresja

Parser (fixture HTML z lodz.pl z 9.11.2026):
1. Politechniki/Wróblewskiego → **3** utrudnienia: Politechniki do centrum `one_lane_open`, `lanes_open=1` (lewy); Wróblewskiego od Wólczańskiej `full_closure`; lewoskręt Politechniki→Wróblewskiego `turn_ban`. Start 2026-11-08 `exact`, koniec `planned`.
2. Stare Złotno → `alternating_traffic`, pasy `null`, koniec „wiosna 2027” `season`/`planned`.
3. Starorudzka → `one_direction_only` (Pabianicka→Przestrzenna), **nie** `full_closure`; start 2026-06-29.
4. Pojezierska → `both_directions_maintained`, pasy `null`, 2026-11-04 – 2026-11-10.
5. Paderewskiego → `one_lane_open`, start 2026-10-23, **`needs_review`** (etap niejednoznaczny); nie dzielić na etapy automatycznie.
6. Pabianicka (Ner – rondo, do centrum) → `lane_narrowing`, `lanes_closed=null` („raz jeden, raz dwa”).
7. Łukowa / Olsztyńska („zamknięta dla ruchu, wjazdy docelowe”) → `local_access_only`, nie `lane_*` (negatywny: słowo „pas” w innym kontekście nie daje częściowego zajęcia).
8. Karta z „prace pod ruchem” i nic więcej (np. Palki) → `unknown`.
9. Każda karta daje ≥1 utrudnienie albo wpis w `needs_review`. Żadna karta nie znika po cichu.

Seed / historia:

10. Pabianicka 2025 → `one_lane_closed`, obie jezdnie, start `approximate` 2025-04, koniec `null`.
11. Rzgowska 2025 → `confidence=medium` (źródło wtórne), start 2025-07-05.
12. Żeromskiego 2025 → relacja Mickiewicza–Kopernika; **brak** utrudnienia na al. Politechniki.
13. Wróblewskiego 2025 → typ `unknown` (brak danych o pasach).

Pipeline i UI:

14. Dwa przebiegi na tym samym HTML-u → zero nowych obserwacji.
15. Zmieniona karta → nowa obserwacja, stara zostaje w `utrudnienia_obs.jsonl`.
16. `2026/BZP 00420817` → 2 rekordy: `2026/BZP 00420817` (Dubois) i `#z2` (Pabianicka), wspólny `contract_id`.
17. Widok „Rok 2025” pokazuje Wróblewskiego (`2026/BZP 00119821`). Wszystkie 21 rekordów z rokiem poza okresem są liczone w latach robót.
18. Liczby w raporcie `badanie-remonty-lodz` (`roczne`, `dzienne`, bilans biletu) **bez zmian** względem stanu sprzed zmiany.
19. Filtr „Częściowe zajęcie” pokazuje utrudnienia niezależnie od zakresu prac i źródła kontraktu.

## 7. Poza zakresem v1 (świadomie)

- Archiwum gazety ŁÓDŹ.PL (PDF), MPK, BIP-TOR, media jako automatyczne źródła. Ich przypadki wchodzą tylko przez seed.
- Cron / GitHub Actions.
- Panel rekordów bez geometrii i ręczne geokodowanie (91 rekordów).
- Dopasowanie relacji do geometrii OSM między skrzyżowaniami. W v1 punkt utrudnienia bierzemy z istniejącego geokodera ulicy (`e4_geocode`), z flagą `geom=street_point`.
- Zmiana metodologii bilansu i definicji roboty z LEJKA.

## 8. Stan wdrożenia v1 (9.11.2026)

### Uruchomienie
```
cd remonty/pipeline
py e11_lodzpl.py --fetch   # pobiera lodz.pl/remonty do work/lodzpl/<znacznik>.html i przebudowuje work/utrudnienia.json
py e11_lodzpl.py           # tylko przebudowa z zapisanych snapshotów + ../utrudnienia_seed.json
py e8_web_export.py        # eksport remonty-lodz/data/remonty.json (sekcja "utrudnienia")
py test_e11.py             # testy regresyjne parsera (fixture z 9.11.2026)
```
Do przeglądu: `work/needs_review.csv` (utrudnienia) i `work/needs_review_bzp.csv` (kontrakty z kilkoma ulicami).

### Wynik pierwszego przebiegu
- 62 karty na lodz.pl. 3 pary to duplikaty, bo ta sama karta stoi w dwóch sekcjach z innym id. 59 kart daje 66 utrudnień, plus 5 z seed, razem **71**.
- Typy: dojazd docelowy 28, pełne zamknięcie 15, jeden kierunek 8, nieustalone 5, oba kierunki 3, jeden pas otwarty 3, jeden pas zajęty 3, zwężenie 2, wahadło 1, zakaz skrętu 1, jezdnia tymczasowa 1, brak utrudnień 1.
- `needs_review`: 17 (skrzyżowania, karty z kilkoma etapami, brak „Zakresu utrudnień”, Plac Wolności, Żeromskiego z seed).
- Geometria: 27 odcinków, 9 punktów w połowie odcinka, 5 skrzyżowań, 26 środków ulicy, 4 bez miejsca.
- Kontrakty: rozbity 1 (`2026/BZP 00420817` → `#z2` Pabianicka). Do przeglądu 7 z kilkoma ulicami bez wzorca.
- Linki `auto`: 2 (Rzgowska → `2026/BZP 00498466`, Pabianicka 3 Maja → `2026/BZP 00420817#z2`) i 1 `manual` (Wróblewskiego 2025).

### Zmiany względem §2–§6
- Nowy typ **`no_impact`** („Brak utrudnień”, np. prace poza pasem drogi). Inaczej taka karta trafiałaby do „nieustalonych”.
- „Brak przejazdu …” → `full_closure` z `wlot`. „Bez wjazdów docelowych” → `full_closure`, a nie `local_access_only`.
- Karty z sekcji „Projekty zaplanowanych do remontu ulic” (bez etykiet, tylko linki do projektów) nie są utrudnieniami i nie trafiają do eksportu.
- Seed ma 5 rekordów, a nie 11. Sześć wpisów pochodziło z lodz.pl/remonty, więc daje je scraper. Źródła 4 z 5 sprawdzone 9.11.2026. Portal Rewitalizacji (Żeromskiego) zwrócił pustą odpowiedź, więc rekord ma `confidence=low` i `needs_review`.
- Rzgowska 2025: `one_lane_open` (`lanes_open=1` na kierunek), a nie `lane_narrowing`, bo źródło podaje liczbę pasów.
- Położenie: zamiast punktu w środku ulicy (§7) jest odcinek wycięty metodą `e4b` (najkrótsza ścieżka po ulicy między skrzyżowaniami). Gdy ścieżki nie ma, bo OSM ma przerwaną geometrię, jest punkt w połowie odcinka. Środek ulicy zostaje tylko jako ostatni fallback (`geom_typ=ulica`).

### Znane ograniczenia (do decyzji)
- **Oś czasu sięga 9.11.2026** (dzień pobrania lodz.pl). Dane BZP i OSM kończą się 7.11, a licznik mówi o tym po tej dacie. **38 z 71 utrudnień nie ma daty startu na karcie** (6 nie ma żadnej daty), więc ich okres zaczyna się w dniu pierwszego pobrania i widać je dopiero od 9.11. Kolejne przebiegi `--fetch` przedłużą je w przód (`last_seen`), ale wstecz tej wiedzy z lodz.pl nie odzyskamy. Daty umowy BZP nie podstawiamy, bo termin umowy to nie termin zajęcia jezdni.
- **Widok „Rok” na mapie a słupki**: mapa liczy umowy trwające w roku (2025: 77), słupki liczą po roku postępowania z E7 (2025: 65), bo bilansu nie zmieniamy (kryterium 18). Obie liczby są opisane w UI.
- Dodanie geometrii `#z2` zmienia kolejność w STRtree w `e10`. Jeden odcinek OSM przypisany jest teraz do innej z dwóch umów na Legionów (`00505751` zamiast `00575852`). Klasa „potwierdzone” i `osm_bilans` bez zmian.
- Okres utrudnienia bez daty końca: `last_seen` z lodz.pl, a dla seed data publikacji źródła (komunikat mówi „trwa”).
- Historia działa dopiero od pierwszego przebiegu (9.11.2026). Wcześniejsze wersje kart nie istnieją.

## 9. Archiwum i daty startu (9.11.2026, druga tura)

- **Wayback Machine:** 22 kopie lodz.pl/remonty od 5.11.2024 do 4.10.2026 (CDX, `collapse=digest`), pobrane do `work/lodzpl/` z przerwą 3 s. Część była gzipowana, więc ją rozpakowałem. Kopia z 19.05.2026 (`?utm_source=…`) była pusta.
- **Stary układ strony** (do 03.2026): te same `<article>`, ale bez etykiet. Opis jest w `<p>`, utrudnienia w `<li>` albo w zdaniach opisu (`legacy=True`). Parser czyta też ten układ. Kopie z 2024 i z początku 2025 nie mają kart w sekcjach o remontach, więc pierwsze czytelne karty pochodzą z 02.2025.
- Teraz 171 kart i 194 utrudnienia (92 trwały w 2025, 143 w 2026). `observations.jsonl` da się w każdej chwili odtworzyć z kopii HTML, więc zbudowałem go od nowa po zmianie parsera.
- **Start, gdy karta go nie podaje:** `first_seen`, czyli pierwsza kopia z kartą. `start_po` to poprzednia kopia, w której karty jeszcze nie było. Gdy znany jest koniec, stosuję regułę autora: koniec minus 75 dni, przycięte do przedziału `[start_po, first_seen]`, który wynika z kopii (`start_precision=estimated`). Wynik: 68 dokładnych, 109 `first_seen`, 8 szacowanych, 4 z dokładnością do miesiąca.
- **Karty bez żadnej daty** (Kościuszki, Sienkiewicza, 1 Maja, Rydla, Widzewska): lodz.pl nie ma dla nich osobnych artykułów, karta to cała treść. Datę daje pierwsze pojawienie się w archiwum.
- **Nowe frazy słownika:** „na wahadle”, „zawężenia”, „zajęcia pasa”, „przejazd bez zmian”, „nie ma utrudnień”, „brak możliwości przejazdu”, „w każdym kierunku”, „zachowane są wszystkie kierunki”, „nie będzie możliwości … skrętu”.
- **SkyscraperCity: odrzucone na teraz.** To forum z wątkami pisanymi swobodnie, zdjęciami i opiniami. Nie ma struktury ani stabilnych identyfikatorów, regulamin ogranicza scraping, a pewność byłaby poniżej mediów lokalnych (§2, decyzja 8). Lepiej używać go ręcznie jako wskazówki do rekordu w seed z linkiem do posta. Wayback lodz.pl daje te same informacje z oficjalnego źródła.
- **UI:** różowy słupek „utrudnienia w roku” obok fioletowego (poza bilansem). Na dolnym wykresie są półprzezroczyste warstwy utrudnień według grup wpływu, pod warstwami umów. Oś czasu sięga 9.11.2026.
