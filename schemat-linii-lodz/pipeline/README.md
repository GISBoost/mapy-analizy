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
   {"lines":["45"],"cut":"Zgierska-Helenówek","k":0.5,"box":false}]` (z `CUT_GAP=3`).
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
   (czyta `$WORK/out<SUF>/<m>.svg` i `.lines.json`). Schematy zapisuje do `../mapy/<m><SUF>.svg`, a odcinki
   linii z jednej grupy scala w jedną ścieżkę (`<path>`; ten sam wygląd, ok. 3 razy mniej węzłów DOM).
5a. Widok geograficzny (przed krokiem 5; dziś tylko tramwaje „po”). Na **kopii** `loom.json` (nie na oryginale, nie na
   `fish`/`octi`) `serving.py` ze skilla `schemat-linii-loom`, potem eksport:
   ```
   cp $WORK/out_TF150/tram.loom.json $WORK/out_TF150/tram.geo.json
   py -3 -X utf8 serving.py $WORK/out_TF150/tram.geo.json $WORK/out_TF150/tram.loom.json $WORK/data_TF150/tram
   LABELS='{"Północna":"Północna / Nowomiejska"}' py -3 -X utf8 geo_export.py $WORK/out_TF150/tram.geo.json \
     $WORK/data_TF150/meta/tram.json colors/tram.json ../mapy/tram_geo.json
   ```
   Linie i przystanki mapy rysuje `transitmap` z LOOM jako kafle wektorowe (MVT), osobno dla z11–z17, z grubością linii
   w pikselach dla każdego zoomu (`geo_tiles.sh`, w WSL). `geo_tiles.py` scala kafle do `tram_geo.json` (klucz `z`).
   Uruchamiaj go zawsze po `geo_export.py`, bo ten zapisuje plik od nowa. Kafle zostają w katalogu roboczym, nie w repo:
   ```
   MSYS_NO_PATHCONV=1 wsl.exe bash -l geo_tiles.sh $WORK_WSL/out_TF150/tram.geo.json $WORK_WSL/tiles_tram
   py -3 -X utf8 geo_tiles.py $WORK/tiles_tram ../mapy/tram_geo.json
   ```
   `build_page.py` daje przełącznik mapy każdemu stanowi, dla którego jest `../mapy/<m><SUF>_geo.json`, i wstawia hash
   `?v=` dla `geo.js` i danych. Nazwy przystanków i krańcówki `geo_export.py` liczy jak `render.py`; kolory z `colors/<m>.json`.
6. `pdf.py <WORK> <SUF> ../druk` — SVG i PDF do druku (headless Chrome, `CHROME=ścieżka`).
   pdf.py zapisuje też wersję ciemną `<nazwa><SUF>_ciemny.{svg,pdf}` (kolory jak w ciemnym motywie strony), `jpg.py` robi z niej JPG, a strona podmienia linki do pobrania zależnie od motywu.
   `jpg.py ../druk [2500]` — podgląd JPG każdego SVG z `druk/` (dłuższy bok w px, Chrome + Pillow).
   `verify.py [katalog_svg]` — kontrola linii i krańcówek względem GTFS (env `WORK`, `SUF`, `MAPS`) oraz linii przy
   przystankach: każda linia z podpisu przystanku musi w rozkładzie stawać na przystanku o jednej z nazw podpisu (kolejność
   ulic bez znaczenia). Zostają zgłoszenia ze sklejeń `topo` (np. rondo z przystankami na dwóch ulicach).
   `gate.py <svg> <gtfs_dir>` — bramka objazdów: odcinki rysowane ≥1,4× dłużej niż cięciwa i linie
   ≥1,5× dłuższe od mediany (rysunek/GTFS). `octi` bywa pechowy (np. pętla 75A/B przez Starową
   Górę, objazd 64A/Z6 przez Zagajnikową) — wtedy przelicz układ i obejrzyj zgłoszone miejsca.
   Znane i w porządku: 85A, 91C, F1 (długie, kręte trasy), haczyk 75A/B przy IKEA (pętla nawrotowa).

`run.sh` między `topo` a `loom` woła `fixends.py`: `topo` potrafi zgubić linię z ostatnich krawędzi
przed krańcówką (59/86 kończyły się 1 km przed Pomorską-Edwarda); skrypt dokleja ją po najkrótszej
ścieżce do przystanku najbliższego krańcówce z rozkładu (log w `out$SUF/<m>.logfix`).
`filt.py` pomija przystanek „przejazd techniczny” (87A/87B), bo to nie przystanek dla pasażerów, oraz zjazdy i wyjazdy
z zajezdni (kurs zaczyna się lub kończy na „…-zajezdnia NOWE SADY/LIMANOWSKIEGO”): F1, 72B, 91C, 60C, 85A i nocne
N1B/N3B/N5B miały ich 20–40%, więc reguła 25% rysowała zajezdnię jako krańcówkę. Zostają, gdy kierunek nie ma innych
kursów (97A/97B). Liczba kursów w `lines.json` nadal je obejmuje.

**Kto gdzie staje** (`serving.py`, w `run.sh` po `octi`): `topo`/`loom` gubią, które linie tylko przejeżdżają przez węzeł
(a `hubsnap.py` czyścił to przy każdym „Dw. Łódź”: 50A/50B/68 na Leszczowej, tramwaje 4/9/19 przy Fabrycznej, 2/6/8/13/16 na
pętli Żabieniec). Skrypt przypisuje każdy przystanek rysowanych kursów linii do węzła z tą linią (najbliższy o tej samej
nazwie, a gdy takiego nie ma, najbliższy w ogóle; położenia z `loom.json`) i zapisuje w `octi.json` `not_serving` oraz
`stop_names` (nazwa → linie). Koniec linii zawsze jest jej przystankiem. `transitmap` rysuje wtedy symbol przystanku tylko
na liniach, które na nim stają. `render.py` z `stop_names`: węzeł sklejony z kilku przystanków dostaje nazwę tego, na którym
staje więcej linii (Kilińskiego-Dw. Łódź Chojny zamiast Śląska 28 dla N3), a krańcówka sklejona z przystankiem przelotowym
innej ulicy ma obie nazwy („Rokicińska-Lermontowa / Widzew Augustów”, „Aleksandrowska-Szczecińska / Teofilów”).
`LABELS` (env, JSON `{nazwa: podpis}`) poprawia ręcznie sklejenia, których nie da się nazwać z danych; tramwaje:
`{"Północna":"Północna / Nowomiejska"}`. Na stronie legenda mówi, że przystanki bliżej niż ok. 150 m są jednym punktem.

### Dworce i centrum (Fabryczna)
LOOM nie grupuje przystanków (`gtfs2graph` robi węzeł z każdego `stop_id`, `parent_station` ignoruje),
a pętle końcowe przez kilka peronów rysuje jako supeł. Fabryczna to w realu cztery grupy peronów wokół jednej
pętli (51/53/61/85: pl. Dąbrowskiego → Rodziny Poznańskich wsch. → dworzec → Rodziny Poznańskich zach. → pl. Dąbrowskiego),
więc rysujemy ją jako cztery węzły połączone pierścieniem:
- `filt.py` — **węzły**: `HUBS` (env, JSON z listami `stop_id`) — domyślnie dworzec (2999, 2995, 2998), Rodziny
  Poznańskich zach. (2989–2992) i wsch. (3015, 3002, 3003), pl. Dąbrowskiego (769, 763 Narutowicza + 760 Sterlinga,
  bo `topo -d 150` i tak by je skleił). ID są te same w feedach z 2.10 i 5.10.2026. Pozostałe dworce (Widzew, Kaliska):
  „Dw. Łódź X” + każdy „Ulica-Dw. Łódź X” do 250 m w jeden przystanek w środku ciężkości. `HUB_SKIP` (env, JSON z nazwami;
  domyślnie `["Dw. Łódź Chojny"]`) wyłącza to: przy Chojnach 69/70/72 stają na Kilińskiego, a 75 na Śląskiej, nie na dworcu.
- `hubsnap.py` (w `run.sh` po `fixends.py`) — węzeł pomocniczy `topo` trafia do najbliższego przystanku i jest
  wciągany, tylko gdy to dworzec do `HUB_R` m (300); równoległe krawędzie scalane. Dworcom zdejmuje `not_serving`
  (`serving.py` liczy je potem od nowa z rozkładu) i nadaje unikalne `station_id` bliźniakom o tej samej nazwie
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
  Gdy `topo` zgubił sam przystanek końcowy, `fixends.py` wstawia go z powrotem na jego miejscu z krótką krawędzią od
  najbliższego przystanku (linia 1: Kilińskiego-Mochnackiego, 480 m za Dąbrowskiego; pętla Helenówek osobno od przystanku 45).
Pozostałe niezgodności w `verify` (54A/91A „Nowosolna”) to nazwy:
`topo -d 150` scala przystanki do 150 m w jeden węzeł, chip stoi we właściwym miejscu.

`straighten.py <katalog_gtfs> <wynik>` (eksperyment, 12.10.2026) — prostuje ulice w GTFS po `filt.py`, przed LOOM:
przystanki i punkty `shapes.txt` do `buf` m od podanej łamanej dostają wspólną długość (`"axis":"v"`) albo szerokość
(`"h"`), z opcjonalnym wygaszaniem przy skrzyżowaniu (`taper`). Konfiguracja w env `STRAIGHTEN` (JSON, opis w nagłówku).
Tramwaje „po”: Piotrkowska od Żwirki do pl. Reymonta na długość Piotrkowskiej Centrum (19.4570) i Przybyszewskiego od
pl. Reymonta do Kilińskiego na szerokość pl. Reymonta (51.7429, wygaszane od 19.4725 do 19.4752):
`[{"path":[[19.4583,51.7577],[19.4590,51.7556],[19.4600,51.7527],[19.4607,51.7490],[19.4614,51.7462],[19.4627,51.7429]],"axis":"v","to":19.4570,"buf":70},
{"path":[[19.4627,51.7429],[19.4690,51.7441],[19.4760,51.7455]],"axis":"h","to":51.7429,"buf":70,"taper":[19.4725,19.4752]}]`.
Korytarz Piotrkowskiej zaczyna się poniżej osi Piłsudskiego/Mickiewicza, inaczej ściągnąłby kawałek poziomej wiązki do
jednego punktu. Samo prostowanie przy domyślnym `octi` prawie nic nie daje. Z
`-g 70% --geo-pen 1 --nd-move-pen 3 --diag-pen 0.5 --pen-45 2 --pen-90 1 --pen-135 1 --density-pen 5 --max-grid-dist 5`
Piotrkowska jest pionowa ze skrętem 90° na pl. Reymonta (issue #1). Z samym `--diag-pen 1` centrum wychodzi tak samo, ale
Pabianicka i ogon do Pabianic kładą się poziomo. Kary faworyzujące 90° (`--pen-90` 0–0,5 przy `--pen-135` 2–3) same
prostują Piotrkowską, ale rozjeżdżają resztę (średni błąd kierunku 23° zamiast 17°), a dodane do zestawu wyżej tylko dokładają
schodków (61 → 127–142 załamań).

`gtfs_fix_shapes.py <gtfs.zip|katalog> <wynik.zip>` — feed ZDiT podany wprost do `gtfs2graph` (także we wtyczce QGIS
[loom_qgis](https://github.com/transportforcairo/loom_qgis)) przerywa wczytywanie: część kursów (tramwaj 43, kilkanaście
linii autobusowych) ma `shape_id` bez wpisu w `shapes.txt`. Skrypt usuwa takie kursy, gdy linia ma inne z kształtem,
a pozostałym czyści `shape_id` (feed z 5.10.2026: 104 usunięte, 4 bez kształtu). `filt.py` sam czyści `shape_id`
bez kształtu (po wyborze wariantów), więc potok tego nie potrzebuje.

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

- 11.10.2026 (uwagi użytkowników): autobusy i nocne w obu stanach od nowa z `filt.py` z `HUB_SKIP` i bez kursów
  zjazdowych, potem `serving.py`. Warianty z `loom.json` (soczewka × `--geo-pen`), wybrane po bramce, konfliktach etykiet,
  niedopasowanych przystankach i zrzutach: autobusy po i przed `FISHEYE="2.2 650 19.4687 51.7703, 1.5 2500"`; nocne po
  `"2.0 600 19.4687 51.7703, 1.5 2500"` z `--geo-pen 1` (7 konfliktów zamiast 17), nocne przed `"2.5 700 19.4687 51.7703,
  1.5 2500"` z `--geo-pen 1`. Tramwaje: dotychczasowy `octi.json` + `serving.py` (układ bez zmian). Przy Chojnach pętla
  jednokierunkowa 69/70/72 i 75 (Broniewskiego–Śląska–Kilińskiego–Rzgowska) nadal daje supeł; próba ze sklejeniem
  Kilińskiego i Śląskiej w jeden węzeł go nie usunęła.

