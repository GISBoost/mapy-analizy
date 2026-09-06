# Ile kosztują opóźnienia?

Interaktywna mapa: gdzie w Łodzi realne opóźnienia transportu publicznego najbardziej
psują dostępność do szkół, aptek, uczelni i centrów handlowych — siatka heksagonalna
(250 m i 500 m), dostępność 30 min w oknie 7:00–9:00, porównanie rozkładu **statycznego**
GTFS vs **zrealizowanego P50** (median tego, co pojazdy faktycznie zrobiły), ten sam
dzień (2026-08-21).

Vanilla JS + [Leaflet](https://leafletjs.com/), zero build stepu. Jeden folder = jedna
analiza w [mapy-analizy](../README.md).

Otwórz z katalogu głównego repo (fetch() danych nie działa z `file://`):

```
py -m http.server 8000
```

potem `http://localhost:8000/opoznienia-dostepnosc/`.

## Dane

`data/hex_250.geojson` / `data/hex_500.geojson` — heksagony z polami `pop_total`,
`delta_<kategoria>` (zmiana liczby osiągalnych punktów, zrealizowany minus statyczny;
`null` gdy baza statyczna = 0 — patrz niżej), `base_<kategoria>` (baza statyczna),
`net_delta` / `net_delta_n` (suma zmian po porównywalnych kategoriach / ile z 4 weszło
do sumy). Kategorie: `school`, `pharmacy`, `university`, `mall`.
`data/manifest.json` — rozdzielczości, granice mapy, etykiety kategorii.
`data/boundary.geojson` (obwódka miasta, ta sama dla obu rozdzielczości) i
`data/siatka_250.geojson` / `siatka_500.geojson` (sama siatka heksagonalna, bez atrybutów) —
dwie warstwy referencyjne rysowane zawsze na wierzchu (bez wypełnienia, więc nie zasłaniają
kolorów) — `siatka` pokazuje pełny zasięg heksagonów, także te bez danych (odfiltrowane z
warstwy właściwej jako `null`).

Wygenerowane z [`easy-R5/tools/realtime_delay_lodz`](https://github.com/GISBoost/easy-R5/tree/main/tools/realtime_delay_lodz)
(`export_geojson.py`) — tam jest pełna metoda, w tym dlaczego `base_<kategoria> = 0`
oznacza "nie ma czego tracić ani zyskiwać", a nie "bez zmian". Odświeżenie danych =
ponowne uruchomienie pipeline'u tam i re-eksport do `data/` (na razie ręcznie).

## Dwie osie przełączania

- **Zakładki u góry = rozdzielczość siatki** (250 m / 500 m) — przeładowuje dane.
  **Uwaga:** dla szkół i aptek wynik miejski **zmienia znak** między rozdzielczościami
  (efekt MAUP, opisany w źródłowym README) — nie traktuj jednej rozdzielczości jako
  "tego jedynego słusznego" wyniku.
- **Panel z lewej = kategoria** (szkoły / apteki / uczelnie / centra handlowe /
  zbiorczo) — tylko przestylowuje już wczytane dane, bez sieci. "Zbiorczo" to suma
  zmian po kategoriach, które akurat miały bazę w danym heksagonie — tooltip pokazuje
  rozbicie, żeby było widać z czego się składa skrajna wartość.

## Legenda

Ręczna klasyfikacja wyśrodkowana na zerze (nie automatyczna equal-interval/quantile) —
0 ma osobną, widoczną klasę (blady szary), a heksagony bez bazy w rozkładzie statycznym
są całkowicie puste (bez wypełnienia), nie pomalowane jako "bez zmian". Dokładnie te
same progi i kolory (ColorBrewer RdBu-7) co w projekcie QGIS źródłowym
(`tools/realtime_delay_lodz/style_delay_layers.py`).

## Licencja

MIT (kod). Dane pochodne z OpenStreetMap (© OpenStreetMap contributors, ODbL) i GTFS
operatora transportu publicznego Łodzi (statyczny + zrealizowany P50, GISBoost
`easy-GTFS-RT`).
