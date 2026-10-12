# Notatki: widok geograficzny (`geo.js`)

Obserwacje i wnioski z poprawiania widoku geograficznego. Co sprawdziłem, co zadziałało, co nie i dlaczego.
Nowe wpisy dopisuj na końcu, z datą.

## Jak testuję

- Zrzuty robi headless Chrome (`--headless=new --allow-file-access-from-files --virtual-time-budget=15000`) na kopii strony.
  Do `index.html` jest doklejony skrypt, który z parametrów URL ustawia `lat`, `lon`, `z`, motyw i wybrane linie.
  Warianty kodu przełączam parametrem w URL w kopii `geo.js`, nie w repo. Porównuję kolaż „obecny | wariant”.
- Zdarza się wyścig: zrzut łapie stan sprzed ostatniego `draw()`. Raz przez to „zniknęła” linia T13.
  Zanim uznasz, że coś zniknęło, zrób zrzut drugi raz albo wypisz stan przez `console.log`
  (Chrome z `--enable-logging=stderr` wypisuje go na stderr).
- Szybki test bez przeglądarki: funkcje działające na samych danych (`dropEyes`, `chainEdges`) można wyciąć z pliku
  i uruchomić w `node` na `mapy/tram_geo.json`.
- Kontrola rozerwań: policz końce linii (`ends` z jednym wpisem) z nowym kodem i bez niego. Każdy dodatkowy koniec
  to albo krańcówka, albo rozerwana linia.

## Jak robi to LOOM (kod źródłowy w WSL `~/loom/src`)

- `transitmap` przed rysowaniem wywołuje `contractStrayNds()`, `smooth()`, `writeNodeFronts()`,
  `expandOverlappinFronts()` i `createMetaNodes()`.
- **Przekrój wiązki (node front)** stoi dokładnie w węźle. Cofa się od niego krokami (szerokość/10) tylko wtedy,
  gdy nachodzi na przekrój sąsiedniej krawędzi.
- **Węzeł, przez który linie po prostu przejeżdżają**, nie ma żadnego cięcia ani łuku. Jeśli przekroje są bliżej
  niż 5 jednostek, połączenie jest prostym odcinkiem.
- **Łuki w węzłach** to Bézier z punktami kontrolnymi w odległości ok. 0,55 × średniej odległości do przecięcia
  stycznych.
- **Wygładzanie** odbywa się w metrach, na całej krawędzi: `smoothenOutliers(50)`, `simplify`, Chaikin.
  `topo --smooth` jest domyślnie wyłączone.
- **Kafle MVT**: szerokość linii i odstęp są podawane w pikselach i przeliczane na metry dla danego zoomu.
  Geometria jest ta sama na każdym zoomie.
- **Strona LOOM** bierze dane z OSM, a nie z GTFS. Przebiegi z OSM są czystsze niż kształty z GTFS, więc część
  „równości” ich linii to po prostu lepsze dane wejściowe.

## Wnioski

1. **Zagięcia brały się z cięcia wiązki na każdym przystanku (12.10.2026).**
   - W `tram_geo.json` przystanek jest węzłem, więc krawędzie są krótkie: 411 krawędzi, mediana ok. 400 m.
   - 304 z 312 węzłów stopnia 2 to miejsca, gdzie te same linie jadą dalej w tej samej kolejności.
   - Każdy kawałek był wygładzany osobno z przypiętymi końcami, więc kierunki na styku nie pasowały,
     a łuk w węźle robił „S”.
   - Naprawa: `chainEdges()` skleja takie krawędzie w jedną polilinię od węzła przesiadkowego do następnego
     (zostaje ok. 110 krawędzi). Przystanki w środku sklejonej krawędzi trzymamy w `e.mid` i rzutujemy na oś.
   - Uwaga na kolejność linii po odwróceniu krawędzi: lista `l` jest liczona od lewej względem kierunku krawędzi,
     więc przy odwróceniu geometrii trzeba odwrócić także `l`.
2. **Zmiana `SIGMA` (8 / 16 / 30 px) prawie nic nie zmienia.** Wygładzanie nie było przyczyną. 30 zaokrągla
   prawdziwe zakręty. Zostaje 16.
