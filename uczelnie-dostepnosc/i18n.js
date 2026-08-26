"use strict";

// Lightweight PL/EN i18n -- same pattern as gtfs-dashboard's i18n.js and the
// other mapy-analizy apps (flat string dicts, {placeholder} substitution,
// localStorage-backed). Loaded before app.js so t()/getLang() are ready
// before its first render() call. University/role display names come from
// manifest.json (proper nouns) and are left untranslated, same as city names.

const LANG_STORAGE_KEY = "mapyAnalizyLang";

const STRINGS = {
  pl: {
    langToggleAriaLabel: "Przełącz język",
    title: "Dojazd na uczelnię — GISBoost",
    h1: "Dojazd na uczelnię — 6 miast",
    introHtml:
      "Siatka heksagonalna 500 m, dostępność 30 min (spacer + transit publiczny), dane r5r / OSM. " +
      'Zakładka = miasto, panel po lewej = widok tego samego wyniku. Jedna z <a href="../">analiz mapowych GISBoost</a>.',
    eyebrowView: "Widok",
    modeDominantTitle: "Dominująca uczelnia",
    modeDominantSub: "która uczelnia „wygrywa” ten heksagon",
    modeCountTitle: "Liczba dostępnych",
    modeCountSub: "ile z 3 uczelni da się dojechać",
    modeOverlapTitle: "Nakładanie (przełączalne)",
    modeOverlapSub: "włączaj/wyłączaj uczelnie osobno",
    eyebrowUniversities: "Uczelnie",
    eyebrowLegend: "Legenda",
    eyebrowOpacity: "Przezroczystość warstwy",
    loadingText: "wczytywanie danych…",
    footerBackLink: "&larr; wszystkie analizy",
    footerDataCode: "Dane i kod:",
    footerMethod: "metoda:",
    footerMethodLink: "wpis na blogu",

    legendNoAccess: "brak dostępu (30 min)",
    legendCount1: "1 uczelnia w zasięgu",
    legendCount2: "2 uczelnie w zasięgu",
    legendCount3: "wszystkie 3 uczelnie",
    legendOverlapMix: "nakładające się warstwy = mieszanka kolorów",

    tooltipHexTitle: "Heksagon #{id}",
    tooltipStudents: "studenci 20-29",
    tooltipDominant: "dominująca",

    statLineHtml: "<b>{n}</b> heksagonów z dostępem do &ge;1 uczelni · <b>{withThree}</b> widzi wszystkie 3 · <b>{pop}</b> studentów 20-29 w tych heksagonach",
  },
  en: {
    langToggleAriaLabel: "Switch language",
    title: "Getting to university — GISBoost",
    h1: "Getting to university — 6 cities",
    introHtml:
      "500 m hex grid, 30 min accessibility (walk + public transit), r5r / OSM data. " +
      'Tab = city, the left panel shows the same result. One of <a href="../">GISBoost\'s map analyses</a>.',
    eyebrowView: "View",
    modeDominantTitle: "Dominant university",
    modeDominantSub: "which university “wins” this hexagon",
    modeCountTitle: "Number reachable",
    modeCountSub: "how many of the 3 universities are reachable",
    modeOverlapTitle: "Overlap (toggleable)",
    modeOverlapSub: "turn universities on/off individually",
    eyebrowUniversities: "Universities",
    eyebrowLegend: "Legend",
    eyebrowOpacity: "Layer opacity",
    loadingText: "loading data…",
    footerBackLink: "&larr; all analyses",
    footerDataCode: "Data and code:",
    footerMethod: "method:",
    footerMethodLink: "blog post",

    legendNoAccess: "no access (30 min)",
    legendCount1: "1 university reachable",
    legendCount2: "2 universities reachable",
    legendCount3: "all 3 universities",
    legendOverlapMix: "overlapping layers = mixed colors",

    tooltipHexTitle: "Hexagon #{id}",
    tooltipStudents: "students 20-29",
    tooltipDominant: "dominant",

    statLineHtml: "<b>{n}</b> hexagons with access to &ge;1 university · <b>{withThree}</b> see all 3 · <b>{pop}</b> students 20-29 in these hexagons",
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
