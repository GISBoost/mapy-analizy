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
transportu publicznego w polskim mieście. **Wszystkie 6 miast z badania
[`accessibility_cities`](https://github.com/GISBoost/easy-OTP/tree/main/tools/accessibility_cities)
policzone i live** (Łódź, Warszawa, Kraków, Gdańsk, Poznań, Szczecin), patrz
`easy-OTP/tools/isochrones_lodz/README.md`.

**Hostowane w dwóch miejscach** (test A/B, 2026-08-27): główny link
[gisboost.github.io/mapy-analizy/izochrony-transport](https://gisboost.github.io/mapy-analizy/izochrony-transport/)
(GitHub Pages) i lustro [mapy-analizy.pages.dev/izochrony-transport](https://mapy-analizy.pages.dev/izochrony-transport/)
(Cloudflare Pages, ten sam branch `main`, auto-redeploy). Zmierzone bezpośrednio
(`performance.getEntriesByType('resource')` na żywej stronie, sweep myszką po
siatce origins w Łodzi): mediana TTFB pojedynczego `.pbf` spadła ze 143ms
(GitHub Pages) do 70ms (Cloudflare Pages) — Cloudflare zauważalnie płynniejszy
na hover, promowany jako preferowany link.

Otwórz z katalogu głównego repo (fetch() danych nie działa z `file://`):

```
py -m http.server 8000
```

potem `http://localhost:8000/izochrony-transport/`.

## Dane

`data/manifest.json` — top-level, zawsze ładowany: lista miast (`id`, `label`)
widocznych jako zakładki. `data/<city>/manifest.json` — per miasto, ładowany
dopiero po przełączeniu zakładki: origins (id/lon/lat, siatka 500 m, precyzja
obcięta do 6 miejsc po przecinku — ~10cm, więcej niż potrzeba przy siatce
500 m), godziny, progi cutoff, dostępne warianty (wszystkie 6 miast mają
`["rt","static"]`), bounds. `data/<city>/boundary.geojson` — dissolved outline
siatki heksagonalnej tego miasta. `data/<city>/{rt,static}/{origin_id}.pbf` —
jeden plik na punkt origin (format geobuf — binarny protobuf-encoding GeoJSON,
~1/5 rozmiaru surowego GeoJSON, dekodowany w przeglądarce przez `vendor/pbf.js`
+`vendor/geobuf.js`, self-hosted zamiast CDN — jeden origin mniej przed
pierwszym renderem), zawiera poligony izochron dla wszystkich godzin × 3
progów naraz (żeby hover/suwak nie robiły fetcha na każdą klatkę — jeden fetch
na najechany/przypięty punkt, potem wszystko lokalnie w przeglądarce). Łódź
(oba warianty): 124MB, zamiast 644MB jako zwykły GeoJSON. Wszystkie 6 miast
razem: ~669MB, 16 172 plików `.pbf`.

Hover jest throttlowany (50ms) i po ustaleniu się na jednym punkcie dogrzewa w
tle ~6 najbliższych sąsiadów — ale nawet z tym każdy niekeszowany heks to
pełny network round-trip, który na GitHub Pages odczuwalny był jako
spowolnienie ("muli") przy szybkim ruchu myszką, mimo że lokalnie
(`http.server`) niewidoczne — zmierzone bezpośrednio (TTFB ~150ms/request na
GitHub Pages), stąd Cloudflare Pages jako preferowany link (patrz wyżej).

Policzone przez [`easy-OTP/tools/isochrones_lodz`](https://github.com/GISBoost/easy-OTP/tree/main/tools/isochrones_lodz)
(`r5r::isochrone()`). Odświeżenie/dodanie miasta = ponowne uruchomienie
pipeline'u tam i re-eksport tutaj (ręczne, jak w pozostałych dwóch analizach) +
dopisanie wpisu do top-level `data/manifest.json`.

## Licencja

MIT (kod). Dane pochodne z OpenStreetMap (© OpenStreetMap contributors, ODbL) i
GTFS/GTFS-RT operatora transportu publicznego Łodzi.
