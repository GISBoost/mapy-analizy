# Schematy linii Łódź — potok

Dwa stany rozkładu: **od 5.10.2026** (sufiks pusty) i **przed 5.10.2026** (sufiks `_przed`).
Katalog roboczy `$WORK` (dane, wyniki pośrednie) trzymaj poza repo; do repo trafiają tylko
`../index.html` i `../druk/`.

## Kroki

1. `filt.py <gtfs> <out> tram|bus|night [YYYYMMDD]` — dzień roboczy (domyślnie 20261008),
   główne warianty tras (≥25% kursów w kierunku), linie z <6 kursami pominięte, autobusy bez
   `^o?P\d`. Kalendarz czytany z `calendar_dates.txt` (w feedach ZDiT `calendar.txt` ma same zera).
   Wynik do `$WORK/data$SUF/<m>/`, a `lines.json` skopiuj do `$WORK/data$SUF/meta/<m>.json`.
2. LOOM (github.com/ad-freiburg/loom, GPL-3.0) przez `run.sh <m> tram|bus [octi args]`:
   `gtfs2graph -m tram|bus` → `topo -d $TOPO_D` → `loom` → `octi` → `transitmap`.
   Parametry: `TOPO_D=150`; `octi` domyślnie dla tramwajów i nocnych; dla autobusów
   `-g 60% --edge-order num-lines --loc-search-max-iters 20` oraz `LWID=24 LSP=5`
   (pozostałe: 30 i 7). Env: `LOOM_BUILD`, `WORK`, `SUF`.
