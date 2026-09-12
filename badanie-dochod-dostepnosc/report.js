"use strict";

// Static research write-up: income vs. transit accessibility in Łódź, on realized GTFS.
// Vanilla JS, no build step, chart helpers from ../charts.js. All numbers below are
// transcribed from docs/analizy/dostepnosc-dochod-lodz.md (gisboostgithub) — no new
// computation happens here.

const LANG_KEY = "mapyAnalizyLang";
const getLang = () => (localStorage.getItem(LANG_KEY) === "en" ? "en" : "pl");

// threshold -> category -> r
const CORR = {
  15: { edu: -0.128, health: -0.110, culture: 0.019, shops: -0.123, total: -0.117 },
  30: { edu: 0.013, health: 0.070, culture: 0.127, shops: -0.010, total: 0.049 },
  60: { edu: 0.128, health: 0.109, culture: 0.110, shops: 0.127, total: 0.120 },
};

const ACCESS = [
  { key: "edu", v: [90.7, 97.7, 99.6, 99.8] },
  { key: "health", v: [90.2, 97.8, 99.5, 99.8] },
  { key: "culture", v: [75.0, 95.7, 99.0, 99.8] },
  { key: "shops", v: [86.4, 97.3, 99.5, 99.8] },
  { key: "any", v: [94.0, 98.7, 99.7, 99.8] },
];

