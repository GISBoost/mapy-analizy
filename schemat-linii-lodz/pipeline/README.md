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
4. `diff.py <gtfs_przed> <dzień> <gtfs_po> <dzień> <diff.json>` — różnice z samego GTFS:
   linie dodane, usunięte, ze zmienioną trasą (inna sekwencja nazw przystanków najczęstszego
   wariantu w którymś kierunku) i ze zmienioną liczbą kursów.
5. `build_page.py <WORK> page_tpl.html <diff.json> ../index.html` — strona z oboma stanami
   (czyta `$WORK/out<SUF>/<m>.svg` i `.lines.json`).
6. `pdf.py <WORK> <SUF> ../druk` — SVG i PDF do druku (headless Chrome, `CHROME=ścieżka`).
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
- LOOM w WSL (Ubuntu 24.04, cmake + g++); `src/topo/tests/ContractTest.cpp` skompilowany
  z `-O0` (`make tests/ContractTest.cpp.o CXX_FLAGS='-O0 -fopenmp -w'` w `build/src/topo`),
  bez libzip — GTFS podawany jako katalog. Python (pandas, shapely, PIL) na Windows z `-X utf8`.
