"use strict";

// Lightweight PL/EN i18n -- same pattern as the other mapy-analizy pages
// (flat string dicts, {placeholder} substitution, localStorage-backed).
// Loaded before the page's inline script so t()/getLang() are ready for its
// first buildList(). Stop names and the legend baked into the SVGs stay Polish.

const LANG_STORAGE_KEY = "mapyAnalizyLang";

const STRINGS = {
  pl: {
    langToggleAriaLabel: "Przełącz język",
    title: "Łódź – schemat linii tramwajowych i autobusowych — GISBoost",
    navPage: "Schemat linii Łódź",
    h1: "Łódź – schemat linii",
    tabTram: "Tramwaje",
    tabBus: "Autobusy",
    tabNight: "Nocne",
    meta: "Rozkład od 5.10.2026 · dzień roboczy · GTFS ZDiT Łódź",
    themeBtn: "Motyw",
    themeAria: "Przełącz motyw jasny/ciemny",
    linesHead: "Linie",
    clearBtn: "Pokaż wszystkie",
    trips: "{n} kurs.",
    tripsTitle: "Kursy w dniu roboczym, oba kierunki",
    hint: "Kliknij linię, żeby ją wyróżnić · przeciągnij i przewiń, żeby przybliżyć",
    zoomIn: "Przybliż",
    zoomOut: "Oddal",
    zoomFit: "Cały schemat",
    footerHtml:
      '<a href="../">GISBoost</a> · dane: GTFS ZDiT Łódź · ' +
      'układ: <a href="https://github.com/ad-freiburg/loom">LOOM</a> · do druku: ' +
      'tramwaje <a href="druk/lodz_tramwaje.pdf">PDF</a>/<a href="druk/lodz_tramwaje.svg">SVG</a>, ' +
      'autobusy <a href="druk/lodz_autobusy.pdf">PDF</a>/<a href="druk/lodz_autobusy.svg">SVG</a>, ' +
      'nocne <a href="druk/lodz_nocne.pdf">PDF</a>/<a href="druk/lodz_nocne.svg">SVG</a>',
  },
  en: {
    langToggleAriaLabel: "Switch language",
    title: "Łódź – tram and bus line diagram — GISBoost",
    navPage: "Łódź line diagram",
    h1: "Łódź – line diagram",
    tabTram: "Trams",
    tabBus: "Buses",
    tabNight: "Night",
    meta: "Timetable from 5 Oct 2026 · weekday · GTFS ZDiT Łódź",
    themeBtn: "Theme",
    themeAria: "Toggle light/dark theme",
    linesHead: "Lines",
    clearBtn: "Show all",
    trips: "{n} trips",
    tripsTitle: "Weekday trips, both directions",
    hint: "Click a line to highlight it · drag and scroll to zoom",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    zoomFit: "Whole diagram",
    footerHtml:
      '<a href="../">GISBoost</a> · data: GTFS ZDiT Łódź · ' +
      'layout: <a href="https://github.com/ad-freiburg/loom">LOOM</a> · for print: ' +
      'trams <a href="druk/lodz_tramwaje.pdf">PDF</a>/<a href="druk/lodz_tramwaje.svg">SVG</a>, ' +
      'buses <a href="druk/lodz_autobusy.pdf">PDF</a>/<a href="druk/lodz_autobusy.svg">SVG</a>, ' +
      'night <a href="druk/lodz_nocne.pdf">PDF</a>/<a href="druk/lodz_nocne.svg">SVG</a>',
  },
};

function getLang() {
  try { return localStorage.getItem(LANG_STORAGE_KEY) === "en" ? "en" : "pl"; } catch (e) { return "pl"; }
}

let onLangChange = null;
function setLangChangeHandler(fn) { onLangChange = fn; }

function setLang(lang) {
  const next = lang === "en" ? "en" : "pl";
  try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch (e) { /* private mode */ }
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
