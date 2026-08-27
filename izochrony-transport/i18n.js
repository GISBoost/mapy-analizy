"use strict";

// Lightweight PL/EN i18n -- same pattern as gtfs-dashboard's i18n.js and the
// other mapy-analizy apps (flat string dicts, {placeholder} substitution,
// localStorage-backed). Loaded before app.js so t()/getLang() are ready
// before its first render() call. City labels come from data/manifest.json
// (proper nouns) and are left untranslated.

const LANG_STORAGE_KEY = "mapyAnalizyLang";

const STRINGS = {
  pl: {
    langToggleAriaLabel: "Przełącz język",
    title: "Dokąd dojadę? — GISBoost",
    h1: "Dokąd dojadę transportem publicznym?",
    introHtml:
      "Najedź kursorem na mapę, aby zobaczyć zasięg dojazdu z tego miejsca. Kliknij, żeby przypiąć punkt, " +
      'i przesuwaj porę dnia — zasięg zmienia się razem z częstotliwością kursowania. Jedna z <a href="../">analiz mapowych GISBoost</a>.',
    eyebrowData: "Dane",
    eyebrowTime: "Pora dnia",
    eyebrowCutoff: "Czas dojazdu",
    statHint: "Najedź na mapę, żeby zobaczyć zasięg dojazdu z tego miejsca.",
    statOutsideArea: "Poza obszarem analizy, tu nie ma policzonych danych.",
    statHtml: "godz. <b>{hour}:00</b> &middot; {pinState}",
    statClickToPin: "kliknij, żeby przypiąć",
    statUnpinButton: "odepnij pinezkę",
    sidenoteHtml:
      "Metoda: <code>r5r::isochrone()</code>, siatka origins co 500 m, dane GTFS z 21.08.2026 — " +
      "rozkład jazdy vs zrealizowany przejazd (mediana obserwacji, GTFS-RT). " +
      "Kod i metodologia: " +
      '<a href="https://github.com/GISBoost/easy-OTP/tree/main/tools/isochrones_lodz" target="_blank" rel="noopener">easy-OTP/tools/isochrones_lodz</a>.',
    footerBackLink: "&larr; wszystkie analizy",
    footerDataCode: "Dane i kod:",

    variantRt: "Zrealizowany przejazd (GTFS-RT)",
    variantStatic: "Rozkład jazdy",
    cutoff45: "do 45 min",
    cutoff30: "do 30 min",
    cutoff15: "do 15 min",
  },
  en: {
    langToggleAriaLabel: "Switch language",
    title: "Where can I get to? — GISBoost",
    h1: "Where can I get to by public transit?",
    introHtml:
      "Hover the map to see the accessible area from that spot. Click to pin a point, " +
      'and drag the time-of-day slider — the area changes with service frequency. One of <a href="../">GISBoost\'s map analyses</a>.',
    eyebrowData: "Data",
    eyebrowTime: "Time of day",
    eyebrowCutoff: "Travel time",
    statHint: "Hover the map to see the accessible area from that spot.",
    statOutsideArea: "Outside the analyzed area, no data was computed here.",
    statHtml: "{hour}:00 &middot; {pinState}",
    statClickToPin: "click to pin",
    statUnpinButton: "unpin",
    sidenoteHtml:
      "Method: <code>r5r::isochrone()</code>, origins every 500 m, GTFS data from 2026-08-21 — " +
      "scheduled vs. realized service (median of observations, GTFS-RT). " +
      "Code and methodology: " +
      '<a href="https://github.com/GISBoost/easy-OTP/tree/main/tools/isochrones_lodz" target="_blank" rel="noopener">easy-OTP/tools/isochrones_lodz</a>.',
    footerBackLink: "&larr; all analyses",
    footerDataCode: "Data and code:",

    variantRt: "Realized service (GTFS-RT)",
    variantStatic: "Scheduled service",
    cutoff45: "up to 45 min",
    cutoff30: "up to 30 min",
    cutoff15: "up to 15 min",
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