3. **Bliskie węzły grupujemy jak meta-węzły LOOM.**
   - Kryterium: krawędź krótsza niż suma promieni cięcia jej końców. Wtedy cięcia nachodzą na siebie, a krawędź
     zamieniała się w same łuki.
   - Taka krawędź znika, jej węzły łączą się (union-find), linie przechodzą przez grupę jednym łukiem.
   - Grupowanie zależy od zoomu: z11 ok. 45 krawędzi, z14 18, z17 0.
   - Skutek uboczny: pętle nawrotowe na krańcówkach przy małym zoomie chowają się w grupie, a linia kończy się
     przed nią. Na z11–14 jest to w porządku.
4. **Zakosy przy zmianie kolejności wynikały z centrowania wiązki.**
   - Wiązka jest centrowana na swojej osi. Gdy dochodzi jedna linia (n → n+1), każda linia jadąca dalej musi
     przeskoczyć o pół odstępu, a robi to w obrębie promienia węzła, więc stromo.
   - Sprawdziłem trzy warianty:
     - **przesuw całej wiązki** o średnie niedopasowanie: linie jadące dalej przestają skakać, ale ta obok
       dołączającej nadal skacze o pół odstępu;
     - **przesuw każdej linii osobno**: linie jadące dalej są idealnie proste, ale dołączająca linia jedzie
       po sąsiedniej (np. T6 po T13 nad Rondem);
     - **regresja izotoniczna** (pool adjacent violators): każda linia jak najbliżej swojej kontynuacji, przy
       zachowanej kolejności i odstępie ≥ pitch. Linia dochodząca ma wagę 0,05, więc ustępuje miejsca.
       Wybrany: linie jadące dalej są proste, a dołączająca wsuwa się łagodnie.
   - Przesunięcie dzielimy po połowie na obie krawędzie i rozkładamy wzdłuż krawędzi funkcją smoothstep.
     Na długich krawędziach zmiana jest niewidoczna.
   - „Partner” linii na węźle to koniec tej samej linii na innej krawędzi o kierunku prawie przeciwnym
     (cos > 0,8, czyli do ok. 37°). Odgałęzienie pod większym kątem traktujemy jak linię dochodzącą.
5. **Czego tym sposobem nie da się usunąć.** Prawdziwe skrzyżowanie wynikające z kolejności `loom`
   (np. T6 musi przeciąć T13, bo przychodzi z lewej, a ma miejsce po prawej) zostaje. Jest tylko krótsze.
   Usunięcie go wymaga zmiany kolejności w `loom` albo ręcznego wymuszenia kolejności.

## Pomysły, których nie robiłem

- Wygładzanie w metrach zamiast w pikselach, jak w LOOM: ta sama geometria na każdym zoomie.
- Przebiegi z OSM (pfaedle albo relacje OSM) zamiast kształtów z GTFS: to usunęłoby fale z geometrii `topo`.

## Dziennik pracy: błędy, pułapki i niejasności (12.10.2026)

Wszystko, na co trafiłem przy trzech rundach poprawek, a czego nie ma wyżej.

### Błędy w kodzie i ich przyczyny

1. **„Nie udało się wczytać mapy” po przepisaniu `geo.js`.**
   - W konsoli było `TypeError: this[e] is not a function` w `_initTooltipInteractions`.
   - Przyczyna: na markerze ustawiłem własne pole `m.on = true`, które nadpisało metodę Leafleta `on()`.
   - Naprawa: zmiana nazwy na `m.lit`.
   - Zasada: na warstwach Leafleta nie twórz pól o nazwach jego metod (`on`, `off`, `fire`, `remove`, `options`...).
2. **Wyróżnienie linii trwało ok. 485 ms**, bo przebudowywało wszystkie tooltipy przystanków.
   - Naprawa: podział na `stops()` (budowa, tylko w `draw()`) i `paintStops()` (sam styl przy zmianie wyboru).
   - Teraz ok. 6 ms.
3. **Wiązki były lustrzanym odbiciem kolejności z LOOM.**
   - Na węzłach było 121 przecięć linii, po odwróceniu znaku przesunięcia 48. Liczone skryptem, nie na oko.
   - LOOM podaje linie od lewej względem kierunku krawędzi w układzie geograficznym (y w górę), a ekran ma y w dół.
