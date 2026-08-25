# Dokąd dojadę transportem publicznym?

Interaktywna izochrona dojazdu — najedź kursorem na dowolne miejsce w Łodzi, mapa
pokazuje zasięg dojazdu transportem publicznym z tego punktu (spacer + transit).
Kliknij, żeby przypiąć pinezkę, i przesuwaj suwak pory dnia (06:00–22:00, co
godzinę) — kształt zasięgu zmienia się razem z częstotliwością kursowania.
Trzy przełączalne progi czasu dojazdu (15/30/45 min) i przełącznik rozkład
jazdy / zrealizowany przejazd (GTFS-RT, mediana obserwacji).

Vanilla JS + [Leaflet](https://leafletjs.com/), zero build stepu. Jeden folder =
jedna analiza w [mapy-analizy](../README.md). Pilot na jedno miasto — inspiracja:
[chronotrains.com](https://www.chronotrains.com/pl/about), metoda dostosowana do
transportu publicznego w polskim mieście.

Otwórz z katalogu głównego repo (fetch() danych nie działa z `file://`):

```
py -m http.server 8000
```

potem `http://localhost:8000/izochrony-lodz/`.

## Dane

`data/manifest.json` — lista origins (id/lon/lat, siatka 500 m), godziny, progi
cutoff, dostępne warianty, bounds. `data/{static,rt}/{origin_id}.pbf` — jeden
plik na punkt origin (format geobuf — binarny protobuf-encoding GeoJSON, ~1/5
rozmiaru surowego GeoJSON, dekodowany w przeglądarce przez `pbf.js`+`geobuf.js`
z CDN), zawiera poligony izochron dla wszystkich 17 godzin × 3 progów naraz
(żeby hover/suwak nie robiły fetcha na każdą klatkę — jeden fetch na
najechany/przypięty punkt, potem wszystko lokalnie w przeglądarce). Całość
danych: 124MB (oba warianty), zamiast 644MB jako zwykły GeoJSON.

Policzone przez [`easy-OTP/tools/isochrones_lodz`](https://github.com/GISBoost/easy-OTP/tree/main/tools/isochrones_lodz)
(`r5r::isochrone()`, GTFS z 21.08.2026). Odświeżenie danych = ponowne uruchomienie
pipeline'u tam i re-eksport tutaj (ręczne, jak w pozostałych dwóch analizach).

## Licencja

MIT (kod). Dane pochodne z OpenStreetMap (© OpenStreetMap contributors, ODbL) i
GTFS/GTFS-RT operatora transportu publicznego Łodzi.
