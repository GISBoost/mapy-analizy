"use strict";

// Static research write-up: estimating income at the census-precinct level via MRP,
// 6 Polish cities. Vanilla JS, no build step, chart helpers from ../charts.js. All
// numbers below are transcribed from docs/analizy/dochod-obwody-spisowe.md
// (gisboostgithub) — no new computation happens here.

const LANG_KEY = "mapyAnalizyLang";
const getLang = () => (localStorage.getItem(LANG_KEY) === "en" ? "en" : "pl");

const PARTY_INCOME = [
  { party: "PiS", value: 2593.8 },
  { party: "other", value: 2898.6 },
  { party: "KO", value: 3178.1 },
  { party: "TD", value: 3226.2 },
  { party: "Lewica", value: 3232.9 },
  { party: "Konfederacja", value: 3344.2 },
];

const STR = {
  pl: {
    title: "Ile zarabia Twój obwód? Szacowanie dochodu — GISBoost",
    brandSub: "/ analizy mapowe",
    navCatalog: "Analizy",
    navReport: "Badanie: dochód",
    crumbHere: "Badanie: dochód",
    langToggleAriaLabel: "Przełącz język",
    kicker: "MRP · dochód per obwód spisowy · 6 miast",
    h1: "Ile zarabia Twój obwód? Szacowanie dochodu tam, gdzie spis go nie mierzy",
    expLabel: "Eksperymentalne — praca w toku",
    expHtml:
      "Ten raport w całości wygenerowała AI (Claude) na podstawie kodu i danych Michała Kaczorowskiego — to " +
      "wstępna, robocza wersja pomocna do rozeznania się w temacie, nie ostateczne wnioski badawcze. Liczby " +
      "i interpretacje traktuj jako punkt wyjścia do dalszej weryfikacji.",
    lede1Html:
      "Polski spis powszechny (NSP 2021) nie pyta o dochód, na żadnym poziomie drobniejszym niż gmina. Ten " +
      "raport szacuje dochód na poziomie obwodu spisowego metodą <b>MRP</b> (Multilevel Regression + " +
      "Poststratification) z predyktorem obszarowym — wynikiem wyborczym — dla sześciu miast: Łodzi, Krakowa, " +
      "Warszawy, Poznania, Gdańska i Szczecina.",
    lede2Html:
      "<b>To nie jest zmierzony dochód, to estymacja.</b> Zakłada, że skład polityczny obwodu głosowania " +
      "koreluje z jego profilem dochodowym tak, jak wynika z ogólnopolskiej ankiety CBOS — założenie z realnymi " +
      "ograniczeniami, opisanymi na końcu.",
    tileCities: "miast",
    tileSurvey: "próba ankiety CBOS",
    tileValid: "rozbieżności głosów w 4 miastach",
    tileLodz: "zgodność populacji, Łódź",
    s1Heading: "1. Dochód szacowany per elektorat",
    s1SubHtml:
      "Krok 1 metody MRP: dochód deklarowany per capita przez wyborców każdej partii (CBOS 98/2023, VI–VII " +
      "2023). Każdy obwód głosowania dostaje ważoną średnią tych wartości, proporcjonalnie do udziału głosów. " +
      "Górny, otwarty przedział ankiety domknięto arbitralnie na 4500 zł — jedyne miejsce w całej metodzie, " +
      "gdzie trzeba było coś założyć zamiast policzyć.",
    s1CaptionHtml:
      "Rozstęp deklarowanego dochodu między elektoratami jest wąski (2594–3344 zł) — różnice partyjne w tej " +
      "ankiecie są dużo mniejsze niż stereotypy sugerują. Każdy obwód spisowy dziedziczy dokładnie " +
      "<code>income_index_pln</code> swojego obwodu głosowania (brak zróżnicowania wewnątrz obwodu głosowania " +
      "— to nie błąd, po prostu głosuje się per obwód, nie per budynek).",
    s2Heading: "2. Jedyna zależność, która się potwierdza: dochód i samotne rodzicielstwo",
    s2SubHtml:
      "Z pięciu sprawdzonych hipotez o związku dochodu, głosowania i struktury rodzinnej (korelacja Pearsona, " +
      "per miasto) tylko jedna powtarza się spójnie we wszystkich sześciu miastach: niższy dochód wiąże się " +
      "z większym udziałem samotnych matek.",
    s2CaptionHtml:
      "Zakres korelacji: od r=−0,11 w Łodzi (najsłabsza) do r=−0,34 w Gdańsku (najsilniejsza) — pozostałe " +
      "cztery miasta leżą pomiędzy, dokładne wartości w kodzie źródłowym. Kierunek jest ujemny i spójny " +
      "wszędzie, co w tej analizie zdarza się rzadko.",
    s3Heading: "3. Pięć hipotez, jedna się potwierdza",
    s3SubHtml:
      "Pozostałe cztery sprawdzone hipotezy o dochodzie i strukturze gospodarstw domowych nie potwierdzają się " +
      "spójnie — znak korelacji albo jest bliski zeru, albo zmienia się między miastami.",
    thHyp: "Hipoteza", thResult: "Wynik",
    hyp1: "Niższy dochód → więcej samotnych matek",
    res1: "Potwierdzona, spójnie we wszystkich 6 miastach (od −0,11 w Łodzi do −0,34 w Gdańsku)",
    hyp2: "Wyższy dochód → mniejsze gospodarstwa domowe",
    res2: "Nie — znak niespójny między miastami",
    hyp3: "Wyższy dochód → mniej dzieci w rodzinie",
    res3: "Nie — korelacja bliska zeru",
    hyp4: "Więcej głosów na PiS → więcej dzieci",
    res4: "Nie — w Warszawie (największa próba) wręcz odwrotnie",
    hyp5: "Wyższy dochód → więcej gospodarstw jednoosobowych",
    res5: "Częściowo — niespójnie (silna w Krakowie, zerowa gdzie indziej)",
    s4Heading: "Metoda i źródła",
    s4SubHtml:
      "Walidacja: po naprawie dwóch realnych błędów (zły kod TERYT dla Łodzi w pierwszej próbie; przestawione " +
      "pola przy złączeniu tabel w QGIS), wynik zgadza się z oficjalną populacją GUS dokładnie w 5 z 6 miast, " +
      "99,9% w Łodzi. Zero rozbieżności głosów względem oficjalnego CSV PKW w Warszawie (805 obwodów), Gdańsku " +
      "(202), Poznaniu (258) i Szczecinie (207). Przestrzennie sklastrowane (I Morana, k-NN k=8): " +
      "<code>income_index_pln</code> i udział głosów na PiS bardzo silnie (0,71–0,84), struktura rodzinna " +
      "słabiej (0,19–0,32) — dochód jest z konstrukcji jednolity w obrębie obwodu głosowania, więc zmienia się " +
      "tylko na jego granicach.",
    sourceNoteHtml:
      'Sześć plików GPKG (warstwy <code>obwody_spisowe</code> i <code>obwody_glosowania</code>) razem ze ' +
      'skryptami: <a href="https://github.com/GISBoost/easy-R5/tree/main/tools/ses_income_lodz" target="_blank" rel="noopener">easy-R5 · tools/ses_income_lodz</a> ' +
      '(<code>METHODOLOGY.md</code>, <code>HANDOFF.md</code>). Pierwotny wpis na portalu: ' +
      '<a href="https://gisboost.github.io/analizy/dochod-obwody-spisowe/">gisboost.github.io/analizy/dochod-obwody-spisowe</a>.',
    footerBack: "← wszystkie analizy",
  },
  en: {
    title: "How much does your precinct earn? Estimating income — GISBoost",
    brandSub: "/ map analyses",
    navCatalog: "Analyses",
    navReport: "Study: income",
    crumbHere: "Study: income",
    langToggleAriaLabel: "Switch language",
    kicker: "MRP · income per census precinct · 6 cities",
    h1: "How much does your precinct earn? Estimating income where the census doesn't measure it",
    expLabel: "Experimental — work in progress",
    expHtml:
      "This write-up was generated entirely by AI (Claude) from Michał Kaczorowski's code and data — an " +
      "early, working draft meant to help scope the topic, not a final research conclusion. Treat the numbers " +
      "and interpretations as a starting point for further verification.",
    lede1Html:
      "The Polish census (NSP 2021) doesn't ask about income at all, at any level finer than a municipality. " +
      "This write-up estimates income at the census-precinct level using <b>MRP</b> (Multilevel Regression + " +
      "Poststratification) with an area-level predictor — the vote — for six cities: Łódź, Kraków, Warsaw, " +
      "Poznań, Gdańsk and Szczecin.",
    lede2Html:
      "<b>This is not measured income, it's an estimate.</b> It assumes a voting precinct's political makeup " +
      "correlates with its income profile the way a nationwide CBOS survey suggests — an assumption with real " +
      "limits, described at the end.",
    tileCities: "cities",
    tileSurvey: "CBOS survey sample",
    tileValid: "vote discrepancies in 4 cities",
    tileLodz: "population match, Łódź",
    s1Heading: "1. Income estimated per electorate",
    s1SubHtml:
      "MRP step 1: per-capita income declared by each party's voters (CBOS 98/2023, June–July 2023). Each " +
      "voting precinct gets a weighted average of these values, proportional to vote share. The survey's open " +
      "top bracket was arbitrarily closed at 4500 PLN — the one place in the whole method where something had " +
      "to be assumed instead of computed.",
    s1CaptionHtml:
      "The spread in declared income across electorates is narrow (2594–3344 PLN) — party differences in this " +
      "survey are much smaller than stereotypes suggest. Every census precinct inherits exactly the " +
      "<code>income_index_pln</code> of its voting precinct (no variation within a voting precinct — not a " +
      "bug, people simply vote per precinct, not per building).",
    s2Heading: "2. The one relationship that holds: income and single motherhood",
    s2SubHtml:
      "Of five hypotheses tested about income, voting and family structure (Pearson correlation, per city), " +
      "only one repeats consistently across all six cities: lower income goes with a higher share of single " +
      "mothers.",
    s2CaptionHtml:
      "Correlation range: from r=−0.11 in Łódź (weakest) to r=−0.34 in Gdańsk (strongest) — the other four " +
      "cities sit in between, exact values in the source code. The direction is negative and consistent " +
      "everywhere, which is rare in this analysis.",
    s3Heading: "3. Five hypotheses, one confirmed",
    s3SubHtml:
      "The other four hypotheses tested about income and household structure don't hold consistently — the " +
      "sign of the correlation is either near zero or flips between cities.",
    thHyp: "Hypothesis", thResult: "Result",
    hyp1: "Lower income → more single mothers",
    res1: "Confirmed, consistently in all 6 cities (from −0.11 in Łódź to −0.34 in Gdańsk)",
    hyp2: "Higher income → smaller households",
    res2: "No — sign inconsistent between cities",
    hyp3: "Higher income → fewer children per family",
    res3: "No — correlation near zero",
    hyp4: "More PiS votes → more children",
    res4: "No — in Warsaw (the largest sample) the opposite",
    hyp5: "Higher income → more single-person households",
    res5: "Partial — inconsistent (strong in Kraków, zero elsewhere)",
    s4Heading: "Method and sources",
    s4SubHtml:
      "Validation: after fixing two real bugs (wrong TERYT code for Łódź in the first attempt; swapped fields " +
      "when joining tables in QGIS), the result matches official GUS population exactly in 5 of 6 cities, " +
      "99.9% in Łódź. Zero vote discrepancies against the official PKW CSV in Warsaw (805 precincts), Gdańsk " +
      "(202), Poznań (258) and Szczecin (207). Spatially clustered (Moran's I, k-NN k=8): " +
      "<code>income_index_pln</code> and PiS vote share very strongly (0.71–0.84), family structure more " +
      "weakly (0.19–0.32) — income is by construction uniform within a voting precinct, so it only changes at " +
      "its edges.",
    sourceNoteHtml:
      'Six GPKG files (layers <code>obwody_spisowe</code> and <code>obwody_glosowania</code>) with scripts: ' +
      '<a href="https://github.com/GISBoost/easy-R5/tree/main/tools/ses_income_lodz" target="_blank" rel="noopener">easy-R5 · tools/ses_income_lodz</a> ' +
      '(<code>METHODOLOGY.md</code>, <code>HANDOFF.md</code>). Original portal post: ' +
      '<a href="https://gisboost.github.io/analizy/dochod-obwody-spisowe/">gisboost.github.io/analizy/dochod-obwody-spisowe</a>.',
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
  const pl = getLang() === "pl";
  const partyLabel = {
    PiS: "PiS", other: pl ? "pozostałe" : "other", KO: "KO",
    TD: pl ? "Trzecia Droga" : "Third Way", Lewica: pl ? "Lewica" : "Left", Konfederacja: "Konfederacja",
  };
  barChartDiverging(
    "incomeChart",
    [...PARTY_INCOME].sort((a, b) => a.value - b.value).map((p) => ({ label: partyLabel[p.party], value: p.value })),
    { unit: " zł", decimals: 0, labelWidth: 110 }
  );
  barChartDiverging(
    "momChart",
    [
      { label: "Łódź", value: -0.11 },
      { label: "Gdańsk", value: -0.34 },
    ],
    { unit: "", decimals: 2, labelWidth: 90 }
  );
  renderDataTable(
    "hypTable",
    [t("thHyp"), t("thResult")],
    [
      [t("hyp1"), { html: `<span class="yes">✓ ${t("res1")}</span>` }],
      [t("hyp2"), { html: `<span class="no">${t("res2")}</span>` }],
      [t("hyp3"), { html: `<span class="no">${t("res3")}</span>` }],
      [t("hyp4"), { html: `<span class="no">${t("res4")}</span>` }],
      [t("hyp5"), { html: `<span class="partial">${t("res5")}</span>` }],
    ]
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