3. `render.py` — własny renderer: paleta (linie biegnące razem dostają odległe kolory),
   przystanki, etykiety bez kolizji, krańcówki z rozkładu, numery linii przy wiązkach, legenda.
   Argumenty: `tm.svg octi.json meta.json out.svg tytuł podtytuł czcionka(9, autobusy 7) all
   tl.svg prefiks loom.json [kolory.json]`. Prefiks id musi być różny dla obu stanów
   (`tram`/`tramp` itd.), bo oba SVG są w jednym dokumencie. `kolory.json` przypina kolory
   (stan „przed” dostaje kolory stanu „po” z `colors/<m>.json`; nowe tylko dla linii, których
   „po” nie ma). Czcionka: Inter z `$FONT_DIR` (domyślnie `/usr/share/fonts/opentype/inter`,
   pakiet `fonts-inter`).
   Wycinki (env `CUTS`, JSON): „ogon” za przystankiem `cut` obsługiwany dokładnie przez linie `lines` idzie do ramki
   w rogu `at` mapy (bl/tl/br/tr; `below` = pod mapą) jako prosta wiązka z etykietami pod 45°; przy `cut` zostaje
   kropkowany odcinek. Z `"box": false` ogon zostaje na miejscu, ściśnięty `k` razy w stronę `cut`. Tramwaje:
   `[{"lines":["41"],"cut":"Chocianowice IKEA","title":"do Pabianic","at":"bl"},
   {"lines":["43"],"cut":"Legionów-Włókniarzy","title":"do Konstantynowa Łódzkiego","at":"bl"},
   {"lines":["45"],"cut":"Zgierska-Helenówek-pętla","k":0.5,"box":false}]` (z `CUT_GAP=3`).
  Z `"shape":"keep"` i `"to":[…]` ogon może mieć pętle i rozgałęzienia: do ramki idą wszystkie fragmenty za
  przystankami `cut` (może być lista: kilka miejsc wyjazdu z miasta) jeżdżone tylko przez `lines`, które dochodzą do
  przystanku z nazwą zawierającą coś z `to`; rysunek octi zostaje, osie ściśnięte `k` razy, wiązki i znaczki w
  pełnym rozmiarze. `"at":"side"` stawia ramkę na prawo od mapy, a plakat poziomy przenosi ją na dół bocznej kolumny.
  Odstęp ramka–mapa: env `CUT_GAP` (w wysokościach czcionki, domyślnie 5). Autobusy (podmiejskie ogony z GTFS vs
  granica Łodzi, 10.10.2026), wszystkie z `"shape":"keep"`: 94 → Lutomiersk (bl, k 0,45); 50A/50B/56 → Rzgów
  (cut Rudzka-Skrajna i Rzgowska-Zagłoby, bl); 88B/88C/88D/91B/91C → Skoszewy, Kalonka (cut Marmurowa-Moskuliki,
  Byszewska-Byszewska 26, Grabińska 40; tr, k 0,36); 60B/60C → Stryków, Michałówek (tr); 53B → Brzeziny (tr);
  201/202/82B/92A/92B → Andrespol, Bedoń, Janówka, Stróża (cut Rokicińska-Andrzejki i Kolumny-Czajewskiego NŻ;
  side, k 0,6). Kolejność na liście decyduje, kto pierwszy dostaje róg.
   Obok `<out>.svg` (strona) powstaje `<out>.poster.svg` (druk, `pdf.py` bierze go, jeśli jest): arkusz o proporcji
   `POSTER_RATIO` (domyślnie A1 pionowo, 841/594), pasek tytułu, lista linii i objaśnienia w pustych rogach mapy
   (`LEGEND_AT`, `KEY_AT`, domyślnie tr i tl), a wysokość, której mapa nie wypełnia, idzie na pas z lupą pod mapą.
   Lupa (env `ZOOM`): `{"stations":[…],"k":2.2,"title":"Centrum"}` — wycinek wokół podanych przystanków (`<use>`
   głównego rysunku) na całą szerokość pasa, zaznaczony na mapie czerwoną przerywaną ramką; ramki wycinków są w lupie
   zasłonięte. Gdy lista linii nie mieści się w rogach mapy, idzie z objaśnieniami do pasa (`BAND_COLS` kolumn,
  domyślnie 2); na arkuszu poziomym (`POSTER_RATIO` < 1) pas jest kolumną z prawej, a lupa ma wysokość najwyżej
  `ZOOM_H` × szerokość (domyślnie 1, kwadrat). Autobusy: A0 poziomo (`POSTER_RATIO=0.7073`), lupa `k` 3 na
  Dw. Łódź Fabryczna, Rodziny Poznańskich-Dw. Łódź Fabryczna, Narutowicza-pl. Dąbrowskiego, Kilińskiego-Narutowicza,
  Jaracza-Piotrkowska, Zamenhofa-Piotrkowska, Struga-Piotrkowska, Tuwima-Kilińskiego (EC1 Centr. Nauki),
  Żeromskiego-pl. Barlickiego, Gdańska-1 Maja. Tramwaje: Piotrkowska Centrum, Kościuszki-Zamenhofa, Mickiewicza-Żeromskiego, Piłsudskiego-Kilińskiego,
   Piotrkowska-Brzeźna, Kościuszki-Struga, Piłsudskiego-Sienkiewicza, Żwirki-Piotrkowska, Kościuszki-Mickiewicza.
   Nocne: A1 pionowo (domyślne `POSTER_RATIO`), `CUT_GAP=3`, wycinki w trybie prostym:
   `[{"lines":["N1A"],"cut":"Rojna-Rydzowa","title":"do Aleksandrowa Łódzkiego","at":"tl"},
   {"lines":["N5B"],"cut":"Rokicińska-Hetmańska NŻ","title":"do Andrespola","at":"br"}]` (każdy ogon zabierał 16%
   powierzchni schematu, razem 22,6×13,7 → 15,3×13,7 km), lupa `k` 3 (render zmniejsza, gdy nie mieści) na
   Zachodnia-Legionów, Gdańska-1 Maja, Więckowskiego-Zachodnia, Próchnika-Piotrkowska, Jaracza-Piotrkowska,
   Zamenhofa-Piotrkowska, Struga-Piotrkowska, Kościuszki-Mickiewicza, Rodziny Poznańskich-Dw. Łódź Fabryczna,
   Kilińskiego-Narutowicza. `LEGEND_AT=band` wymusza listę linii w pasie/kolumnie (próba A1 poziomo, odrzucona: lupa ×1,1).
