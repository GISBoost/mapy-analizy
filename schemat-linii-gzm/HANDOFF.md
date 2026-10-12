# Handoff: schemat linii tramwajowych GZM

Stan na 12.10.2026. Wszystko lokalnie, **nic nie jest wypushowane**. Nie pushuj, dopóki użytkownik o to nie poprosi.

## Prompt dla następnego agenta

> Kontynuujesz projekt schematu linii tramwajowych GZM w `C:\Users\Michal\Desktop\easy\mapy-analizy\schemat-linii-gzm\`. Przeczytaj `HANDOFF.md`, `README.md` i `geo.js`.
>
> **Twoje zadanie: naprawa widoku geograficznego** (schemat nałożony na mapę OSM, przełącznik „Mapa" na stronie).
> 1. Uruchom stronę przez serwer (`py -m http.server 8791` z katalogu `mapy-analizy`, adres `http://localhost:8791/schemat-linii-gzm/`). `file://` nie zadziała.
> 2. Przejrzyj widok geograficzny na zoomach 11–17, w jasnym i ciemnym motywie, także w wąskim oknie (telefon).
> 3. Przybliż się do linii i przystanków. Oceń rozmieszczenie etykiet (nakładanie się w gęstym centrum Katowic, Sosnowca, Chorzowa), kształt wiązek linii, pastylek przystanków, węzłów i przesiadek, czytelność przy podświetleniu jednej linii.
> 4. Zrób zrzuty problematycznych miejsc.
> 5. **Zanim cokolwiek zmienisz**, zapytaj użytkownika (AskUserQuestion), co chce poprawić. Do każdego znalezionego problemu zaproponuj 2–3 opcje poprawki ze skutkami i rekomendacją, najlepiej ze zrzutem.
> 6. Poprawki rób tylko w tym, co wybrał. Możesz commitować lokalnie (jedno repo `mapy-analizy`, Conventional Commits po angielsku), **nie pushuj**.

## Co jest zbudowane

Strona statyczna (vanilla JS, bez build stepu) z dwoma widokami tych samych 26 linii tramwajowych GZM, dzień roboczy środa 16.09.2026 (GTFS ZTM GZM):

- **Schemat** (LOOM, oktylinearny) z warstwą orientacyjną z OSM (tory, parki, nazwy miast, piktogramy), lupa na centrum Katowic, pan/zoom, podświetlanie linii, motyw jasny/ciemny.
- **Mapa geograficzna** (Leaflet 1.9.4 z unpkg, kafelki OSM w skali szarości, canvas) z liniami rysowanymi jak na schemacie: wiązki równoległych linii, obwódka, pastylki przystanków, podświetlanie linii, tooltipy.
- **Druk**: PDF/SVG/JPG, jasny i ciemny, plakat 1189 × 618 mm.

## Pliki

Katalog projektu: `mapy-analizy/schemat-linii-gzm/`

| Plik | Rola |
|---|---|
| `index.html` | **generowany** przez `pipeline/build_page.py` z `pipeline/page_tpl.html`. Nie edytuj ręcznie |
| `geo.js` | **ręcznie pisany**, widok geograficzny. `window.GeoMap(el, D, S)`; zwraca `{map, repaint, invalidate, fit}` |
| `mapy/tram.svg`, `mapy/tram_geo.json` | dane strony (generowane) |
| `druk/` | PDF/SVG/JPG |
| `pipeline/` | `prep.py`, `build.sh`, `render.ps1`, `render.py`, `landmarks.py`, `geo_export.py`, `build_page.py`, `page_tpl.html`, `pdf.py`, `jpg.py`, `verify.py`, `colors/tram.json` |
| `README.md` | decyzje projektowe z uzasadnieniem i odtwarzanie |

