# Notatki: widok geograficzny (`geo.js`)

Co sprawdzone i jak, co nie zadziałało, decyzje niepewne. Nowe wpisy na końcu, z datą.
Kod `geo.js` to kopia z `schemat-linii-gzm/` (tam `NOTATKI.md` opisuje, skąd się wzięły zasady rysowania wiązek).

## 12.10.2026: pierwsza wersja, tramwaje od 5.10

**Zakres (decyzja autora):** tylko tramwaje, tylko stan „od 5.10”. Przełącznik „Schemat | Mapa” pojawia się
obok przełącznika stanu tylko tam, gdzie jest mapa (`mapy/<m><SUF>_geo.json`). Na „Przed 5.10”, autobusach i nocnych znika
i pokazuje się schemat; po powrocie wraca ostatnio wybrany widok (`localStorage` `lodz-view`).

**Dane.** `out_TF150/tram.loom.json` → kopia `tram.geo.json` → `serving.py` ze skilla (4 węzły zmienione, jak w schemacie)
→ `pipeline/geo_export.py` → `mapy/tram_geo.json` (246 krawędzi, 227 przystanków, 50 znaczników krańcówek = 25 linii × 2).
Nazwy przystanków i krańcówki liczone tymi samymi regułami co w `render.py` (nazwa, na której staje więcej linii; `LABELS`;
krańcówka na najbliższym węźle linii do 700 m; „OLECHÓW” → „Olechów”).

**Kolejność w wiązkach.** Przecięcia linii na węzłach (skrypt: cięcie 25 m od węzła, odstęp 4 m, połączenia prostymi,
liczone pary przecinających się odcinków różnych linii):

| | znak jak w `geo.js` (pierwsza linia z `loom` po prawej na ekranie) | znak odwrotny |
|---|---|---|
| Łódź, tramwaje | **159** | 312 |
| GZM, tramwaje (dla porównania, ta sama metoda) | 205 | 300 |

Kod z GZM jest dobry dla Łodzi bez zmian. (GZM w swoich notatkach podaje 48/121: inna metoda liczenia, ten sam kierunek.)

**Końce linii** (`ends` z jednym wpisem): bez grupowania węzłów 51 na każdym zoomie 11–17; z grupowaniem z11 48, z12–z17 51.
51 = 25 linii × 2 + odgałęzienie P1 przy Rondzie Lotników Lwowskich do pl. Niepodległości. To odgałęzienie jest też
w `octi.json` schematu (P1 to przewóz pracowników, 3 kursy), więc mapa jest ze schematem zgodna. Na z11 linie 4 i 9 chowają
koniec w grupie węzłów (pętla na krańcówce): mniej końców, nie więcej, czyli nic się nie rozrywa.

**Spójność ze schematem** po `station_id`:
- te same węzły z wyjątkiem `147` (Dąbrowskiego-Kilińskiego): `octi` zostawił jednego z dwóch bliźniaków o tej nazwie
  (`147~2`) i przypiął mu linie obu. Na mapie są dwa przystanki 220 m od siebie (16/2 i 11/16/5/6), na schemacie jeden.
- poza tym linie obsługujące (`stop_names`) identyczne;
- nazwy: wszystkie podpisy mapy są na schemacie (porównanie tekstów `g.lb` w `mapy/tram.svg`, po złożeniu łamanych wierszy);
- krańcówki: każda krańcówka rozpoznana na schemacie jest też na mapie (parser SVG łapie tylko część chipów, więc to
  kontrola jednostronna).
- Ramki ogonów (41, 43, 45) są tylko na schemacie; na mapie ogony leżą w terenie (Pabianice, Konstantynów).

