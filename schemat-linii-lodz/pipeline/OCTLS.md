# octls: własny układ oktylinearny (zamiast `octi`)

`octls.py` układa graf z `loom.json` na ośmiu kierunkach (0°, 45°, …, 315°) i zapisuje wynik w tym samym
formacie co `octi`. Dalsze kroki (`serving.py`, `transitmap`, `render.py`) nie wiedzą, który program układał
schemat. Domyślnie potok nadal używa `octi`; `octls` włącza się zmienną `OCTI=ls` (patrz „Użycie”).

Po co to jest: `octi` układa graf na jednolitej siatce i nie da się mu powiedzieć „ta ulica ma być pionowa”.
Schemat MPK z 2016 roku ma kilka osi, które ludzie rozpoznają (Piotrkowska pionowo, Mickiewicza i Piłsudskiego poziomo,
Pabianicka pod 45°), a ogony na Retkini i Olechowie mają być pod 45°. W `octls` te osie to jawny plik
wejściowy (`goals/tram.json`), a reszta grafu układa się sama, możliwie blisko geografii.
Historia decyzji i pomiary: `../NOTATKI.md`, zgłoszenie
[#1](https://github.com/GISBoost/mapy-analizy/issues/1).

## Pliki

| Plik | Rola |
|---|---|
| `octls.py` | solver (numpy, ok. 360 linii): wczytanie, model, wyszukiwanie, zapis |
| `merge_nodes.py` | przed solverem: skleja dwa węzły przystanków w jeden hub (Rondo Lotników Lwowskich) |
| `goals/tram.json` | osie wymuszane dla tramwajów od 5.10.2026 (nazwy przystanków z tego feedu) |
| `test_octls.py` | test na małym grafie: kierunki oktylinearne, cel wymuszony, brak przecięć |
| `run.sh` | z `OCTI=ls` wywołuje `merge_nodes.py` i `octls.py` zamiast `fisheye.py` + `octi` |

## Użycie

Cały potok, tylko tramwaje (WSL, jak reszta `run.sh`):

```
OCTI=ls PY_LS=<python z numpy> LOOM_BUILD=... WORK=... SUF=_TF150 TOPO_D=150 bash run.sh tram tram
```

- `PY_LS`: interpreter z numpy (domyślnie `python3`). Reszta `run.sh` działa na samym stdlib, więc numpy jest
  jedyną zależnością, którą dodaje `octls`. Gdy w WSL nie ma numpy, wskaż skrypt uruchamiający Windowsowe `py`.
- `GOALS`: plik celów (domyślnie `goals/<tryb>.json`; brak pliku = układ bez celów).
- `HUB_MERGE`: `'zostaje|znika'`, etykiety dwóch przystanków do sklejenia. Dla `tram` domyślnie
  `Pabianicka-Rondo Lotników Lwowskich|Paderewskiego-Rondo Lotników Lwowskich`; `HUB_MERGE=` (puste) wyłącza.
- `OCTLS_ARGS`: opcje solvera. Domyślnie „preset tramwajowy” (wariant `lv048`):
  `--theta 8 --anchor 0.4 --lenw 1.0 --escale 5e5 --bend45 3 --bend90 6 --bend135 20 --minlen 150 --win 0 --xpen 100 --passes 4`.
- Soczewka (`fisheye.py`) w tym trybie jest pominięta, a argumenty `octi` ignorowane.

Sam solver:

```
py -X utf8 octls.py loom.json out.octi.json --goals goals/tram.json --theta 8 ...
py -X utf8 test_octls.py
```

Odtwarzalność: solver jest deterministyczny (bez losowości, `--ils 0`). Dla wejścia `loom_merged.json` i presetu
powyżej wynik jest bajt w bajt taki sam jak wybrany wariant `lv048` (sprawdzone 14.10.2026), czas ok. 25–30 s
na grafie 233 węzłów i 245 krawędzi.

## Jak to działa

```
loom.json ──► merge_nodes.py ──► octls.py ──► octi.json ──► serving.py ──► transitmap / render.py
 (węzły,        (hub Ronda)       │  ▲
  krawędzie,                      │  └── goals/tram.json (osie V/H/D wzdłuż ścieżek przystanków)
  linie)                          ▼
                       1. obrót o theta, metry
                       2. etykiety kierunków (8 na krawędź)
                       3. pozycje z najmniejszych kwadratów
                       4. wyszukiwanie lokalne etykiet
                       5. zapis (łamane z jednym załamaniem)
```

### 1. Wejście i obrót (`load`)

Współrzędne węzłów idą do metrów (`x = lon·cos(51,76°)·111320`, `y = lat·111320`) i są obracane zgodnie z ruchem
wskazówek zegara o `--theta` wokół środka ciężkości węzłów. Ulice Łodzi są obrócone o ok. 8–10° względem północy,
więc po obrocie Piotrkowska jest blisko pionu i etykieta „pionowo” kosztuje mało. **Wynik nie jest obracany z powrotem:**
cały schemat jest przechylony o `theta` względem północy (zamierzone; MPK też nie rysuje północy u góry).
`p0` oznacza tak obrócone, oryginalne pozycje.

### 2. Model (`Layout`)

Każda krawędź `k = (u, v)` dostaje etykietę `d_k` ∈ {0…7} (0 = N, 2 = E, 4 = S, 6 = W) i długość `l_k` (ciągła).
Dla danych etykiet pozycje węzłów minimalizują

```
E = wd² · Σ |p_v − p_u − l_k·d_k|²      krawędź ma iść w kierunku d_k
  + lw² · Σ (l_k − L0_k)²               długość zbliżona do oryginalnej (L0)
  + al² · Σ |p_i − p0_i|²               węzeł blisko oryginalnego miejsca
```

Długości `l_k` da się wyeliminować wzorem, więc zostaje jeden gęsty układ liniowy 2n × 2n (`solve`, ok. 3 ms).
To jest „część ciągła”: pozycje są zawsze optymalne dla danych etykiet.

Etykiety to „część dyskretna”. Funkcja kosztu, którą minimalizuje wyszukiwanie (`J`):

```
J = E/escale
  + kary za zagięcia
  + xpen · liczba przecięć
  + kara za krótkie krawędzie
```

- **Zagięcie** liczy się w węźle dla każdej pary krawędzi, które dzielą co najmniej jedną linię (tam linia się
  łamie). Kara zależy od kąta: 45° → `bend45`, 90° → `bend90`, 135° → `bend135`, prosto 0. Opcja `--bendpow`
  mnoży karę przez (liczba wspólnych linii)^bendpow, żeby grube wiązki łamały się rzadziej (preset: 0, wyłączone).
- **Twarde reguły** (kara 1e5): dwie krawędzie wychodzące z węzła w tym samym kierunku (nakładanie się) oraz
  dwie krawędzie węzła z tą samą etykietą wyjścia (`dup`).
- **Przecięcia** (`crossings`): pary krawędzi bez wspólnego węzła, których odcinki (prosta cięciwa między węzłami)
  się przecinają. To kara miękka z dużą wagą (`xpen 100`), a nie ograniczenie.
- **Krótkie krawędzie**: `shortw · Σ max(minlen − l, 0)² / 1e4` plus 200 za każdą krawędź krótszą niż 10 m,
  żeby przystanki nie zlewały się w jeden punkt.

### 3. Etykiety początkowe (`smooth_dirs`)

Każda krawędź dostaje najbliższy z ośmiu kierunków swojej cięciwy. Przy `--win N` bierze się sumę cięciw
sąsiednich krawędzi tego samego łańcucha (do N po każdej stronie), co wygładza zygzaki; preset używa `win 0`
(sama krawędź). **Łańcuch** (`_chains`) to maksymalna ścieżka przez węzły stopnia 2.

### 4. Cele (`goals/*.json`, `goal_edges`)

Plik to lista obiektów:

```json
{"name": "Zgierska-Piotrkowska", "axis": "V", "path": ["Zgierska-Helenówek-pętla", "Zgierska-Dolna", "…"]}
```

- `path`: nazwy przystanków (`station_label`) jako punkty orientacyjne. Między kolejnymi parami solver szuka
  najkrótszej ścieżki w grafie (Dijkstra po `L0`) i wszystkie krawędzie tej ścieżki zostają zamrożone.
- `axis`: `V` (kierunki 0, 4), `H` (2, 6) lub `D` (1, 3, 5, 7). Z klasy wybierany jest kierunek najbliższy
  kierunkowi od pierwszego do ostatniego punktu odcinka, a dla każdej krawędzi ustawiany z uwzględnieniem tego,
  w którą stronę jest zapisana.
- Zamrożone krawędzie nie biorą udziału w wyszukiwaniu. Pozycje węzłów nadal wynikają z najmniejszych
  kwadratów, więc ulica nie musi być idealnie prosta, jeśli reszta grafu ją ciągnie, ale kierunek jest wymuszony.
- Nazwa nieistniejąca w grafie kończy program komunikatem z listą brakujących nazw. **Cele są związane z jednym
  feedem**: po zmianie rozkładu, który przemianowuje przystanki, trzeba je zaktualizować.

`goals/tram.json` (feed od 5.10.2026) zawiera osie: Mickiewicza–Piłsudskiego (H), Pabianicka (D),
Zgierska–Piotrkowska (V, Helenówek → pl. Reymonta przez Zachodnią i Kościuszki-Mickiewicza), Kochanówka,
Retkinia i Olechów (D), Dąbrowa (H) oraz Gdańska (poziomo, potem pionowo).

### 5. Wyszukiwanie lokalne (`search`)

Kolejne przebiegi (do `--passes`, koniec, gdy nic się nie poprawia). W każdym próbuje się ruchów:
1. pojedyncza krawędź, od najdłuższej: etykieta ±1 i ±2;
2. cały łańcuch ustawiony na jeden kierunek (etykieta łańcucha ±1 i etykiety, które już w nim występują);
3. okna 2, 3, 4 i 6 kolejnych krawędzi łańcucha (łańcuchy 3–40 krawędzi), z krokiem połowy okna.

Dla każdego ruchu przelicza się `J` (z pełnym rozwiązaniem pozycji) i zostaje najlepszy kandydat, jeśli jest
lepszy od obecnego. `--ils N` dodaje N losowych zaburzeń z lokalną poprawą (iterated local search, ziarno `--seed`);
przy wariancie `lv048` niepotrzebne i wyłączone. Limit czasu: `--tlimit` s.

To heurystyka: znajduje dobre minimum lokalne, bez gwarancji optimum. W eksperymentach badano też ILP
(MIP w HiGHS i LNS na jego bazie): nie dały nic ponad to, co daje wyszukiwanie lokalne, a LNS na jednym z wariantów
wprowadził 2 przecięcia (patrz NOTATKI). Kod tych prób nie jest w repozytorium.

### 6. Zapis (`write`)

Węzły dostają nowe współrzędne (odwrotnie do kroku 1, bez cofania obrotu). Krawędź, której końce nie leżą
dokładnie na jej kierunku (reszta > 1,5 m), dostaje drugi odcinek w sąsiednim kierunku, czyli łamaną z jednym
załamaniem 45°. Wszystkie atrybuty węzłów i krawędzi (linie, kolory, `station_label`, …) są kopiowane bez zmian.

## Opcje `octls.py`

| Opcja | Domyślnie | Preset tram | Znaczenie |
|---|---|---|---|
| `--theta` | 0 | 8 | obrót wejścia, stopnie zgodnie z ruchem wskazówek |
| `--anchor` | 0,3 | 0,4 | `al`: siła trzymania węzła przy oryginalnej pozycji |
| `--lenw` | 0,5 | 1,0 | `lw`: siła trzymania oryginalnej długości krawędzi |
| `--wdir` | 300 | 300 | `wd`: siła trzymania kierunku krawędzi (duża = kierunki prawie sztywne) |
| `--escale` | 1,5e5 | 5e5 | dzielnik `E` w `J`; większy = zagięcia ważniejsze od dopasowania |
| `--bend45/90/135` | 1 / 6 / 20 | 3 / 6 / 20 | kary za zagięcie |
| `--bendpow` | 0 | 0 | wykładnik wagi „liczba wspólnych linii” |
| `--xpen` | 10 | 100 | kara za jedno przecięcie |
| `--minlen`, `--shortw` | 120, 1 | 150, 1 | minimalna długość krawędzi (m) i waga kary |
| `--win` | 1 | 0 | okno wygładzania etykiet początkowych |
| `--passes`, `--tlimit` | 4, 600 | 4 | liczba przebiegów, limit czasu (s) |
| `--ils`, `--seed` | 0, 0 | 0 | opcjonalne zaburzenia losowe |
| `--goals` | brak | `goals/tram.json` | plik celów |

Preset tramwajowy to wynik przeglądu wielu konfiguracji (`NOTATKI.md`); parametry nie są niezależne,
więc zmieniaj je pojedynczo i porównuj z pomiarami (odchyłki osi, liczba zagięć 45°/90°, przecięcia).

## Ograniczenia

- Heurystyka, nie optimum; inne parametry dają inny układ. Wybrany układ i jego pomiary są w NOTATKACH.
- Cele są związane z nazwami przystanków jednego feedu i z `loom.json` powstałym z tych samych ustawień
  `topo`/`hubsnap` (inaczej nazwy mogą się nie znaleźć).
- Układ jest obrócony o `theta` względem północy.
- Przecięcia są karą, nie warunkiem. Wynik trzeba sprawdzić (`gate.py`, `verify.py`, oko); `octls` zwraca
  liczbę przecięć w podsumowaniu (`cross`).
- Konflikty etykiet w gęstym południowo-wschodnim centrum rozwiązuje renderer, nie solver.
- Tylko tramwaje mają cele i preset; autobusy i nocne nadal idą przez `octi`.
- Czasy: koszt jednej oceny `J` rośnie z kwadratem liczby krawędzi (przecięcia) i sześcianem liczby węzłów
  (rozwiązanie); przy kilkukrotnie większym grafie trzeba ograniczyć `--passes` albo okna.