4. `diff.py <gtfs_przed> <dzień> <gtfs_po> <dzień> <diff.json>` — różnice z samego GTFS:
   linie dodane, usunięte, ze zmienioną trasą (inna sekwencja nazw przystanków najczęstszego
   wariantu w którymś kierunku) i ze zmienioną liczbą kursów.
5. `build_page.py <WORK> page_tpl.html <diff.json> ../index.html` — strona z oboma stanami
   (czyta `$WORK/out<SUF>/<m>.svg` i `.lines.json`).
6. `pdf.py <WORK> <SUF> ../druk` — SVG i PDF do druku (headless Chrome, `CHROME=ścieżka`).
   pdf.py zapisuje też wersję ciemną `<nazwa><SUF>_ciemny.{svg,pdf}` (kolory jak w ciemnym motywie strony), `jpg.py` robi z niej JPG, a strona podmienia linki do pobrania zależnie od motywu.
   `jpg.py ../druk [2500]` — podgląd JPG każdego SVG z `druk/` (dłuższy bok w px, Chrome + Pillow).
   `verify.py [katalog_svg]` — kontrola linii i krańcówek względem GTFS (env `WORK`, `SUF`).
   `gate.py <svg> <gtfs_dir>` — bramka objazdów: odcinki rysowane ≥1,4× dłużej niż cięciwa i linie
   ≥1,5× dłuższe od mediany (rysunek/GTFS). `octi` bywa pechowy (np. pętla 75A/B przez Starową
   Górę, objazd 64A/Z6 przez Zagajnikową) — wtedy przelicz układ i obejrzyj zgłoszone miejsca.
   Znane i w porządku: 85A, 91C, F1 (długie, kręte trasy), haczyk 75A/B przy IKEA (pętla nawrotowa).

`run.sh` między `topo` a `loom` woła `fixends.py`: `topo` potrafi zgubić linię z ostatnich krawędzi
przed krańcówką (59/86 kończyły się 1 km przed Pomorską-Edwarda); skrypt dokleja ją po najkrótszej
ścieżce do przystanku najbliższego krańcówce z rozkładu (log w `out$SUF/<m>.logfix`).
`filt.py` pomija przystanek „przejazd techniczny” (87A/87B), bo to nie przystanek dla pasażerów.

### Dworce i centrum (Fabryczna)
LOOM nie grupuje przystanków (`gtfs2graph` robi węzeł z każdego `stop_id`, `parent_station` ignoruje),
a pętle końcowe przez kilka peronów rysuje jako supeł. Fabryczna to w realu cztery grupy peronów wokół jednej
pętli (51/53/61/85: pl. Dąbrowskiego → Rodziny Poznańskich wsch. → dworzec → Rodziny Poznańskich zach. → pl. Dąbrowskiego),
więc rysujemy ją jako cztery węzły połączone pierścieniem:
- `filt.py` — **węzły**: `HUBS` (env, JSON z listami `stop_id`) — domyślnie dworzec (2999, 2995, 2998), Rodziny
  Poznańskich zach. (2989–2992) i wsch. (3015, 3002, 3003), pl. Dąbrowskiego (769, 763 Narutowicza + 760 Sterlinga,
  bo `topo -d 150` i tak by je skleił). ID są te same w feedach z 2.10 i 5.10.2026. Pozostałe dworce (Widzew, Kaliska,
  Chojny): „Dw. Łódź X” + każdy „Ulica-Dw. Łódź X” do 250 m w jeden przystanek w środku ciężkości.
- `hubsnap.py` (w `run.sh` po `fixends.py`) — węzeł pomocniczy `topo` trafia do najbliższego przystanku i jest
  wciągany, tylko gdy to dworzec do `HUB_R` m (300); równoległe krawędzie scalane. Dworcom zdejmuje `not_serving`
  (inaczej symbol rysuje się tylko na jednej linii) i nadaje unikalne `station_id` bliźniakom o tej samej nazwie
  (`render.py` przypisuje krańcówki po `station_id`, oba „Rodziny Poznańskich” dostawały „Dw. Łódź Fabryczna”).