**Czas.** `draw()` (okno 1000×800, środek Łodzi): z11 14 ms, z12 22, z13 32, z14 34, **z15 173, z16 272, z17 349 ms**.
Skok od z15 to podpisy wszystkich przystanków (stałe tooltipy Leafleta, także poza ekranem). Wyróżnienie linii (`repaint`)
2 ms. Powyżej progu 150 ms ze skilla, więc (decyzja autora) **nazwy przystanków przelotowych od z15 tylko w kadrze
i w pasie 25% wokół niego**, odświeżane po `moveend`; krańcówki zawsze. To jedyne odejście `geo.js` od kopii z GZM
(`inView`, `drawnZ`, `moveend` zamiast `zoomend`). Po zmianie (okno 980×724): z14 40 ms, z15 62, z16 61, z17 69,
przesunięcie mapy na z16 23 ms. Przystanki poza kadrem mają nazwę w dymku po najechaniu, dopóki mapa tam nie dojedzie.

**Kontrola strony.** Przełączanie mapy, stanu, widoku i języka: jedna mapa Leaflet (`.leaflet-container` = 1), ten sam obiekt
`G`. Wyróżnienie z listy i z „Zmian” działa w widoku mapy i dopasowuje widok do linii. Zbiór wybranych linii jest przy
zmianie stanu podmieniany na nowy, dlatego `geo.js` dostaje `sel` przez getter (`st[GK].sel`), a nie sam obiekt `Set`.
Konsola bez błędów na z11–17 w obu motywach (także po zmianie podpisów). Okno 390 px: przełącznik w osobnym wierszu, bez poziomego przewijania.

**Pułapka testu.** Mapa testowa utworzona z konsoli i usunięta `map.remove()` nadal reaguje na zmianę motywu
(`MutationObserver` w `geo.js`) i sypie `Cannot read properties of undefined (reading 'clearRect')`. To artefakt testu,
nie strony: po przeładowaniu bez mapy testowej błędów nie ma.

**Obejrzane miejsca** (z16, jasny): Fabryczna (pętla Kilińskiego-Przystanek mBank, Rodziny Poznańskich), Kaliska, Piotrkowska
Centrum, Kościuszki-Zamenhofa, Kościuszki-Mickiewicza (z17,5), Rondo Lotników Lwowskich, Retkinia (pętla chowa się, linia
kończy się na przystanku), Północna / Nowomiejska (17), ogony 41 i 43 (z12). Kolaż: `schemat-lodz-dane/kolaz_geo_tramwaje.jpg`.

**Węzły z wieloma liniami** (decyzja autora 12.10.2026): zostają jak są. Na z15–17 przy Fabrycznej, Kaliskiej, Kościuszki-Mickiewicza
i Rondzie Lotników nie widać szpilek ani prostych skoków po `hubsnap.py`; krótkie skrzyżowania wymuszone kolejnością z `loom`
zostają, bo zmiana kolejności zmieniłaby też schemat.

## Do zrobienia później

- Nocne i autobusy oraz stan „przed”: eksport `geo_export.py` z ich `*.loom.json` (tabela w `PROMPT_mapa-geograficzna.md`);
  `build_page.py` sam doda przełącznik. Gdy dojdzie druga mapa, `loadGeo()` musi podmieniać dane w istniejącej mapie
  (dziś tworzy ją raz dla pierwszego zestawu danych). Autobusy: najpierw pomiar `draw()` (ok. 1325 krawędzi).

## 12.10.2026: poprawki po uwagach autora

1. **Za dużo etykiet.** Od z15 podpisany był każdy przystanek. Teraz: krańcówki zawsze, od z15 tylko węzły (przystanki na
   skrzyżowaniu 3+ krawędzi grafu, liczone przed `chainEdges`), wszystkie przystanki dopiero od z17.
2. **Zoom bez granic.** `minZoom` był stały (9). Teraz `minZoom` = zoom, przy którym mieści się cała sieć (`getBoundsZoom`,
   przeliczany przy zmianie rozmiaru okna; 11,5 w oknie 706×856), `maxZoom` 17,5, a `maxBounds` = zasięg sieci + 15%,
   żeby nie odjechać daleko w bok.
