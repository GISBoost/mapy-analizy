# schemat-linii-lodz

Schemat linii tramwajowych, autobusowych i nocnych Łodzi w dwóch stanach rozkładu — **od
5.10.2026** i **przed 5.10.2026** (przełącznik w nagłówku) — z listą zmian między nimi
(zakładka „Zmiany” w panelu bocznym; kliknięcie wyróżnia linię). Sześć statycznych schematów SVG
(każdy wczytywany dopiero po wybraniu zakładki), z zoomem, wyróżnianiem linii i motywem jasnym/ciemnym (przycisk
„Motyw"; ciemny motyw idzie przez ten sam atrybut `data-theme` co tokeny `gisboost-1.css`,
więc belka huba przełącza się razem ze schematem).

Strona: `https://gisboost.github.io/mapy-analizy/schemat-linii-lodz/`

## Zawartość

- `index.html`: gotowa strona, wynik `pipeline/build_page.py` (lista linii, różnice, skrypt) oraz `i18n.js` (PL/EN).
- `mapy/`: sześć schematów SVG strony (`<m>.svg`, `<m>_przed.svg`), też z `build_page.py`. Strona pobiera
  schemat przy pierwszym otwarciu zakładki, więc nie działa otwarta z dysku (`file://`), tylko z serwera.
  Przeciąganie i zoom zmieniają `viewBox` przy każdym ruchu (przesuwanie gotowego obrazu przez CSS `transform` było
  szybsze, ale rozmyte przy zoomie i szarpało po geście, więc z niego zrezygnowaliśmy). Legenda mapy: przycisk „Legenda”.
- `druk/`: PDF i SVG do druku: tramwaje (szerokość 594 mm), autobusy (1189 mm), nocne (841 mm);
  stan sprzed 5.10 z sufiksem `_przed`. Do szybkiego podglądu także JPG (2500 px po dłuższym boku).
- `pipeline/`: skrypty, którymi to powstało (opis niżej).
- `geo.js`, `mapy/tram_geo.json`: **widok geograficzny** (od 12.10.2026, na razie tylko tramwaje od 5.10). Te same linie,
  przystanki i krańcówki co schemat, położone na kaflach OpenStreetMap (Leaflet 1.9.4, ładowany przy pierwszym otwarciu
  widoku). Przełącznik „Schemat | Mapa” pojawia się obok przełącznika stanu tylko tam, gdzie jest mapa.
  Linie, węzły i przystanki rysuje `transitmap` z [LOOM](https://github.com/ad-freiburg/loom) jako kafle wektorowe dla
  z11–z17, tak jak na mapach twórców LOOM; kafle są scalone w jeden plik danych, a strona dokłada podpisy, krańcówki
  i wyróżnianie linii. Pomiary i kontrola w `NOTATKI.md`.

## Dane

- Od 5.10.2026: statyczny GTFS ZDiT Łódź z release'u `lodz-realized-2026-10-05-phone`
  repo [easy-GTFS-RT](https://github.com/GISBoost/easy-GTFS-RT), dzień roboczy **8.10.2026**.
- Przed 5.10.2026: release `lodz-realized-2026-10-02-phone` (`feed_start_date` 20261001),
  dzień roboczy **1.10.2026** (czwartek, jak 8.10).
- Tło orientacyjne (kolej, granica Łodzi, parki i lasy, szpitale, lotnisko): © autorzy OpenStreetMap,
  licencja [ODbL](https://www.openstreetmap.org/copyright); pobierane przez `pipeline/landmarks.py`.

## Metoda

1. `filt.py <gtfs> <out> tram|bus|night`: wybór linii danego trybu, kursy z wybranego dnia,
   główne warianty tras (każda sekwencja przystanków, która ma ≥25% kursów w danym kierunku;
   jeśli żadna, to najczęstsza), metadane linii (krańcówki, liczba kursów).
2. [LOOM](https://github.com/ad-freiburg/loom) (Uniwersytet we Fryburgu):
   `gtfs2graph` → `topo -d 150` → `loom` → `octi` → `transitmap`. Dla autobusów
   `octi -g 60% --edge-order num-lines --loc-search-max-iters 20`; `transitmap --line-width 30
   --line-spacing 7 --outline-width 0` (autobusy 24 i 5).
   Tramwaje od 5.10.2026 (opublikowane od 14.10.2026) układa własny solver `pipeline/octls.py` zamiast `octi`, z osiami
   wymuszonymi (Piotrkowska pionowo, Mickiewicza poziomo, Pabianicka pod 45°); opis w `pipeline/OCTLS.md`. Poprzedni układ
   (`octi`) jest w tagu gita `schemat-lodz-tram-octi-2026-10-12`. Stan „przed”, autobusy i nocne nadal idą przez `octi`.
3. `render.py`: własny renderer na geometrii z LOOM: paleta (linie biegnące razem dostają
   odległe kolory), przystanki, etykiety bez kolizji, krańcówki z rozkładu, numery linii przy
   wiązkach, legenda. Czcionka przystanków 9 (autobusy 7).
4. `diff.py`: lista zmian liczona z samego GTFS (nie z rysunku): linie dodane, usunięte, ze
   zmienioną trasą (inna sekwencja przystanków najczęstszego wariantu w którymś kierunku)
   i ze zmienioną liczbą kursów w dniu roboczym.
5. `pdf.py`, `build_page.py`: PDF do druku i strona interaktywna.
   `verify.py`: kontrola, czy każda linia z rozkładu jest narysowana i czy krańcówki na
   schemacie zgadzają się z rozkładem.

Kolory linii są wspólne dla obu stanów: stan „przed” dostaje przypisanie ze stanu „po”
(`pipeline/colors/*.json`), nowe kolory tylko linie, których po 5.10 nie ma (P2, Z2, Z11).
Układ oktylinearny jest liczony osobno dla każdego stanu, więc schematy różnią się także tam,
gdzie sieć się nie zmieniła. Uruchamianie krok po kroku: `pipeline/README.md`.

## Czego na schemacie nie ma

- **Wariantów rzadkich**: kursów zjazdowych, skróconych i innych wariantów poniżej 25% kursów
  w kierunku. Krańcówki takich wariantów nie są rysowane.
- **Linii z mniej niż 6 kursami** w wybranym dniu roboczym.
- **Linii `P…` i `oP…`** (wyrażenie `^o?P\d`) na schemacie autobusowym.
- **Kursów weekendowych i świątecznych**: schemat pokazuje dzień roboczy.
- **Geografii w skali**: układ oktylinearny (kąty co 45°), odległości są umowne. Schemat nie
  zastępuje mapy ani rozkładu.
- Legenda i nazwy przystanków wewnątrz SVG są tylko po polsku (przełącznik języka zmienia
  interfejs strony).

## Licencja

MIT (kod). Dane pochodne z GTFS ZDiT Łódź. Układ obliczony programem LOOM
(GPL-3.0; używany jako narzędzie, jego kod nie jest częścią tego repo).
