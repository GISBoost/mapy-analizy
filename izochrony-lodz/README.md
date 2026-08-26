# Dokąd dojadę transportem publicznym?

Interaktywna izochrona dojazdu — najedź kursorem na dowolne miejsce w Łodzi, mapa
pokazuje zasięg dojazdu transportem publicznym z tego punktu (spacer + transit).
Kliknij, żeby przypiąć pinezkę, i przesuwaj suwak pory dnia (06:00–22:00, co
godzinę) — kształt zasięgu zmienia się razem z częstotliwością kursowania.
Trzy przełączalne progi czasu dojazdu (15/30/45 min) i przełącznik rozkład
jazdy / zrealizowany przejazd (GTFS-RT, mediana obserwacji).

Vanilla JS + [Leaflet](https://leafletjs.com/), zero build stepu. Jeden folder =
jedna analiza w [mapy-analizy](../README.md). Zaczęte jako pilot na Łódź — inspiracja:
[chronotrains.com](https://www.chronotrains.com/pl/about), metoda dostosowana do
transportu publicznego w polskim mieście. Docelowo 6 miast z badania
[`accessibility_cities`](https://github.com/GISBoost/easy-OTP/tree/main/tools/accessibility_cities)
(Warszawa, Kraków, Gdańsk, Poznań, Szczecin) — na razie tylko **Łódź ma policzone
dane**, reszta czeka na uruchomienie pipeline'u (kod gotowy, patrz
`easy-OTP/tools/isochrones_lodz/README.md`).

Otwórz z katalogu głównego repo (fetch() danych nie działa z `file://`):

```
py -m http.server 8000
```

potem `http://localhost:8000/izochrony-lodz/`.

## Dane

`data/manifest.json` — top-level, zawsze ładowany: lista miast (`id`, `label`)
widocznych jako zakładki. `data/<city>/manifest.json` — per miasto, ładowany
dopiero po przełączeniu zakładki: origins (id/lon/lat, siatka 500 m), godziny,
progi cutoff, dostępne warianty (`["rt"]` albo `["rt","static"]` — tylko Łódź
ma oba, reszta miast miała policzony wyłącznie zrealizowany przejazd, patrz
pipeline README), bounds. `data/<city>/boundary.geojson` — dissolved outline
siatki heksagonalnej tego miasta. `data/<city>/{rt,static}/{origin_id}.pbf` —
jeden plik na punkt origin (format geobuf — binarny protobuf-encoding GeoJSON,
~1/5 rozmiaru surowego GeoJSON, dekodowany w przeglądarce przez
`pbf.js`+`geobuf.js` z CDN), zawiera poligony izochron dla wszystkich godzin ×
3 progów naraz (żeby hover/suwak nie robiły fetcha na każdą klatkę — jeden
fetch na najechany/przypięty punkt, potem wszystko lokalnie w przeglądarce).
Łódź (oba warianty): 124MB, zamiast 644MB jako zwykły GeoJSON.

Hover jest throttlowany (50ms) i po ustaleniu się na jednym punkcie dogrzewa w
tle ~6 najbliższych sąsiadów — bez tego każdy nowy heks w realnym ruchu myszką
na GitHub Pages to pełny network round-trip, co odczuwalne było jako
spowolnienie ("muli") mimo że lokalnie (`http.server`) niewidoczne.

Policzone przez [`easy-OTP/tools/isochrones_lodz`](https://github.com/GISBoost/easy-OTP/tree/main/tools/isochrones_lodz)
(`r5r::isochrone()`). Odświeżenie/dodanie miasta = ponowne uruchomienie
pipeline'u tam i re-eksport tutaj (ręczne, jak w pozostałych dwóch analizach) +
dopisanie wpisu do top-level `data/manifest.json`.

## Licencja

MIT (kod). Dane pochodne z OpenStreetMap (© OpenStreetMap contributors, ODbL) i
GTFS/GTFS-RT operatora transportu publicznego Łodzi.