3. **Linie się rozjeżdżały** (Kościuszki, Mickiewicza–Piłsudskiego, Kilińskiego). Dwie przyczyny w kodzie z GZM:
   - przesunięcie wiązki przy węźle było rozkładane smoothstepem na **całą** krawędź, więc krótkie krawędzie w centrum
     (200–400 m) szły w całości ukosem;
   - regresja izotoniczna przesuwała każdą linię osobno (z odstępem ≥ pitch), więc między liniami robiły się szpary.
   Poprawka: cała wiązka przesuwa się razem (średnia ważona połówek niedopasowania, linia dochodząca waga 0,05),
   a przesunięcie wygasa w odległości 8 × pitch od węzła. Porównane warianty (Piotrkowska Centrum, Piłsudskiego-Kilińskiego,
   z15,5–17): izotoniczny na całą krawędź (było), izotoniczny lokalnie, sztywny lokalnie (wybrany: na zrzutach jak
   izotoniczny lokalnie, a linie zawsze się stykają).
4. **Kościuszki-Mickiewicza na środku skrzyżowania** to nie błąd GTFS: perony 521/542 leżą ok. 55 m na południe od
   skrzyżowania. `topo -d 150` wciągnął przystanek w węzeł skrzyżowania. Podobnie (55–112 m od najbliższego peronu
   o tej nazwie): Karolew, Chocianowice IKEA, Dąbrowa Niższa, Legionów-Włókniarzy, Dąbrowskiego-Kilińskiego, Dw. Łódź Dąbrowa,
   Łagiewnicka-Rondo Powstańców, Piłsudskiego-Śmigłego-Rydza i kilka innych; mediana 6 m. Nie poprawione: wymaga osobnego
   przebiegu `topo` z mniejszym promieniem tylko dla mapy (kolejność linii może się wtedy różnić od schematu).
5. Przełącznik: „Mapa” zamiast „Mapa geograficzna” (EN „Map”).

## 12.10.2026: węzły przesiadkowe jako prostokąty

- **Objaw:** ukośne pastylki na skrzyżowaniach (Przybyszewskiego-Kilińskiego, Piłsudskiego-Kilińskiego).
- **Przyczyna:** pastylka to zawsze odcinek między dwoma najdalszymi liniami na przystanku. Na skrzyżowaniu jedna leży w wiązce
  pionowej, druga w poziomej, więc odcinek wychodzi po przekątnej.
- **Poprawka:** `draw()` zapisuje dla każdej linii oś jazdy na przystanku (`lineDir`: styczna osi na przystanku w środku krawędzi,
  a w węźle kierunek wejście → wyjście łuku albo kierunek krawędzi na krańcówce). `shape()`: gdy osie wszystkich linii przystanku
  są w granicach 30° (prosto, skos, cała wiązka skręca razem), zostaje pastylka; gdy się krzyżują, rysowany jest zaokrąglony
  prostokąt (jak na mapach LOOM, np. Freiburg Berliner Platz) wokół miejsc linii, ustawiony wzdłuż osi, którą dzieli najwięcej linii.
  Przy wyróżnieniu kształt liczony jest tylko z wybranych linii (jedna linia = pastylka).
- Kościuszki-Mickiewicza zostaje pastylką: stają tam tylko linie z Kościuszki (2, 3, 6, 7, 11); linie z Mickiewicza stają na
  Piotrkowskiej Centrum.

## 12.10.2026: skala linii względem zoomu

- **Objaw:** na oddaleniu (z11,5–12) sieć zlewa się w plamę z wielkim białym węzłem w centrum; na każdym zoomie inna geometria.
- **Przyczyna:** wszystko w pikselach. Linia 2,9 px na z12 to ok. 68 m w terenie, na z17,5 6 px to ok. 3 m: wiązka 8 linii
  ma w terenie ok. 740 m na z12 i ok. 30 m na z17,5. Wygładzanie 16 px to 380 m na z12 i 8 m na z17,5; promienie węzłów
  i grupowanie zależą od odstępu linii, więc też od zoomu.
