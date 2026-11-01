"use strict";

// PL/EN i18n, same pattern as the other mapy-analizy pages (flat dicts, {placeholder} substitution,
// shared localStorage key so the language toggle stays in sync across pages).

const LANG_STORAGE_KEY = "mapyAnalizyLang";

const STRINGS = {
  pl: {
    langToggleAriaLabel: "Przełącz język",
    themeToggle: "Motyw",
    themeToggleAriaLabel: "Przełącz motyw jasny/ciemny",
    title: "Łódź godzina po godzinie — GISBoost",
    topnavAnalyses: "Analizy",
    topnavThis: "Łódź godzina po godzinie",
    h1: "Łódź godzina po godzinie",
    leadHtml: "Ile miejsc osiągniesz z domu w <b>30 minut</b> komunikacją miejską, zależnie od godziny wyjścia i miesiąca.",
    eyebrowMonth: "Miesiąc",
    eyebrowCategory: "Rodzaj miejsc",
    eyebrowView: "Widok",
    minus: "minus",
    eyebrowLook: "Wygląd",
    opacity: "Przezroczystość",
    heightScale: "Wysokość słupków",
    zoomInAria: "Przybliż", zoomOutAria: "Oddal", btn3dAria: "Przełącz widok 3D",
    hidePanelAria: "Zwiń panel", hideChartAria: "Ukryj wykres", showChartAria: "Pokaż wykres", sheetAria: "Rozwiń lub zwiń menu",
    legendNote3dValues: "W 3D wysokość słupka rośnie z liczbą miejsc (skala pierwiastkowa).",
    legendNote3dDiff: "W 3D wysokość słupka to wielkość różnicy, kolor mówi, czy to zysk, czy strata.",
    viewValues: "Wartości",
    viewDiff: "Różnica",
    monthSeg: { "2026-08": "Sierpień", "2026-09": "Wrzesień", "2026-10": "Październik" },
    monthFull: { "2026-08": "sierpień 2026", "2026-09": "wrzesień 2026", "2026-10": "październik 2026" },
    monthGen: { "2026-08": "sierpnia", "2026-09": "września", "2026-10": "października" },
    cat: { all: "Razem", edukacja: "Edukacja", zdrowie: "Zdrowie", handel_uslugi: "Handel i usługi", kultura_rekreacja: "Kultura i rekreacja" },
    legendValues: "Liczba miejsc w 30 min",
    legendDiff: "Różnica liczby miejsc",
    legendNoteValues: "Brak koloru = żadnego miejsca w zasięgu. Skala jest stała dla wszystkich godzin i miesięcy.",
    legendNoteDiff: "Niebieski: więcej miejsc niż w miesiącu odniesienia, czerwony: mniej. Szary środek = praktycznie bez zmian.",
    statMean: "średnio {v} miejsc",
    statDiff: "średnio {v} miejsc względem {m}",
    chartValues: "Średnia liczba miejsc (ważona ludnością)",
    chartDiff: "Różnica średniej: {a} minus {b}",
    chartAria: "Wykres średniej liczby miejsc według godziny",
    tipHex: "Heksagon {id}",
    tipValue: "{m}: {v}",
    tipDiff: "Różnica: {v}",
    playAria: "Odtwórz",
    pauseAria: "Zatrzymaj",
    sliderAria: "Godzina odjazdu",
    speedAria: "Prędkość animacji",
    panelToggleAria: "Pokaż lub ukryj ustawienia",
    loadingText: "wczytywanie danych…",
    loadError: "Nie udało się wczytać danych.",
    methodHtml:
      "Dla każdego heksagonu (250 m) liczymy, ile z ok. 4500 miejsc z OpenStreetMap (21 typów w 4 grupach) można osiągnąć w ≤ 30 min " +
      "pieszo i komunikacją miejską, przy wyjściu w danej godzinie (mediana po minutach odjazdu, R5). Rozkłady: zrealizowane P50 z " +
      "<a href=\"https://gisboost.github.io/gtfs-dashboard/\">gtfs-dashboard</a> (ZDiT Łódź), po 3 dni robocze (wt–czw) na miesiąc, " +
      "mediana z tych dni. Bez ŁKA. Różnica między miesiącami łączy zmianę rozkładu i opóźnień. Dane: <a href=\"https://gisboost.github.io/easy-R5/\">Easy-R5</a>.",
  },
  en: {
    langToggleAriaLabel: "Switch language",
    themeToggle: "Theme",
    themeToggleAriaLabel: "Switch light/dark theme",
    title: "Lodz hour by hour — GISBoost",
    topnavAnalyses: "Analyses",
    topnavThis: "Lodz hour by hour",
    h1: "Lodz hour by hour",
    leadHtml: "How many places you can reach from home in <b>30 minutes</b> by public transport, by departure hour and month.",
    eyebrowMonth: "Month",
    eyebrowCategory: "Type of places",
    eyebrowView: "View",
    minus: "minus",
    eyebrowLook: "Appearance",
    opacity: "Opacity",
    heightScale: "Bar height",
    zoomInAria: "Zoom in", zoomOutAria: "Zoom out", btn3dAria: "Toggle 3D view",
    hidePanelAria: "Collapse the panel", hideChartAria: "Hide the chart", showChartAria: "Show the chart", sheetAria: "Expand or collapse the menu",
    legendNote3dValues: "In 3D the bar height grows with the number of places (square-root scale).",
    legendNote3dDiff: "In 3D the bar height is the size of the difference, the colour tells gain from loss.",
    viewValues: "Values",
    viewDiff: "Difference",
    monthSeg: { "2026-08": "August", "2026-09": "September", "2026-10": "October" },
    monthFull: { "2026-08": "August 2026", "2026-09": "September 2026", "2026-10": "October 2026" },
    monthGen: { "2026-08": "August", "2026-09": "September", "2026-10": "October" },
    cat: { all: "All", edukacja: "Education", zdrowie: "Health", handel_uslugi: "Shops & services", kultura_rekreacja: "Culture & recreation" },
    legendValues: "Places within 30 min",
    legendDiff: "Difference in places",
    legendNoteValues: "No colour = no place within reach. The scale is fixed for all hours and months.",
    legendNoteDiff: "Blue: more places than in the reference month, red: fewer. Grey middle = practically no change.",
    statMean: "avg. {v} places",
    statDiff: "avg. {v} places vs {m}",
    chartValues: "Average number of places (population-weighted)",
    chartDiff: "Difference of the average: {a} minus {b}",
    chartAria: "Chart of the average number of places by hour",
    tipHex: "Hexagon {id}",
    tipValue: "{m}: {v}",
    tipDiff: "Difference: {v}",
    playAria: "Play",
    pauseAria: "Pause",
    sliderAria: "Departure hour",
    speedAria: "Animation speed",
    panelToggleAria: "Show or hide the settings",
    loadingText: "loading data…",
    loadError: "Could not load the data.",
    methodHtml:
      "For every 250 m hexagon we count how many of ~4,500 OpenStreetMap places (21 types in 4 groups) can be reached within 30 min " +
      "on foot and by public transport when leaving in a given hour (median over departure minutes, R5). Timetables: realized P50 from " +
      "<a href=\"https://gisboost.github.io/gtfs-dashboard/\">gtfs-dashboard</a> (ZDiT Lodz), 3 working days (Tue–Thu) per month, " +
      "median over these days. No regional rail (LKA). The difference between months mixes timetable changes and delays. Data: <a href=\"https://gisboost.github.io/easy-R5/\">Easy-R5</a>.",
  },
};

function getLang() {
  return localStorage.getItem(LANG_STORAGE_KEY) === "en" ? "en" : "pl";
}

function t(key, vars) {
  const dict = STRINGS[getLang()];
  let str = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
  if (vars && typeof str === "string") {
    Object.keys(vars).forEach((k) => { str = str.split(`{${k}}`).join(vars[k]); });
  }
  return str;
}

let onLangChange = null;
function setLangChangeHandler(fn) { onLangChange = fn; }

function applyStaticI18n() {
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel)); });
}
function updateLangToggleButton() {
  const btn = document.getElementById("langToggleBtn");
  if (btn) btn.textContent = getLang() === "pl" ? "EN" : "PL";
}
function setLang(lang) {
  const next = lang === "en" ? "en" : "pl";
  localStorage.setItem(LANG_STORAGE_KEY, next);
  document.documentElement.lang = next;
  applyStaticI18n();
  updateLangToggleButton();
  if (onLangChange) onLangChange();
}

document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.lang = getLang();
  applyStaticI18n();
  updateLangToggleButton();
  const btn = document.getElementById("langToggleBtn");
  if (btn) btn.addEventListener("click", () => setLang(getLang() === "pl" ? "en" : "pl"));
});