- 11.10.2026, po drugiej rundzie uwag: tramwaje w obu stanach od nowa (`run.sh tram tram`, `TOPO_D=150`, `FISHEYE=`) z poprawką
  `fixends.py`; wycinek 45 zaczepiony o „Zgierska-Helenówek”. Test promienia `topo -d` 150/100/75 m: przy 75 m tramwaje
  rozdzielają Widzew Augustów i Lermontowa, ale rondo Lotników Lwowskich jest nieczytelne; autobusy przy 100 i 75 m tracą
  podpisy kilkunastu przystanków. Zostaje 150 m. N4B i N9 kursują tylko w weekendy; lista linii nocnych o tym mówi.

## Warstwa orientacyjna (10.10.2026)

Opcjonalne tło schematu: kolej, granica Łodzi (strefa biletowa 1 | 2), parki i lasy, nazwy pięciu dzielnic, ul. Piotrkowska
z pl. Wolności oraz piktogramy przy nazwach przystanków (stacja kolejowa w promieniu 350 m, duże szpitale, Manufaktura).
Jest na stronie i w `druk/`, na wszystkich sześciu schematach (oba stany). Render: `LANDMARKS=<work>/landmarks.json
RAIL_STYLE=double`, na autobusach i nocnych dodatkowo `PIOTRKOWSKA=0`; ustawienia map bez zmian (jak wyżej).