const STR = {
  pl: {
    title: "Czy bieda oznacza gorszy dojazd? Dochód a dostępność w Łodzi — GISBoost",
    brandSub: "/ analizy mapowe",
    navCatalog: "Analizy",
    navReport: "Badanie: dochód i dostępność",
    crumbHere: "Badanie: dochód i dostępność",
    langToggleAriaLabel: "Przełącz język",
    kicker: "r5r · dochód a dostępność · Łódź",
    h1: "Czy bieda oznacza gorszy dojazd? Dostępność transportowa a dochód w Łodzi",
    expLabel: "Eksperymentalne — praca w toku",
    expHtml:
      "Ten raport w całości wygenerowała AI (Claude) na podstawie kodu i danych Michała Kaczorowskiego — to " +
      "wstępna, robocza wersja pomocna do rozeznania się w temacie, nie ostateczne wnioski badawcze. Liczby " +
      "i interpretacje traktuj jako punkt wyjścia do dalszej weryfikacji.",
    lede1Html:
      'Łącząc warstwę dochodu szacowanego metodą MRP (<a href="../badanie-dochod-obwody/">poprzedni ' +
      "raport</a>) z pomiarem dostępności czasowej transportu publicznego w Łodzi, sprawdzamy wprost: <b>czy " +
      "biedniejsze obwody mają gorszy dostęp do szkół, przychodni, bibliotek i sklepów?</b> Dostępność liczona " +
      "na <b>zrealizowanym</b> rozkładzie z easy-GTFS-RT (21.08.2026, wariant p50), nie na rozkładzie " +
      "papierowym — to zmienia interpretację wszystkiego dalej.",
    lede2Html:
      "Inspiracją jest artykuł Bragi, Loureiro i Pereiry (2026, <i>Journal of Transport Geography</i>) " +
      "o Fortalezie w Brazylii, gdzie odpowiedź brzmiała: tak, wyraźnie. <b>W Łodzi wyszło inaczej.</b>",
    tilePrecincts: "obwodów spisowych",
    tileServices: "punktów usług publicznych",
    tilePeak: "poranny szczyt",
    tileCats: "kategorie usług",
    s1Heading: "1. Dochód: korelacja słaba i zmienia znak",
    s1SubHtml:
      "Korelacja Pearsona <code>income_index_pln</code> z liczbą usług osiągalnych w danym progu, per " +
      "kategoria (n=3854 obwodów). Przy krótkim progu (15 min) kierunek jest <b>odwrotny</b> do naiwnej " +
      "hipotezy: biedniejsze obwody mają wtedy więcej usług w zasięgu, nie mniej.",
    s1CaptionHtml:
      "Przy dłuższym progu korelacja robi się dodatnia, ale nadal słaba (do +0,12 przy 60 min). Udział " +
      "samotnych matek w obwodzie koreluje z dostępnością <b>dodatnio</b> (r=+0,38 przy 30 min) — tam, gdzie " +
      "więcej gospodarstw jednorodzicielskich, dostępność jest zwykle lepsza, nie gorsza.",
    catEdu: "edukacja", catHealth: "zdrowie", catCulture: "kultura", catShops: "sklepy", catTotal: "razem",
    s2Heading: "2. To, co naprawdę tłumaczy dostępność: odległość od centrum",
    s2SubHtml:
      "Korelacja odległości centroidu obwodu od centrum miasta z dostępnością (razem, próg 30 min), " +
      "zestawiona z korelacją dochodu przy tym samym progu.",
    s2CaptionHtml:
      "Odległość od centrum tłumaczy dostępność wielokrotnie silniej niż dochód. Dostępność maleje niemal " +
      "promieniście od centrum; dochód nie ma takiego wzorca wcale — mapy pokazują to samo wizualnie. " +
      "<b>Wniosek: w Łodzi deprywacja transportowa jest przede wszystkim geograficzna, nie ekonomiczna</b> — " +
      "spójne z tym, że biedniejsze, gęściej zaludnione dzielnice leżą tu centralnie, właśnie tam gdzie sieć " +
      "tramwajowa jest najgęstsza.",
    legDistance: "odległość od centrum (30 min)", legIncome: "dochód (30 min)",
    s3Heading: "3. Efekt MAUP: ta sama analiza na heksagonach",
    s3SubHtml:
      "Obwody spisowe są mikroskopijne w centrum i ogromne na granicy miasta (modifiable areal unit problem). " +
      "Kontrola: ta sama korelacja policzona na jednolitej siatce heksagonów 500 m (1479 komórek), przy progu " +
      "60 minut.",
    s3CaptionHtml:
      "Sygnał się <b>wzmacnia</b> na heksagonach (n=646 z dopasowanym dochodem) — MAUP faktycznie tłumił " +
      "korelację w obwodach — ale nawet po korekcie związek zostaje słaby do umiarkowanego, nie silny. Główny " +
      "wniosek się nie zmienia.",
    legPrecincts: "obwody spisowe (60 min)", legHex: "heksagony 500 m (60 min)",
    s4Heading: "4. Ilu mieszkańców Łodzi ma dostęp do usług",
    s4SubHtml:
      "Osobna, prostsza metryka: nie „ile placówek widać z jednego miejsca”, tylko „ilu mieszkańców ma dostęp " +
      "do choć jednej placówki danej kategorii” — populacja obwodów z co najmniej jedną placówką w zasięgu, " +
      "jako % populacji całego miasta.",
    thCat: "Kategoria", th15: "15 min", th30: "30 min", th45: "45 min", th60: "60 min",
    catAny: "dowolna",
    s5Heading: "Metoda i źródła",
    s5SubHtml:
      "Sieć drogowa i tramwajowa z OpenStreetMap; punkty usług z Overpass API (szkoły/przedszkola, " +
      "szpitale/przychodnie/apteki, biblioteki/domy kultury, sklepy). Punkty startowe: centroidy 3854 obwodów " +
      'spisowych. Silnik: <a href="https://ipeagit.github.io/r5r/" target="_blank" rel="noopener">r5r</a>, tryb ' +
      "pieszo + transport publiczny, zrealizowany rozkład easy-GTFS-RT (Family A, 21.08.2026, wariant p50).",
    sourceNoteHtml:
      'Pełny pipeline: <a href="https://github.com/GISBoost/easy-R5/tree/main/tools/accessibility_lodz" target="_blank" rel="noopener">easy-R5 · tools/accessibility_lodz</a> ' +
      '(<code>HANDOFF.md</code>, <code>RESEARCH_LOG.md</code>, <code>COLUMNS.md</code>). Seria: ' +
      '<a href="../badanie-dochod-obwody/">jak oszacowano dochód</a> → ten raport → ' +
      '<a href="../badanie-uczelnie/">dostępność do uczelni</a>. Pierwotny wpis na portalu: ' +
      '<a href="https://gisboost.github.io/analizy/dostepnosc-dochod-lodz/">gisboost.github.io/analizy/dostepnosc-dochod-lodz</a>.',
    footerBack: "← wszystkie analizy",
  },
  en: {
    title: "Does poverty mean a worse commute? Income and accessibility in Łódź — GISBoost",
    brandSub: "/ map analyses",
    navCatalog: "Analyses",
    navReport: "Study: income and accessibility",
    crumbHere: "Study: income and accessibility",
    langToggleAriaLabel: "Switch language",
    kicker: "r5r · income vs. accessibility · Łódź",
    h1: "Does poverty mean a worse commute? Transit accessibility and income in Łódź",
    expLabel: "Experimental — work in progress",
    expHtml:
      "This write-up was generated entirely by AI (Claude) from Michał Kaczorowski's code and data — an " +
      "early, working draft meant to help scope the topic, not a final research conclusion. Treat the numbers " +
      "and interpretations as a starting point for further verification.",
    lede1Html:
      'Combining the MRP-estimated income layer (<a href="../badanie-dochod-obwody/">previous report</a>) ' +
      "with a measure of transit time-accessibility in Łódź, we test directly: <b>do poorer precincts have " +
      "worse access to schools, clinics, libraries and shops?</b> Accessibility is computed on the " +
      "<b>realized</b> schedule from easy-GTFS-RT (2026-08-21, p50 variant), not the printed timetable — that " +
      "changes how everything below should be read.",
    lede2Html:
      "The inspiration is Braga, Loureiro and Pereira's (2026, <i>Journal of Transport Geography</i>) paper on " +
      "Fortaleza, Brazil, where the answer was: yes, clearly. <b>In Łódź it came out differently.</b>",
    tilePrecincts: "census precincts",
    tileServices: "public-service points",
    tilePeak: "morning peak",
    tileCats: "service categories",
    s1Heading: "1. Income: a weak correlation that flips sign",
    s1SubHtml:
      "Pearson correlation of <code>income_index_pln</code> with the number of reachable services at a given " +
      "cutoff, per category (n=3854 precincts). At the short cutoff (15 min) the direction is <b>reversed</b> " +
      "from the naive hypothesis: poorer precincts have more services in reach, not fewer.",
    s1CaptionHtml:
      "At longer cutoffs the correlation turns positive, but stays weak (up to +0.12 at 60 min). The share of " +
      "single mothers in a precinct correlates <b>positively</b> with accessibility (r=+0.38 at 30 min) — " +
      "where there are more single-parent households, accessibility is usually better, not worse.",
    catEdu: "education", catHealth: "health", catCulture: "culture", catShops: "shops", catTotal: "total",
    s2Heading: "2. What actually explains accessibility: distance from the centre",
    s2SubHtml:
      "Correlation of a precinct centroid's distance from the city centre with accessibility (total, 30-minute " +
      "cutoff), set against the income correlation at the same cutoff.",
    s2CaptionHtml:
      "Distance from the centre explains accessibility many times more strongly than income. Accessibility " +
      "falls off almost radially from the centre; income shows no such pattern at all — the maps show exactly " +
      "the same thing visually. <b>Conclusion: in Łódź, transit deprivation is primarily geographic, not " +
      "economic</b> — consistent with poorer, denser neighborhoods sitting centrally here, exactly where the " +
      "tram network is densest.",
    legDistance: "distance from centre (30 min)", legIncome: "income (30 min)",
    s3Heading: "3. The MAUP effect: the same analysis on hexagons",
    s3SubHtml:
      "Census precincts are tiny downtown and huge at the city edge (the modifiable areal unit problem). " +
      "Control: the same correlation computed on a uniform 500 m hex grid (1479 cells), at the 60-minute " +
      "cutoff.",
    s3CaptionHtml:
      "The signal <b>strengthens</b> on hexagons (n=646 with matched income) — MAUP was indeed dampening the " +
      "correlation in precincts — but even after the correction the relationship stays weak to moderate, not " +
      "strong. The main conclusion doesn't change.",
    legPrecincts: "census precincts (60 min)", legHex: "500 m hexagons (60 min)",
    s4Heading: "4. How many Łódź residents have access to services",
    s4SubHtml:
      "A separate, simpler metric: not “how many facilities are visible from one spot”, but “how many " +
      "residents have access to at least one facility of a given category” — the population of precincts with " +
      "at least one facility in reach, as % of the whole city's population.",
    thCat: "Category", th15: "15 min", th30: "30 min", th45: "45 min", th60: "60 min",
    catAny: "any",
    s5Heading: "Method and sources",
    s5SubHtml:
      "Road and tram network from OpenStreetMap; service points from the Overpass API (schools/kindergartens, " +
      "hospitals/clinics/pharmacies, libraries/cultural centres, shops). Origins: centroids of 3854 census " +
      'precincts. Engine: <a href="https://ipeagit.github.io/r5r/" target="_blank" rel="noopener">r5r</a>, ' +
      "walk + transit mode, the realized easy-GTFS-RT schedule (Family A, 2026-08-21, p50 variant).",
    sourceNoteHtml:
      'Full pipeline: <a href="https://github.com/GISBoost/easy-R5/tree/main/tools/accessibility_lodz" target="_blank" rel="noopener">easy-R5 · tools/accessibility_lodz</a> ' +
      '(<code>HANDOFF.md</code>, <code>RESEARCH_LOG.md</code>, <code>COLUMNS.md</code>). Series: ' +
      '<a href="../badanie-dochod-obwody/">how income was estimated</a> → this report → ' +
      '<a href="../badanie-uczelnie/">university accessibility</a>. Original portal post: ' +
      '<a href="https://gisboost.github.io/analizy/dostepnosc-dochod-lodz/">gisboost.github.io/analizy/dostepnosc-dochod-lodz</a>.',
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

const CAT_ORDER = ["edu", "health", "culture", "shops", "total"];
const CAT_KEY_LABEL = { edu: "catEdu", health: "catHealth", culture: "catCulture", shops: "catShops", total: "catTotal" };
const ACCESS_LABEL = { edu: "catEdu", health: "catHealth", culture: "catCulture", shops: "catShops", any: "catAny" };
// Short axis labels for the small-multiples chart -- hand-picked per language
// instead of slicing the full translated word (which produced garbled
// fragments like "eduk"/"heal"/"tota").
const CAT_SHORT = {
  pl: { edu: "edu", health: "zdr", culture: "kult", shops: "skl", total: "razem" },
  en: { edu: "edu", health: "health", culture: "cult", shops: "shop", total: "total" },
};

function renderCharts() {
  const short = CAT_SHORT[getLang()];
  smallMultiples(
    "corrGrid",
    [15, 30, 60].map((th) => ({
      title: `${th} min`,
      bars: CAT_ORDER.map((c) => ({ label: short[c], value: CORR[th][c] })),
    }))
  );
  barChartDiverging(
    "distChart",
    [
      { label: t("legDistance"), value: -0.71 },
      { label: t("legIncome"), value: CORR[30].total },
    ],
    { unit: "", decimals: 2, labelWidth: 170 }
  );
  barChartDiverging(
    "maupChart",
    [
      { label: t("legPrecincts"), value: 0.12 },
      { label: t("legHex"), value: 0.28 },
    ],
    { unit: "", decimals: 2, labelWidth: 170 }
  );
  renderDataTable(
    "accessTable",
    [t("thCat"), t("th15"), t("th30"), t("th45"), t("th60")],
    ACCESS.map((row) => [t(ACCESS_LABEL[row.key]), row.v[0] + "%", row.v[1] + "%", row.v[2] + "%", row.v[3] + "%"])
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
