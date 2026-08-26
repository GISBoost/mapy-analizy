"use strict";

// Lightweight PL/EN i18n for the language toggle -- same pattern as
// gtfs-dashboard's i18n.js (flat string dicts, {placeholder} substitution,
// localStorage-backed). Loaded before any page-specific script (none here --
// this page is static) so data-i18n attributes are ready on DOMContentLoaded.

const LANG_STORAGE_KEY = "mapyAnalizyLang";

const STRINGS = {
  pl: {
    langToggleAriaLabel: "Przełącz język",
    title: "Analizy mapowe — GISBoost",
    h1: "Analizy mapowe",
    introHtml:
      'Interaktywne mapy z analiz przestrzennych <a href="https://gisboost.github.io/">GISBoost</a> — ' +
      "dostępność transportowa i pokrewne tematy. Każda analiza to osobny folder tego repo " +
      "i osobna podstrona; kod i metoda liczenia danych są opisane w README każdego folderu.",
    eyebrowAnalyses: "Dostępne analizy",
    card1Title: "Dojazd na uczelnię",
    card1Desc:
      "Dostępność do 3 uczelni w 6 polskich miastach w 30 min (spacer + transit), siatka heksagonalna 500 m — " +
      "dominująca uczelnia, liczba dostępnych, nakładanie stref.",
    card2Title: "Jak długo czekać na przystanku?",
    card2Desc:
      "Mediana odstępu między kolejnymi przyjazdami dowolnej linii na przystanku, siatka heksagonalna 500 m — " +
      "4 polskie miasta, dane GTFS-RT.",
    card3Title: "Dokąd dojadę?",
    card3Desc:
      "Interaktywna izochrona dojazdu transportem publicznym — najedź kursorem, przypnij pinezkę, " +
      "przesuwaj porę dnia suwakiem. Rozkład jazdy vs GTFS-RT, pilot: Łódź.",
    tag6cities: "6 miast",
    tag4cities: "4 miasta",
    footerHtml:
      'Kod: <a href="https://github.com/GISBoost/mapy-analizy">github.com/GISBoost/mapy-analizy</a> (MIT) ' +
      "· dane pochodne z OpenStreetMap i GTFS poszczególnych operatorów",
  },
  en: {
    langToggleAriaLabel: "Switch language",
    title: "Map analyses — GISBoost",
    h1: "Map analyses",
    introHtml:
      'Interactive maps from <a href="https://gisboost.github.io/">GISBoost</a>\'s spatial analyses — ' +
      "transit accessibility and related topics. Each analysis is its own folder in this repo " +
      "and its own page; the code and the data methodology are described in that folder's README.",
    eyebrowAnalyses: "Available analyses",
    card1Title: "Getting to university",
    card1Desc:
      "Accessibility to 3 universities in 6 Polish cities within 30 min (walk + transit), 500 m hex grid — " +
      "dominant university, count reachable, overlapping catchments.",
    card2Title: "How long do you wait at the stop?",
    card2Desc:
      "Median headway between consecutive arrivals of any line at a stop, 500 m hex grid — " +
      "4 Polish cities, GTFS-RT data.",
    card3Title: "Where can I get to?",
    card3Desc:
      "Interactive transit-isochrone map — hover to preview, click to pin, scrub the time-of-day slider. " +
      "Scheduled vs. GTFS-RT, pilot: Łódź.",
    tag6cities: "6 cities",
    tag4cities: "4 cities",
    footerHtml:
      'Code: <a href="https://github.com/GISBoost/mapy-analizy">github.com/GISBoost/mapy-analizy</a> (MIT) ' +
      "· data derived from OpenStreetMap and each operator's GTFS",
  },
};

function getLang() {
  return localStorage.getItem(LANG_STORAGE_KEY) === "en" ? "en" : "pl";
}

function setLang(lang) {
  const next = lang === "en" ? "en" : "pl";
  localStorage.setItem(LANG_STORAGE_KEY, next);
  document.documentElement.lang = next;
  applyStaticI18n();
  updateLangToggleButton();
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
