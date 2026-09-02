# Dojazd na uczelnię

Interaktywna mapa dostępności do uczelni w 6 polskich miastach (Gdańsk, Kraków, Łódź,
Poznań, Szczecin, Warszawa) — siatka heksagonalna 500 m, dostępność 30 min (spacer +
transit publiczny), dane [r5r](https://github.com/ipeaGIT/r5r) + OSM.

Vanilla JS + [Leaflet](https://leafletjs.com/), zero build stepu. Jeden folder = jedna
analiza w [mapy-analizy](../README.md).

Otwórz z katalogu głównego repo (fetch() danych nie działa z `file://`):

```
py -m http.server 8000
```

potem `http://localhost:8000/uczelnie-dostepnosc/`.

## Dane

`data/{city}_hex.geojson` — heksagony z polami `politechnika_30min` / `uniwersytet_30min`
/ `medyczny_30min` / `total_30min` / `dominant_role` / `dominant_label` / `pop_20_29`.
`data/{city}_buildings.geojson` — budynki uczelni (OSM), pole `role` do kolorowania.
`data/manifest.json` — lista miast, etykiety, nazwy uczelni per rola, bounding box.

Wygenerowane z [`easy-R5/tools/accessibility_cities`](https://github.com/GISBoost/easy-R5/tree/main/tools/accessibility_cities)
(r5r + OSM, patrz repo źródłowe po metodę). Odświeżenie danych = ponowne uruchomienie
pipeline'u tam i re-eksport do `data/` (na razie ręcznie).

## Trzy tryby widoku

- **Dominująca uczelnia** — która z 3 uczelni ma najwięcej budynków w zasięgu 30 min z
  danego heksagonu.
- **Liczba dostępnych** — ile z 3 uczelni da się w ogóle dojechać (sekwencyjna skala,
  odpowiada wprost na pytanie o nakładanie się stref).
- **Nakładanie (przełączalne)** — każda uczelnia jako osobna, wyłączalna warstwa;
  suwak przezroczystości po lewej reguluje jak mocno się mieszają.

## Licencja

MIT (kod). Dane pochodne z OpenStreetMap (© OpenStreetMap contributors, ODbL) i GTFS
operatorów transportu publicznego poszczególnych miast.
