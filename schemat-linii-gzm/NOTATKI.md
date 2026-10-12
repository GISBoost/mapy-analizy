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
