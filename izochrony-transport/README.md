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
[`accessibility_cities`](https://github.com/GISBoost/easy-R5/tree/main/tools/accessibility_cities)
policzone i live** (Łódź, Warszawa, Kraków, Gdańsk, Poznań, Szczecin), patrz
`easy-R5/tools/isochrones_lodz/README.md`.

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
siatki heksagonalnej tego miasta. `data/<city>/{rt,static}/hours/<hour>.pbf` — jedna paczka na miasto, wariant
i godzinę (geobuf, 3 progi × wszystkie origins). Hover czyta paczkę z pamięci;
fetch jest przy starcie, zmianie godziny, wariantu albo miasta. Sąsiednie
godziny dogrzewane w tle. Mapa i granica rysują się od razu; izochrona
czeka na paczkę (status „Wczytuję zasięgi…”). Per-origin `.pbf` nie wchodzi
do repo. Paczki w pipeline easy-R5: `node geobuf_pack/pack_hours.js <city> <variant>`
po `convert.js`. Lokalnie z originów: `node izochrony-transport/build_hour_packs.mjs`.

Hover bierze ostatni punkt kursora raz na klatkę (`requestAnimationFrame`).
Zimny heks nie robi już round-tripu na origin. TTFB ~150 ms na GitHub Pages
dotyka zmiany godziny, nie przeciągania kursora.

Policzone przez [`easy-R5/tools/isochrones_lodz`](https://github.com/GISBoost/easy-R5/tree/main/tools/isochrones_lodz)
(`r5r::isochrone()`). Odświeżenie/dodanie miasta = ponowne uruchomienie
pipeline'u tam i re-eksport tutaj (ręczne, jak w pozostałych dwóch analizach) +
dopisanie wpisu do top-level `data/manifest.json`.

## Licencja

MIT (kod). Dane pochodne z OpenStreetMap (© OpenStreetMap contributors, ODbL) i
GTFS/GTFS-RT operatora transportu publicznego Łodzi.
