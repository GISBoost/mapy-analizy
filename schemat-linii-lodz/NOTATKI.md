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
