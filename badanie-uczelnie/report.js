"use strict";

// Static research write-up: transit accessibility to universities, 6 Polish cities.
// Vanilla JS, no build step. Chart helpers shared from ../charts.js. All numbers below
// are transcribed from docs/analizy/dostepnosc-uczelnie.md (gisboostgithub) — no new
// computation happens here, this page only presents it in the badanie-opoznienia style.

const LANG_KEY = "mapyAnalizyLang";
const getLang = () => (localStorage.getItem(LANG_KEY) === "en" ? "en" : "pl");

const CITY_PL = { poznan: "Poznań", krakow: "Kraków", szczecin: "Szczecin", lodz: "Łódź", warszawa: "Warszawa", gdansk: "Gdańsk" };

// city order matches the source table (ascending by unweighted %)
const DATA = [
  { key: "poznan", unweighted: 53.3, weighted: 21.4, r: 0.225 },
  { key: "krakow", unweighted: 53.6, weighted: 28.9, r: 0.286 },
  { key: "szczecin", unweighted: 58.1, weighted: 28.2, r: 0.210 },
  { key: "lodz", unweighted: 60.9, weighted: 36.9, r: 0.147 },
  { key: "warszawa", unweighted: 69.1, weighted: 43.2, r: 0.042 },
  { key: "gdansk", unweighted: 66.9, weighted: 54.0, r: 0.018 },
];

