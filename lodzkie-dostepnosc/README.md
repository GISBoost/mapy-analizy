# Dostępność w Łódzkiem

Interaktywna mapa dostępności transportowej dla całego województwa łódzkiego (statyczny
GTFS, 8 feedów, siatka 1000 m) oraz — tylko dla Łodzi, jedynego miasta z nagrywanym
GTFS-RT w regionie — zmiany dostępności między rozkładem a rozkładem zrealizowanym (P50,
siatka 250 m), w trzech wariantach (dzień referencyjny 2026-09-10, średnia 3-dniowa,
średnia z 4 dni wakacyjnych sierpnia).

Vanilla JS + [Leaflet](https://leafletjs.com/), zero build stepu. Jeden folder = jedna
analiza w [mapy-analizy](../README.md).

Otwórz z katalogu głównego repo (fetch() danych nie działa z `file://`):

```
py -m http.server 8000
```

potem `http://localhost:8000/lodzkie-dostepnosc/`.

## Dane

- `data/level_woj.geojson` — poziom dostępności wojewódzki: `level_total_c30` (suma
  10 kategorii POI osiągalnych ≤ 30 min), `pop_total`. Zero jest wynikiem, nie brakiem
  danych — mapa go celowo nie koloruje (patrz Legenda).
- `data/growth_woj.geojson` — "delta" wojewódzka zdefiniowana jako wzrost dostępności
  przy podwojeniu progu czasu: `level_total_c30`, `level_total_c60`, `growth_total`
  (c60−c30), `ratio_total` (c60/c30, `null` gdy `level_total_c30 = 0` — nie da się
  policzyć krotności z zera). Tylko pola `_total` — szczegół per kategoria (10×4 pola)
  został przycięty z eksportu (23,6 MB → 6,7 MB), bo żadna warstwa mapy go dziś nie
  używa; pełny szczegół per kategoria wciąż jest w `lodzkie_base.gpkg`
  (`hex_woj_thresholds`).
- `data/delta_lodz_wrzesien.geojson`, `delta_lodz_3dni.geojson`, `delta_lodz_wakacje.geojson`
  — delta Łodzi (zrealizowany P50 minus statyczny), 21 kategorii + `_total`, `null` gdy
  baza statyczna = 0 (nie ma czego tracić ani zyskiwać). Trzy niezależne przebiegi:
  jeden dzień, średnia 3 dni września (robustness), średnia 4 dni sierpnia (wakacje —
  test, czy jednorodna ujemna delta to efekt powrotu do szkoły).
- `data/siatka_{woj,lodz}.geojson`, `boundary_{woj,lodz}.geojson` — warstwy referencyjne
  (pełna siatka bez atrybutów, granica), zawsze rysowane na wierzchu bez wypełnienia.
- `data/manifest.json` — zasięgi, daty, listy kategorii per zakres, lista plików z
  liczbą obiektów i rozmiarem (informacyjnie).

Wygenerowane z [`easy-R5/tools/lodzkie_na_mapach_2026`](https://github.com/GISBoost/easy-R5/tree/main/tools/lodzkie_na_mapach_2026)
(`export_geojson.py`) — tam jest pełna metoda. Eksport pisze najpierw do lokalnego
stagingu w `easy-R5` (pomiar rozmiarów), potem, po potwierdzeniu, tu — dwuetapowo, żeby
żadna zmiana rozmiaru plików nie trafiała do tego repo bez sprawdzenia. Odświeżenie
danych = ponowne uruchomienie pipeline'u tam i re-eksport do `data/` (na razie ręcznie).

## Dwie osie przełączania

- **Wybór zakresu u góry** — Województwo (statyczny GTFS) / Łódź (rozkład vs
  realizacja) — przeładowuje granice i dopasowuje widok mapy; obie strony mają inny
  zestaw dostępnych warstw poniżej.
- **Panel z lewej = warstwa** — dla województwa: poziom / wzrost 30→60 min; dla Łodzi:
  trzy warianty delty. Tylko przestylowuje/przeładowuje jeden plik danych, nie całą
  mapę. Maska wiarygodności RT (`hex_{woj,lodz}_rt_mask` w `lodzkie_base.gpkg`) nie
  jest tu pokazana — na siatce 1000 m/250 m nie czyta się sensownie jako warstwa mapy
  webowej; obowiązuje na wydrukach/w projekcie QGIS, gdzie ma sens zagregowana do
  gminy/powiatu.

## Legenda

Ręczna klasyfikacja (nie automatyczna equal-interval/quantile), zgodna z progami użytymi
w projekcie QGIS źródłowym (`tools/lodzkie_na_mapach_2026/style_layers.py`):
- **Poziom** — sekwencyjna rampa, progi 5/15/30/60/120, zero heksagonów bez wypełnienia
  (nie ta sama barwa co "1 POI").
- **Wzrost 30→60 min** — sekwencyjna pomarańczowo-brązowa rampa, zawsze ≥ 0.
- **Delta Łodzi** — ColorBrewer RdBu-7 z izolowanym zerem (własna, widoczna klasa),
  `null` = brak wypełnienia (brak bazy, nie "bez zmian").

## Licencja

MIT (kod). Dane pochodne z OpenStreetMap (© OpenStreetMap contributors, ODbL), GUS
(NSP 2021, ludność) i GTFS operatorów transportu publicznego województwa łódzkiego
(statyczny + zrealizowany P50 dla Łodzi, GISBoost `easy-GTFS-RT`).