- `fisheye.py` (w `run.sh` przed `octi`) — najpierw `MOVE` (env, JSON `[lon, lat, nowy_lon, nowy_lat]`): cztery węzły
  ręcznie w romb 300 m od dworca (S, W, E, N; w realu W–dworzec–E leżą na jednej prostej i `octi` robi z nich jeden pęk).
  Potem soczewki `FISHEYE="M R0 [lon lat], …"` po kolei: lokalna na Fabryczną i globalna na centrum (domyślnie
  `2.5 650 19.4687 51.7703, 1.5 2500`). `octi` ma jedną skalę siatki, bez tego przystanki centrum lądują
  w sąsiednich komórkach.
- `octi` jest bardzo czuły na wejście: drobna zmiana soczewki daje inny układ. Wariant wybierany z kilku po bramce
  (`gate.py`), liczbie konfliktów etykiet i niedopasowanych przystankach w `render.py` oraz zrzucie okolic dworca.
  Opublikowane: stan „po” `FISHEYE="2.2 650 19.4687 51.7703, 1.5 2500"`, stan „przed” `"2.5 700 19.4687 51.7703, 1.5 2500"`.
  Szybka iteracja: sam `fisheye.py` + `octi` + `transitmap` na gotowym `loom.json` (~20 s).
- `fixends.py` łata krańcówki dalsze niż 120 m od linii (`topo` gubił też ostatnie 230 m linii 61 do dworca).
Pozostałe niezgodności w `verify` (54A/91A „Nowosolna”) to nazwy:
`topo -d 150` scala przystanki do 150 m w jeden węzeł, chip stoi we właściwym miejscu.

`mk.sh`/`fin.sh` łączą kroki 2–3 i robią podgląd PNG (`shot.py`, Playwright) — env:
`PY`, `SUB` i (tylko `fin.sh`) `COLORS`.

## Jak powstał stan „przed” (8.10.2026)

- GTFS: release `lodz-realized-2026-10-02-phone` repo `GISBoost/easy-GTFS-RT`,
  `lodz_static_gtfs_2026-10-02.zip`, `feed_start_date` 20261001. Dzień: czwartek **1.10.2026**.
- Stan „po”: tramwaje i nocne to dotychczasowe SVG z `../druk/` (release `lodz-realized-2026-10-05-phone`,
  dzień 8.10.2026), nieprzeliczane; ich `lines.json` odtworzono z metadanych strony. Autobusy
  w obu stanach przeliczone 9.10.2026 z czterema węzłami Fabrycznej, `hubsnap.py`, `fisheye.py` (MOVE + dwie soczewki)
  i `fixends.py`.
- Tramwaje 10.10.2026: stan „po” od nowa obecnym `run.sh` z `FISHEYE=` (stary układ nie odtwarza się na tej maszynie),
  stan „przed” z dotychczasowego `octi.json`. Próbowane i odrzucone: soczewka na centrum + `octi --geo-pen 1` (Piotrkowska
  pionowo, ale Pabianicka/Paderewskiego robią się poziome wbrew geografii), `--diag-pen 1.5`, `-g 75%`, `--geo-pen 3`.
  `tl.svg` (`transitmap -l`) ma czasem szersze płótno niż `tm.svg`; `render.py` przelicza numery linii przez `latlng-box`. Autobusy i nocne bez zmian (bez plakatu, tylko wersje ciemne).