const STR = {
  pl: {
    title: "61% obszaru bez dostępu do uczelni w 6 miastach — GISBoost",
    brandSub: "/ analizy mapowe",
    navCatalog: "Analizy",
    navReport: "Badanie: uczelnie",
    crumbHere: "Badanie: uczelnie",
    langToggleAriaLabel: "Przełącz język",
    kicker: "Easy-R5 · dostępność do uczelni · 6 miast",
    h1: "61% obszaru zamieszkanego przez studentów bez dostępu do uczelni w pół godziny",
    expLabel: "Eksperymentalne — praca w toku",
    expHtml:
      "Ten raport w całości wygenerowała AI (Claude) na podstawie kodu i danych Michała Kaczorowskiego — to " +
      "wstępna, robocza wersja pomocna do rozeznania się w temacie, nie ostateczne wnioski badawcze. Liczby " +
      "i interpretacje traktuj jako punkt wyjścia do dalszej weryfikacji.",
    lede1Html:
      "Dla studentów (mieszkańcy 20-29 lat, proxy z NSP2021) policzyliśmy dostępność do budynków uczelnianych " +
      "transportem publicznym w progu 30 minut, siatka heksagonalna 500 m, na zrealizowanym rozkładzie GTFS " +
      "(easy-GTFS-RT, wariant p50). Najpierw pilotaż w Łodzi, potem pięć kolejnych miast: Warszawa, Kraków, " +
      "Gdańsk, Poznań, Szczecin.",
    lede2Html:
      "W Łodzi <b>61% heksagonów z populacją studencką (390 z 640) nie ma dostępu do żadnej z trzech uczelni</b> " +
      "w 30 minut — dla porównania, dostępność do jakiejkolwiek usługi publicznej dla całej populacji " +
      "(poprzedni wpis) wynosiła 98,7% w tym samym progu. Dostęp do uczelni jest dużo bardziej przestrzennie " +
      "ograniczony niż dostęp do usług ogółem.",
    tileCities: "miast",
    tileUnis: "uczelnie na miasto",
    tileCutoff: "próg dojazdu",
    tileGrid: "siatka heksagonalna",
    s1Heading: "1. Korekta metody: heksagony bez dostępu vs studenci bez dostępu",
    s1SubHtml:
      "Pierwsza wersja liczyła <b>% heksagonów</b> bez dostępu do żadnej uczelni — ale to traktuje jednakowo " +
      "heksagon na peryferiach z jednym studentem i gęsty heksagon centrum z pięciuset. Po zamianie na metrykę " +
      "<b>ważoną liczbą mieszkańców 20-29 lat</b>, obraz jest wyraźnie mniej dramatyczny — i kolejność miast " +
      "się zmienia.",
    s1CaptionHtml:
      "Realny obraz to 21–54% studentów bez dostępu, nie 53–70% heksagonów. Po ważeniu populacją to " +
      "<b>Gdańsk</b>, nie Warszawa, wypada najgorzej — głównie dlatego że ma najmniej budynków uczelni ze " +
      "wszystkich sześciu miast (37), w połączeniu z konkretnym rozkładem gęstości zaludnienia.",
    legUnweighted: "% heksagonów bez dostępu (nieważone)",
    legWeighted: "% populacji 20-29 bez dostępu (ważone)",
    s2Heading: "2. Dochód nie tłumaczy dostępności do uczelni",
    s2SubHtml:
      "Korelacja Pearsona dochodu (heksagony, próg 30 min) z dostępnością do uczelni, per miasto — ta sama " +
      "analiza co dla usług publicznych ogółem w poprzednim wpisie, teraz powtórzona dla studentów.",
    s2CaptionHtml:
      "Wszystkie korelacje dodatnie, słabe do umiarkowanych — żadne miasto nie pokazuje wzorca „biedny = " +
      "gorszy dostęp”. Wniosek z poprzedniego wpisu (odległość od centrum tłumaczy dostępność lepiej niż " +
      "dochód) uogólnia się na wszystkie sześć miast.",
    s3Heading: "3. Uczelnie objęte analizą",
    s3SubHtml:
      "Lista uczelni jest dopasowana do lokalnych realiów — nie każde miasto ma osobną politechnikę czy " +
      "uczelnię medyczną. We wszystkich miastach poza Poznaniem uczelnia medyczna ma najsłabszą przestrzenną " +
      "dostępność: mniejsze, rozproszone kampusy przy szpitalach klinicznych, nie jeden zwarty kampus.",
    thCity: "Miasto", thUni1: "Uczelnia 1", thUni2: "Uczelnia 2", thUni3: "Uczelnia 3",
    ujCmNote: "Collegium Medicum UJ: 0 trafień w OSM",
    s4Heading: "Metoda i źródła",
    s4SubHtml:
      "Budynki uczelni: Overpass API (<code>amenity=university/college</code>, <code>building=university</code>). " +
      "Sieć: wyciągi Geofabrik przycięte <code>osmosis</code> (flaga <code>completeWays=yes</code>). Silnik: " +
      '<a href="https://ipeagit.github.io/r5r/" target="_blank" rel="noopener">r5r</a> na zrealizowanym GTFS p50 ' +
      "z easy-GTFS-RT. <b>Ciekawostka z procesu:</b> pierwsza wersja wyniku okazała się zawyżona, bo skrypt " +
      "liczący miał zahardkodowaną datę, która dla pięciu z sześciu miast wypadła w sobotę zamiast dnia " +
      "powszedniego — błąd znaleziony przez niezależny audyt zlecony świeżemu agentowi, bez wcześniejszego " +
      "kontekstu analizy.",
    s4LinksHtml:
      'Pełny opis: <a href="https://github.com/GISBoost/easy-R5/tree/main/tools/accessibility_lodz" target="_blank" rel="noopener">easy-R5 · tools/accessibility_lodz</a> ' +
      '(Łódź) i <a href="https://github.com/GISBoost/easy-R5/tree/main/tools/accessibility_cities" target="_blank" rel="noopener">tools/accessibility_cities</a> ' +
      '(6 miast). Pierwotny wpis na portalu: <a href="https://gisboost.github.io/analizy/dostepnosc-uczelnie/">gisboost.github.io/analizy/dostepnosc-uczelnie</a>.',
    sourceNoteHtml:
      'Interaktywna mapa (wszystkie 6 miast, przełącznik dominującej uczelni / liczby dostępnych / włączania ' +
      'każdej z osobna): <a href="../uczelnie-dostepnosc/">Dojazd na uczelnię</a>.',
    footerBack: "← wszystkie analizy",
  },
  en: {
    title: "61% of the area without university access in 6 cities — GISBoost",
    brandSub: "/ map analyses",
    navCatalog: "Analyses",
    navReport: "Study: universities",
    crumbHere: "Study: universities",
    langToggleAriaLabel: "Switch language",
    kicker: "Easy-R5 · university accessibility · 6 cities",
    h1: "61% of the area where students live has no university within a 30-minute ride",
    expLabel: "Experimental — work in progress",
    expHtml:
      "This write-up was generated entirely by AI (Claude) from Michał Kaczorowski's code and data — an " +
      "early, working draft meant to help scope the topic, not a final research conclusion. Treat the numbers " +
      "and interpretations as a starting point for further verification.",
    lede1Html:
      "For students (residents aged 20-29, a proxy from the 2021 census) we computed transit accessibility to " +
      "university buildings within a 30-minute cutoff, 500 m hex grid, on the realized GTFS schedule " +
      "(easy-GTFS-RT, p50 variant). Łódź first as a pilot, then five more cities: Warsaw, Kraków, Gdańsk, " +
      "Poznań, Szczecin.",
    lede2Html:
      "In Łódź, <b>61% of hexagons with student population (390 of 640) have no access to any of the three " +
      "universities</b> within 30 minutes — for comparison, accessibility to any public service for the whole " +
      "population (previous post) was 98.7% at the same cutoff. University access is far more spatially " +
      "constrained than access to services in general.",
    tileCities: "cities",
    tileUnis: "universities per city",
    tileCutoff: "travel-time cutoff",
    tileGrid: "hex grid",
    s1Heading: "1. Correcting the method: hexagons without access vs. students without access",
    s1SubHtml:
      "The first version counted <b>% of hexagons</b> without access to any university — but that treats a " +
      "fringe hexagon with one student the same as a dense downtown hexagon with five hundred. After switching " +
      "to a metric <b>weighted by the 20-29 population</b>, the picture is markedly less dramatic — and the " +
      "city ranking changes.",
    s1CaptionHtml:
      "The real picture is 21–54% of students without access, not 53–70% of hexagons. After population " +
      "weighting, it's <b>Gdańsk</b>, not Warsaw, that comes out worst — mainly because it has the fewest " +
      "university buildings of all six cities (37), combined with its specific population-density pattern.",
    legUnweighted: "% of hexagons without access (unweighted)",
    legWeighted: "% of 20-29 population without access (weighted)",
    s2Heading: "2. Income doesn't explain university accessibility",
    s2SubHtml:
      "Pearson correlation of income (hexagons, 30-minute cutoff) with university accessibility, per city — " +
      "the same analysis run for public services overall in the previous post, now repeated for students.",
    s2CaptionHtml:
      "All correlations are positive, weak to moderate — no city shows a “poorer = worse access” pattern. The " +
      "previous post's conclusion (distance from the core explains accessibility better than income) " +
      "generalizes to all six cities.",
    s3Heading: "3. Universities covered by the analysis",
    s3SubHtml:
      "The university list is matched to local realities — not every city has its own polytechnic or medical " +
      "university. In every city except Poznań, the medical university has the weakest spatial accessibility: " +
      "smaller, scattered campuses next to teaching hospitals rather than one compact campus.",
    thCity: "City", thUni1: "University 1", thUni2: "University 2", thUni3: "University 3",
    ujCmNote: "Collegium Medicum UJ: 0 OSM matches",
    s4Heading: "Method and sources",
    s4SubHtml:
      "University buildings: Overpass API (<code>amenity=university/college</code>, " +
      "<code>building=university</code>). Network: Geofabrik extracts clipped with <code>osmosis</code> " +
      '(<code>completeWays=yes</code>). Engine: <a href="https://ipeagit.github.io/r5r/" target="_blank" ' +
      "rel=\"noopener\">r5r</a> on the realized p50 GTFS schedule from easy-GTFS-RT. <b>A detail from the " +
      "process:</b> the first version of the result was inflated because the computation script had a " +
      "hardcoded date that landed on a Saturday instead of a weekday for five of the six cities — caught by an " +
      "independent audit run by a fresh agent with no prior context on the analysis.",
    s4LinksHtml:
      'Full write-up: <a href="https://github.com/GISBoost/easy-R5/tree/main/tools/accessibility_lodz" target="_blank" rel="noopener">easy-R5 · tools/accessibility_lodz</a> ' +
      '(Łódź) and <a href="https://github.com/GISBoost/easy-R5/tree/main/tools/accessibility_cities" target="_blank" rel="noopener">tools/accessibility_cities</a> ' +
      '(6 cities). Original portal post: <a href="https://gisboost.github.io/analizy/dostepnosc-uczelnie/">gisboost.github.io/analizy/dostepnosc-uczelnie</a>.',
    sourceNoteHtml:
      'Interactive map (all 6 cities, switch dominant university / count reachable / toggle each on its own): ' +
      '<a href="../uczelnie-dostepnosc/">Getting to university</a>.',
    footerBack: "← all analyses",
  },
};

