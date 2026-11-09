# Szybki podgląd odcinków

Jak strona `dijkstra-paths` doszła do podglądu, który nadąża za kursorem. Stan na 8.11.2026. Stara specyfikacja `spec_animacja_dijkstra_lodz.md` opisuje inny produkt (izochrony, pieszo, samochód, film) i nie jest instrukcją tej strony.

## Co jest na stronie

Heks 250 m jest tylko początkiem. Zapala się **odcinek**: kawałek tramwaju albo autobusu między kolejnymi przystankami. Minuta odcinka to P50 czasu do przystanku na jego końcu, z Conveyal R5, wtorek 6.10.2026. Rano 7:00–9:00, popołudnie 14:00–18:00. Suwak nie liczy trasy od nowa. 255 znaczy „poza 60 min”.

Podgląd (nic nie jest przypięte) bierze próg z suwaka. Próg zostaje przy zmianie heksa i wraca do 30 min po zejściu z miasta. Klik w heks przypina go, stawia kółko, ustawia 4× i raz puszcza wzrost od 0 do 60. Dopiero po przypięciu klik w narysowany odcinek otwiera inspekcję: numer linii last-hopu, popup i ten sam tekst w panelu. Drugi klik w ten sam odcinek zamyka inspekcję. Odtwarzanie wtedy nie pauzuje. Łańcuch przesiadek z R5 nie jest na stronie. Obrysu heksa nie ma.

Geometria leży w `data/segments.geojson` (około 3100 odcinków, około 19 tys. wierzchołków). Minuty leżą w `morning.bin.gz` i `afternoon.bin.gz`. Siatka leży w `hex.bin` (5662 heksy).

## Co było wolne

Pierwsza wersja przy każdej zmianie heksa budowała nową kolekcję GeoJSON i wołała `setData` na źródle odcinków. Do tego kursor był opóźniony timerem 80 ms, który resetował się przy każdym `mousemove`.

Pomiar w headless Chrome, software WebGL, prawdziwa strona, dwa zgodne przebiegi:

- Skan 5662 heksów (odrzucenie po prostokącie, potem punkt w pierścieniu): do 0,4 ms.
- Złożenie kolekcji w JavaScripcie: do 0,4 ms.
- Samo `setData` wraca w ≤ 3,3 ms i nie robi długiego zadania na głównym wątku.
- Worker MapLibre kończy przeładowanie geometrii (`sourcedata` + `isSourceLoaded`) po 69–80 ms. Przy 1705 odcinkach 80 ms, przy 475 odcinkach 69 ms.
- Timer 80 ms kasuje się w ruchu, więc przez całe prowadzenie myszy nie ma ani jednej aktualizacji. Pierwszy `setData` startował około 91 ms po zatrzymaniu kursora. Od postoju do gotowych danych: około 150–170 ms.
- Timer ustawiony na 0 daje aktualizacje w ruchu, ale 8 zachodzących na siebie `setData` zostawia źródło 227 ms w tyle.

Wniosek: koszt to ponowne wgrywanie geometrii, nie liczenie heksa i nie histogram.

## Czego nie robić

- Kafle wektorowe. Przy 3 tysiącach odcinków MapLibre i tak kafelkuje GeoJSON wewnętrznie. Kafle mają sens dopiero przy pełnym grafie ulic (pieszo, samochód), nie tutaj.
- Wyrażenie `match` po identyfikatorze przystanku. Na 2072 przystankach: 6–16 ms synchronicznie, do 21 ms do klatki. Gorzej niż feature-state.
- Kasowanie tysięcy feature-state przy zejściu z heksa. Warstwę wystarczy schować.

Porównanie, ta sama przeglądarka, całe 3041 odcinków dodane raz (`addSource` jednorazowo 270 ms): `setFeatureState` na każdym odcinku, trzy przebiegi, synchronicznie 1,5 / 0,6 / 0,3 ms, do klatki 4,6 / 2,6 / 14,7 ms.

## Co jest w `app.js`

