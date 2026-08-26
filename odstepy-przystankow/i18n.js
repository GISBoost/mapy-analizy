"use strict";

// Lightweight PL/EN i18n -- same pattern as gtfs-dashboard's i18n.js and
// mapy-analizy's own root i18n.js (flat string dicts, {placeholder}
// substitution, localStorage-backed). Loaded before app.js so t()/getLang()
// are ready before its first render() call.

const LANG_STORAGE_KEY = "mapyAnalizyLang";

const STRINGS = {
  pl: {
    langToggleAriaLabel: "Przełącz język",
    title: "Jak długo czekać na przystanku — GISBoost",
    h1: "Jak długo trzeba czekać na przystanku?",
    introHtml:
      "Mediana odstępu między kolejnymi przyjazdami dowolnej linii, dla każdego przystanku z osobna, " +
      "uśredniona do siatki heksagonalnej 500 m. Zakładka = miasto, okno czasowe niżej przelicza medianę " +
      'tylko z obserwacji w tym przedziale. Jedna z <a href="../">analiz mapowych GISBoost</a>.',
    eyebrowWindow: "Okno czasowe",
    eyebrowLegend: "Legenda",
    eyebrowOpacity: "Przezroczystość warstwy",
    sidenoteHtml:
      "Ta sama analiza jako statyczny plakat, z drugim panelem pokazującym wahania w ciągu dnia: " +
      '<a href="https://github.com/GISBoost/easy-OTP/blob/main/tools/transit_charts/assets/examples/J39_I37_four_cities_2026-08-13.png" target="_blank" rel="noopener">J39/I37 na GitHubie</a>.',
    loadingText: "wczytywanie danych…",
    footerBackLink: "&larr; wszystkie analizy",
    footerDataCode: "Dane i kod:",
    footerMethod: "metoda i dane źródłowe:",

    window_all: "Cały dzień (6-22)",
    window_h06_10: "6:00-10:00",
    window_h10_14: "10:00-14:00",
    window_h14_18: "14:00-18:00",
    window_h18_22: "18:00-22:00",

    class1: "0-6 min - odstęp na tyle krótki, że rozkład jest zbędny",
    class2: "6-12 min - nadal można przyjść bez planowania",
    class3: "12-18 min - warto zerknąć w rozkład przed wyjściem",
    class4: "18-30 min - podróż wymaga zaplanowania",
    class5: "30+ min - na granicy realnej dostępności transportu",

    hexTooltipTitle: "Heksagon 500 m",
    hexTooltipMedian: "mediana odstępu",
    hexTooltipCount: "przystanki w heksie",

    statLineHtml: "<b>{count}</b> przystanków w <b>{hexCount}</b> heksagonach (500 m) &middot; mediana ważona odstępu <b>{median} min</b>",
    statLineEmpty: "brak wystarczających danych w tym oknie czasowym",
  },
  en: {
    langToggleAriaLabel: "Switch language",
    title: "How long do you wait at the stop — GISBoost",
    h1: "How long do you have to wait at the stop?",
    introHtml:
      "Median headway between consecutive arrivals of any line, for every stop separately, " +
      "averaged into a 500 m hex grid. Tab = city, the time window below recomputes the median " +
      'from only the observations in that range. One of <a href="../">GISBoost\'s map analyses</a>.',
    eyebrowWindow: "Time window",
    eyebrowLegend: "Legend",
    eyebrowOpacity: "Layer opacity",
    sidenoteHtml:
      "The same analysis as a static poster, with a second panel showing intraday variation: " +
      '<a href="https://github.com/GISBoost/easy-OTP/blob/main/tools/transit_charts/assets/examples/J39_I37_four_cities_2026-08-13.png" target="_blank" rel="noopener">J39/I37 on GitHub</a>.',
    loadingText: "loading data…",
    footerBackLink: "&larr; all analyses",
    footerDataCode: "Data and code:",
    footerMethod: "method and source data:",

    window_all: "Whole day (6-22)",
    window_h06_10: "6:00-10:00",
    window_h10_14: "10:00-14:00",
    window_h14_18: "14:00-18:00",
    window_h18_22: "18:00-22:00",

    class1: "0-6 min - short enough that a schedule is pointless",
    class2: "6-12 min - still fine to show up without planning",
    class3: "12-18 min - worth checking the schedule before heading out",
    class4: "18-30 min - the trip needs planning",
    class5: "30+ min - at the edge of real transit accessibility",

    hexTooltipTitle: "500 m hexagon",
    hexTooltipMedian: "median headway",
    hexTooltipCount: "stops in hexagon",

    statLineHtml: "<b>{count}</b> stops in <b>{hexCount}</b> hexagons (500 m) &middot; weighted median headway <b>{median} min</b>",
    statLineEmpty: "not enough data for this time window",
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