- Nocne 10.10.2026: oba stany od nowa (`run.sh night bus`, `TOPO_D=150`, z `fixends`/`hubsnap`), potem z `loom.json`
  soczewka `FISHEYE='2.5 650 19.4687 51.7703, 1.5 2500'` i `octi --geo-pen 1`, żeby wiązka Zamenhofa – Kościuszki-Mickiewicza
  – Kościuszki-Radwańska szła pionowo jak w terenie. Porównane: domyślne octi, `--geo-pen` 0,5/1/2/3, `--diag-pen 1.5`,
  `-g 75%`, sama soczewka, `--geo-pen 1 -g 75%` (najmniejsza dystorcja: błąd kierunku 22,6°, przesunięcie 0,29 km;
  wybrana soczewka + geo-pen ma 29,5° i 0,47 km, ale więcej miejsca w centrum).
- LOOM w WSL (Ubuntu 24.04, cmake + g++); `src/topo/tests/ContractTest.cpp` skompilowany
  z `-O0` (`make tests/ContractTest.cpp.o CXX_FLAGS='-O0 -fopenmp -w'` w `build/src/topo`),
  bez libzip — GTFS podawany jako katalog. Python (pandas, shapely, PIL) na Windows z `-X utf8`.

## Warstwa orientacyjna (prototyp, 10.10.2026)

Opcjonalne tło schematu: kolej, granica Łodzi (strefa biletowa 1 | 2), parki i lasy, nazwy pięciu dzielnic, ul. Piotrkowska
z pl. Wolności oraz piktogramy przy nazwach przystanków (stacja kolejowa w promieniu 350 m, duże szpitale, Manufaktura).
Przetestowana na tramwajach, autobusach i nocnych, stan „po”; pliki w `druk/` i na stronie są jeszcze bez niej.

- `landmarks.py <work>/landmarks.json`: pobiera dane z OpenStreetMap (Overpass API) do katalogu roboczego; surowa odpowiedź
  zostaje obok (`*.osm.json`), więc kolejne uruchomienie nie odpytuje serwera. Dane nie trafiają do repozytorium.
- `render.py` z `LANDMARKS=<work>/landmarks.json` rysuje warstwę, z `RAIL_STYLE=double` kolej jak na mapie NYC (podwójna linia).
- Tło jest przycięte do ramki rysunku (nie wchodzi pod pasek tytułu ani do bocznej kolumny plakatu). Gdy panel objaśnień
  jest wąski (nocne), objaśnienia idą w jednej kolumnie.
- Parki nie przechodzą przez linie (wyglądałoby to jak przejście na drugą stronę ulicy): są cięte wzdłuż każdej linii
  z odstępem, a skrawki (poniżej 1/5 największej części) znikają. Nazwy dzielnic omijają parki, podpisy parków omijają
  nazwy dzielnic.
- Na mapach bez przystanku „Piotrkowska Centrum” (nocne) ulica zaczyna się w miejscu tego przystanku przeniesionym
  przez odwzorowanie. Na autobusach jej nie rysujemy (`PIOTRKOWSKA=0`), bo nie ma jak jej wpasować. Ośmiokąt pl. Wolności zjeżdża wzdłuż ulicy (do 8 wysokości czcionki) z linii i przystanków; podpis
  szuka wolnego miejsca w pobliżu, a bez niego jest pomijany.
- Ramki `"shape":"keep"` (autobusy), które w całości leżą poza Łodzią, mają tło strefy 2 i kreskę granicy na pierwszym
  odcinku za każdym przystankiem cięcia.
- Geografia trafia na schemat przez odwzorowanie odcinkowo-afiniczne na trójkątach rozpiętych na przystankach; poza siecią
  działa jedno przekształcenie afiniczne dopasowane do wszystkich przystanków.
- Kolej: tory pasażerskie (relacje `route=train`) sklejone w jedną linię na korytarz, przecięte na stacjach i rozjazdach
  (węzły bliższe niż 350 m łączone), każdy odcinek narysowany jako skos + prosta (kąty 45/90°), do granicy miasta.
- Parki i granica: wielokąty uproszczone i dociągnięte do siatki, boki tylko co 45/90°; parki z zaokrąglonymi narożnikami.
- Kolory warstwy w wersji ciemnej: tabela `NEUT` w `pdf.py`.