- `landmarks.py <work>/landmarks.json`: pobiera dane z OpenStreetMap (Overpass API) do katalogu roboczego; surowa odpowiedź
  zostaje obok (`*.osm.json`), więc kolejne uruchomienie nie odpytuje serwera. Dane nie trafiają do repozytorium.
- `render.py` z `LANDMARKS=<work>/landmarks.json` rysuje warstwę, z `RAIL_STYLE=double` kolej jak na mapie NYC (podwójna linia).
- Tło jest przycięte do ramki rysunku (nie wchodzi pod pasek tytułu ani do bocznej kolumny plakatu). Gdy panel objaśnień
  jest wąski (nocne), objaśnienia idą w jednej kolumnie.
- Parki nie przechodzą przez linie (wyglądałoby to jak przejście na drugą stronę ulicy): są cięte wzdłuż każdej linii
  z odstępem, a skrawki (poniżej 1/5 największej części) znikają. Nazwy dzielnic omijają parki, podpisy parków omijają
  nazwy dzielnic.
- Na mapach bez przystanku „Piotrkowska Centrum” (nocne) ulica zaczyna się w miejscu tego przystanku przeniesionym
  przez odwzorowanie. Na autobusach i nocnych jej nie rysujemy (`PIOTRKOWSKA=0`, razem z pl. Wolności): na autobusach nie ma jak jej wpasować, a z nocnych
  usunięta 11.10.2026, bo deptak bez linii mylił. Ośmiokąt pl. Wolności zjeżdża wzdłuż ulicy (do 8 wysokości czcionki) z linii i przystanków; podpis
  szuka wolnego miejsca w pobliżu, a bez niego jest pomijany.
