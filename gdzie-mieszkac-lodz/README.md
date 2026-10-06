# Gdzie mieszkać w Łodzi?

Interaktywna mapa heksagonów 250 m dla Łodzi: użytkownik ustawia wymagania (do 5 celów dojazdu, przystanki,
częstotliwość, zieleń, hałas), a mapa pokazuje tylko miejsca, które je spełniają, pokolorowane wynikiem 0–100.
Vanilla JS + [Leaflet](https://leafletjs.com/), zero build stepu — ten sam wzorzec co pozostałe analizy w
[mapy-analizy](../README.md). PL/EN, stan filtrów w adresie URL (`#s=…`).

Narzędzie pokazuje **model, nie wyrocznię**: nie jest poradą inwestycyjną ani wyceną nieruchomości.

Dane leżą w osobnym repo [gdzie-mieszkac-lodz-data](https://github.com/GISBoost/gdzie-mieszkac-lodz-data), pod tym
samym originem (`gisboost.github.io/gdzie-mieszkac-lodz-data/`), więc `app.js` czyta je ścieżką względną
`../../gdzie-mieszkac-lodz-data/`. Lokalnie serwuj **katalog nadrzędny obu repo** (fetch() nie działa z `file://`):

```
cd easy && py -m http.server 8000
```

potem `http://localhost:8000/mapy-analizy/gdzie-mieszkac-lodz/`. `py -m http.server` ignoruje `Range` (zwraca cały
plik, strona działa, tylko wolniej); GitHub Pages obsługuje `Range`.

## Pliki

| Plik | Co |
|---|---|
| `index.html`, `styles.css`, `i18n.js` | strona, style, PL/EN |
| `app.js` | mapa, panel, cele, karta „dlaczego ten wynik", stan w URL, odczyt macierzy |
| `score.js`, `score.test.js` | silnik punktacji (czyste funkcje); `node score.test.js` — test z ręcznie policzonymi wartościami |
| *(dane)* | w repo `gdzie-mieszkac-lodz-data`, **generowane** przez `easy-R5/tools/apartment_finder/scripts/export_web.py` |

## Dane (repo `gdzie-mieszkac-lodz-data`)

- `manifest.json` — wersja metody, okna czasowe, krzywe punktacji, parametry macierzy, lista scenariuszy.
- `hex.json` — środki i obrysy heksagonów (indeks = `hex_id`).
- `layers.json` — warstwy per heks: odległość pieszo do przystanku tramwajowego/autobusowego i do zieleni
  (rozdzielczość 20 m, brak wartości > 2 km), częstotliwość per pora dnia, udział powierzchni z hałasem ≥ N dB.
- `m/<scenariusz>.r.bin` (wiersz: z heksa) i `.c.bin` (kolumna: do heksa) — macierze czasów O–D. Jeden blok DEFLATE
  na wiersz/kolumnę za tablicą offsetów, więc przeglądarka pobiera jeden wiersz zapytaniem `Range`. Czasy obcięte do
  60 min, kwantyzacja 2 min. Scenariusze tranzytowe poza bazą okna zapisane jako różnica względem
  `<pora>_static_unlimited_nolka` (patrz `manifest.json` → `matrix.base`). Format: nagłówek w `export_web.py`.

- `services/index.json` i `services/<scenariusz>.json` — liczba miejsc z 4 metakategorii (edukacja, zdrowie, handel i usługi,
  kultura i rekreacja; 21 typów OSM, skład w `index.json` → `composition`) osiągalnych z środka heksa w ≤ Y min, osobno dla
  pieszo, roweru, auta (per pora) i transportu publicznego (pora × rozkład/P50/P85 × ŁKA, mediana z 5 dni, przesiadki bez
  limitu). Liczone dokładnie przez R5 do współrzędnych placówek (OSM, także do 1,2 km za granicą miasta). Kryterium: „co najmniej
  X w ≤ Y min”, jeden tryb na kryterium; parki nie są liczone (osobne kryterium zieleni).

Metoda, wersje i ograniczenia: [easy-R5/tools/apartment_finder](https://github.com/GISBoost/easy-R5/tree/main/tools/apartment_finder).

## Zastrzeżenia

- „Zmierzony" = rekonstrukcja GTFS-RT (P50/P85) z 5 dni roboczych (28.09–02.10.2026), nie prawda referencyjna.
- Auto = przybliżenie korków z prędkości autobusów, nie pomiar.
- Cena: brak danych w tej wersji (pusty slot).
- **Podkład OSM** ładowany wprost z `tile.openstreetmap.org`, jak na pozostałych stronach tego repo (decyzja
  autora). Polityka kafli OSM zabrania intensywnego użycia; przy większym ruchu zmienić dostawcę.
- **Dane hałasu** (mapa akustyczna Łodzi, UMŁ): informacja publiczna wg autora (2026-10-05).

## Licencja

MIT (kod). Dane pochodne: OpenStreetMap (ODbL), GTFS operatorów, mapa akustyczna Łodzi — patrz zastrzeżenia wyżej.
