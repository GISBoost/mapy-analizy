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

`mk.sh`/`fin.sh` łączą kroki 2–3 i robią podgląd PNG (`shot.py`, Playwright) — env:
`PY`, `SUB` i (tylko `fin.sh`) `COLORS`.

## Jak powstał stan „przed” (8.10.2026)

- GTFS: release `lodz-realized-2026-10-02-phone` repo `GISBoost/easy-GTFS-RT`,
  `lodz_static_gtfs_2026-10-02.zip`, `feed_start_date` 20261001. Dzień: czwartek **1.10.2026**.
- Stan „po” to dotychczasowe SVG z `../druk/` (release `lodz-realized-2026-10-05-phone`,
  dzień 8.10.2026), nieprzeliczane; ich `lines.json` odtworzono z metadanych strony.
- LOOM w WSL (Ubuntu 24.04, cmake + g++); `src/topo/tests/ContractTest.cpp` skompilowany
  z `-O0` (`make tests/ContractTest.cpp.o CXX_FLAGS='-O0 -fopenmp -w'` w `build/src/topo`),
  bez libzip — GTFS podawany jako katalog. Python (pandas, shapely, PIL) na Windows z `-X utf8`.
