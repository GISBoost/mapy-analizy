"use strict";

// Lightweight PL/EN i18n -- same pattern as gtfs-dashboard's i18n.js and the
// other mapy-analizy apps (flat string dicts, {placeholder} substitution,
// localStorage-backed). Loaded before app.js so t()/getLang() are ready
// before its first render() call.

const LANG_STORAGE_KEY = "mapyAnalizyLang";

const STRINGS = {
  pl: {
    langToggleAriaLabel: "Przełącz język",
    title: "Ile kosztują opóźnienia? — GISBoost",
    h1: "Ile kosztują opóźnienia? — Łódź",
    introHtml:
      "Siatka heksagonalna, dostępność 30 min (spacer + transit) w oknie 7:00–9:00, porównanie rozkładu " +
      "<b>statycznego</b> vs <b>zrealizowanego P50</b> GTFS, 2026-08-21. Dane " +
      '<a href="https://gisboost.github.io/easy-R5/">Easy-R5</a> (QGIS). ' +
      'Zakładka = rozmiar heksagonu, panel po lewej = kategoria. Jedna z <a href="../">analiz mapowych GISBoost</a>.',
    eyebrowCategory: "Kategoria",
    eyebrowLegend: "Legenda",
    eyebrowOpacity: "Przezroczystość warstwy",
    tooltipsToggleLabel: "Pokazuj podpowiedzi po najechaniu",
    loadingText: "wczytywanie danych…",
    footerBackLink: "&larr; wszystkie analizy",
    footerDataCode: "Dane i kod:",
    footerMethod: "metoda:",
    footerMethodLink: "tools/realtime_delay_lodz",

    catSchoolTitle: "Szkoły", catSchoolSub: "amenity=school, bez przedszkoli",
    catPharmacyTitle: "Apteki", catPharmacySub: "amenity=pharmacy",
    catUniversityTitle: "Uczelnie", catUniversitySub: "budynki uczelni (OSM)",
    catMallTitle: "Centra handlowe", catMallSub: "shop=mall",
    catNetTitle: "Zbiorczo (wszystkie kategorie)", catNetSub: "suma zmian po kategoriach porównywalnych w danym heksagonie",

    legendNote:
      'Puste (bez wypełnienia) = brak bazowego dostępu w rozkładzie statycznym — nie ma czego tracić ani ' +
      'zyskiwać, więc nie liczymy tego jako "bez zmian".',
    legendClassLe4: "≤ -4", legendClassM3M2: "-3 .. -2", legendClassM1: "-1",
    legendClass0: "0 (bez zmian)", legendClassP1: "+1", legendClassP2P3: "+2 .. +3", legendClassGe4: "≥ +4",
    legendClassLe6: "≤ -6", legendClassM5M2: "-5 .. -2", legendClassP2P5: "+2 .. +5", legendClassGe6: "≥ +6",

    tooltipHexTitle: "Heksagon #{id}",
    tooltipPop: "populacja",
    tooltipBase: "baza (statyczny)",
    tooltipDelta: "zmiana (opóźnienia)",
    tooltipNetDelta: "suma zmian",
    tooltipNetN: "kategorii porównywalnych",
    tooltipBreakdown: "rozbicie:",
    tooltipNoBase: "brak bazy",

    statLineHtml:
      "<b>{n}</b> heksagonów porównywalnych z <b>{total}</b> · średnia ważona populacją: <b>{mean}</b>",
    statLineUnitCategory: "pkt.",
    statLineUnitNet: "pkt. (suma)",
  },
  en: {
    langToggleAriaLabel: "Switch language",
    title: "What do delays cost? — GISBoost",
    h1: "What do delays cost? — Łódź",
    introHtml:
      "Hex grid, 30 min accessibility (walk + transit) in the 7:00–9:00 window, comparing the " +
      "<b>static</b> vs the <b>realized P50</b> GTFS schedule, 2026-08-21. " +
      '<a href="https://gisboost.github.io/easy-R5/">Easy-R5</a> (QGIS) data. ' +
      'Tab = hex size, the left panel picks the category. One of <a href="../">GISBoost\'s map analyses</a>.',
    eyebrowCategory: "Category",
    eyebrowLegend: "Legend",
    eyebrowOpacity: "Layer opacity",
    tooltipsToggleLabel: "Show tooltips on hover",
    loadingText: "loading data…",
    footerBackLink: "&larr; all analyses",
    footerDataCode: "Data and code:",
    footerMethod: "method:",
    footerMethodLink: "tools/realtime_delay_lodz",

    catSchoolTitle: "Schools", catSchoolSub: "amenity=school, no kindergartens",
    catPharmacyTitle: "Pharmacies", catPharmacySub: "amenity=pharmacy",
    catUniversityTitle: "Universities", catUniversitySub: "university buildings (OSM)",
    catMallTitle: "Malls", catMallSub: "shop=mall",
    catNetTitle: "Combined (all categories)", catNetSub: "sum of changes over the categories comparable in that hexagon",

    legendNote:
      "Blank (no fill) = no baseline access under the static schedule — nothing to lose or gain, " +
      'so it does not count as "no change".',
    legendClassLe4: "≤ -4", legendClassM3M2: "-3 .. -2", legendClassM1: "-1",
    legendClass0: "0 (no change)", legendClassP1: "+1", legendClassP2P3: "+2 .. +3", legendClassGe4: "≥ +4",
    legendClassLe6: "≤ -6", legendClassM5M2: "-5 .. -2", legendClassP2P5: "+2 .. +5", legendClassGe6: "≥ +6",

    tooltipHexTitle: "Hexagon #{id}",
    tooltipPop: "population",
    tooltipBase: "baseline (static)",
    tooltipDelta: "change (delays)",
    tooltipNetDelta: "sum of changes",
    tooltipNetN: "comparable categories",
    tooltipBreakdown: "breakdown:",
    tooltipNoBase: "no baseline",

    statLineHtml:
      "<b>{n}</b> comparable hexagons out of <b>{total}</b> · population-weighted mean: <b>{mean}</b>",
    statLineUnitCategory: "pts",
    statLineUnitNet: "pts (sum)",
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

function dtLocale() { return getLang() === "en" ? "en-US" : "pl-PL"; }

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