- Ramki `"shape":"keep"` (autobusy), które w całości leżą poza Łodzią, mają tło strefy 2 i kreskę granicy na pierwszym
  odcinku za każdym przystankiem cięcia.
- Geografia trafia na schemat przez odwzorowanie odcinkowo-afiniczne na trójkątach rozpiętych na przystankach; poza siecią
  działa jedno przekształcenie afiniczne dopasowane do wszystkich przystanków.
- Kolej: tory pasażerskie (relacje `route=train`) sklejone w jedną linię na korytarz, przecięte na stacjach i rozjazdach
  (węzły bliższe niż 350 m łączone), każdy odcinek narysowany jako skos + prosta (kąty 45/90°), do granicy miasta.
- Parki i granica: wielokąty uproszczone i dociągnięte do siatki, boki tylko co 45/90°; parki z zaokrąglonymi narożnikami.
- Kolory warstwy w wersji ciemnej: tabela `NEUT` w `pdf.py`. `build_page.py` robi z niej reguły CSS ciemnego motywu strony
  (kolory warstwy są atrybutami, więc reguły dopasowują je po wartości). Po kliknięciu linii tło nie przygasa.
- Ramka boczna przeniesiona do kolumny plakatu (autobusy: „do Andrespola”) zostawia w starym miejscu łatę, na której
  warstwa jest narysowana ponownie (`<use>` grupy `bgl`), żeby tło strefy 2 i parki się nie urywały.
