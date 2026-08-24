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

## Dodawanie nowej analizy

1. Nowy folder w korzeniu repo (`nazwa-analizy/`), własny `index.html` + `app.js` +
   `styles.css` + `data/*.geojson` — w pełni samodzielny, nie zależy od plików innych
   analiz.
2. Dopisz kartę w `index.html` (korzeń repo) w sekcji `.cards`.
3. Dopisz link w tym README.

Współdzielenie kodu między folderami (wspólny JS framework, wspólne komponenty UI) ma
sens dopiero gdy będą co najmniej 2-3 analizy i widać, co faktycznie się powtarza —
nie wyciągaj tego wcześniej "na zapas".

## Licencja

MIT (kod). Dane pochodne mają własne licencje wskazane w README każdego folderu
(zwykle OpenStreetMap/ODbL + GTFS operatorów).
