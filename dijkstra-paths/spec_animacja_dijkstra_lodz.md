# Łódź: jak rośnie zasięg podróży — plan i specyfikacja

**GISBoost · stan rozpoznania: 7.11.2026, Europe/Warsaw (CET).**
**Docelowy adres pliku:** `/workspace/deliverables/spec_animacja_dijkstra_lodz.md`.
**Cel:** publiczna analiza/post, opcjonalnie film na **24.11.2026 — #30DayMapChallenge / Network**, nie nowy produkt routingowy.

## 0. Obowiązujący zakres po zmianie decyzji

**Trzy osobne tryby w jednym interfejsie, a nie składanie trzech etapów podróży:**

1. **PT — transport publiczny:** zwykła dostępność R5, rosnąca izochrona heksagonalna z wcześniej obliczonej macierzy O–D. Nie animujemy ulic ani działania RAPTOR-a.
2. **WALK — pieszo:** rzeczywisty Dijkstra na pieszym grafie OSM. Ulice/ścieżki rozświetlają się według czasu osiągnięcia.
3. **CAR — samochód:** rzeczywisty Dijkstra na skierowanym grafie drogowym OSM, z prędkościami, jednokierunkowością, uprawnieniami i ograniczeniami skrętów; zgodność kosztów z R5 podlega testom.

**Hover:** szybki podgląd izochrony z macierzy odpowiedniej dla wybranego trybu. **Klik:** przypięcie heksa i animacja od 0 do 60 minut. Przełącznik PT/WALK/CAR nie oznacza podróży multimodalnej ani przesiadki.

**Usunięte z zakresu:** eksport origin→stop, podświetlanie przystanków z RAPTOR-a, wieloźródłowy Dijkstra od przystanków, rozdzielanie ulic na access/egress. Nie budować tych elementów „na zapas”. W PT dojście, oczekiwanie, przejazdy, przesiadki i odejście uwzględnia normalna macierz R5; nie rozkładamy ich na animowane etapy.

### Najważniejsze decyzje projektowe

- Jedna siatka **`hex250-v1`, 5662 heksy**, nie inna „podobna” siatka 250 m.
- PT zachowuje godzinne okno odjazdu i P50 z analizy godzinowej. Animacja pokazuje **próg czasu podróży w statystycznej powierzchni dostępności**, nie jeden rzeczywisty przejazd pojazdu.
- WALK: **3,6 km/h**. CAR: w pierwszym wariancie prędkości zakodowane w tym samym grafie R5 z tego samego OSM; **bez deklaracji o rzeczywistych korkach**. Istniejący `car-v1` to opcja, nie dodatkowy projekt kalibracyjny.
- Reuse interakcji z istniejącej strony izochron; do licznych ulic rekomendowany istniejący w repo **MapLibre**, nie migracja całego serwisu do nowego frameworka.
- Najpierw **jeden origin i film offline w Pythonie**, potem 2–3 miejsca pokazowe, dopiero następnie pełny interfejs dla 5662 początków.
- Szacunek: **MVP 14–22 h; całość 48–75 h z rezerwą**, bez czasu maszynowego. Największe ryzyko: zgodny z R5 CAR, szczególnie skręty i przypięcie punktów do ulic, a nie sam kopiec Dijkstry.

## 1. Co rzeczywiście istnieje i co wykorzystujemy

Ścieżki w tej tabeli sprawdzono przez odczyt plików/drzew GitHub 7.11.2026. **Istnienie opisu lokalnego artefaktu w README nie oznacza, że jego plik znajduje się w repo albo na tym komputerze.** Nie sprawdzano lokalnych danych użytkownika. Weryfikacja jest rozpoznaniem do specyfikacji, nie benchmarkiem implementacji.

Odczytane drzewa: `GISBoost/easy-R5` — `b936e94ffd60e991cf6ee873c8ce82161b9e2d9b`; `GISBoost/mapy-analizy` — `7671baacdbf06d10b00fecc4bac7c49502401925`. To identyfikatory drzew, nie deklarowane SHA commitów. Linki niżej prowadzą do aktualnej gałęzi `main`; w metadanych wykonania należy zapisać konkretne commity i hashe wejść.

