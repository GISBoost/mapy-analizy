# mapy-analizy

Hub interaktywnych map dla analiz przestrzennych [GISBoost](https://gisboost.github.io/).
Jedna analiza = jeden folder = jedna statyczna podstrona (vanilla JS + Leaflet, zero
build stepu — ten sam wzorzec bez frameworka co
[gtfs-dashboard](https://github.com/GISBoost/gtfs-dashboard), tylko lekki i bez własnego
CI, więc nie zasługuje na osobne repo per analiza).

Wdrożenie: GitHub Pages z brancha `main`, `index.html` w korzeniu = strona-spis
(`gisboost.github.io/mapy-analizy/`), każdy folder = osobna podstrona
(`gisboost.github.io/mapy-analizy/<folder>/`).

## Analizy

- **[uczelnie-dostepnosc](uczelnie-dostepnosc/)** — dostępność do uczelni, 6 miast.
- **[odstepy-przystankow](odstepy-przystankow/)** — mediana odstępu między przyjazdami na przystanku, 4 miasta.
- **[izochrony-transport](izochrony-transport/)** — interaktywna izochrona dojazdu (hover/klik/suwak pory dnia), 6 miast. Też
  lustrzana na [Cloudflare Pages](https://mapy-analizy.pages.dev/izochrony-transport/) — patrz README tego folderu.
- **[opoznienia-dostepnosc](opoznienia-dostepnosc/)** — gdzie rozkład zrealizowany P50 zmienia dostępność (szkoły, apteki, uczelnie, centra handlowe) względem statycznego, siatka 250 m i 500 m, 6 miast.
- **[badanie-opoznienia](badanie-opoznienia/)** — raport z tej analizy: hipoteza stref przesiadkowych (obalona poza Łodzią), dlaczego znak efektu zależy od napięcia rozkładu, rozbicie na heksagony. Osobna zakładka w górnej belce, nie folder-mapa.

## Dodawanie nowej analizy

1. Nowy folder w korzeniu repo (`nazwa-analizy/`), własny `index.html` + `app.js` +
   `styles.css` + `data/*.geojson` — w pełni samodzielny, nie zależy od plików innych
   analiz.
2. Dopisz kartę w `index.html` (korzeń repo) w sekcji `.cards`.
3. Dopisz link w tym README.

Górna belka (`.topbar` w `styles.css`) jest tylko na stronie-spisie i na `badanie-opoznienia/`
— to jedyne strony, które są „całą witryną, po której się przełączasz". Podstrony-mapy mają
własne nagłówki i nie potrzebują belki.

Współdzielenie kodu między folderami (wspólny JS framework, wspólne komponenty UI) ma
sens dopiero gdy będą co najmniej 2-3 analizy i widać, co faktycznie się powtarza —
nie wyciągaj tego wcześniej "na zapas".

## Licencja

MIT (kod). Dane pochodne mają własne licencje wskazane w README każdego folderu
(zwykle OpenStreetMap/ODbL + GTFS operatorów).