function t(key) {
  const d = STR[getLang()];
  return Object.prototype.hasOwnProperty.call(d, key) ? d[key] : key;
}

function applyStaticI18n() {
  document.documentElement.lang = getLang();
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel)); });
  const btn = document.getElementById("langToggleBtn");
  if (btn) btn.textContent = getLang() === "pl" ? "EN" : "PL";
}

function renderCharts() {
  renderLegend("uczLegend", [
    { c: CHART_COL.neutral, l: t("legUnweighted") },
    { c: CHART_COL.pos, l: t("legWeighted") },
  ]);
  barChartGrouped(
    "uczChart",
    DATA.map((c) => ({
      label: CITY_PL[c.key],
      series: [
        { value: c.unweighted, color: CHART_COL.neutral },
        { value: c.weighted, color: CHART_COL.pos },
      ],
    })),
    { unit: "%", decimals: 1, labelWidth: 90 }
  );
  barChartDiverging(
    "incChart",
    [...DATA].sort((a, b) => a.r - b.r).map((c) => ({ label: CITY_PL[c.key], value: c.r })),
    { unit: "", decimals: 3, labelWidth: 90 }
  );
}

function renderAll() {
  applyStaticI18n();
  renderCharts();
}

document.addEventListener("DOMContentLoaded", () => {
  renderAll();
  const btn = document.getElementById("langToggleBtn");
  if (btn) btn.addEventListener("click", () => { localStorage.setItem(LANG_KEY, getLang() === "pl" ? "en" : "pl"); renderAll(); });
});
