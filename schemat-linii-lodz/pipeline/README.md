# Schematy linii Łódź — potok
1. `filt.py <gtfs> <out> tram|bus|night` — dzień roboczy (8.10.2026), główne warianty tras (≥25% kursów w kierunku), linie z <6 kursami pominięte.
2. LOOM (github.com/ad-freiburg/loom): `gtfs2graph -m tram|bus` → `topo -d 150` → `loom` → `octi` (autobusy: `-g 60% --edge-order num-lines --loc-search-max-iters 20`) → `transitmap`.
3. `render.py` — własny renderer: paleta (linie biegnące razem dostają odległe kolory), przystanki, etykiety bez kolizji, krańcówki z rozkładu, numery linii przy wiązkach, legenda.
4. `pdf.py`, `build_page.py` — PDF i strona interaktywna.  `verify.py` — kontrola linii i krańcówek względem GTFS.
