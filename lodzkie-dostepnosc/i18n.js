"use strict";

// Lightweight PL/EN i18n -- same pattern as opoznienia-dostepnosc/i18n.js and
// the other mapy-analizy apps (flat string dicts, {placeholder} substitution,
// localStorage-backed, shared key so the toggle stays in sync across pages).

const LANG_STORAGE_KEY = "mapyAnalizyLang";

const STRINGS = {
  pl: {
    langToggleAriaLabel: "Przełącz język",
    title: "Dostępność w Łódzkiem — GISBoost",
    h1: "Dostępność transportowa województwa łódzkiego",
    introHtml:
      "Siatka heksagonalna (1000 m dla województwa, 250 m dla Łodzi), dostępność do 30 min (spacer + transit) " +
      "w oknie 7:00–9:00, statyczny rozkład GTFS na 2026-09-10. Dla Łodzi dodatkowo zmiana dostępności między " +
      'rozkładem a rozkładem zrealizowanym (P50). Dane <a href="https://gisboost.github.io/easy-R5/">Easy-R5</a> ' +
      "(QGIS). Wybierz zakres, panel po lewej = warstwa. Metodyka i wnioski: " +
      '<a href="../badanie-lodzkie-dostepnosc/">raport z badania</a>. Jedna z <a href="../">analiz mapowych GISBoost</a>.',
    topnavReport: "Badanie",
    eyebrowRegion: "Zakres",
    eyebrowLayer: "Warstwa",
    eyebrowLegend: "Legenda",
    eyebrowOpacity: "Przezroczystość warstwy",
    tooltipsToggleLabel: "Pokazuj podpowiedzi po najechaniu",
    loadingText: "wczytywanie danych…",
    footerBackLink: "&larr; wszystkie analizy",
    footerDataCode: "Dane i kod:",
    footerMethod: "metoda:",
    footerMethodLink: "tools/lodzkie_na_mapach_2026",

    wojRegionLabel: "Województwo (statyczny GTFS)",
    lodzRegionLabel: "Łódź (rozkład vs realizacja)",

    levelTitle: "Poziom dostępności", levelSub: "suma POI osiągalnych ≤ 30 min, 10 kategorii",
    growthTitle: "Wzrost 30→60 min", growthSub: "o ile rośnie dostępność przy podwojeniu czasu",
    delta_wrzesienTitle: "Delta — dzień referencyjny", delta_wrzesienSub: "2026-09-10, rozkład vs P50",
    delta_3dniTitle: "Delta — średnia 3-dniowa", delta_3dniSub: "wrzesień, robustness 09-08/09/10",
    delta_wakacjeTitle: "Delta — wakacje", delta_wakacjeSub: "średnia z 4 dni sierpnia, rok szkolny vs wakacje",

    legendNoteLevel: "Puste (bez wypełnienia) = zero osiągalnych POI w 30 min — to jest wynik, nie brak danych.",
    legendNoteGrowth: "Wartość = ile POI dodatkowo staje się osiągalnych, gdy próg czasu rośnie z 30 do 60 min. Zawsze ≥ 0.",
    legendNoteDelta: "Puste (bez wypełnienia) = brak bazowego dostępu w rozkładzie statycznym — nie ma czego tracić ani zyskiwać, więc nie liczymy tego jako „bez zmian”.",
    legendGe: "≥ {n}",
    legendDeltaLe12: "≤ -12", legendDeltaM9M6: "-9 .. -6", legendDeltaM1: "-1",
    legendDelta0: "0 (bez zmian)", legendDeltaP1: "+1", legendDeltaP6P9: "+6 .. +9", legendDeltaGe12: "≥ +12",

    tooltipHexTitle: "Heksagon",
    tooltipHexId: "id",
    tooltipPop: "populacja",
    tooltipLevel: "dostępnych POI (30 min)",
    tooltipLevel30: "dostępnych POI @30 min",
    tooltipLevel60: "dostępnych POI @60 min",
    tooltipGrowth: "wzrost",
    tooltipRatio: "krotność (60/30)",
    tooltipDelta: "zmiana (P50 - rozkład)",
    tooltipNoBase: "brak bazy",

    statLineHtml: "<b>{n}</b> heksagonów porównywalnych z <b>{total}</b> · średnia ważona populacją: <b>{mean}</b>",
  },
  en: {
    langToggleAriaLabel: "Switch language",
    title: "Accessibility in Łódzkie — GISBoost",
    h1: "Transport accessibility of the Łódzkie voivodeship",
    introHtml:
      "Hex grid (1000 m for the voivodeship, 250 m for Łódź), 30 min accessibility (walk + transit) in the " +
      "7:00–9:00 window, static GTFS schedule for 2026-09-10. For Łódź, also the accessibility change between " +
      'the schedule and the realized (P50) schedule. <a href="https://gisboost.github.io/easy-R5/">Easy-R5</a> ' +
      "(QGIS) data. Pick a scope, the left panel picks the layer. Methodology and findings: " +
      '<a href="../badanie-lodzkie-dostepnosc/">the study write-up</a>. One of <a href="../">GISBoost\'s map analyses</a>.',
    topnavReport: "Study",
    eyebrowRegion: "Scope",
    eyebrowLayer: "Layer",
    eyebrowLegend: "Legend",
    eyebrowOpacity: "Layer opacity",
    tooltipsToggleLabel: "Show tooltips on hover",
    loadingText: "loading data…",
    footerBackLink: "&larr; all analyses",
    footerDataCode: "Data and code:",
    footerMethod: "method:",
    footerMethodLink: "tools/lodzkie_na_mapach_2026",

    wojRegionLabel: "Voivodeship (static GTFS)",
    lodzRegionLabel: "Łódź (schedule vs realized)",

    levelTitle: "Accessibility level", levelSub: "sum of POI reachable in ≤ 30 min, 10 categories",
    growthTitle: "Growth 30→60 min", growthSub: "how much accessibility grows when the time budget doubles",
    delta_wrzesienTitle: "Delta — reference day", delta_wrzesienSub: "2026-09-10, schedule vs P50",
    delta_3dniTitle: "Delta — 3-day average", delta_3dniSub: "September, robustness 09-08/09/10",
    delta_wakacjeTitle: "Delta — vacation", delta_wakacjeSub: "4-day August average, school term vs vacation",

    legendNoteLevel: "Blank (no fill) = zero reachable POI in 30 min — that is a result, not missing data.",
    legendNoteGrowth: "Value = how many extra POI become reachable when the time budget grows from 30 to 60 min. Always ≥ 0.",
    legendNoteDelta: "Blank (no fill) = no baseline access under the static schedule — nothing to lose or gain, so it does not count as “no change”.",
    legendGe: "≥ {n}",
    legendDeltaLe12: "≤ -12", legendDeltaM9M6: "-9 .. -6", legendDeltaM1: "-1",
    legendDelta0: "0 (no change)", legendDeltaP1: "+1", legendDeltaP6P9: "+6 .. +9", legendDeltaGe12: "≥ +12",

    tooltipHexTitle: "Hexagon",
    tooltipHexId: "id",
    tooltipPop: "population",
    tooltipLevel: "reachable POI (30 min)",
    tooltipLevel30: "reachable POI @30 min",
    tooltipLevel60: "reachable POI @60 min",
    tooltipGrowth: "growth",
    tooltipRatio: "ratio (60/30)",
    tooltipDelta: "change (P50 - schedule)",
    tooltipNoBase: "no baseline",

    statLineHtml: "<b>{n}</b> comparable hexagons out of <b>{total}</b> · population-weighted mean: <b>{mean}</b>",
  },
};

function getLang() {
  return localStorage.getItem(LANG_STORAGE_KEY) === "en" ? "en" : "pl";
}

let onLangChange = null;
function setLangChangeHandler(fn) { onLangChange = fn; }

function setLang(lang) {
  const next = lang === "en" ? "en" : "pl";
  localStorage.setItem(LANG_STORAGE_KEY, next);
  document.documentElement.lang = next;
  applyStaticI18n();
  updateLangToggleButton();
  if (onLangChange) onLangChange();
}

function t(key, vars) {
  const dict = STRINGS[getLang()];
  let str = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
  if (vars) {
    Object.keys(vars).forEach((k) => { str = str.split(`{${k}}`).join(vars[k]); });
  }
  return str;
}

function applyStaticI18n() {
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel)); });
}
function updateLangToggleButton() {
  const btn = document.getElementById("langToggleBtn");
  if (btn) btn.textContent = getLang() === "pl" ? "EN" : "PL";
}

document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.lang = getLang();
  applyStaticI18n();
  updateLangToggleButton();
  const btn = document.getElementById("langToggleBtn");
  if (btn) btn.addEventListener("click", () => setLang(getLang() === "pl" ? "en" : "pl"));
});
