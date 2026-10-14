# Schematy linii Łódź — potok

Skrypty, którymi powstają schematy linii (strona, SVG, PDF i JPG do druku). Dwa stany rozkładu:

| Stan | Sufiks `SUF` | GTFS | Dzień roboczy |
|---|---|---|---|
| od 5.10.2026 („po”) | pusty | release `lodz-realized-2026-10-05-phone` | 8.10.2026 |
| przed 5.10.2026 („przed”) | `_przed` | release `lodz-realized-2026-10-02-phone` (`feed_start_date` 20261001) | 1.10.2026 (czwartek, jak 8.10) |

Katalog roboczy `$WORK` (dane, wyniki pośrednie) trzymaj poza repo. Do repo trafiają tylko `../index.html`, `../mapy/` i `../druk/`.

## Spis treści

- [Przegląd kroków](#przegląd-kroków)
- [1. Dane: `filt.py`](#1-dane-filtpy)
- [2. Układ: LOOM i `octls`](#2-układ-loom-i-octls)
- [3. Rendering: `render.py`](#3-rendering-renderpy)
- [4. Lista zmian: `diff.py`](#4-lista-zmian-diffpy)
- [5. Strona: `build_page.py` i widok geograficzny](#5-strona-build_pagepy-i-widok-geograficzny)
- [6. Druk: `pdf.py`, `jpg.py`](#6-druk-pdfpy-jpgpy)
- [7. Kontrola: `verify.py`, `gate.py`](#7-kontrola-verifypy-gatepy)
- [Tematy szczegółowe](#tematy-szczegółowe)
- [Narzędzia pomocnicze](#narzędzia-pomocnicze)
- [Historia](#historia)

## Przegląd kroków

| # | Skrypt | Co robi | Wynik |
|---|---|---|---|
| 1 | `filt.py` | wybiera linie, dzień i główne warianty tras z GTFS | `$WORK/data$SUF/<m>/`, `lines.json` |
| 2 | `run.sh` (LOOM albo `octls`) | graf linii i układ oktylinearny | `out$SUF/<m>.octi.json`, `.tm.svg`, `.tl.svg` |
| 3 | `render.py` | własny renderer: etykiety, kolory, ramki, plakat | `<m>.svg`, `<m>.poster.svg`, `<m>.lines.json` |
| 4 | `diff.py` | różnice rozkładu przed/po | `diff.json` |
| 5 | `build_page.py` | strona z oboma stanami | `../index.html`, `../mapy/<m><SUF>.svg` |
| 6 | `pdf.py`, `jpg.py` | pliki do druku | `../druk/lodz_*.{svg,pdf,jpg}` |
| 7 | `verify.py`, `gate.py` | kontrola linii, krańcówek i objazdów | raport |

`<m>` to `tram`, `bus` albo `night`.

---

## 1. Dane: `filt.py`

```
filt.py <gtfs> <out> tram|bus|night [YYYYMMDD]
```

- Dzień roboczy (domyślnie 20261008). Kalendarz jest czytany z `calendar_dates.txt`, bo w feedach ZDiT `calendar.txt` ma same zera.
- Główne warianty tras: każda sekwencja przystanków obsługiwana przez ≥25% kursów w danym kierunku.
- Linie z mniej niż 6 kursami są pominięte. Autobusy bez `^o?P\d`.
- Pominięte są też przystanek „przejazd techniczny” (87A/87B, to nie przystanek dla pasażerów) oraz zjazdy i wyjazdy z zajezdni
  (kurs zaczyna się lub kończy na „…-zajezdnia NOWE SADY/LIMANOWSKIEGO”). F1, 72B, 91C, 60C, 85A i nocne N1B/N3B/N5B miały ich 20–40%,
  więc reguła 25% rysowała zajezdnię jako krańcówkę. Zostają tylko wtedy, gdy kierunek nie ma innych kursów (97A/97B).
  Liczba kursów w `lines.json` nadal je obejmuje.
- Wynik trafia do `$WORK/data$SUF/<m>/`, a `lines.json` skopiuj do `$WORK/data$SUF/meta/<m>.json`.
- `filt.py` skleja też dworce w huby, patrz [Dworce i centrum](#dworce-i-centrum-fabryczna).

## 2. Układ: LOOM i `octls`

```
run.sh <m> tram|bus [octi args]
```

Łańcuch: `gtfs2graph -m tram|bus` → `topo -d $TOPO_D` → `fixends.py` → `hubsnap.py` → `loom` → (`fisheye.py` →) `octi` → `serving.py` → `transitmap`.
LOOM: [github.com/ad-freiburg/loom](https://github.com/ad-freiburg/loom), GPL-3.0.

**Parametry per mapa**

| Mapa | `TOPO_D` | Układ | `transitmap` (`LWID` / `LSP`) |
|---|---|---|---|
| tramwaje, nocne | 150 | `octi` z domyślnymi opcjami | 30 / 7 |
| autobusy | 150 | `octi -g 60% --edge-order num-lines --loc-search-max-iters 20` | 24 / 5 |

**Zmienne:** `LOOM_BUILD` (katalog `build` z LOOM), `WORK`, `SUF`, `TOPO_D`, `HUB_R`, `FISHEYE`, `LWID`, `LSP`.

**Kroki pomocnicze w `run.sh`**
- `fixends.py` (między `topo` a `loom`): `topo` potrafi zgubić linię z ostatnich krawędzi przed krańcówką (59/86 kończyły się 1 km przed
  Pomorską-Edwarda). Skrypt dokleja ją po najkrótszej ścieżce do przystanku najbliższego krańcówce z rozkładu. Log w `out$SUF/<m>.logfix`.
- `serving.py` (po układzie): ustala, które linie stają na którym węźle, patrz [Kto gdzie staje](#kto-gdzie-staje-servingpy).
- `mk.sh` i `fin.sh` łączą kroki 2–3 i robią podgląd PNG, patrz [Narzędzia pomocnicze](#narzędzia-pomocnicze).

### Własny solver `octls` (`OCTI=ls`, tylko tramwaje, opcjonalnie)

Zamiast `fisheye.py` i `octi` układ liczy własny solver `octls.py`: etykiety kierunków i najmniejsze kwadraty, z osiami wymuszonymi
z `goals/tram.json`. Przed nim `merge_nodes.py` skleja węzły Ronda Lotników Lwowskich. Wynik ma format `octi.json`, więc dalsze kroki
są bez zmian. Zależność: numpy. Opis modelu, opcji i ograniczeń: [`OCTLS.md`](OCTLS.md).

```
OCTI=ls PY_LS=<python z numpy> TOPO_D=150 LOOM_BUILD=... WORK=... SUF=_TF150 bash run.sh tram tram
py -X utf8 test_octls.py        # test solvera na małym grafie
```

Zmienne trybu: `PY_LS` (domyślnie `python3`), `GOALS`, `HUB_MERGE`, `OCTLS_ARGS` (domyślnie preset z wariantu `lv048`).
Opublikowany jest nim stan „po” tramwajów, patrz [Tramwaje „po”: układ z `octls`](#tramwaje-po-układ-z-octls-14102026).

## 3. Rendering: `render.py`

Własny renderer: paleta (linie biegnące razem dostają odległe kolory), przystanki, etykiety bez kolizji, krańcówki z rozkładu,
numery linii przy wiązkach, legenda.

```
render.py tm.svg octi.json meta.json out.svg tytuł podtytuł czcionka(9, autobusy 7) all tl.svg prefiks loom.json [kolory.json]
```

- **Prefiks id** musi być różny dla obu stanów (`tram`/`tramp` itd.), bo oba SVG są w jednym dokumencie.
- **`kolory.json`** przypina kolory. Stan „przed” dostaje kolory stanu „po” z `colors/<m>.json`, nowe tylko dla linii, których „po” nie ma.
- **Czcionka:** Inter z `$FONT_DIR` (domyślnie `/usr/share/fonts/opentype/inter`, pakiet `fonts-inter`).
- **Wynik:** obok `<out>.svg` (strona) powstaje `<out>.poster.svg` (druk) i `<out>.lines.json`.

### Zmienne środowiskowe

| Zmienna | Znaczenie |
|---|---|
| `CUTS` | wycinki ogonów do ramek (JSON), patrz niżej |
| `CUT_GAP` | odstęp ramka–mapa w wysokościach czcionki (domyślnie 5) |
| `ZOOM` | lupa na plakacie (JSON), patrz niżej |
| `ZOOM_H` | maks. wysokość lupy jako ułamek szerokości na arkuszu poziomym (domyślnie 1, kwadrat) |
| `POSTER_RATIO` | proporcja arkusza plakatu (domyślnie A1 pionowo, 841/594) |
| `LEGEND_AT`, `KEY_AT` | rogi mapy dla listy linii i objaśnień (domyślnie `tr` i `tl`); `LEGEND_AT=band` wymusza pas/kolumnę |
| `BAND_COLS` | liczba kolumn listy linii w pasie (domyślnie 2) |
| `LANDMARKS` | plik warstwy orientacyjnej z `landmarks.py`, patrz [Warstwa orientacyjna](#warstwa-orientacyjna) |
| `RAIL_STYLE` | `grey` (domyślnie), `double`, `ladder`, `dash`, `none` |
| `PIOTRKOWSKA` | `0` wyłącza ul. Piotrkowską i pl. Wolności |
| `LABELS` | JSON `{nazwa: podpis}`, ręczne poprawki sklejeń, których nie da się nazwać z danych (tramwaje: `{"Północna":"Północna / Nowomiejska"}`) |
| `OCTLS` | `1` zmienia napis o autorstwie układu (LOOM + `octls`) na planszy i w stopce plakatu |
| `FONT_DIR` | katalog z czcionką Inter |

### Wycinki ogonów (`CUTS`)

„Ogon” za przystankiem `cut`, obsługiwany dokładnie przez linie `lines`, idzie do ramki w rogu `at` jako prosta wiązka z etykietami pod 45°.
Przy `cut` zostaje kropkowany odcinek. Kolejność na liście decyduje, kto pierwszy dostaje róg.

| Pole | Znaczenie |
|---|---|
| `lines`, `cut`, `title` | linie, przystanek cięcia, tytuł ramki |
| `at` | róg mapy: `bl`, `tl`, `br`, `tr`; `below` = pod mapą; `side` = na prawo od mapy (plakat poziomy przenosi ramkę na dół bocznej kolumny) |
| `box: false` | ogon zostaje na miejscu, ściśnięty `k` razy w stronę `cut` |
| `k` | współczynnik ściśnięcia |
| `shape: keep` + `to: […]` | ogon może mieć pętle i rozgałęzienia: do ramki idą wszystkie fragmenty za przystankami `cut` (też lista kilku miejsc wyjazdu z miasta), jeżdżone tylko przez `lines`, które dochodzą do przystanku z nazwą zawierającą coś z `to`. Rysunek `octi` zostaje, osie są ściśnięte `k` razy, wiązki i znaczki w pełnym rozmiarze |

### Plakat i lupa

Plakat (`<out>.poster.svg`, `pdf.py` bierze go, jeśli jest): arkusz o proporcji `POSTER_RATIO`, pasek tytułu, lista linii i objaśnienia
w pustych rogach mapy. Wysokość, której mapa nie wypełnia, idzie na pas z lupą pod mapą. Gdy lista linii nie mieści się w rogach mapy,
idzie z objaśnieniami do pasa. Na arkuszu poziomym (`POSTER_RATIO` < 1) pas jest kolumną z prawej, a lupa ma wysokość najwyżej
`ZOOM_H` × szerokość.

Lupa (`ZOOM`): `{"stations":[…],"k":2.2,"title":"Centrum"}` to wycinek wokół podanych przystanków (`<use>` głównego rysunku)
na całą szerokość pasa, zaznaczony na mapie czerwoną przerywaną ramką. Ramki wycinków są w lupie zasłonięte. Powiększenie jest
ograniczone wysokością pasa, więc listę przystanków dobierz pod kształt układu: szeroki, płaski zestaw daje największe powiększenie.

### Ustawienia opublikowanych map

| Mapa | Arkusz | `CUT_GAP` | Wycinki | Lupa |
|---|---|---|---|---|
| tramwaje | A1 pionowo | 3 | patrz niżej | `k` 2,2 „Centrum” |
| autobusy | A0 poziomo (`POSTER_RATIO=0.7073`) | domyślny | wszystkie z `shape: keep`, patrz niżej | `k` 3 |
| nocne | A1 pionowo | 3 | tryb prosty, patrz niżej | `k` 3 (render zmniejsza, gdy nie mieści) |

**Tramwaje: wycinki**
```
[{"lines":["41"],"cut":"Chocianowice IKEA","title":"do Pabianic","at":"bl"},
 {"lines":["43"],"cut":"Legionów-Włókniarzy","title":"do Konstantynowa Łódzkiego","at":"bl"},
 {"lines":["45"],"cut":"Zgierska-Helenówek","k":0.5,"box":false}]
```

**Tramwaje: przystanki lupy.** Stan „po” (układ `octls`, od 14.10.2026): Bandurskiego-Dw. Łódź Kaliska, Mickiewicza-Żeromskiego,
Kościuszki-Mickiewicza, Piotrkowska Centrum, Piłsudskiego-Sienkiewicza, Piłsudskiego-Kilińskiego, Piłsudskiego-Śmigłego-Rydza.
Stan „przed” (układ `octi`): Piotrkowska Centrum, Kościuszki-Zamenhofa, Mickiewicza-Żeromskiego, Piłsudskiego-Kilińskiego,
Piotrkowska-Brzeźna, Kościuszki-Struga, Piłsudskiego-Sienkiewicza, Żwirki-Piotrkowska, Kościuszki-Mickiewicza.

**Autobusy: wycinki** (podmiejskie ogony z GTFS vs granica Łodzi, 10.10.2026)

| Linie | Dokąd | Przystanki `cut` | `at` | `k` |
|---|---|---|---|---|
| 94 | Lutomiersk | | `bl` | 0,45 |
| 50A, 50B, 56 | Rzgów | Rudzka-Skrajna, Rzgowska-Zagłoby | `bl` | |
| 88B, 88C, 88D, 91B, 91C | Skoszewy, Kalonka | Marmurowa-Moskuliki, Byszewska-Byszewska 26, Grabińska 40 | `tr` | 0,36 |
| 60B, 60C | Stryków, Michałówek | | `tr` | |
| 53B | Brzeziny | | `tr` | |
| 201, 202, 82B, 92A, 92B | Andrespol, Bedoń, Janówka, Stróża | Rokicińska-Andrzejki, Kolumny-Czajewskiego NŻ | `side` | 0,6 |

**Autobusy: przystanki lupy:** Dw. Łódź Fabryczna, Rodziny Poznańskich-Dw. Łódź Fabryczna, Narutowicza-pl. Dąbrowskiego,
Kilińskiego-Narutowicza, Jaracza-Piotrkowska, Zamenhofa-Piotrkowska, Struga-Piotrkowska, Tuwima-Kilińskiego (EC1 Centr. Nauki),
Żeromskiego-pl. Barlickiego, Gdańska-1 Maja.

**Nocne: wycinki** (każdy ogon zabierał 16% powierzchni schematu, razem 22,6×13,7 → 15,3×13,7 km)
```
[{"lines":["N1A"],"cut":"Rojna-Rydzowa","title":"do Aleksandrowa Łódzkiego","at":"tl"},
 {"lines":["N5B"],"cut":"Rokicińska-Hetmańska NŻ","title":"do Andrespola","at":"br"}]
```

**Nocne: przystanki lupy:** Zachodnia-Legionów, Gdańska-1 Maja, Więckowskiego-Zachodnia, Próchnika-Piotrkowska, Jaracza-Piotrkowska,
Zamenhofa-Piotrkowska, Struga-Piotrkowska, Kościuszki-Mickiewicza, Rodziny Poznańskich-Dw. Łódź Fabryczna, Kilińskiego-Narutowicza.
`LEGEND_AT=band` wymusza listę linii w pasie lub kolumnie (próba A1 poziomo, odrzucona: lupa ×1,1).

## 4. Lista zmian: `diff.py`

```
diff.py <gtfs_przed> <dzień> <gtfs_po> <dzień> <diff.json>
```

Różnice z samego GTFS: linie dodane, usunięte, ze zmienioną trasą (inna sekwencja nazw przystanków najczęstszego wariantu w którymś
kierunku) i ze zmienioną liczbą kursów.

## 5. Strona: `build_page.py` i widok geograficzny

```
build_page.py <WORK> page_tpl.html <diff.json> ../index.html
```

Strona z oboma stanami. Czyta `$WORK/out<SUF>/<m>.svg` i `.lines.json`, schematy zapisuje do `../mapy/<m><SUF>.svg`. Odcinki linii
z jednej grupy scala w jedną ścieżkę (`<path>`: ten sam wygląd, ok. 3 razy mniej węzłów DOM). Przełącznik mapy dostaje każdy stan, dla którego
jest `../mapy/<m><SUF>_geo.json`; `geo.js` i dane dostają hash `?v=`.

### Widok geograficzny (krok 5a, przed `build_page.py`; dziś tylko tramwaje „po”)

Na **kopii** `loom.json` (nie na oryginale, nie na `fish`/`octi`) uruchamiasz `serving.py` ze skilla `schemat-linii-loom`, potem eksport:

```
cp $WORK/out_TF150/tram.loom.json $WORK/out_TF150/tram.geo.json
py -3 -X utf8 serving.py $WORK/out_TF150/tram.geo.json $WORK/out_TF150/tram.loom.json $WORK/data_TF150/tram
LABELS='{"Północna":"Północna / Nowomiejska"}' py -3 -X utf8 geo_export.py $WORK/out_TF150/tram.geo.json \
  $WORK/data_TF150/meta/tram.json colors/tram.json ../mapy/tram_geo.json
```

Linie i przystanki rysuje `transitmap` z LOOM jako kafle wektorowe (MVT), osobno dla z11–z17, z grubością linii w pikselach dla każdego zoomu
(`geo_tiles.sh`, w WSL). `geo_tiles.py` scala kafle do `tram_geo.json` (klucz `z`). **Uruchamiaj go zawsze po `geo_export.py`**, bo ten zapisuje plik od nowa.
Kafle zostają w katalogu roboczym, nie w repo:

```
MSYS_NO_PATHCONV=1 wsl.exe bash -l geo_tiles.sh $WORK_WSL/out_TF150/tram.geo.json $WORK_WSL/tiles_tram
py -3 -X utf8 geo_tiles.py $WORK/tiles_tram ../mapy/tram_geo.json
```

Nazwy przystanków i krańcówki `geo_export.py` liczy jak `render.py`; kolory bierze z `colors/<m>.json`.

## 6. Druk: `pdf.py`, `jpg.py`

```
pdf.py <WORK> <SUF> ../druk      # env CHROME=ścieżka do Chrome
jpg.py ../druk [2500]            # dłuższy bok w px
```

- `pdf.py` zapisuje SVG i PDF (headless Chrome). Rozmiar strony PDF wynika z reguły CSS `@page`. Szerokość arkusza: tramwaje 594 mm,
  autobusy 1189 mm, nocne 594 mm.
- Zapisuje też wersję ciemną `<nazwa><SUF>_ciemny.{svg,pdf}` (kolory jak w ciemnym motywie strony).
- `jpg.py` robi JPG z każdego SVG w `druk/` (Chrome + Pillow), także z ciemnych.
- Strona podmienia linki do pobrania zależnie od motywu.

## 7. Kontrola: `verify.py`, `gate.py`

**`verify.py [katalog_svg]`** (env `WORK`, `SUF`, `MAPS`): kontrola linii i krańcówek względem GTFS oraz linii przy przystankach.
Każda linia z podpisu przystanku musi w rozkładzie stawać na przystanku o jednej z nazw podpisu (kolejność ulic bez znaczenia).
Zostają zgłoszenia ze sklejeń `topo` (np. rondo z przystankami na dwóch ulicach). Pozostałe niezgodności (54A/91A „Nowosolna”) to nazwy:
`topo -d 150` scala przystanki do 150 m w jeden węzeł, a chip stoi we właściwym miejscu.

**`gate.py <svg> <gtfs_dir>`**: bramka objazdów. Zgłasza odcinki rysowane ≥1,4× dłużej niż cięciwa i linie ≥1,5× dłuższe od mediany
(rysunek/GTFS). `octi` bywa pechowy (np. pętla 75A/B przez Starową Górę, objazd 64A/Z6 przez Zagajnikową): wtedy przelicz układ i obejrzyj
zgłoszone miejsca. Znane i w porządku: 85A, 91C, F1 (długie, kręte trasy) oraz haczyk 75A/B przy IKEA (pętla nawrotowa).

---

## Tematy szczegółowe

### Kto gdzie staje (`serving.py`)

`topo` i `loom` gubią, które linie tylko przejeżdżają przez węzeł. `hubsnap.py` czyścił to przy każdym „Dw. Łódź”: 50A/50B/68 na Leszczowej,
tramwaje 4/9/19 przy Fabrycznej, 2/6/8/13/16 na pętli Żabieniec.

`serving.py` (w `run.sh` po układzie):
- przypisuje każdy przystanek rysowanych kursów linii do węzła z tą linią (najbliższy o tej samej nazwie, a gdy takiego nie ma, najbliższy w ogóle;
  położenia z `loom.json`). Koniec linii zawsze jest jej przystankiem;
- zapisuje w `octi.json` pola `not_serving` oraz `stop_names` (nazwa → linie).

Efekt:
- `transitmap` rysuje symbol przystanku tylko na liniach, które na nim stają;
- `render.py` z `stop_names` nazywa węzeł sklejony z kilku przystanków po tym, na którym staje więcej linii (Kilińskiego-Dw. Łódź Chojny zamiast
  Śląska 28 dla N3);
- krańcówka sklejona z przystankiem przelotowym innej ulicy ma obie nazwy („Rokicińska-Lermontowa / Widzew Augustów”,
  „Aleksandrowska-Szczecińska / Teofilów”).

Na stronie legenda mówi, że przystanki bliżej niż ok. 150 m są jednym punktem.

### Dworce i centrum (Fabryczna)

LOOM nie grupuje przystanków (`gtfs2graph` robi węzeł z każdego `stop_id`, `parent_station` ignoruje), a pętle końcowe przez kilka peronów rysuje
jako supeł. Fabryczna to w realu cztery grupy peronów wokół jednej pętli (51/53/61/85: pl. Dąbrowskiego → Rodziny Poznańskich wsch. → dworzec →
Rodziny Poznańskich zach. → pl. Dąbrowskiego), więc rysujemy ją jako cztery węzły połączone pierścieniem.

| Skrypt | Co robi |
|---|---|
| `filt.py` (węzły) | `HUBS` (env, JSON z listami `stop_id`): domyślnie dworzec (2999, 2995, 2998), Rodziny Poznańskich zach. (2989–2992) i wsch. (3015, 3002, 3003), pl. Dąbrowskiego (769, 763 Narutowicza + 760 Sterlinga, bo `topo -d 150` i tak by je skleił). ID są te same w feedach z 2.10 i 5.10.2026. Pozostałe dworce (Widzew, Kaliska): „Dw. Łódź X” + każdy „Ulica-Dw. Łódź X” do 250 m w jeden przystanek w środku ciężkości. `HUB_SKIP` (env, JSON z nazwami, domyślnie `["Dw. Łódź Chojny"]`) wyłącza to: przy Chojnach 69/70/72 stają na Kilińskiego, a 75 na Śląskiej, nie na dworcu |
| `hubsnap.py` (w `run.sh` po `fixends.py`) | węzeł pomocniczy `topo` trafia do najbliższego przystanku i jest wciągany, tylko gdy to dworzec do `HUB_R` m (300). Równoległe krawędzie scala. Dworcom zdejmuje `not_serving` (`serving.py` liczy je potem od nowa z rozkładu) i nadaje unikalne `station_id` bliźniakom o tej samej nazwie (`render.py` przypisuje krańcówki po `station_id`, oba „Rodziny Poznańskich” dostawały „Dw. Łódź Fabryczna”) |
| `fisheye.py` (w `run.sh` przed `octi`) | najpierw `MOVE` (env, JSON `[lon, lat, nowy_lon, nowy_lat]`): cztery węzły ręcznie w romb 300 m od dworca (S, W, E, N; w realu W–dworzec–E leżą na jednej prostej i `octi` robi z nich jeden pęk). Potem soczewki `FISHEYE="M R0 [lon lat], …"` po kolei: lokalna na Fabryczną i globalna na centrum (domyślnie `2.5 650 19.4687 51.7703, 1.5 2500`). `octi` ma jedną skalę siatki, bez tego przystanki centrum lądują w sąsiednich komórkach |
| `fixends.py` | łata krańcówki dalsze niż 120 m od linii (`topo` gubił też ostatnie 230 m linii 61 do dworca). Gdy `topo` zgubił sam przystanek końcowy, wstawia go z powrotem na jego miejscu z krótką krawędzią od najbliższego przystanku (linia 1: Kilińskiego-Mochnackiego, 480 m za Dąbrowskiego; pętla Helenówek osobno od przystanku 45) |

`octi` jest bardzo czuły na wejście: drobna zmiana soczewki daje inny układ. Wariant wybierany jest z kilku po bramce (`gate.py`),
liczbie konfliktów etykiet i niedopasowanych przystankach w `render.py` oraz zrzucie okolic dworca. Szybka iteracja: sam `fisheye.py` +
`octi` + `transitmap` na gotowym `loom.json` (ok. 20 s). Opublikowane soczewki: stan „po” `FISHEYE="2.2 650 19.4687 51.7703, 1.5 2500"`,
stan „przed” `"2.5 700 19.4687 51.7703, 1.5 2500"`.

### Tramwaje „po”: układ z `octls` (14.10.2026)

Opublikowany schemat tramwajów (stan od 5.10.2026) liczy własny solver [`octls.py`](OCTLS.md), nie `octi`: Piotrkowska pionowo,
Mickiewicza i Piłsudskiego poziomo, Pabianicka jedną linią 45° (wariant `lv048`, zgłoszenie
[#1](https://github.com/GISBoost/mapy-analizy/issues/1)). Stan „przed”, autobusy i nocne zostają z `octi`.

**Poprzedni układ** (`octi`) jest zachowany w tagu gita `schemat-lodz-tram-octi-2026-10-12` i w `archiwum_tram_octi/` w katalogu roboczym.

**Kroki** (wejście: `loom.json` z `run.sh` albo gotowy `out_TF150_octls/tram.loom.json`):
1. `OCTI=ls bash run.sh tram tram` (patrz [krok 2](#2-układ-loom-i-octls)) albo sam `octls.py` na `loom.json` po `merge_nodes.py`. Wynik: `tram.octi.json`.
2. `serving.py tram.octi.json tram.loom.json <data>/tram` oraz `transitmap` (`tm.svg`, `tl.svg`), jak w `run.sh`.
3. `render.py` z `OCTLS=1`, `LANDMARKS`, `RAIL_STYLE=double`, `CUT_GAP=3`, `CUTS` jak w [ustawieniach map](#ustawienia-opublikowanych-map)
   i kolorami przypiętymi `colors/tram.json` (kolory zostają takie same jak w widoku mapy i w stanie „przed”).
   Lupa z nowej listy przystanków:
   ```
   ZOOM='{"stations":["Bandurskiego-Dw. Łódź Kaliska","Mickiewicza-Żeromskiego","Kościuszki-Mickiewicza","Piotrkowska Centrum",
   "Piłsudskiego-Sienkiewicza","Piłsudskiego-Kilińskiego","Piłsudskiego-Śmigłego-Rydza"],"k":2.2,"title":"Centrum"}'
   ```
   Stara lista, dobrana pod układ z `octi`, dawała w nowym układzie lupę ×1,0 i ucinała centrum. Krzyż Mickiewicza/Piłsudskiego jest teraz
   poziomy, więc lupa jest szerokim pasem wzdłuż niego.
4. `build_page.py`, `pdf.py`, `jpg.py` bez zmian. Pliki tramwajów „po”: `mapy/tram.svg`, `druk/lodz_tramwaje[_ciemny].{svg,pdf,jpg}`.
   Powtórne zbudowanie strony ze starych wsadów daje identyczne `mapy/*.svg` i `druk/*.svg` autobusów i nocnych.

**Warstwa orientacyjna** działa na nowym układzie bez zmian w kodzie, bo odwzorowanie odcinkowo-afiniczne jest liczone z położeń przystanków.
Przeliczenie 14.10.2026:

| | `octi` (dotychczas) | `octls` |
|---|---|---|
| zagięte trójkąty odwzorowania | 25 | 21 |
| `gate.py` | bez zgłoszeń | bez zgłoszeń |
| piktogramy | 19 | 18 |
| konflikty etykiet | 1 | 2 |
| podpis „Park na Zdrowiu” | jest | brak (nie mieści się) |

Ramki 41 i 43 renderer sam ustawia pod mapą, bo dolny lewy róg zajmuje ogon Pabianickiej.

### Warstwa orientacyjna

Opcjonalne tło schematu (10.10.2026): kolej, granica Łodzi (strefa biletowa 1 | 2), parki i lasy, nazwy pięciu dzielnic, ul. Piotrkowska
z pl. Wolności oraz piktogramy przy nazwach przystanków (stacja kolejowa w promieniu 350 m, duże szpitale, Manufaktura).
Jest na stronie i w `druk/`, na wszystkich sześciu schematach (oba stany).

**Render:** `LANDMARKS=<work>/landmarks.json RAIL_STYLE=double`. Na autobusach i nocnych dodatkowo `PIOTRKOWSKA=0`. Pozostałe ustawienia map bez zmian.

**Dane:** `landmarks.py <work>/landmarks.json` pobiera dane z OpenStreetMap (Overpass API) do katalogu roboczego. Surowa odpowiedź zostaje obok
(`*.osm.json`), więc kolejne uruchomienie nie odpytuje serwera. Dane nie trafiają do repozytorium.

**Jak jest rysowana**
- *Geografia na schemacie:* odwzorowanie odcinkowo-afiniczne na trójkątach rozpiętych na przystankach; poza siecią działa jedno przekształcenie
  afiniczne dopasowane do wszystkich przystanków.
- *Kolej:* tory pasażerskie (relacje `route=train`) sklejone w jedną linię na korytarz, przecięte na stacjach i rozjazdach (węzły bliższe niż 350 m
  łączone), każdy odcinek narysowany jako skos + prosta (kąty 45/90°), do granicy miasta. `RAIL_STYLE=double` daje kolej jak na mapie NYC
  (podwójna linia).
- *Parki i granica:* wielokąty uproszczone i dociągnięte do siatki, boki tylko co 45/90°; parki z zaokrąglonymi narożnikami.
- *Parki a linie:* parki nie przechodzą przez linie (wyglądałoby to jak przejście na drugą stronę ulicy), są cięte wzdłuż każdej linii z odstępem,
  a skrawki (poniżej 1/5 największej części) znikają.
- *Podpisy:* nazwy dzielnic omijają parki, podpisy parków omijają nazwy dzielnic.

**Przycinanie i ramki**
- Tło jest przycięte do ramki rysunku (nie wchodzi pod pasek tytułu ani do bocznej kolumny plakatu). Gdy panel objaśnień jest wąski (nocne),
  objaśnienia idą w jednej kolumnie.
- Ramki `"shape":"keep"` (autobusy), które w całości leżą poza Łodzią, mają tło strefy 2 i kreskę granicy na pierwszym odcinku za każdym
  przystankiem cięcia.
- Ramka boczna przeniesiona do kolumny plakatu (autobusy: „do Andrespola”) zostawia w starym miejscu łatę, na której warstwa jest narysowana
  ponownie (`<use>` grupy `bgl`), żeby tło strefy 2 i parki się nie urywały.

**Ul. Piotrkowska**
- Na mapach bez przystanku „Piotrkowska Centrum” (nocne) ulica zaczyna się w miejscu tego przystanku przeniesionym przez odwzorowanie.
- Na autobusach i nocnych jej nie rysujemy (`PIOTRKOWSKA=0`, razem z pl. Wolności). Na autobusach nie ma jak jej wpasować, a z nocnych
  usunięta 11.10.2026, bo deptak bez linii mylił.
- Ośmiokąt pl. Wolności zjeżdża wzdłuż ulicy (do 8 wysokości czcionki) z linii i przystanków; podpis szuka wolnego miejsca w pobliżu,
  a bez niego jest pomijany.

**Ciemny motyw:** kolory warstwy w wersji ciemnej to tabela `NEUT` w `pdf.py`. `build_page.py` robi z niej reguły CSS ciemnego motywu strony
(kolory warstwy są atrybutami, więc reguły dopasowują je po wartości). Po kliknięciu linii tło nie przygasa.

---

## Narzędzia pomocnicze

### `mk.sh` i `fin.sh`

Łączą kroki 2–3 i robią podgląd PNG (`shot.py`, Playwright). Env: `PY`, `SUB` i (tylko `fin.sh`) `COLORS`.

### `gtfs_fix_shapes.py <gtfs.zip|katalog> <wynik.zip>`

Feed ZDiT podany wprost do `gtfs2graph` (także we wtyczce QGIS [loom_qgis](https://github.com/transportforcairo/loom_qgis)) przerywa wczytywanie:
część kursów (tramwaj 43, kilkanaście linii autobusowych) ma `shape_id` bez wpisu w `shapes.txt`. Skrypt usuwa takie kursy, gdy linia ma inne
z kształtem, a pozostałym czyści `shape_id` (feed z 5.10.2026: 104 usunięte, 4 bez kształtu). `filt.py` sam czyści `shape_id` bez kształtu
(po wyborze wariantów), więc potok tego nie potrzebuje.

### `straighten.py <katalog_gtfs> <wynik>` (eksperyment, 12.10.2026)

Prostuje ulice w GTFS po `filt.py`, przed LOOM. Przystanki i punkty `shapes.txt` do `buf` m od podanej łamanej dostają wspólną długość
(`"axis":"v"`) albo szerokość (`"h"`), z opcjonalnym wygaszaniem przy skrzyżowaniu (`taper`). Konfiguracja w env `STRAIGHTEN` (JSON, opis w nagłówku).

Tramwaje „po”: Piotrkowska od Żwirki do pl. Reymonta na długość Piotrkowskiej Centrum (19.4570) i Przybyszewskiego od pl. Reymonta do Kilińskiego
na szerokość pl. Reymonta (51.7429, wygaszane od 19.4725 do 19.4752):
```
[{"path":[[19.4583,51.7577],[19.4590,51.7556],[19.4600,51.7527],[19.4607,51.7490],[19.4614,51.7462],[19.4627,51.7429]],"axis":"v","to":19.4570,"buf":70},
 {"path":[[19.4627,51.7429],[19.4690,51.7441],[19.4760,51.7455]],"axis":"h","to":51.7429,"buf":70,"taper":[19.4725,19.4752]}]
```
Korytarz Piotrkowskiej zaczyna się poniżej osi Piłsudskiego/Mickiewicza, inaczej ściągnąłby kawałek poziomej wiązki do jednego punktu.

Wyniki z `octi` (zgłoszenie #1):
- Samo prostowanie przy domyślnym `octi` prawie nic nie daje.
- Z `-g 70% --geo-pen 1 --nd-move-pen 3 --diag-pen 0.5 --pen-45 2 --pen-90 1 --pen-135 1 --density-pen 5 --max-grid-dist 5` Piotrkowska jest pionowa
  ze skrętem 90° na pl. Reymonta.
- Z samym `--diag-pen 1` centrum wychodzi tak samo, ale Pabianicka i ogon do Pabianic kładą się poziomo.
- Kary faworyzujące 90° (`--pen-90` 0–0,5 przy `--pen-135` 2–3) same prostują Piotrkowską, ale rozjeżdżają resztę (średni błąd kierunku 23° zamiast 17°),
  a dodane do zestawu wyżej tylko dokładają schodków (61 → 127–142 załamań).

Ostatecznie Piotrkowską prostuje solver `octls`, patrz [Tramwaje „po”](#tramwaje-po-układ-z-octls-14102026).

---

## Historia

### Stan „przed” (8.10.2026)
- **GTFS:** release `lodz-realized-2026-10-02-phone` repo `GISBoost/easy-GTFS-RT`, `lodz_static_gtfs_2026-10-02.zip`, `feed_start_date` 20261001.
  Dzień: czwartek **1.10.2026**.
- **Stan „po”:** tramwaje i nocne to dotychczasowe SVG z `../druk/` (release `lodz-realized-2026-10-05-phone`, dzień 8.10.2026), nieprzeliczane;
  ich `lines.json` odtworzono z metadanych strony.
- **Autobusy** w obu stanach przeliczone 9.10.2026 z czterema węzłami Fabrycznej, `hubsnap.py`, `fisheye.py` (MOVE + dwie soczewki) i `fixends.py`.

### 10.10.2026
- **Tramwaje:** stan „po” od nowa obecnym `run.sh` z `FISHEYE=` (stary układ nie odtwarza się na tej maszynie), stan „przed” z dotychczasowego
  `octi.json`. Próbowane i odrzucone: soczewka na centrum + `octi --geo-pen 1` (Piotrkowska pionowo, ale Pabianicka/Paderewskiego robią się poziome
  wbrew geografii), `--diag-pen 1.5`, `-g 75%`, `--geo-pen 3`.
- `tl.svg` (`transitmap -l`) ma czasem szersze płótno niż `tm.svg`; `render.py` przelicza numery linii przez `latlng-box`.
  Autobusy i nocne bez zmian (bez plakatu, tylko wersje ciemne).
- **Nocne:** oba stany od nowa (`run.sh night bus`, `TOPO_D=150`, z `fixends`/`hubsnap`), potem z `loom.json` soczewka
  `FISHEYE='2.5 650 19.4687 51.7703, 1.5 2500'` i `octi --geo-pen 1`, żeby wiązka Zamenhofa – Kościuszki-Mickiewicza – Kościuszki-Radwańska szła
  pionowo jak w terenie. Porównane: domyślne `octi`, `--geo-pen` 0,5/1/2/3, `--diag-pen 1.5`, `-g 75%`, sama soczewka, `--geo-pen 1 -g 75%`
  (najmniejsza dystorcja: błąd kierunku 22,6°, przesunięcie 0,29 km; wybrana soczewka + geo-pen ma 29,5° i 0,47 km, ale więcej miejsca w centrum).
- **Środowisko:** LOOM w WSL (Ubuntu 24.04, cmake + g++). `src/topo/tests/ContractTest.cpp` skompilowany z `-O0`
  (`make tests/ContractTest.cpp.o CXX_FLAGS='-O0 -fopenmp -w'` w `build/src/topo`), bez libzip, więc GTFS podawany jako katalog.
  Python (pandas, shapely, PIL) na Windows z `-X utf8`.

### 11.10.2026: uwagi użytkowników
- Autobusy i nocne w obu stanach od nowa z `filt.py` z `HUB_SKIP` i bez kursów zjazdowych, potem `serving.py`.
- Warianty z `loom.json` (soczewka × `--geo-pen`), wybrane po bramce, konfliktach etykiet, niedopasowanych przystankach i zrzutach:
  - autobusy po i przed: `FISHEYE="2.2 650 19.4687 51.7703, 1.5 2500"`;
  - nocne po: `"2.0 600 19.4687 51.7703, 1.5 2500"` z `--geo-pen 1` (7 konfliktów zamiast 17);
  - nocne przed: `"2.5 700 19.4687 51.7703, 1.5 2500"` z `--geo-pen 1`.
- Tramwaje: dotychczasowy `octi.json` + `serving.py` (układ bez zmian).
- Przy Chojnach pętla jednokierunkowa 69/70/72 i 75 (Broniewskiego–Śląska–Kilińskiego–Rzgowska) nadal daje supeł; próba ze sklejeniem Kilińskiego
  i Śląskiej w jeden węzeł go nie usunęła.

### 11.10.2026: po drugiej rundzie uwag
- Tramwaje w obu stanach od nowa (`run.sh tram tram`, `TOPO_D=150`, `FISHEYE=`) z poprawką `fixends.py`; wycinek 45 zaczepiony o „Zgierska-Helenówek”.
- Test promienia `topo -d` 150/100/75 m: przy 75 m tramwaje rozdzielają Widzew Augustów i Lermontowa, ale rondo Lotników Lwowskich jest nieczytelne;
  autobusy przy 100 i 75 m tracą podpisy kilkunastu przystanków. Zostaje 150 m.
- N4B i N9 kursują tylko w weekendy; lista linii nocnych o tym mówi.

### 14.10.2026
Tramwaje „po” z układem `octls`, patrz [Tramwaje „po”: układ z `octls`](#tramwaje-po-układ-z-octls-14102026).