| Zasób i dokładna ścieżka | Potwierdzone znaczenie / reuse |
|---|---|
| [`mapy-analizy/izochrony-lodz/index.html`](https://github.com/GISBoost/mapy-analizy/blob/main/izochrony-lodz/index.html) | Dawna „Łódź izochrony” jest przekierowaniem do `../izochrony-transport/`. Nie rozwijać stubu. |
| [`mapy-analizy/izochrony-transport/README.md`](https://github.com/GISBoost/mapy-analizy/blob/main/izochrony-transport/README.md), [`app.js`](https://github.com/GISBoost/mapy-analizy/blob/main/izochrony-transport/app.js), `index.html`, `styles.css`, `i18n.js` | Obecny frontend to **Leaflet + vanilla JS**, bez build stepu. Reuse wzorca hover/pin, panelu, motywu, cache i ochrony przed spóźnionym fetchem. W `app.js`: `fetchOrigin`, `prefetchNeighbors`, `placePin`, `unpin`, `onMapMouseMove`, `onMapClick`. |
| [`easy-R5/tools/isochrones_lodz/README.md`](https://github.com/GISBoost/easy-R5/blob/main/tools/isochrones_lodz/README.md) | Stara strona używa poligonów z `r5r::isochrone()`, a nie macierzy heks→heks. Łódź ma tam **1479 początków 500 m**, nie 5662. Nie kopiować tych danych jako nowego hovera 250 m. |
| [`easy-R5/tools/lodz_hourly_seasons/PROCES.md`](https://github.com/GISBoost/easy-R5/blob/main/tools/lodz_hourly_seasons/PROCES.md), [`config.yaml`](https://github.com/GISBoost/easy-R5/blob/main/tools/lodz_hourly_seasons/config.yaml), [`scripts/ci_hourly.py`](https://github.com/GISBoost/easy-R5/blob/main/tools/lodz_hourly_seasons/scripts/ci_hourly.py) | Źródło ustawień PT i odniesień do siatki/ludności. Wyniki godzinowe to **liczby osiągalnych POI**, nie zachowana pełna macierz O–D do 60 min. |
| [`easy-R5/tools/apartment_finder/inputs/lodz250_hex_origins.csv`](https://github.com/GISBoost/easy-R5/blob/main/tools/apartment_finder/inputs/lodz250_hex_origins.csv), [`config/grid.yaml`](https://github.com/GISBoost/easy-R5/blob/main/tools/apartment_finder/config/grid.yaml), [`scripts/make_grid.py`](https://github.com/GISBoost/easy-R5/blob/main/tools/apartment_finder/scripts/make_grid.py) | Kanoniczne ID i środki 5662 heksów. `ci_matrices.py` wskazuje ten CSV jako `ORIGINS`. Nie generować siatki od nowa. |
| [`easy-R5/tools/apartment_finder/scripts/ci_matrices.py`](https://github.com/GISBoost/easy-R5/blob/main/tools/apartment_finder/scripts/ci_matrices.py), [`scripts/pack_matrix.py`](https://github.com/GISBoost/easy-R5/blob/main/tools/apartment_finder/scripts/pack_matrix.py) | Istniejąca ścieżka macierzy all-to-all, cache budowy sieci, uruchomienie Java i pakowanie `uint8` do NPZ; `255` = nieosiągalne. |
| [`easy-R5/tools/apartment_finder/scripts/export_web.py`](https://github.com/GISBoost/easy-R5/blob/main/tools/apartment_finder/scripts/export_web.py), [`mapy-analizy/gdzie-mieszkac-lodz/app.js`](https://github.com/GISBoost/mapy-analizy/blob/main/gdzie-mieszkac-lodz/app.js) | Gotowy format **HXM1**: nagłówek, tabela offsetów i osobny blok DEFLATE-raw na wiersz/kolumnę; loader HTTP Range + `DecompressionStream`. Wystarczy wariant wierszowy i jeden scenariusz na tryb. |
| [`mapy-analizy/lodz-dostepnosc-godzinowa/app.js`](https://github.com/GISBoost/mapy-analizy/blob/main/lodz-dostepnosc-godzinowa/app.js), `index.html`, `styles.css`, [`easy-R5/tools/lodz_hourly_seasons/scripts/export_web.py`](https://github.com/GISBoost/easy-R5/blob/main/tools/lodz_hourly_seasons/scripts/export_web.py) | Istniejące MapLibre, `promoteId: hex_id`, kolory przez `feature-state`, geometria 5662 heksów i manifest. W nowej stronie użyć wypełnień 2D, bez słupków 3D. |
| [`easy-R5/easy_r5/core/job_spec.py`](https://github.com/GISBoost/easy-R5/blob/main/easy_r5/core/job_spec.py), [`core/pins.py`](https://github.com/GISBoost/easy-R5/blob/main/easy_r5/core/pins.py), [`java/EasyR5Runner.java`](https://github.com/GISBoost/easy-R5/blob/main/easy_r5/java/EasyR5Runner.java) | Używać istniejącego bridge'a. Pin R5 **7.6**, Java 21. `baseTask` ustawia m.in. prędkość, limity, modes, okno, percentyle. Nie wprowadzać r5py ani drugiego silnika tylko do tego zadania. |
| [`easy-R5/tools/apartment_finder/config/car.yaml`](https://github.com/GISBoost/easy-R5/blob/main/tools/apartment_finder/config/car.yaml), [`scripts/car_speeds.py`](https://github.com/GISBoost/easy-R5/blob/main/tools/apartment_finder/scripts/car_speeds.py), [`README.md`](https://github.com/GISBoost/easy-R5/blob/main/tools/apartment_finder/README.md) | Istniejący `car-v1`: korekty prędkości z odcinków autobusowych, pięć dni 28.09–2.10.2026, kopie `data/car/lodz_car_<pora>.osm.pbf`. Reuse tylko jeżeli artefakty są dostępne i świadomie wybierzemy taki wariant. |

### Lokalne wejścia udokumentowane w `PROCES.md` — do sprawdzenia w M0

Wszystkie poniższe ścieżki są względem repo **easy-R5**, nie bieżącego katalogu powłoki:

- `tools/apartment_finder/data/grid.gpkg` i `data/grid.meta.json` — siatka i metadane; kanoniczny CSV wyżej jest w repo.
- `tools/lodzkie_na_mapach_2026/lodzkie_base.gpkg`, warstwa `hex_lodz_all`, pole `pop_total` — ludność GUS NSP 2021. Dopasowanie do ID siatki sprawdzić po centroidzie, jak w analizie godzinowej. Ludność nie uczestniczy w routingu; opcjonalnie daje licznik „mieszkańcy w zasięgu”.
- `tools/lodzkie_na_mapach_2026/work/pbf/lodz.osm.pbf` — udokumentowany wycinek OSM; alternatywnie `tools/apartment_finder/data/raw/lodz.osm.pbf`, ale **nie zakładać identyczności bez SHA-256**.
- `tools/lodz_hourly_seasons/data/gtfs/2026-10-06/lodz_realized_2026-10-06_p50.zip` — oczekiwana lokalizacja feedu dla wybranego dnia; skrypt godzinowy potrafi pozyskać go z istniejących Releases `GISBoost/easy-GTFS-RT`.
- `tools/lodz_hourly_seasons/data/<dzień>.npz` i `data/seasons.npz` — zliczenia POI; nie zastępują macierzy czasów. Wcześniej użytkownik potwierdził posiadanie lokalnych wyników i GPKG, lecz nie należy z tego wnioskować posiadania wszystkich surowych wejść.

**Zasada danych brakujących:** najpierw znaleźć istniejący artefakt/cache. Nie uruchamiać ponownej rekonstrukcji GTFS-RT, tworzenia siatki, dasymetrii ludności ani kalibracji prędkości auta.

## 2. Kontrakt scenariuszy i macierzy

### 2.1 Wspólne zasady

- Wiersz `o` = podróż **z** heksa `o`, kolumna `d` = środek heksa docelowego. Zachować asymetrię PT/CAR; nie transponować przypadkiem macierzy.
- Wszystkie tryby: te same `hex_id`, geometria i zasięg wyświetlania; osobne macierze i właściwe grafy.
- Próg animacji `t = 0…60 min`. Poza zasięgiem lub >60 min: sentinel, nie „60”.
- Na początku liczymy tylko po **jednym scenariuszu na tryb**. Brak suwaka godzin, wielu miesięcy i przełącznika static/RT w MVP.
- Hover pokazuje zasięg do wybranego progu, domyślnie 30 min, z opcją 15/30/45/60. Klik zeruje zegar animacji.
- Czas w manifestach PT zapisywać z `Europe/Warsaw`. **6.10.2026, 07:00–08:00 to CEST (UTC+2)**, mimo że data opracowania dokumentu przypada już na CET. Nie dopisywać do październikowego wyjazdu listopadowego offsetu.

### 2.2 PT — ustawienia rekomendowane

| Ustawienie | Wartość |
|---|---|
| Feed | zrealizowany GTFS P50, **2026-10-06**, jeden dzień z obecnego `config.yaml`; bez ŁKA |
| OSM | ten sam snapshot co wejście do porównywanych grafów, z hashem |
| Początki i cele | kanoniczny CSV 5662 środków heksów użyty po obu stronach |
| Okno odjazdu | **07:00–08:00, 60 min**, jak pojedynczy przebieg godzinowy |
| Percentyl routingu | **50**, po minutach odjazdu/iteracjach R5 |
| Direct/access/egress | WALK; prędkość **3,6 km/h** |
| Maks. podróż i maks. chód | **60 / 60 min**, jawne rozszerzenie dotychczasowego 30 / 30 |
| `max_rides` | **8**, z `scenarios.yaml`, nie dosłownie nieskończoność |
| Monte Carlo | **5 na minutę** zgodnie z bridge'em: `monte_carlo_draws=5`; Java przelicza to na całkowitą liczbę losowań w oknie |
| Tryby PT | odziedziczyć `ci_matrices.TRANSIT_MODES`; o faktycznej ofercie decyduje pojedynczy miejski feed bez feedu ŁKA |

**Dlaczego potrzebne jest nowe obliczenie:** analiza godzinowa liczyła środek heksa→POI do 30 min, następnie zliczała miejsca i usuwała CSV. Z tego nie odtworzymy heks→heks do 60 min. Istniejące macierze `apartment_finder` wolno wykorzystać tylko po zgodności dnia/feedu, okna, limitów, OSM, prędkości i ID. Agregat z pięciu dni lub 07:00–09:00 nie jest tym samym scenariuszem.

**Dwa różne P50:** P50 w nazwie feedu to percentyl rekonstrukcji opóźnień; P50 R5 to percentyl czasów podróży po odjazdach w oknie. Żadne z nich nie jest „kolejnością operacji algorytmu”. Nie agregować jeszcze po trzech dniach miesiąca.

Normalny R5 nadal wykorzystuje RAPTOR do transportu publicznego, ale **RAPTOR działa rundami po trasach i przystankach, nie odwiedza kolejnych ulic**. W tym projekcie nie trzeba eksportować stanu RAPTOR-a. Odczyt `FastRaptorWorker`/`TravelTimeComputer` podczas rozpoznania nie rodzi wymagania ich modyfikacji.

### 2.3 WALK — niezależna macierz referencyjna i graf

- R5 bez tranzytu: `direct_modes=["WALK"]`, `transit_modes=[]`, `walk_speed_kmh=3.6`, maksymalny czas podróży 60 min.
- Okno i percentyl nie zmieniają statycznego wyniku; dla spójnego pipeline'u można zostawić te same pola czasu i `[50]`.
- Graf wyłącznie z krawędzi dopuszczających WALK. Nie przenosić samochodowego `oneway` na chodzenie bez sprawdzenia uprawnień pieszych w R5.
- Wagi czasowe z długości i prędkości **według reguł R5**, z uwzględnieniem jego zaokrągleń i ewentualnych kar. Nie przeliczać po cichu na popularne 4,8–5 km/h.
- Macierz służy hoverowi i walidacji. Ulice po kliknięciu wynikają z Dijkstry, nie z interpolacji wartości heksów.

### 2.4 CAR — niezależna macierz referencyjna i graf

**Wariant domyślny: statyczne prędkości z grafu R5 z bazowego OSM.**

- `direct_modes=["CAR"]`, `transit_modes=[]`, maksymalna podróż 60 min. Nie włączać `CAR_PARK`, P+R ani access/egress do PT.
- Odczytać z grafu rzeczywiste prędkości krawędzi po imporcie, uprawnienia, kierunki oraz koszty/zakazy skrętu. `R5Runner.baseTask` ustawia `maxCarTime=maxTrip`, lecz nie narzuca wszystkim drogom jednej prędkości jazdy.
- `maxspeed` nie jest zawsze realną prędkością przejazdu, a brak tagu nie oznacza braku drogi. Unikać osobnej implementacji domyślnych prędkości, skoro graf R5 zawiera wynik importu.
- Przypięcie środka heksa do grafu musi odwzorować reguły R5. W kodzie `StreetRouter.setOrigin` odcinek poza ulicą jest liczony z prędkością chodu także przy CAR. To nie jest koszt parkowania. W legendzie: „punkt reprezentuje środek heksa; modelowe dojście do sieci”.
- Zakres interpretacji: **modelowy czas jazdy i dojścia do sieci, bez szukania parkingu, bez aktualnych korków**. Nie tytułować tego „rzeczywisty dojazd autem”.

**Opcja po MVP:** użyć istniejącego `data/car/lodz_car_<pora>.osm.pbf` (`car-v1`), jednocześnie dla macierzy R5 i eksportu grafu. Jest to estymacja prędkości oparta na odcinkach autobusowych, nie pomiar wszystkich samochodów; `car.yaml` opisuje założenia i fallbacki. Nie wolno zestawić macierzy z poprawionego OSM z animacją z bazowego OSM. Nie tworzyć nowego `car_speeds.py` ani projektu korkowego.

## 3. Pozyskanie grafów — minimum nowego kodu

### 3.1 Preferowane źródło topologii

**Eksport pieszej i samochodowej warstwy ulic z tej samej sieci R5**, której używa macierz. OSM jest źródłem danych, R5 już rozstrzyga wiele uprawnień, kierunków i prędkości. Minimalne rozszerzenie istniejącego bridge'a o eksport danych jest lepsze od budowania drugiej topologii OSMnx i późniejszego wyjaśniania rozbieżności.

Nie ma w sprawdzonych plikach gotowego eksportera CSR całego grafu na potrzeby tej animacji. **To element do wykonania, nie istniejąca komenda.** W M0 sprawdzić, czy repo ma nowszy odpowiednik. Jeśli nie, dodać małą ścieżkę eksportu wykorzystującą istniejący runner, bez forka R5 i zmiany wersji silnika.

Kontrakt eksportu:

- `nodes`: współrzędne, stabilne lokalne ID;
- skierowane łuki: `from`, `to`, koszt, identyfikator geometrii i odwołanie do oryginalnej krawędzi R5;
- WALK: uprawnienia i koszt w sekundach; CAR: kierunkowe prędkości, koszt jazdy, tabela kar/zakazów skrętów i ograniczeń wielokrawędziowych;
- `origin_links` i `destination_links` dla 5662 środków: punkt przecięcia z krawędzią, dozwolone kierunki, częściowe koszty i koszt odcinka poza siecią; nie tylko „najbliższy węzeł”;
- geometria polilinii oddzielnie od grafu obliczeniowego;
- metadane: hashe OSM/GTFS/sieci, wersja R5, jednostki, zasięg routingu i zasięg rysowania, konfiguracja modelu.

Długości liczyć w metrach, np. EPSG:2180, nie stopniach. Geometrię dla mapy eksportować w EPSG:4326. Wagi do liczenia mogą pozostać `float32`/liczbami JS; kwantyzować dopiero wyniki, a nie systematycznie zaokrąglać każde 5 m do pełnej sekundy.

### 3.2 Zasięg i uproszczenia

- Reuse istniejącego wycinka OSM: udokumentowany bbox **19.1672, 51.6035–19.7404, 51.9155**. To domena obliczeń, nie obietnica pełnej izochrony samochodowej 60 min poza Łodzią.
- Cele i render pozostają w siatce miasta; **nie odcinać grafu do granicy administracyjnej**, bo najszybsza trasa między dwoma heksami może wyjść z miasta i wrócić.
- Dla CAR 60 min może wykraczać poza istniejący wycinek. W M0 sprawdzić trasy przy obrzeżach; jeśli potrzebne, wykorzystać istniejący szerszy PBF lub dotychczasowy sposób wycięcia większego obszaru. Rozszerzenie oznacza ponowną inwentaryzację pamięci i czasu.
- Zgodność z macierzą na identycznie uciętym grafie **nie dowodzi**, że ucięcie nie zaburza prawdziwych tras. W raporcie zaznaczyć to osobno; porównać próbkę z szerszym grafem, gdy jest dostępny.
- Najpierw uprościć **wyłącznie geometrię renderowaną**, np. 1–3 m po projekcji. Nigdy nie łączyć ulic tylko dlatego, że przecinają się na ekranie — most i tunel nie tworzą skrzyżowania.
- Opcjonalne zwijanie węzłów stopnia 2 dopiero po testach, z zachowaniem sum kosztów, kierunków, łączników heksów i węzłów/stanów ograniczeń skrętu. Nie jest warunkiem MVP.

## 4. Co dokładnie liczymy i animujemy

### 4.1 PT: próg macierzy, bez Dijkstry ulicznej

Dla przypiętego heksa `o` odczytaj wiersz `M_PT[o, :]`. W chwili `t` pokaż cele spełniające `M_PT[o,d] <= t`. Dane minutowe dają schodki co minutę; przejście alfa między klatkami jest wyłącznie efektem wizualnym.

Podpis: **„Miejsca osiągalne w t minut; mediana czasu podróży dla odjazdów 07:00–08:00”.** Nie używać podpisu „o 07:17 autobus dotarł tutaj”. Różne cele mogą mieć korzystne połączenia przy różnych minutach wyjazdu. Nie rysować z tych heksów jednej fikcyjnej trasy.

Każdy heks reprezentuje czas do jego **środka**, nie gwarancję osiągalności każdego punktu poligonu. Może być osiągalny obszar odłączony wizualnie od początkowego heksa — to normalne w PT, nie błąd konturu.

### 4.2 WALK: Dijkstra z kopcem binarnym

1. Przyłącz origin do właściwych fragmentów krawędzi z prawidłowymi kosztami początkowymi.
2. Ustaw odległości/czasy, dodaj do kopca dopuszczalne stany startowe.
3. Zdejmuj minimum; odrzuć przestarzałe wpisy, utrwal najlepszy stan i relaksuj dozwolone przejścia.
4. Zakończ, gdy minimum >3600 s. Niezwiązane składowe pozostają nieosiągalne.
5. Zapisz czasy osiągnięcia węzłów oraz wejścia i przejścia skierowanych krawędzi.

**„Odwiedzone” = trwale ustalony najkrótszy czas, nie samo dodanie do kopca.** Zdarzenia relaksacji mogą być później poprawione i nie wolno ich przedstawiać jako finalnych czasów dojazdu. Powiązanie z czasem podróży jest ważniejsze od kolejności rysowania struktur danych; remisy można obsłużyć stabilnym ID.

### 4.3 CAR: Dijkstra na stanach, nie naiwnie na samych skrzyżowaniach

R5 `StreetRouter` przechowuje stany związane z krawędziami, ponieważ przy skrętach nie wystarcza pojedynczy najlepszy czas na węźle. Stan powinien rozróżniać co najmniej **krawędź wjazdową**, a przy ograniczeniach `via-way` także postęp ograniczenia. Wagi przejść pozostają nieujemne, więc nadal jest to Dijkstra.

Przejście z łuku `a` do `b` jest dozwolone tylko przy zgodnych kierunkach, uprawnieniach i zakazach. Koszt to `turn_cost(a,b) + travel_time(b)`. Reguły i zaokrąglenia odwzorować z przypiętej wersji R5, nie z uniwersalnej tabeli napisanej z pamięci.

**Nie akceptujemy** jako pełnej zgodności CAR wersji „długość / maxspeed” z jedną etykietą na węzeł. Nawet poprawne `oneway` nie chroni przed niedozwolonym lewoskrętem lub zawracaniem. Jeśli przeniesienie semantyki skrętów do JS przekracza budżet, MVP używa wyników rzeczywistego wyszukiwania `StreetRouter` offline; pełny CAR w przeglądarce jest osobnym kamieniem milowym.

Źródło do weryfikacji: [`conveyal/r5`, v7.6, `streets/StreetRouter.java`](https://github.com/conveyal/r5/blob/v7.6/src/main/java/com/conveyal/r5/streets/StreetRouter.java), szczególnie opis stanów, `setOrigin`, `getState(Split)` i obsługa skrętów. Należy korzystać z klasy i jej kosztów, a nie kopiować cały silnik.

### 4.4 „Zalewanie” fragmentu ulicy

Dla skierowanej krawędzi o czasie wejścia `a` i koszcie przejścia `w` postęp w chwili `t` wynosi `clamp((t-a)/w, 0, 1)`. Przy CAR do `a` wchodzi kara dopuszczalnego skrętu. Węzeł nie oznacza automatycznie, że wszystkie przyległe ulice już przejechano.

- **MVP:** cała krótka krawędź zapala się po jej osiągnięciu; jawnie rozróżnić „wejście” i „całkowite przebycie”. Używać czasu całkowitego przebycia do jednolitego kolorowania pełnych odcinków, żeby nie sugerować osiągnięcia końca wcześniej.
- **Docelowo:** częściowe wypełnienie wzdłuż geometrii; dla WALK dwie przeciwne fale mogą spotkać się na jednej ulicy. Dla CAR zachować kierunki, a na mapie w razie potrzeby scalać wyłącznie wygląd pokrywających się łuków.
- Jeśli krawędź zawiera origin/łącznik celu, uwzględnić punkt podziału — nie czekać na obejście od końca ulicy.
- „Pierwsze wejście” i „całkowite pokrycie” fizycznego odcinka mogą pochodzić z różnych kierunków. Nie tworzyć jednego czasu `min(T(u),T(v))+w`, który przy kierunkowości może być nielegalny.

Animacja to **pole najkrótszych czasów od jednego początku**, a nie symulacja jednej osoby/samochodu jednocześnie jadącego wszystkimi ulicami. Obliczenia kończą się przed odtwarzaniem; zegar animacji nie odmierza czasu pracy CPU.

## 5. Ile danych i czy przeglądarka wystarczy

Poniższe liczby to **rachunek rozmiaru i hipotezy do benchmarku, nie pomiary grafu Łodzi**. MB oznacza tutaj 10⁶ bajtów.

### 5.1 Macierze 5662 × 5662

`N² = 32 058 244` komórki.

| Reprezentacja | Jeden tryb | Trzy tryby |
|---|---:|---:|
| `uint8`, minuty, `255` = poza zakresem | **32,06 MB** | **96,17 MB** |
| `uint16`, sekundy, `65535` = poza zakresem | 64,12 MB | 192,35 MB |
| `float32` | 128,23 MB | 384,70 MB |

Rekomendacja: **hover/PT = uint8, skala 1 minuta**, cap 60; sekundowe wyniki prób walidacyjnych i grafowe lokalnie. Nie udawać sekundowej dokładności przez przemnożenie macierzy minutowej przez 60. Używać reguły konwersji zgodnej z R5/istniejącym packerem; opisać możliwy błąd progu do około minuty.

Wiersz to **5662 B**, czyli 5,66 KB bez kompresji. HXM1 dodaje na plik `16 + 4*(N+1) = 22 668 B` nagłówka/offsetów i skompresowane wiersze. Reuse `write_hxm` + loadera; nie są potrzebne kolumny `.c.bin`, bo pytamy tylko „dokąd stąd?”. Wersję bazowo-delta z mieszkaniówki można wyłączyć, nie jest wymogiem trzech samodzielnych macierzy.

- Zmierzyć `Range`/206, CORS i cache na rzeczywistym hostingu. Odpowiedź 200 zamiast 206 w istniejącym loaderze pobiera **cały plik** — nie powtarzać jej na każdym hoverze.
- Fallback: cache całej raz pobranej macierzy albo paczki np. po 64 wiersze: około 0,36 MB surowo, **89 paczek/tryb**. Nie tworzyć 17 tys. drobnych plików, jeśli gotowy format działa.
- Po potwierdzeniu budżetu można dogrzać cały aktywny tryb (32 MB), ale nie blokować startu transferem wszystkich trzech. Na telefonie preferować wiersze/paczki.
- „Natychmiast” znaczy lokalny odczyt ciepłego cache. Pierwsze wejście w niepobrany wiersz zawsze zależy od sieci: pokazać loading, nie obiecywać zerowej latencji.

### 5.2 Grafy: widełki planistyczne i pamięć

Dla istniejącego wycinka miejskiego przyjąć do wstępnego budżetu:

| Graf | Węzły | Skierowane łuki | Uwagi |
|---|---:|---:|---|
| WALK | 50–120 tys. | 120–300 tys. | Ścieżki, przejścia i pełna geometria zwiększają rozmiar. |
| CAR | 25–70 tys. | 60–180 tys. | Dijkstra stanowy wymaga więcej etykiet niż liczba skrzyżowań. |

Nie prezentować tych widełek jako zinwentaryzowanych statystyk. Eksporter ma raportować rzeczywiste `V`, `E`, liczbę punktów geometrii, restrykcji i stanów oraz rozmiary surowe/skompresowane.

Przykład CSR: 100 tys. węzłów i 250 tys. łuków; `offset u32[V+1]` ≈0,4 MB, `to u32[E]` ≈1 MB, `cost f32[E]` ≈1 MB, `edge_id u32[E]` ≈1 MB, współrzędne węzłów ≈0,8 MB. Sam rdzeń około **4,2 MB**, przed geometrią, łącznikami i pamięcią roboczą. Dwa grafy + polilinie + restrykcje: orientacyjnie **15–50 MB danych binarnych** przed kompresją. Geometria i struktury obiektowe potrafią zdominować CSR.

Cel roboczy całej strony: desktop <200 MB, telefon <120 MB; to kryteria projektowe do pomiaru, nie gwarancje. Nie wczytywać masowego GeoJSON na nowo przy każdym kliknięciu, nie tworzyć osobnego obiektu JS na każdą relaksację. Przy szerszym obszarze CAR budżet może być znacznie większy.

### 5.3 JS Dijkstra czy precompute?

- WALK: typed arrays + kopiec binarny w **Web Workerze**; złożoność `O((V+E) log V)`. Przy tej skali sensowny kandydat do liczenia po kliknięciu.
- CAR: analogicznie, ale na stanach skrętowych. Nie wnioskować o jego wydajności z benchmarku uproszczonego grafu bez zakazów.
- Cele testu: po załadowaniu grafu p95 WALK <300 ms desktop / <1 s telefon; CAR <800 ms desktop / <2 s telefon. **To progi odbioru, nie wyniki pomiarów.** Worker pozwala zachować płynność UI nawet podczas dłuższego biegu; pokazać postęp/stan przygotowania.
- Benchmark: 30 różnych originów, 5 powtórzeń po rozgrzaniu, desktop i telefon, rozdzielić download, dekodowanie, obliczenia i rendering. Raportować medianę/p95, pamięć, liczbę odwiedzonych stanów.
- Nie uruchamiać Dijkstry na hover. Klik anuluje/ignoruje poprzedni wynik; cache LRU dla np. ostatnich 10–20 par `(mode, origin)`.

**Dlaczego nie precompute ulic dla wszystkich:** przy `E_WALK=250k`, `E_CAR=150k`, jedna tablica `uint16` na origin to około **4,53 GB** dla obu trybów łącznie; dwa czasy wejście/koniec to około **9,06 GB** przed kompresją. Stałe per-origin wyniki ulic są gorsze niż małe macierze hover + graf do obliczeń.

Fallback bez nowej infrastruktury: precompute tylko **2–3 originy pokazowe** offline, wszystkie trzy tryby w UI; pozostałe heksy mają normalny hover, lecz klik dla ulic wyraźnie informuje o ograniczeniu do originów pokazowych. To **MVP demonstracyjne, nie pełna realizacja dowolnego kliknięcia**. Nie ukrywać ograniczenia i nie budować serwera routingu tylko po to, by zdążyć na challenge.

Po zmianie zakresu nie ma tabeli heks→przystanek. Jej rozmiar wynosi w tym projekcie **zero — nie jest potrzebna**.

## 6. Architektura strony i stany interakcji

### 6.1 Minimalna struktura docelowa

**Nowe proponowane ścieżki**, nie istniejące pliki:

```text
mapy-analizy/animacja-dijkstra-lodz/
  index.html, styles.css, app.js
  routing-worker.js              # WALK/CAR; żadnego RAPTOR-a w JS
  data/manifest.json
  data/hex.geojson                # reuse geometrii 5662 heksów
  data/m/{pt,walk,car}.r.bin       # istniejący HXM1, 1-min jednostki
  data/graph/{walk,car}.*.bin      # topologia/koszty/linki, osobno geometria
  data/showcase/...               # tylko mała paczka MVP, jeżeli potrzebna
```

Obliczenia i skrypty eksportu proponujemy w `easy-R5/tools/animacja_dijkstra_lodz/`, z importem istniejących helperów. To mały katalog analizy, nie biblioteka routingu ani nowa wtyczka QGIS.

Manifest: wersja metody, `n_hex`, hashe ID/siatki, scenariusze, units/sentinel/scale, `routing_bbox`, `render_bbox`, źródła i wersje danych, parametry PT/WALK/CAR, model skrętów, opcjonalny `car_version`, lista showcase originów, ograniczenia, rozmiary plików i daty wykonania. Nigdy nie ładować „podobnego” grafu przy braku hasha.

### 6.2 Renderer — jedna biblioteka, nie stos dla samego stosu

**Rekomendacja:** MapLibre z istniejącej strony godzinowej; przenieść wzorzec interakcji z Leaflet, nie oba silniki naraz. Heksy: warstwa 2D `fill`, stałe `hex_id`; PT zmienia tylko stan/kolor. Ulice: stała geometria z `edge_id`, aktualizacje wyłącznie odcinków przekraczających próg.

Na początek krótkie segmenty + `feature-state`, aktualizacje porcjami 10–20 razy/s; podkład i licznik mogą rysować się osobno. Nie wykonywać 200 tys. `setFeatureState` co klatkę i nie generować całego GeoJSON 60 razy/s. Cofnięcie suwaka obsługiwać indeksem posortowanych zdarzeń; twardy skok może przeliczyć widoczny zbiór jednorazowo.

Jeżeli profilowanie wykaże, że takie porcjowanie nie spełnia celu, dopiero wtedy rozważyć pojedynczą warstwę GPU (np. deck.gl) z buforami czasów i globalnym progiem. **Nie dodawać deck.gl, frameworka aplikacyjnego ani bundlera w MVP bez wyniku benchmarku.** Częściowe wypełnienie długich polilinii jest ulepszeniem, nie warunkiem pierwszego filmu.

### 6.3 Stan aplikacji

`mode`, `hoverOrigin`, `pinnedOrigin`, `requestId`, `playState`, `timeSec`, `speed`, `previewCutoff`, `scenarioVersion`.

| Zdarzenie | Zachowanie |
|---|---|
| Hover bez przypięcia | Test rzeczywistego heksa pod kursorem; odczyt wiersza aktywnego trybu, pokazanie izochrony do `previewCutoff`; żadnego automatycznego startu animacji. |
| Klik heksa | Ustaw pin, zablokuj hover, załaduj wiersz; PT gotowe z macierzy, WALK/CAR worker; po gotowości start od t=0. |
| Ruch kursora po przypięciu | Nie zmienia początku ani nie restartuje odtwarzania. |
| Klik innego heksa | Nowy origin, reset zegara, nowy `requestId`; stary wynik nie może nadpisać nowego. |
| Zmiana PT/WALK/CAR | Zachowaj przypięty origin, zatrzymaj/resetuj do 0 i rozpocznij po przygotowaniu danych nowego trybu. Jawne odświeżenie legendy i opisu modelu. Bez pinu zachowaj tylko podgląd. |
| Odpięcie / Escape | Przerwij odtwarzanie, wróć do hover; wyczyść uliczną falę. |
| Klik poza siatką | Brak nowego originu. Nie snapować arbitralnie dalekich punktów do miasta. |
| Błąd sieci / nieprzyłączony origin | Czytelny komunikat, brak fałszywej pustej dostępności; opcja ponowienia odczytu. |

Hover throttle około 50 ms i prefetch 6 sąsiadów, jak w obecnej stronie; cel ciepłego podglądu <50 ms. Zachować ostatni poprawny obraz podczas oczekiwania, lecz zaznaczyć, którego originu dotyczy. Na dotykowym ekranie tap = pin, dostępny przycisk odpięcia; bez wymagania hovera. Obsłużyć `prefers-reduced-motion` i obsługę klawiaturą.

### 6.4 Kontrolki i legenda

- **PT | Pieszo | Samochód**, zawsze widoczne; ikona i tekst, nie sam kolor.
- Play/Pause, od początku, prędkość **0,5× / 1× / 2× / 4×**.
- Suwak **0–60 min**, krok 1 min dla PT; dla ulic możliwe sekundy. Scrub zatrzymuje, wznowienie przyciskiem.
- Umowne 1×: 60 minut podróży w **30 s filmu/animacji**. Inna skala czasu odtwarzania ma czytelną etykietę; nie jest to 1 s życia =1 s filmu.
- Domyślny próg hovera 30 min i 15/30/45/60. W CAR większość miasta może pojawić się znacznie wcześniej niż po godzinie; nie rozciągać jego czasów do 60 min „dla dramaturgii”.
- Kolory: PT fiolet/niebieski na heksach, WALK turkus na ulicach, CAR bursztyn na ulicach; jasność/obwódka oznacza front fali, z osobną legendą minut 0/15/30/45/60. Nie wracać do nieaktualnego podziału „walk vs po transit”.
- Pasek: origin, tryb, t, opis scenariusza; w PT data i okno P50, w CAR model prędkości i brak parkowania. Opcjonalnie ludność w zasięgu heksów; nie dodawać tej statystyki bez poprawnego joinu i definicji.
- W WALK/CAR można pokazać dyskretną izochronę heksową jako kontekst, ale ulice są głównym wynikiem animacji. Jeżeli licznik używa macierzy, a ulice Dijkstry, ujawnić rozdzielczość i sprawdzić zgodność.

## 7. MVP offline i eksport GIF/MP4

### 7.1 Najpierw jeden origin

Wybrać **istniejący `hex_id`** w centrum w pobliżu Piotrkowskiej/Centrum. Nie wpisywać wymyślonego numeru w kodzie. Sprawdzić, czy ten sam środek ma legalne przyłączenie do grafu WALK i CAR; różna ulica przyłączenia nie jest automatycznie błędem.

1. Dla PT obliczyć jeden wiersz macierzy do 5662 celów, w dokładnie docelowym scenariuszu.
2. WALK: jeden Dijkstra na grafie i eksport czasów.
3. CAR: na początku **istniejący R5 `StreetRouter` bez heurystyki celu** jako wyszukiwanie one-to-many, z jego stanami/kosztami; eksportować finalne czasy, nie błędne przejściowe relaksacje. Jeśli potrzeba, mały adapter do istniejącej klasy, nie nowy silnik Java.
4. Python rysuje trzy osobne przebiegi na jednym stałym podkładzie, stały kadr i skalę, t=0…60 min. Matplotlib + `LineCollection`/`PolyCollection` wystarczą; brak potrzeby QGIS pluginu lub MoviePy.
5. Z walidacją i podpisem powstaje samodzielny post, nawet bez wersji interaktywnej.

### 7.2 Dwa–trzy originy pokazowe

Rekomendowane typy miejsc: **centrum**, osiedle mieszkaniowe np. Retkinia, obrzeże np. okolice Nowosolnej. To propozycje lokalizacji do wyboru, nie potwierdzone ID i nie zapowiedź konkretnych wyników. Używać tego samego heksa w trzech trybach; nie wybierać osobno korzystniejszego miejsca dla auta.

Każdy origin: film przełączający trzy tryby lub trzy panele z tym samym zegarem. W podpisie oddzielić statystyczną izochronę PT od statycznych najkrótszych czasów WALK/CAR. Nie twierdzić, że porównanie jest oceną komfortu, kosztu lub pełnej podróży od drzwi do drzwi.

### 7.3 Technika eksportu

- **MP4:** 1920×1080 lub 1080×1080, 30 fps, 20–30 s, H.264, `yuv420p`, `faststart`, bez audio. Render klatek deterministyczny z `t = frame/fps * scale`, nie nagranie nierównego ekranu.
- **GIF:** 800–1000 px, 10–15 fps, krótszy fragment; generacja palety przez FFmpeg. MP4 jest podstawowym formatem, GIF dodatkiem ze względu na rozmiar.
- Przykładowe komendy, po wygenerowaniu klatek:

```bash
ffmpeg -framerate 30 -i frames/%05d.png -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart showcase.mp4
ffmpeg -i showcase.mp4 -vf "fps=12,scale=900:-1:flags=lanczos,palettegen" palette.png
ffmpeg -i showcase.mp4 -i palette.png -lavfi "fps=12,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse" showcase.gif
```

Stała atrybucja OSM/GTFS, data/feed, model prędkości, opis P50 i logo GISBoost; ostatnia klatka może zawierać adres analizy. Nie pobierać masowo rastrów z publicznego serwera OSM do tysięcy klatek; użyć istniejącego lokalnego podkładu/wektorów i zachować licencje. Eksport z przeglądarki/MediaRecorder jest opcją późniejszą, nie wymaganiem MVP. Nie wykonywać publikacji jako części implementacji bez osobnego zlecenia.

## 8. Walidacja i kryteria odbioru

### 8.1 Wspólne kontrole danych

- Dokładnie 5662 ID, bez duplikatów i przesunięcia kolejności; hashe wejść zgodne w grafach, macierzach i geometrii.
- Brak ujemnych kosztów/NaN, jednostki jawne; uprawnienia i kierunki zachowane.
- Dla PT sprawdzić aktywny `service_id` w dniu analizy, liczbę kursów i guard przed cichym wynikiem walk-only, tak jak `ci_hourly.py`.
- Sentinel pozostaje sentinelem po kompresji/dekodowaniu. Diagonalę i przypadki nieprzyłączone testować oddzielnie, nie sztucznie wpisywać 0 dla niedostępnego punktu.
- `reachable(t1)` jest podzbiorem `reachable(t2)` dla `t1<t2`. Pauza, cofanie i zmiana originu nie zostawiają starych krawędzi.

### 8.2 WALK/CAR przeciw macierzom R5

Próbka: **30 początków** rozłożonych po mieście i 200 celów/początek; do tego wszystkie cele dla trzech showcase originów. Włączyć centrum, peryferia, park, most/tunel, rondo, odcinki jednokierunkowe i miejsca po przeciwnych stronach dużej arterii.

Obliczyć czasy do środków heksów z Dijkstry przez **te same linki docelowe i części krawędzi co R5**, nie przez najbliższą ulicę ani średnią czasu ulic w heksie. CAR musi respektować legalność ostatniego skrętu na krawędź docelową. Porównać z osobnymi `M_WALK` oraz `M_CAR`, nigdy z PT.

Dwa poziomy tolerancji:

1. **Sekundowy test modelu**, przed pakowaniem: cel p95 błędu bezwzględnego ≤5 s WALK, ≤10 s CAR przy tej samej sieci i semantyce. Jeżeli dostępna referencja R5 ma tylko minuty, uzyskać sekundowe wyniki dla próbki przez `StreetRouter`; nie przypisywać dokładności sekundowej całej macierzy minutowej.
2. **Macierz użytkowa `uint8`**: docelowo co najmniej 95% poprawnie przyłączonych par z błędem ≤1 min; osobno raport p50/p95/max, liczbę różnic osiągalny/nieosiągalny i zgodność progów 15/30/45/60. Granice w pasie ±1 min oceniać oddzielnie z powodu kwantyzacji.

To proponowane kryteria projektowe, nie uzyskane wyniki. Nie wolno traktować 95% jako zgody na 5% **nielegalnych tras**: wszystkie znalezione naruszenia jednokierunkowości, uprawnień i zakazów skrętu blokują odbiór CAR. Systematyczny błąd wymaga poprawki, nie zwiększenia tolerancji do 5 minut. Jeśli JS nie przechodzi testów, pozostać przy zweryfikowanym offline MVP i ograniczeniu showcase.

Mikrotesty grafowe: rozgałęzienie i remisy, wyspa, origin na środku krawędzi, odwrotny `oneway`, dozwolony kierunek pieszy na ulicy jednokierunkowej dla aut, zakaz skrętu, ograniczenie `via-way`, tańszy dojazd do węzła prowadzący do droższego skrętu, różne prędkości kierunkowe. Dla małego grafu porównać z referencją brute-force/niezależnym najkrótszym przejściem.

### 8.3 PT i zgodność interfejsu

- PT renderować **bezpośrednio z tego samego wiersza**, więc test progu to zgodność 100% identyfikatorów heksów przy danej konwencji minut.
- Sprawdzić ręcznie 3 originy × 4 progi i dekodowanie losowych komórek względem CSV/NPZ R5.
- Nie wymagać zgodności PT z ulicami Dijkstry: to osobne tryby i modele. Nie walidować PT poprzez „czas do najbliższej ulicy”.
- Test race condition: szybki hover A→B→C, klik C, zmiana na CAR zanim skończy się WALK; na ekranie może pozostać wyłącznie aktualny tryb/origin.
- Benchmark i testy mobilne z sekcji 5 to warunek pełnego interaktywnego wydania, nie filmu offline.

## 9. Ryzyka i świadome uproszczenia

| Ryzyko | Co robimy |
|---|---|
| CAR: skręty, restrykcje z via-way, stan krawędziowy | Najpierw referencja R5 offline i mikrotesty. Nie implementować vertex-only i nie nazywać tego zgodnym modelem. Osobny budżet pełnego worker-a CAR. |
| Inne snapowanie początku/celu | Eksport linków R5 i podział krawędzi; żadnego arbitralnego najbliższego węzła. |
| CAR: prędkość, korki i parking | Domyślnie model statyczny z grafu; jasno bez real-time i parkowania. Opcjonalny istniejący car-v1 z osobnymi metadanymi i macierzą. |
| Zbyt mały wycinek sieci | Routing poza granicą miasta dozwolony; ujawnić bbox, osobna kontrola wrażliwości na większy obszar. |
| PT: oczekiwanie i godzina odjazdu | Pozostają w R5; P50 godzinowego okna to rozkład czasów, nie spójny przebieg pojedynczego kursu. Suwak t nie jest godziną zegarową. |
| PT: dotychczasowe limity 30 min | Przeliczyć 60/60. Nie odzyskiwać zasięgu godzinnego ze zliczeń POI ani z istniejącego capu 30. |
| Chód | W całym porównywanym pipeline 3,6 km/h i identyczne zasady kosztów. Uproszczenie bez różnic tempa między osobami i bez dostępności dla wszystkich potrzeb ruchowych. |
| Różnica dat | PT z jednego dnia, bazowy CAR/WALK statyczny; nie interpretować różnicy jako pomiaru wpływu opóźnień lub przyczynowego efektu wyboru środka transportu. |
| Render i pamięć | Najpierw porcjowane aktualizacje istniejącego MapLibre; nowa warstwa GPU dopiero po profilowaniu. Graf ładowany leniwie per tryb. |
| Hosting i Range | Przetestować 206/CORS; cache odpowiedzi 200 lub paczki. Nie liczyć „instant” z zimnego HTTP. |
| Nowe narzędzie zamiast analizy | Reuse bridge'a, HXM1, siatki, komponentów i FFmpeg. Bez serwera, nowego frameworka i pełnej symulacji ruchu. |

## 10. Kamienie milowe, godziny i realny termin

Godziny to **praca własna**, niezależnie od asysty Claude Code; długie obliczenia/transfery są dodatkowym czasem kalendarzowym. Nie sumować tego bezpośrednio z innymi projektami, jeśli budżet 5–10 h/tydzień jest wspólny.

| Etap | Zakres i bramka wyjścia | Praca |
|---|---|---:|
| **M0 — inwentaryzacja i mini-proba** | Odnalezienie lokalnych wejść, hashe/ID, wybór bazowego CAR, zasięg grafu, 1 wiersz PT, sprawdzenie dostępności eksportu stanów R5. STOP przy brakujących danych, bez odbudowy innych pipeline'ów. | **3–4 h** |
| **M1 — jeden origin, dane i walidacja** | Graf/adapter eksportu z istniejącego R5, WALK Dijkstra, CAR wyszukiwanie offline R5, linki i pierwsze porównania. PT wyłącznie macierz. | **5–7 h** |
| **M2 — offline post / film** | Python, render trzech osobnych trybów, podpisy i MP4/GIF; pierwszy origin, do 2–3 showcase jeśli koszt marginalny. Wynik publikowalny bez strony. | **4–7 h** |
| **M3 — pełne dane hover** | Trzy zgodne macierze all-to-all lub reuse potwierdzonych, eksport HXM1 z 1-min skalą, benchmark 10/100 originów przed pełnym przebiegiem, raport objętości. | **4–6 h** |
| **M4 — wspólny UI** | MapLibre + wzorzec hover/pin, PT animacja, przełączniki i sterowanie, odtwarzanie showcase dla ulic. | **6–9 h** |
| **M5 — dowolny origin WALK/CAR** | Workery, kopiec/typed arrays, stanowy CAR z kosztami/zakazami, cache, benchmark, brak liczenia na hover. To największa część ryzyka. | **12–20 h** |
| **M6 — odbiór i przygotowanie wydania** | Pełna próbka walidacji, mobilne UX, hosting/Range, licencje i opis, finalne 2–3 filmy. Przygotowanie plików, bez automatycznej publikacji. | **6–9 h** |

- **MVP offline M0–M2: 12–18 h bazowo; około 14–22 h z 20% rezerwy.**
- **Pełna wersja M0–M6: 40–62 h bazowo; około 48–75 h z 20% rezerwy.** MVP jest częścią tej sumy, nie dodatkiem.
- Przy 5–10 h/tydzień: całość orientacyjnie **5–15 tygodni**; granice wynikają z 48/10 i 75/5, nie są obietnicą daty.
- Do 24.11 od daty tej specyfikacji jest 17 dni, czyli około **12–24 h** przy tej dostępności i bez innych zadań. **Realny cel challenge: jeden zweryfikowany film offline**, nie pełne trzytrybowe narzędzie dla dowolnego heksa. Przy dolnym budżecie nawet MVP nie jest pewne.
- Jeśli M0/M1 ujawni problem ze stanami CAR lub wejściami, nie przeciągać do terminu: przygotować wpis Network z istniejącego schematu sieci z wcześniejszego planu, a animację dokończyć później. Nie zmieniać ponownie zakresu na hybrydę walk+RAPTOR+egress.
- Ten projekt nie mieści się „gratis” obok B7/B4/A2+B12 w istniejącym budżecie do końca stycznia. Decyzja o przesunięciu kolejności prac wymaga osobnego uzgodnienia; dokument niczego sam nie rezerwuje ani nie planuje w kalendarzu.

### Definition of Done

**MVP:** jedna siatka i origin, trzy oddzielne tryby, PT z poprawnego scenariusza, legalne grafowe wyniki WALK/CAR, tabela walidacji, czytelne t=0…60, MP4 i źródła. Dowolny hover/click może jeszcze nie istnieć.

**Pełna wersja:** dowolny heks 250 m w trzech trybach, ciepły hover z właściwej macierzy, przypięcie + poprawna animacja, wszystkie kontrolki i obsługa mobile, poprawny CAR na stanach, spełnione testy poprawności/wydajności, 2–3 eksporty i opis ograniczeń. Bez tego nie nazywać demo pełnym interaktywnym wydaniem.

## 11. Samodzielny prompt dla Claude Code

Poniższy prompt jest gotowy do wklejenia bez wcześniejszej rozmowy. Nie zakłada istnienia lokalnych artefaktów tylko dlatego, że opisano je w repo.

```text
Pracujesz nad publiczną analizą/postem GISBoost „Łódź: jak rośnie zasięg podróży”.
Repozytoria: GISBoost/easy-R5 (dane/obliczenia) i GISBoost/mapy-analizy (frontend).
Priorytet: reuse istniejących narzędzi, jeden origin i film offline, potem interaktywny UI.
Budżet użytkownika to 5–10 h/tydzień; nie buduj nowego produktu routingowego.

OBOWIĄZUJĄCY ZAKRES:
3 ODDZIELNE tryby w jednym UI:
1) PT — standardowa dostępność R5, rosnąca izochrona heksów z macierzy all-to-all;
2) WALK — rzeczywisty Dijkstra na pieszym grafie OSM, kolorowanie ulic wg najkrótszego czasu;
3) CAR — rzeczywisty Dijkstra na samochodowym grafie OSM z kierunkami, prędkościami,
   uprawnieniami, kosztami i zakazami skrętów.
NIE rób hybrydy walk + RAPTOR + egress. NIE eksportuj origin→stop ani stanów RAPTOR-a.
RAPTOR działa rundami po trasach/przystankach, nie animuje odwiedzin ulic.

UX: hover nad heksami 250 m daje szybki podgląd izochrony z macierzy wybranego trybu.
Klik przypina origin i uruchamia t=0…60 min. Po przypięciu hover nic nie zmienia.
Przełącznik PT/WALK/CAR zachowuje pin, resetuje czas i ładuje właściwy model.
Play/pause, restart, 0,5×/1×/2×/4×, suwak, legenda, odpięcie/Escape, mobile tap.
PT = animacja progu P50, nie przejazd jednego autobusu i nie czas działania CPU.
WALK/CAR = fala pola najkrótszych czasów, nie symulacja pojedynczego podróżnego.

NAJPIERW PRZECZYTAJ I WYKORZYSTAJ:
mapy-analizy/izochrony-lodz/index.html — tylko redirect;
mapy-analizy/izochrony-transport/{README.md,app.js,index.html,styles.css,i18n.js}
  — Leaflet, hover/pin, cache, prefetch i ignorowanie starych odpowiedzi;
  istniejące dane Łodzi to 1479 originów 500 m z r5r::isochrone(), NIE nowa siatka!
mapy-analizy/lodz-dostepnosc-godzinowa/{app.js,index.html,styles.css}
  — istniejący MapLibre i feature-state dla heksów;
mapy-analizy/gdzie-mieszkac-lodz/app.js — loader HXM1/Range/DEFLATE;
easy-R5/tools/lodz_hourly_seasons/{PROCES.md,config.yaml,scripts/ci_hourly.py};
easy-R5/tools/apartment_finder/inputs/lodz250_hex_origins.csv;
easy-R5/tools/apartment_finder/config/{grid.yaml,scenarios.yaml,car.yaml};
easy-R5/tools/apartment_finder/scripts/{ci_matrices.py,pack_matrix.py,export_web.py,car_speeds.py};
easy-R5/easy_r5/core/{job_spec.py,pins.py};
easy-R5/easy_r5/java/EasyR5Runner.java.

DANE I PARAMETRY:
Kanoniczna siatka hex250-v1 ma 5662 heksy; nie generuj innej. Wspólne ID/centroidy
we wszystkich trybach. Reuse geometrii z eksportu strony godzinowej.
Lokalne wejścia do sprawdzenia względem easy-R5:
- tools/apartment_finder/data/grid.gpkg i data/grid.meta.json;
- tools/lodzkie_na_mapach_2026/work/pbf/lodz.osm.pbf;
- tools/lodz_hourly_seasons/data/gtfs/2026-10-06/lodz_realized_2026-10-06_p50.zip;
- opcjonalnie tools/lodzkie_na_mapach_2026/lodzkie_base.gpkg,
  warstwa hex_lodz_all.pop_total (ludność, nie routing).
Brak artefaktu oznacza raport braków, nie automatyczną odbudowę innych analiz.

PT: R5 7.6/Java 21 z istniejących pinów; dzień 2026-10-06, realized-P50 miejski GTFS,
bez ŁKA, okno 07:00–08:00 Europe/Warsaw (wtedy CEST, UTC+2), percentiles=[50],
max_trip_duration_minutes=60, max_walk_time_minutes=60, walk_speed_kmh=3.6,
max_rides=8, monte_carlo_draws=5 wg istniejącego bridge'a, WALK direct/access/egress.
Zachowaj listę trybów z ci_matrices. Sprawdź aktywne usługi, unikaj walk-only fallbacku.
To jawne rozszerzenie analizy godzinowej z 30 do 60 min; jej NPZ zawiera zliczenia POI,
nie macierz heks→heks! Nie pomyl P50 rekonstrukcji feedu z P50 routingu.
WALK: R5 bez PT, direct WALK, 3.6 km/h, 60 min.
CAR: R5 bez PT, direct CAR, 60 min; domyślnie bazowy OSM, prędkości importowane
przez R5, bez deklaracji o realnych korkach/parkowaniu. Istniejący car-v1 jest opcją
wyłącznie przy dostępnych artefaktach; nie twórz nowego pipeline'u prędkości.
Macierz i graf danego trybu muszą mieć te same wejścia i parametry.

WYKONANIE — ETAPAMI:
0. Zrób inwentaryzację lokalnych danych, hashe, zgodność ID, rozmiar grafów i zasięg.
   Nie zakładaj, że plik udokumentowany w PROCES.md jest wersjonowany lub dostępny.
1. Jeden istniejący hex_id w centrum: jeden wiersz PT + WALK/CAR offline.
   Preferuj eksport grafu/topologii/kosztów i linków z tej samej sieci R5.
   Jeśli brak gotowego eksportera, dodaj minimalny adapter do istniejącego runnera,
   nie fork R5 ani drugi silnik r5py/OSMnx dla tej samej pracy.
   WALK Dijkstra; dla CAR MVP użyj istniejącego StreetRouter one-to-many bez heurystyki
   celu i wyeksportuj finalne czasy; koszty i restrykcje bierz z R5.
2. Python + kolekcje geometrii + FFmpeg: deterministyczny film t=0…60 min,
   3 osobne tryby, 1080p/30 fps, H.264 yuv420p, źródła i ograniczenia.
   Najpierw jeden origin; potem centrum/osiedle/obrzeże, łącznie 2–3 showcase.
   Nie buduj przeglądarkowego eksportera ani całego UI przed poprawnym filmem.
3. Po odbiorze MVP: trzy zgodne macierze 5662², uint8 minuty, 255=nieosiągalne/>60.
   Reuse pack_matrix i HXM1 write_hxm/loader, skala 1 min, tylko pliki wierszowe.
   Jeśli brak zgodnych gotowych danych, przelicz jeden scenariusz na tryb, nie wszystkie
   dni/godziny. Benchmark 10/100 originów przed pełnym przebiegiem, resume i metadane.
4. Nowy folder mapy-analizy/animacja-dijkstra-lodz/, vanilla JS + istniejący MapLibre;
   wzorzec UX z izochrony-transport, nie zmieniaj istniejących map.
   Stała geometria heksów/ulic; nie odtwarzaj wielkiego GeoJSON co klatkę.
5. WORKERY dopiero po walidacji: typed arrays + kopiec binarny.
   WALK może użyć klasycznego modelu grafowego po sprawdzeniu kosztów.
   CAR MUSI rozróżniać krawędź wjazdową i stany ograniczeń via-way; jedna etykieta
   na skrzyżowaniu nie wystarcza. Zachowaj oneway, permissions, koszty i zakazy skrętów.
   Początek/cel to split na krawędzi + off-network koszt, nie najbliższy węzeł.
   Sprawdź StreetRouter.setOrigin/getState(Split) w przypiętym R5; w CAR odcinek
   poza ulicą może mieć koszt chodu. Nie dopisuj czasu parkowania bez zmiany modelu.
   Wagi nieujemne, finalizacja po zdjęciu minimum; animuj czas podróży, nie relaksacje.
6. Walidacja i benchmark: 30 originów × 200 celów + wszystkie cele 3 showcase.
   WALK/CAR porównuj z osobnymi R5 macierzami przez te same linki celów.
   Cel p95 błędu przed pakowaniem ≤5 s WALK/≤10 s CAR, jeśli referencja sekundowa
   dostępna; dla macierzy minutowej ≥95% par w ±1 min, osobno osiągalność i progi.
   Żadne wykryte nielegalne skręty/przejazdy nie przechodzą odbioru, nawet przy 95%.
   PT render musi odpowiadać bezpośrednio progowi wartości z wiersza macierzy.
   Przetestuj race conditions, sentinel, monotoniczność zasięgu, granice grafu i mobile.

WYDAJNOŚĆ / OGRANICZENIA:
Jedna macierz uint8 to 32.06 MB surowo, trzy 96.17 MB; wiersz tylko 5.66 KB.
Nie pobieraj ponownie całego pliku, gdy hosting ignoruje Range (200 zamiast 206).
Prefetch sąsiadów, cache; fallback paczki po 64 wiersze lub raz cached cała macierz.
Nie licz Dijkstry na hover. Worker i requestId/cancel dla kliknięć, LRU wyników.
Cele p95 po załadowaniu danych: WALK <300 ms desktop/<1 s telefon,
CAR <800 ms/<2 s; zmierz, nie deklaruj na podstawie złożoności.
Grafy podaj jako rzeczywistą inwentaryzację, nie estymaty z dokumentu.
Geometrię upraszczaj oddzielnie od topologii; nie usuwaj skrętów/łączników heksów.
CAR może potrzebować sieci poza granicą Łodzi; ujawnij routing_bbox vs render_bbox.
Nie precomputuj ulic dla wszystkich 5662 originów: to gigabajty.
Jeśli poprawny CAR w JS nie mieści się w budżecie lub nie przechodzi testów,
zatrzymaj się na legalnych wynikach R5 offline dla 2–3 showcase originów i nazwij UI
„demo”; nie udawaj pełnej animacji dowolnego heksa i nie dodawaj serwera.

DOSTARCZ:
MVP: film MP4, opcjonalnie GIF, parametry/hashe, raport walidacji i ograniczeń.
Dalszy etap: kod strony, manifest i artefakty danych, testy oraz pomiary download,
decode, routing, rendering i pamięci. Nazwy nowych ścieżek opisz jako nowe.
Budżet orientacyjny: MVP 14–22 h, pełna wersja 48–75 h z rezerwą; M5 CAR stanowy
jest największym ryzykiem. Na 24.11 celuj w film offline, nie pełne narzędzie.
Nie wdrażaj, nie publikuj, nie wysyłaj postów i nie force-pushuj danych.
Nie rób nowych pipeline'ów GTFS-RT, siatki, ludności, korków ani hybrydy RAPTOR+ulice.
Po M0 i po MVP przedstaw wynik, braki i koszt następnego etapu zamiast rozszerzać zakres.
```
