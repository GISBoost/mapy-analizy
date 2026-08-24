# Jak długo trzeba czekać na przystanku?

Interaktywna mapa mediany odstępu między kolejnymi przyjazdami dowolnej linii,
liczonej osobno dla każdego przystanku i uśrednionej do siatki heksagonalnej 500 m —
4 polskie miasta (Warszawa, Kraków, Łódź, Gdańsk), dane GTFS-RT. Okno czasowe (cały
dzień / 4 kubełki po 4h: 6-10, 10-14, 14-18, 18-22) przelicza medianę tylko z
obserwacji w danym przedziale.

Vanilla JS + [Leaflet](https://leafletjs.com/), zero build stepu. Jeden folder = jedna
analiza w [mapy-analizy](../README.md).

Otwórz z katalogu głównego repo (fetch() danych nie działa z `file://`):

```
py -m http.server 8000
```

potem `http://localhost:8000/odstepy-przystankow/`.

## Dane

`data/{city}_hex.geojson` (cały dzień) i `data/{city}_hex_h{od}_{do}.geojson`
(4 kubełki) — siatka 500 m, pola `mean_min` (mediana odstępu uśredniona po
przystankach w heksie w danym oknie) i `count` (liczba przystanków w heksie).
`data/{city}_boundary.geojson` — postrzępiony obrys miasta (dissolve pełnych
heksów dotykających granicy), wspólny dla wszystkich okien. `data/manifest.json` —
kolejność miast, etykiety okien, bounds, statystyki nagłówkowe per (miasto, okno).

Geometria wyeksportowana z [`easy-OTP/tools/transit_charts/four_cities_layers.gpkg`](https://github.com/GISBoost/easy-OTP/tree/main/tools/transit_charts)
(warstwy `{city}_result` / `_hex_dissolved` / `_hex500_clip`) przez QGIS MCP.
Kubełki czasowe: `tools/transit_charts/export_bucket_stop_headway.py` liczy
per-stop pooled headway (I37) osobno dla każdego 4h okna z już wyekstrahowanych
tabel tidy (`out/stop_headway/cities_2026-08-13/{city}_tidy_2026-08-13.csv.gz`,
`min_n=2`), wynik jest złączany do tej samej siatki `hex500_clip` przez
`native:joinbylocationsummary` (QGIS MCP) — grid się nie zmienia, zmienia się
tylko punktowa warstwa wejściowa. `export_odstepy_przystankow.py` docina pola
i liczy manifest dla wszystkich 5 okien naraz. Progi klasyfikacji i kolory
pochodzą z `tools/transit_charts/styles/stop_headway_hex.qml` (analiza I37).
Odświeżenie danych = ponowne uruchomienie obu skryptów.

**Statystyki nagłówkowe** (liczba przystanków, mediana ważona) są liczone wyłącznie
z siatki 500 m widocznej na mapie — to inna wielkość niż "mediana miejska" na
statycznym plakacie J39/I37, który zestawia tę mapę z osobnym wykresem pooled-crossing
(patrz link w panelu bocznym); zjawisko celowe, opisane w
`transit_charts/stop_headway.py`.

**Rzadkie okna:** przy 4h zamiast całego dnia część przystanków spada poniżej
progu `min_n` i znika z mapy — normalne, nie błąd. Kraków 6:00-10:00 jest
skrajnym przypadkiem (330 z ~1800+ przystanków w innych oknach) — to realna
cecha feedu GTFS-RT tego miasta (obserwacji jest tam ~3x mniej w tych
godzinach niż po południu), nie efekt progu `min_n`.

## Licencja

MIT (kod). Dane pochodne z OpenStreetMap (© OpenStreetMap contributors, ODbL) i
GTFS-RT operatorów transportu publicznego poszczególnych miast.