- **Porównane** (kolaż obecny | metry | pośredni, z11,5/13/15/17): szerokość w metrach (8 m, min 1,5 px) trzyma geometrię,
  ale na z13 linie za cienkie (uwaga autora), a na z17 ok. 11 px.
- **Wybrany wariant pośredni**, jak interpolacja wykładnicza szerokości w stylach map wektorowych (Mapbox/MapLibre `interpolate`
  `exponential`; baza 1 = stałe piksele, 2 = metry): `width = 6 · 1,35^(z − 16)`, w granicach 1,6–9 px (z12 1,8; z13 2,4;
  z14 3,3; z15 4,4; z16 6; z17 8,1). Kafle LOOM mają ok. 1,15 (z14 3 px, z16 4 px).
- Wygładzanie w metrach (24 m, min. 2 px): kształt osi ten sam na każdym zoomie. Pastylka `1,5 · w + 3,5`. Przystanki przelotowe
  (pastylki i prostokąty) od z14, krańcówki jak dotąd.

## 12.10.2026: rysowanie wiązek według zasad `transitmap` (LOOM)

- **Uwaga autora** (zrzuty z loom.cs.uni-freiburg.de/global, Londyn): tam linie idą równo obok siebie, wchodzą prosto w hub,
  a od pewnego oddalenia kształt „zastyga”. U nas linie rozjeżdżały się przy węzłach, a każdy zoom wyglądał inaczej.
- **Jak to robi LOOM** (kod `~/loom/src` w WSL, commit 1e47578; strona /global; kafle):
  - Graf linii z osiami wygładzonymi w metrach powstaje raz. Wygładzanie: `LineGraph::smooth`, czyli `smoothenOutliers(50)`,
    `simplify`, Chaikin ×3. Wejście to tory z OSM.
  - `transitmap --render-engine mvt` dla każdego całkowitego zoomu liczy tylko fronty węzłów, czyli odcinki prostopadłe do
    wiązki o jej szerokości:
    - krawędź skraca tylko dopóty, dopóki fronty w węźle się nakładają (`expandOverlappinFronts`);
    - z bliskich węzłów robi meta-węzły;
    - linia to oś przesunięta o stały offset, przycięta do frontów;
    - w węźle łączy fronty krzywą Béziera z ramieniem 0,55 × odległość do przecięcia stycznych (`getInnerBezier`);
    - przystanek to otoczka frontów zamieniona na zorientowany prostokąt (`getStopGeoms`).
  - Frontend: Leaflet + `Leaflet.VectorGrid`, `weight` z kafla w pikselach. Kafle są dla z6–17. Szerokość linii: ok. 1 px do z11,
    2 px na z12, 3 px na z13–14, 4 px na z16. Między zoomami kafel jest tylko skalowany.
- **Przyczyny u nas:**
  - oś upraszczana i wygładzana w pikselach przy każdym `draw()`;
  - przesuwanie całej wiązki przy węźle (`sh`, wygaszane na 8 odstępach), które ściągało linie z osi;
  - stały promień cięcia `n · odstęp / 2 + odstęp`, przez który wiązka skręcała przed hubem;
  - kształt przystanku liczony z punktów na łukach.
