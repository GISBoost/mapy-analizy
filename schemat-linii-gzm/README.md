# Schemat linii tramwajowych GZM

Schemat oktylinearny (0/45/90°) wszystkich linii tramwajowych Górnośląsko-Zagłębiowskiej Metropolii, policzony z rozkładu GTFS
programem [LOOM](https://github.com/ad-freiburg/loom). Strona: `index.html` (podświetlanie linii, przesuwanie i zoom przez `viewBox`),
do druku: `druk/gzm_tramwaje.{pdf,svg,jpg}` (arkusz poziomy 1189 × 618 mm) i wersje `_ciemny`.

## Dane i decyzje

| Co | Wybór | Dlaczego |
|---|---|---|
| Rozkład | `gzm_static_gtfs_2026-09-16.zip` z release `gzm-realized-2026-09-16-phone` (`GISBoost/easy-GTFS-RT`) | środa 16.09.2026; feed ważny 16–18.09, linie na `calendar.txt` (środa–piątek) |
| Dzień | roboczy, 20260916 | wszystkie 26 linii kursuje tego dnia |
| Warianty | ≥25% kursów w kierunku, linie ≥6 kursów | domyślne progi; pominięto 46 mniejszych wariantów (lista w raporcie filtra) |
| Przystanki techniczne | `\[tech\]` i `^granica ` usunięte z kursów | to punkty dyspozytorskie i granice gmin, nie przystanki dla pasażerów |
| „Zajezdnia” | zostaje | Gliwice, Zawodzie, Stroszek, Os. Zamkowe, Chorzów Batory to publiczne pętle (nazwy tras T1, T11, T13 …) |
| `topo -d` | 75 m | 90% par kierunków jest bliżej niż 66 m; 50 m daje pętle T16/T46/T36/T41/T6, 100 m objazd T38 |
| Soczewka | `1.5 1700 19.0200 50.2560` (Katowice) | najgęstszy obszar przystanków |
| `octi` | domyślne | kontrola: 26/26 linii, 0 objazdów, 0 pętli |
| Kolory | paleta rendera (linie biegnące razem dostają odległe kolory), `pipeline/colors/tram.json` | GTFS ma 24 × czarny |
| Arkusz | poziomy 1189 × 618 mm (szerokość A0), lupa ×3 na centrum Katowic | rysunek ma proporcje 2:1; A1 poziomo zostawiał ~40% pustego arkusza |
| Warstwa orientacyjna | kolej pasażerska i stacje (podwójna linia), parki i lasy ≥120 ha, nazwy 13 miast, piktogramy: stacja kolejowa przy przystanku, szpital z SOR, Silesia City Center i Galeria Katowicka | OpenStreetMap (Overpass, `pipeline/landmarks.py`, odpowiedź w cache poza repo); bez granic miast, bo GZM nie ma jednej granicy strefy |
| Wariant geograficzny | przełącznik „Schemat / Mapa geograficzna” na stronie: Leaflet 1.9.4 + kafle OSM, trasy z kształtów GTFS wygładzone (Douglas-Peucker + filtr Gaussa w pikselach), wiązki równoległe jak w kaflach LOOM: każda linia z ciemną obwódką 1 px, obwódki sąsiadów stykają się (kolejność z LOOM; linie na krawędzi od lewej względem jej kierunku; grubość ok. 75% dawnej, z16 = 6 px), wiązki ucięte przed węzłem i połączone łukami Béziera jak w LOOM (najpierw wszystkie obwódki, potem linie), „oczka” (oba kierunki tych samych linii na osobnych torach między dwoma węzłami, 7 miejsc, np. Plac Wolności) zwinięte do krótszej ścieżki, etykiety z wykrywaniem kolizji (krańcówki, potem przesiadki; 4 pozycje; reszta po najechaniu), ciemny motyw z paletą legendy, przy wyróżnieniu pastylki obejmują tylko wybrane linie; klik w linię ją wyróżnia, kafle wyszarzone | `pipeline/geo_export.py` → `mapy/tram_geo.json`, kod `geo.js`; ciemny motyw odwraca kafle |

Znane: na `T15` węzeł „Piłsudskiego-Sosnowiec / Sobieskiego” to sklejenie `topo` (przystanki bliżej niż 75 m są jednym punktem).
Układu `octi` nie da się odtworzyć na innej maszynie — zachowano `4_octi.json` i `3_loom.json` w katalogu roboczym.

## Odtworzenie (katalog roboczy poza gitem: `..\..\schemat-gzm-dane`)

1. `gh release download gzm-realized-2026-09-16-phone --repo GISBoost/easy-GTFS-RT --pattern gzm_static_gtfs_2026-09-16.zip`, rozpakować do `gtfs_static/`.
2. WSL: `pipeline/build.sh` (filtr → `prep.py` → łańcuch LOOM ze skilla `schemat-linii-loom`; `OUT=tram_b`).
3. Windows (`py -3`, shapely, numpy, Pillow, pandas): `pipeline/render.ps1` → `out/tram.svg`, `tram.poster.svg`, `tram.lines.json` (skopiować z `out/tram_b/` do `out/`).
4. `verify.py` (zgodność podpisów z rozkładem), `build_page.py ..\..\schemat-gzm-dane pipeline\page_tpl.html index.html`,
   `pdf.py` (env `CHROME`; sufiks pusty to `-`), `jpg.py druk`.
Dodatkowo: `landmarks.py <WORK>\landmarks.json` (Overpass, wymaga sieci), `geo_export.py out	ram_b_geo.json data	ram\lines.json out	ram.lines.json geo.json`; `render.ps1` ustawia `LANDMARKS`.
Znane: lasy poza siecią pokazują się jako jasnozielone plamy (tło jest przycięte do 1,5 km od przystanków); lupa przycina napis miasta na brzegu.
Źródło danych: ZTM GZM; tło: © autorzy OpenStreetMap (ODbL) (otwartedane.metropoliagzm.pl); układ: LOOM (Uniwersytet we Fryburgu, GPL-3.0).