Dane robocze **poza repo**: `C:\Users\Michal\Desktop\easy\schemat-gzm-dane\` (GTFS, `data/tram/`, zaakceptowany układ LOOM w `out/tram_b/`, `geo.json`, `landmarks.json`). LOOM działa w WSL Ubuntu: `/home/michallinux/loom/build`. `octi` jest niedeterministyczny, więc nie odtwarzaj układu od zera. Używaj zarchiwizowanych `3_loom.json` i `4_octi.json`.

## Jak działa `geo.js` (gdzie zacząć)

- **Dane**: `tram_geo.json` ma `lines`, `edges {p, l}` (geometria krawędzi i linie na nich), `stops {ll, n, l, t}`. Kolejność linii w wiązce pochodzi z LOOM.
- **Wygładzanie**: `smooth(p, sig)`: przepróbkowanie co 3 px, filtr Gaussa, odbite brzegi, stałe końce, na końcu Douglas-Peucker. Stała `SIGMA = 16`. Krawędzie: `smooth(dp(project(...), 1.2), SIGMA)`.
- **`chainEdges()`** (przy starcie, po `dropEyes()`): skleja krawędzie przez węzły stopnia 2, gdzie te same linie jadą dalej w tej samej kolejności (304 z 312 takich węzłów). Przystanki w środku sklejonej krawędzi są w `e.mid`; ich miejsce na każdej linii to najbliższy punkt osi (`near`). Wcześniej każdy przystanek ciął wiązkę i dokładał łuk, stąd zagięcia.
- **Grupy węzłów** (w `draw()`, zależnie od zoomu): krawędź krótsza niż suma promieni jej końców znika, a jej węzły łączą się w jeden (`ck`, union-find); linie przechodzą przez grupę jednym łukiem. Przystanek w grupie dostaje najbliższy punkt łuków swojej linii (`conn`). Pętle nawrotowe na krańcówkach przy małym zoomie znikają w grupie.
- **Przesuw końców krawędzi** (w `draw()`, `o.sh`, `iso()`): na węźle każda linia dostaje połowę niedopasowania do swojej kontynuacji (partner: ta sama linia na krawędzi o kierunku prawie przeciwnym, cos > 0,8), dopasowaną regresją izotoniczną, żeby zachować kolejność i odstęp; przesunięcie jest rozłożone wzdłuż krawędzi (smoothstep). `offset(p, d)` przyjmuje funkcję `d(i)`.
- **Notatki z pracy**: `NOTATKI.md` (jak testować, jak robi to LOOM, wnioski z wariantów).
- **`draw()`**: przesunięcia równoległe linii w wiązce (`pitch = w + 1`), wiązki ucięte o promień węzła i połączone łukami Béziera (`ends`, `nodePos`), dwa przebiegi: najpierw wszystkie ciemne obwódki (w+2), potem linie; tooltip i klik → `S.pick(ln)`. `dropEyes()` przy starcie zwija oczka do krótszej ścieżki.
- **Grubość linii**: `width(z)`: z≤10 → 1.5, 11 → 2.3, 12 → 2.9, 13 → 3.6, 14 → 4.5, 15 → 5.3, więcej → 6 (styl z kafli MVT LOOM: linia + obwódka 1 px).
- **`paintLines()` / `paintStops()`**: niewybrane linie dostają kolor zmieszany z tłem (nieprzezroczysty, bez kropek na łączeniach), wybrane idą na wierzch; pastylki obejmują tylko wybrane linie i zawsze leżą nad liniami.
- **`stops(z)`**: pastylka to dwie polilinie (ciemna obwódka + biały środek, okrągłe końce) między dwoma najdalszymi miejscami obsługujących linii na węźle. Przystanki od z≥12, krańcówki wcześniej (z chipami od z≥11), nazwy od z≥15; etykiety z kolizjami (4 pozycje, omijają pastylki, inne etykiety i w miarę możliwości linie), reszta w tooltipie.
- **Strona** (`page_tpl.html`): przełącznik widoków w nagłówku, leniwe `loadGeo()`, `setView()`, `s.pick`/`s.meta` ustawiane przed `GeoMap(...)`, filtry kafelków (szarość, odwrócone w ciemnym), klucz motywu `gzm-theme`.

## Przebudowa strony po zmianach

Z katalogu roboczego `schemat-gzm-dane` (użyj `py -3 -X utf8`, nie `python3`):

```
py -3 -X utf8 C:\Users\Michal\Desktop\easy\mapy-analizy\schemat-linii-gzm\pipeline\build_page.py <WORK> <page_tpl.html> <out index.html>
```

Zmiana samego `geo.js` wymaga tylko ponownego uruchomienia `build_page.py`, bo wstawia on hash `?v=` do `index.html` (cache-buster).

## Znane problemy i podejrzane miejsca (do sprawdzenia)

- (12.10.2026, trzecia runda) Zakosy przy dochodzeniu i odchodzeniu linii usunięte (wariant izotoniczny, zob. `NOTATKI.md`). Zostają krótkie skrzyżowania tam, gdzie kolejność z `loom` wymusza przecięcie linii.
- (12.10.2026, druga runda) Sklejanie krawędzi przez przystanki i grupowanie bliskich węzłów: wiązki proste, skręcają razem. Zostają krótkie „S” tam, gdzie LOOM zmienia kolejność linii, i lekkie fale z geometrii `topo`. Pastylka krańcówki w grupie (np. Bytom Plac Sikorskiego na z14) bywa wydłużona.
- (12.10.2026) Widok geograficzny poprawiony: łuki na węzłach, odwrócona strona wiązek (wcześniej odbite względem LOOM: 121 → 48 przecięć na węzłach), oczka zwinięte, kolizje etykiet, ciemna paleta, zoom startowy. Etykieta, która nie mieści się w żadnej z 4 pozycji, jest tylko w tooltipie.
- Wygładzanie `SIGMA = 16` zaokrągla też prawdziwe zakręty. Kompromis do rozważenia (np. zależność od zoomu).
- Widoku geograficznego nie testowano na telefonie. Ciemny motyw tego widoku w ostatniej wersji też nie był sprawdzany.
- Schemat: tło do 1,5 km od przystanków, dalekie lasy jako blade zielone plamy. Lupa przycina etykietę miasta. Mało szpitali przy przystankach.
- Weryfikacja schematu: 26/26 linii, krańcówki 0 niezgodności; jedno znane scalenie topologii (T15: Piłsudskiego-Sosnowiec / Sobieskiego).

## Zasady

- Nic nie pushuj. Commity lokalne, jedno repo (`mapy-analizy`), Conventional Commits po angielsku.
- Nie zmieniaj istniejących adresów URL ani atrybucji OSM.
- Nie dodawaj bundlera ani zależności npm. Dane robocze nie idą do gita.