- **Poprawka (`geo.js`):**
  - Oś liczona raz przy wczytaniu, w metrach (zoom odniesienia 18): kolce < 35° przy odcinku < 50 m, DP 3 m, Chaikin ×3, DP 0,5 m.
    Na każdym zoomie oś jest tylko skalowana.
  - Stały offset linii od osi; usunięte `sh`, `ease` i `rad`.
  - Fronty: start 1 odstęp przed węzłem, cofanie o ¼ odstępu, dopóki fronty się przecinają albo są bliżej niż 1 px (najwyżej 45%
    krawędzi). Krawędź, z której po cięciu zostaje mniej niż odstęp, łączy węzły w grupę, a fronty grupy są rozsuwane razem.
  - Krzywe w węźle jak `getInnerBezier`; przy cięciwie < 1,5 px prosty odcinek.
  - Przystanek z frontów: pastylka wzdłuż frontu albo prostokąt w osi najszerszej wiązki (oś liczona per linia).
  - Szerokość schodkowa, liniowo między progami: z11 1,5; z12 2; z13 3; z14 3,5; z15 4; z16 5; z17 6 px.
- **Pułapka:** `if (F) for … if (…) {…} else …` przypiął `else` do wewnętrznego `if`. Przystanki w środku wiązki wyszły jako
  kropki. Potrzebne nawiasy.
- **Sprawdzone:**
  - kolaż przed | po: z13, z15, z16 centrum; z15 i z17 Zachodnia/Północna;
  - ciemny motyw na z15,5: bez szpar w wiązkach przy połówce zoomu;
  - z11,5 po `fit()`;
  - wolne końce linii na z12, z15, z17: 51 (każda linia 2, P1 3 z odgałęzieniem na pl. Niepodległości), jak przed zmianą;
  - konsola bez błędów.
  - Czas `draw()` po rozgrzaniu: z12 74 ms, z13 64, z15 107, z16 137, z17 129. Fronty kosztują 2–7 ms; reszta to warstwy
    Leafleta i podpisy, jak przedtem.
- **Zostaje:** splot na Zachodniej/Północnej (linia 17 przecina wiązkę, żeby skręcić na wschód). To kolejność z `loom`,
  jest krótszy niż przedtem. Zmiana wymaga przeliczenia LOOM.

## 12.10.2026: druga wersja, geometria z kafli `transitmap` (gałąź `lodz-map-transitmap-tiles`)

- **Uwaga autora** po wersji z frontami w `geo.js`: poprawa niewielka, część linii nadal dziwnie odsunięta, a na oddaleniu
  znikają przystanki (na mapie LOOM Londynu są widoczne). Prośba o wersję „z kafli”, na osobnej gałęzi.
- **Jak:**
  - `pipeline/geo_tiles.sh` (WSL) uruchamia `transitmap --render-engine mvt` osobno dla z11–z17. Grubość linii w px:
    1,5 / 2 / 3 / 3,5 / 4 / 4,5 / 5. Obwódka 1 px, odstęp −1 px, czyli obwódki sąsiadów nachodzą na siebie jak dotąd.
    Wejście to `out_TF150/tram.geo.json` (`loom.json` po `serving.py`, z `not_serving`).
  - `pipeline/geo_tiles.py` dekoduje kafle (`pipeline/mvt.py`, sama biblioteka standardowa) i przycina każdy kawałek linii
    do jego kafla, bo kafle zachodzą na siebie o bufor. Obwódek nie zapisuje (ta sama geometria, szersza). Stacje zapisuje raz.
    Wynik idzie do `mapy/tram_geo.json` jako klucz `z`; punkty to ćwiartki piksela danego zoomu (siatka kafla).
  - `geo.js` rysuje te linie i stacje tak, jak są. Na połówkach zoomu i powyżej z17 skaluje geometrię i grubość zoomu niżej,
    jak kafle. Podpisy, krańcówki, tooltipy i wyróżnianie zostały, a przystanki łączy po `station_id` (227 z 227).
- **Kafle LOOM (Londyn, z dekodowania):** linia 2 / 3 / 4 px na z12 / z13 / z16, obwódka 1 px. Kafle są dla z6–z17.
- **Sprawdzone:**
  - każda z 25 linii jest na każdym zoomie z11–z17;
  - stacje: z11 131, z13 211, z15–17 227 z 227. `transitmap` chowa mniejszy z nakładających się przystanków, krańcówki są zawsze;
  - konsola bez błędów; wyróżnienie linii działa; ciemny motyw;
  - czas rysowania 27–103 ms na z11,5–z17.
  - Splot na Zachodniej/Północnej zniknął: `transitmap` rozwiązuje go w samym węźle.