4. **Pastylki przystanków chowały się pod wyróżnioną linią.**
   - Na canvasie kolejność rysowania to kolejność dodawania warstw, a `paintLines()` daje wyróżnionym liniom
     `bringToFront()`.
   - Naprawa: po nich `bringToFront()` także na pastylkach.
5. **Wywrotka na telefonie i na małym zoomie:** `TypeError: Cannot read properties of undefined (reading 'x') at dir`.
   - Krawędź krótsza niż piksel po wygładzeniu i Douglas-Peuckerze miała 1 punkt.
   - Naprawa: `if (px.length < 2) px.push(px[0])`.
6. **`Map container is already initialized`** przy próbie przebudowania mapy na żywej stronie z konsoli
   (`GeoMap(...)` drugi raz na tym samym `div`).
   - Do takich eksperymentów podmień kontener na świeży: `o.replaceWith(o.cloneNode(false))`.
   - Na stronie przełączanie danych powinno używać istniejącej mapy, nie tworzyć nowej.

### Pułapki środowiska i narzędzi

- **Serwer.** Port 8791 był zajęty przez serwer z innej sesji, więc `preview_start` się nie udał. Ten serwer serwował
  jednak właściwy katalog. Sprawdzaj go przez `curl -s localhost:8791/schemat-linii-gzm/ | grep -o 'geo.js?v=[a-f0-9]*'`
  i porównaj hash z `index.html`. Zgodny hash oznacza aktualną wersję.
- **Panel przeglądarki aplikacji.** Zrzuty kończyły się „Screenshot timed out after 5s”, panel był za wąski na
  widok desktopowy, a `file://` nie działa bez otwartego folderu projektu. Dlatego zbudowałem headless harness (`shot.py`).
- **Harness `shot.py`.**
  - Kopiuje stronę do katalogu tymczasowego, dokleja skrypt sterujący i robi zrzut Chrome z
    `--allow-file-access-from-files` (bez tego `fetch` danych z `file://` nie działa).
  - Pastylki przy wyróżnieniu czasem nie wychodzą na zrzucie, a na żywej stronie działają.
  - Równoległe uruchomienia dzielą ten sam katalog `h/`: zrzuty wychodzą wtedy z przesuniętym widokiem.
    Do kolaży porównawczych uruchamiaj je po kolei.
  - Zmienne: `GEO` (który `geo.js` skopiować), `Q` (dodatkowe parametry URL).
  - Logi konsoli: flagi `--enable-logging=stderr --v=0` i szukanie linii `DBG` w stderr.
- **Artykuł o LOOM (PDF).** WebFetch nie umiał go przeczytać (skompresowane strumienie). W tym środowisku nie ma
  `pdftotext` w WSL ani `fitz`/`pypdf` w Pythonie. Zamiast artykułu czytałem kod źródłowy LOOM
  (`~/loom/src` w WSL) i to dało więcej konkretów.
- **Opcje narzędzi LOOM** (z `--help`):
  - `topo --smooth` (domyślnie 0);
  - `transitmap --smoothing` (domyślnie 1);
  - `--render-engine svg|mvt`, `-z` zoomy MVT;
  - `--line-width` 20, `--line-spacing` 10, `--outline-width` 1.
- **Przebudowa strony** po każdej zmianie `geo.js` (wstawia nowy `?v=`):
  `cd C:\Users\Michal\Desktop\easy\schemat-gzm-dane; py -3 -X utf8 ../mapy-analizy/schemat-linii-gzm/pipeline/build_page.py . ../mapy-analizy/schemat-linii-gzm/pipeline/page_tpl.html ../mapy-analizy/schemat-linii-gzm/index.html`.
  Ostrzeżenie git „LF will be replaced by CRLF” jest nieszkodliwe.
- **Heredoki w Git Bash.** Przy dłuższych edycjach Pythonem przez heredoc łatwo o
  `SyntaxError: unterminated string literal`. Bezpieczniej: `<<'EOF'` (z apostrofami) i asercja `count(a) == 1`
  przed każdą podmianą tekstu.

### Styl kafli LOOM (zdekodowane MVT ze strony loom.cs.uni-freiburg.de)

- Strona LOOM nie dostaje gotowych kolorów ani grubości w stylu mapy. Bierze geometrię i właściwości z kafli
  (`transitmap --render-engine=mvt`), a styl nakłada w przeglądarce.
