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
- **[badanie-opoznienia](badanie-opoznienia/)** — raport z tej analizy: hipoteza stref przesiadkowych (obalona poza Łodzią), dlaczego znak efektu zależy od napięcia rozkładu, rozbicie na heksagony.
- **[badanie-uczelnie](badanie-uczelnie/)** — raport towarzyszący `uczelnie-dostepnosc`: korekta metody (heksagony vs populacja), dochód jako słaby predyktor. Eksperymentalne — treść w całości wygenerowana przez AI z kodu/danych, oznaczone tagiem na stronie-spisie.
- **[badanie-dochod-obwody](badanie-dochod-obwody/)** — jak oszacowano dochód na poziomie obwodu spisowego metodą MRP, skoro polski spis go nie mierzy. Eksperymentalne.
- **[badanie-dochod-dostepnosc](badanie-dochod-dostepnosc/)** — dochód a dostępność transportowa w Łodzi na zrealizowanym GTFS. Eksperymentalne.

## Dodawanie nowej analizy

1. Nowy folder w korzeniu repo (`nazwa-analizy/`), własny `index.html` + `app.js` +
   `styles.css` + `data/*.geojson` — w pełni samodzielny, nie zależy od plików innych
   analiz.
2. Dopisz kartę w `index.html` (korzeń repo) w sekcji `.cards`.
3. Dopisz link w tym README.

Górna belka (`.topbar`, tokeny w `gisboost-1.css`) jest teraz na każdej podstronie —
`href="../"` do spisu + link/aria-current do bieżącej strony + przełącznik języka, ten sam
markup wszędzie (kontrakt opisany w `gisboostgithub/PROMPT_redesign-system.md` §6.1).

Współdzielenie kodu między folderami ma sens dopiero gdy widać, co faktycznie się powtarza:
`charts.js` (korzeń repo) powstał dopiero przy trzecim raporcie typu `badanie-*` (obok
`badanie-opoznienia`), gdy dublowanie tych samych funkcji rysujących SVG stało się
realnym problemem — nie wyciągaj podobnych rzeczy wcześniej "na zapas".

## Licencja

MIT (kod). Dane pochodne mają własne licencje wskazane w README każdego folderu
(zwykle OpenStreetMap/ODbL + GTFS operatorów).