- **Podpisy:** przy przystankach widocznych od z11 podpisy krańcówek nie mieściły się między symbolami przystanków.
  Dlatego przystanki przelotowe są dla podpisów przeszkodą miękką, jak linie, a twarde są tylko inne podpisy i krańcówki.
- **Koszt:** `tram_geo.json` ma ok. 1 MB zamiast ok. 100 KB (na stronie gzip). Gdyby to przeszkadzało: osobny plik na zoom.
- **Bez zmian względem `transitmap`:** „oczka” (oba kierunki na osobnych ulicach) są rysowane jako dwie wiązki. `dropEyes`
  działał tylko w naszym rysowaniu.

## 14.10.2026: własny solver `octls` (opcjonalny zamiast `octi`), wariant `lv048`

**Cel (wzór: schemat MPK z 2026, szare linie = autobusy, pominięte):** Piotrkowska jedną osią pionową
(Helenówek–Zgierska–Zachodnia–Piotrkowska), Mickiewicza/Piłsudskiego poziomo, Pabianicka jedną linią pod 45°
z Rondem Lotników jak u MPK, Retkinia, Olechów i Kochanówka pod 45° bez zagięć 90°, Dąbrowa poziomo, Gdańska
poziomo i potem pionowo. Z `octi` (także po dostrojeniu parametrów i wyprostowaniu wejścia, zgłoszenie #1) nie dało
się tego zrobić naraz, bo nie ma w nim „ta ulica ma być pionowa”.

**Co zrobiono.** `pipeline/octls.py` (opis: `pipeline/OCTLS.md`): etykiety 8 kierunków na krawędź, pozycje węzłów
z najmniejszych kwadratów, wyszukiwanie lokalne etykiet, osie wymuszane plikiem `goals/tram.json`. Węzły Ronda
Lotników Lwowskich (Pabianicka i Paderewskiego) skleja `merge_nodes.py` w jeden hub. Włączane `OCTI=ls` w `run.sh`;
domyślnie nadal `octi`.

**Wybrany wariant `lv048`** (z kilku wariantów wybrał autor po obejrzeniu pełnych schematów i kolaży miejsc ze
szkicu): `--theta 8 --anchor 0.4 --lenw 1.0 --escale 5e5 --bend45 3 --bend90 6 --bend135 20 --minlen 150 --win 0
--xpen 100 --passes 4` + `goals/tram.json`. Pomiary (feed od 5.10, dzień roboczy 8.10):

| miara | `lv048` |
|---|---|
| odchyłka od pionu: Kościuszki-Mickiewicza…Piotrkowska-Czerwona; oś Helenówek→Piotrkowska-Czerwona; Zgierska | 0 m |
| odchyłka od poziomu: Mickiewicza–Piłsudskiego | 0 m |
| Pabianicka: załamania; % długości poza 45° | 0; 0% |
| zagięcia 90° na ogonach Retkini i Olechowa | 0 |
| przecięcia | 0 |
| linie narysowane | 25 z 25 |
| węzły z zagięciem 45° / 90° / 135° | 16 / 25 / 4 |
| średni błąd kierunku względem geografii (`sprawdz.py`) | 20,8° |
| rozrzut skali | 0,28 |
| konflikty etykiet (renderer) | 2 (Limanowskiego-Bałucki Rynek, Dąbrowskiego-Kilińskiego) |

Poprzedni kandydat `lv018` (`--theta 10`): 32 węzły 45°, 21 węzłów 90°, 3 konflikty etykiet, 21,1°, rozrzut 0,30.
`lv048` ma więcej kątów prostych (np. wokół Narutowicza, Kilińskiego i Piłsudskiego-Kilińskiego, różowa linia
z Zachodniej skręca w Mickiewicza o 90° zamiast dwóch 45°), mniej 45°.

**Odrzucone.** MIP w HiGHS (`octmip.py`) i ILP-LNS (`octmip_lns.py`, wybrany wariant dopracowany sąsiedztwami
po ok. 30 krawędzi): nie dały nic ponad wyszukiwanie lokalne, LNS na `lv018` wprowadził 2 przecięcia. `octi` z ILP
(GLPK zbudowany lokalnie) działa tylko na fragmentach ok. 11 węzłów. Kod tych prób, skrypty pomiarowe i kolaże
zostały poza repozytorium (`schemat-lodz-dane/t_params/`, dane nie są wersjonowane).

**Odtwarzalność.** Solver deterministyczny; dla `loom_merged.json` i presetu wynik identyczny bajt w bajt z `lv048`
(14.10.2026). Przejście potoku `run.sh` z `OCTI=ls` (hub, solver, `serving.py`, `transitmap`) sprawdzone na gotowym
`loom.json`; sam krok GTFS → `loom.json` nie został odtworzony, bo katalog roboczy `data_TF150` został wcześniej
nadpisany danymi z lipca.

**Do zrobienia (osobno).** Węzeł południowo-wschodni (Kilińskiego–Dąbrowskiego–Niepodległości–Mochnackiego):
krótkie ukośne odcinki i dotykające się etykiety. Prostokątne zagięcia wokół Narutowicza/Piłsudskiego (decyzja
o wadze kary 90°). Cele i preset dotyczą feedu od 5.10.2026 i tramwajów; po zmianie rozkładu trzeba sprawdzić nazwy
w `goals/tram.json`. Schemat jest obrócony o 8° względem północy (zamierzone).

## 14.10.2026: publikacja tramwajów „po” z układem `octls` (`lv048`)

**Co poszło na stronę i do druku:** `mapy/tram.svg`, `druk/lodz_tramwaje.{svg,pdf,jpg}` i `lodz_tramwaje_ciemny.*`
(594 × 841 mm, 1 strona PDF). `index.html` zmienił się tylko o stopkę, hash `i18n.js` i hash `tram.svg`. Stan „przed”
tramwajów, autobusy, nocne i widok geograficzny bez zmian: SVG autobusów i nocnych z ponownego `pdf.py` są bajt w bajt
takie same jak w repo, `lines.json` tramwajów identyczny (kolory przypięte `colors/tram.json`).

**Warstwa orientacyjna na nowym układzie** (to samo `render.py`, ustawienia z README): zagięte trójkąty odwzorowania 21
(przy `octi` 25), `gate.py` 25 linii bez objazdów, 36 krawędzi kolei, 18 piktogramów (19), konflikty etykiet 2 (1),
brak podpisu „Park na Zdrowiu” (parki są cięte liniami; podpis tylko wewnątrz kawałka parku). Dostrojona lupa „Centrum”
(stara lista dawała ×1,0 i ucinała centrum, nowa ×2,2: oś Kaliska–Piłsudskiego-Śmigłego-Rydza).

**Strona sprawdzona lokalnie** (serwer statyczny, bez błędów w konsoli): przełączniki Od/Przed 5.10, Schemat/Mapa,
motyw jasny i ciemny, wyróżnianie linii, zakładka „Zmiany”, wszystkie 18 linków do pobrania zwraca 200 w obu motywach.

**Różnica między schematem a mapą:** schemat skleja Rondo Lotników (Pabianicka i Paderewskiego) w jeden węzeł, mapa
rysuje dwa przystanki. Obrócenie schematu o 8° względem północy jest zamierzone; napis „północ (kierunki przybliżone)” zostaje.

**Zachowane:** tag `schemat-lodz-tram-octi-2026-10-12` (stan strony przed zmianą), katalog roboczy `archiwum_tram_octi/`
z nieodtwarzalnym `octi.json`.