- Warstwa linii:
  - czarna obwódka o szerokości w+2, zakończenie `butt`;
  - na niej linia w kolorze o szerokości w, zakończenie `round`;
  - z14: w = 3, odstęp osi 5; z16: w = 4, odstęp 7.
- Obwódki sąsiednich linii stykają się, więc linie wyglądają, jakby leżały „obok siebie” z cienką ciemną kreską
  między nimi. Wcześniej mieliśmy szersze odstępy i jasną obwódkę, stąd wrażenie rozdzielonych linii.
- U nas: `pitch = w + 1`, obwódka w+2 `#16181d`, szerokość ok. 75% dawnej (z16 = 6 px).
- Do dekodowania kafli wystarczył mały dekoder protobuf w Pythonie (bez bibliotek).

### Liczby z danych GZM (do porównań)

- `tram_geo.json` (po `dropEyes`): 411 krawędzi, 385 węzłów, 312 węzłów stopnia 2, w tym 303 przystanki.
- Węzły stopnia 2:
  - 304: te same linie w tej samej kolejności;
  - 3: te same linie w innej kolejności;
  - 5: inne linie.
- Po `chainEdges` zostaje ok. 110 krawędzi.
- Końce linii (`ends` z jednym wpisem): bez grupowania 38 na każdym zoomie, z grupowaniem z11 50, z14 46, z16 38.
  Wszystkie dodatkowe końce to krańcówki z pętlami (Zawodzie, Bytom Plac Sikorskiego, Plac Miarki).
- „Oczka”: 7 miejsc (np. Plac Wolności). Zwinięcie przesuwa linię o 50–150 m na sąsiednią ulicę.

### Niejasności i decyzje, których nie byłem pewien

- **Próg „partnera” linii na węźle.** Na początku cos > 0,3 (do ok. 72°). To łapało odgałęzienia i dawało
  bezsensowne niedopasowania. Zmieniłem na 0,8.
- **Waga linii dochodzącej w regresji izotonicznej** (0,05): dobrana na oko na Rondzie i Rynku. Większa waga
  wypycha sąsiadów, mniejsza nic nie zmienia.
- **Promień grupowania.** Kryterium „krawędź < suma promieni cięcia” jest analogią do nakładania się przekrojów
  w LOOM, a nie kopią ich algorytmu. Łańcuch krótkich krawędzi może dać dużą grupę (w Katowicach na z13 do 8 węzłów).
  Łuk przez taką grupę zna tylko styczne na brzegach.
- **Pastylka krańcówki w grupie** (Bytom Plac Sikorskiego, z14) bywa wydłużona, bo jej końce to najbliższe punkty
  łuków różnych linii. Nie poprawiałem.
- **Etykiety.** W gęstym centrum Katowic na z14 część nazw jest tylko w tooltipie, bo żadna z 4 pozycji się nie mieści.
  Tooltipy Leafleta mają w CSS margines ok. 6 px, co trzeba doliczyć przy przesunięciach.
- **Skrzyżowania z kolejności `loom`** (T6 / T13 nad Rondem) zostają. Nie sprawdzałem, czy inna kolejność z
  `loom` dałaby ich mniej. Do sprawdzenia są: metoda `-m` (domyślnie `comb-no-ilp`, `ilp` wymaga solvera glpk,
  cbc albo gurobi), kary `--same-seg-cross-pen` (4), `--diff-seg-cross-pen` (1), `--in-stat-cross-pen-*`,
  `--sep-pen` (3), `--no-untangle` i `--no-prune`. Wymaga to ponownego uruchomienia `loom` na zarchiwizowanym `topo`,
  a nowa kolejność zmieni też schemat, jeśli przeliczysz `octi`.

### Poza GZM

- Przy pisaniu promptu dla Łodzi (`schemat-linii-lodz/PROMPT_mapa-geograficzna.md`) wyszło, że:
  - `serving.py` w `schemat-linii-lodz/pipeline/` jest starszy niż wersja w skillu;
  - `*.loom.json` Łodzi powstał po `hubsnap.py`, który zmienia `topo.json` w miejscu;
  - w Łodzi nie ma pliku `*_geo.json`, trzeba go zrobić tak jak `3_geo.json` w GZM.
- Nieśledzone pliki `schemat-linii-lodz/*.jpg|pdf|png` należą do innej pracy. Zostawiałem je poza commitami.