1. `segments.geojson` wchodzi do źródła `seg-on` raz. Identyfikator (`feature.id`) jest nadawany w pamięci, plik na dysku się od tego nie zmienia.
2. Zmiana heksa nie woła `setData`. Pętla po odcinkach liczy histogram (ułamek milisekundy) i zapisuje minutę każdego odcinka przez `setFeatureState`. 255 zostaje „poza zasięgiem”. Histogram jest potrzebny do zdania „N odcinków w T min”.
3. Kolor linii czyta `feature-state` `m`. Szerokość zostaje przy właściwości `mode` (tramwaj grubszy, autobus cieńszy), bo rodzaj się nie zmienia między heksami.
4. MapLibre **nie pozwala** użyć `feature-state` w filtrze warstwy. Taki filtr wywala dodanie warstwy i nic się nie rysuje, choć licznik odcinków żyje. Próg suwaka jest więc przezroczystością: `line-opacity` to `case` „minuta ≤ próg → 0,95, inaczej 0”. Zejście z heksa ustawia przezroczystość na 0 i nie czyści stanów.
5. Zamiast timera 80 ms ostatni punkt kursora jest brany raz na klatkę (`requestAnimationFrame`). `setFeatureState` leci tylko, gdy zmieni się numer heksa. Pauza przy kółku zostaje: 180 ms (`wheelUntil`), żeby zoom nie przebierał heksów.
6. Znacznik przypięcia to osobny element DOM (białe kółko z czerwoną obwódką). Obrys heksa był małym `setData` i został usunięty.

Sufit: przy zmianie heksa przepisywane są wszystkie stany, około 3 tysiące. Gdyby jedna zmiana heksa przekroczyła klatkę, zapisywać tylko minuty, które się zmieniły.

## Skala koloru

Viridis, z większością różnicy w 0–30 min i ściśniętym końcem 45–60. Próbki przy minutach legendy: `#414487`, `#228d8d`, `#6ccd5a`, `#b5de2b`, `#fde725`. Czysty początek viridisa (`#440154`) ginie na ciemnym podkładzie, więc skala startuje od około 0,2 palety. Legenda nadal pokazuje 0, 15, 30, 45, 60.

## Geometria z OSM

Shape GTFS nie ma `shape_dist_traveled`. Dziura w gęstym kształcie rysowała się jako cięciwa (m.in. 1784 m od Kilińskiego przy dworcu Fabryczna do Przędzalnianej). `build_segments.py` w easy-R5 najpierw wycina pojedynczy skok dłuższy niż `max(250 m, 8 × mediana krawędzi tego kształtu)`. Jednolicie rzadki kształt zostaje. Dziury nie skleja z innych shape’ów.

Na mapie nie ma zjazdów do zajezdni (`R11`, `R16` i inne `R` + numer), przewozu pracowników (`P*`, `oP*`), linii F/G/H/W ani `T`. Zastępcze `Z*` zostają. Minuty R5 ich nie wyrzucają; ginie tylko geometria i numer w inspekcji. Destinations zostają te same co przy przebiegu.

Potem, gdy podany jest `--osm` i lokalny `lodz.osm.pbf`, para przystanków bierze geometrię z relacji OSM `route=tram` albo `route=bus`, której `ref` jest równy `route_short_name`. „10A” nie wchodzi w „10”. Kawałki jednej relacji, które prawie się stykają, są sklejane (GDAL oddaje relację jako kilka linii i bez tego zostaje dziura, m.in. na Prądzyńskiego i Franciszka z Asyżu). Oba przystanki muszą leżeć do 100 m od linii relacji. Gdy nie leżą, zostaje kawałek z GTFS. Tramwaj ma 4,3 px, autobus 2 px. Start mapy jest o 1 poziom bliżej niż całe miasto w kadrze i wyśrodkowany na heks 2389 (przystanek Centrum), z uwzględnieniem panelu po lewej. Indeks przystanków (`destinations.csv`) ma zostać ten sam co przy przebiegu R5, inaczej minuty trafiają w zły odcinek.

Przy przebudowie 8.11.2026 OSM pokrył 4058 par. Zostały proste kreski, m.in. autobusowe około 1941 m, 1889 m, 1882 m i 1529 m. To pary, których przystanki nie weszły na relację.

## Czego ten dokument nie naprawia

Pieszo i samochód nie są na stronie. Pełny graf OSM to osobna rozmowa i dopiero wtedy kafle. Czterech długich prostych z GTFS nie wycinać bez wskazania linii.
