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
    loadErr: "Nie udało się wczytać schematu. Odśwież stronę.",
    legendBtn: "Legenda",
    lgStop: "przystanek",
    lgHub: "węzeł przesiadkowy",
    lgTerm: "krańcówka linii (numer)",
    lgNums: "numery linii przy wiązce",
    lgCont: "ciąg dalszy linii w ramce (poza Łodzią)",
    lgRail: "kolej, stacja kolejowa",
    lgTrain: "stacja kolejowa przy przystanku",
    lgHosp: "szpital",
    lgMall: "Manufaktura",
    lgPark: "park, las",
    lgZone: "granica Łodzi; za nią (fioletowe tło) strefa biletowa 2",
    zoomIn: "Przybliż",
    zoomOut: "Oddal",
    zoomFit: "Cały schemat",
    footerHtml:
      '<a href="../">GISBoost</a> · dane: GTFS ZDiT Łódź, tło: © <a href="https://www.openstreetmap.org/copyright">autorzy OpenStreetMap</a> · ' +
      'układ: <a href="https://github.com/ad-freiburg/loom">LOOM</a> · do druku: ' +
      'tramwaje <a href="druk/lodz_tramwaje.pdf">PDF</a>/<a href="druk/lodz_tramwaje.svg">SVG</a>/<a href="druk/lodz_tramwaje.jpg">JPG</a>, ' +
      'autobusy <a href="druk/lodz_autobusy.pdf">PDF</a>/<a href="druk/lodz_autobusy.svg">SVG</a>/<a href="druk/lodz_autobusy.jpg">JPG</a>, ' +
      'nocne <a href="druk/lodz_nocne.pdf">PDF</a>/<a href="druk/lodz_nocne.svg">SVG</a>/<a href="druk/lodz_nocne.jpg">JPG</a>; ' +
      'przed 5.10: tramwaje <a href="druk/lodz_tramwaje_przed.pdf">PDF</a>/<a href="druk/lodz_tramwaje_przed.svg">SVG</a>/<a href="druk/lodz_tramwaje_przed.jpg">JPG</a>, ' +
      'autobusy <a href="druk/lodz_autobusy_przed.pdf">PDF</a>/<a href="druk/lodz_autobusy_przed.svg">SVG</a>/<a href="druk/lodz_autobusy_przed.jpg">JPG</a>, ' +
      'nocne <a href="druk/lodz_nocne_przed.pdf">PDF</a>/<a href="druk/lodz_nocne_przed.svg">SVG</a>/<a href="druk/lodz_nocne_przed.jpg">JPG</a> · ' +
      'zobacz też: <a href="https://lodzcalanaprzod.pl/lodz-schemat-linii-tramwajowych-pazdziernik-2026/">schemat tramwajów Łódź Cała Naprzód</a>',
    stateAria: "Stan rozkładu",
    stateAfter: "Od 5.10.2026",
    stateBefore: "Przed 5.10.2026",
    metaBefore: "Rozkład sprzed 5.10.2026 · dzień roboczy 1.10.2026 · GTFS ZDiT Łódź",
    changesHead: "Zmiany",
    changesNote:
      "Różnice policzone z rozkładu (GTFS), nie z rysunku: dzień roboczy 1.10.2026 (przed) i 8.10.2026 (od 5.10). " +
      "Zmiana trasy = inna sekwencja przystanków najczęstszego wariantu w którymś kierunku. " +
      "Układ schematów liczony osobno dla każdego stanu, więc różni się też tam, gdzie sieć się nie zmieniła.",
    chAdded: "nowa linia · {b} kurs.",
    chRemoved: "zlikwidowana · było {a} kurs.",
    chRoute: "zmiana trasy (+{p} / −{m} przyst.)",
    chTrips: "kursy {a} → {b}",
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
    loadErr: "Could not load the diagram. Reload the page.",
    legendBtn: "Legend",
    lgStop: "stop",
    lgHub: "interchange",
    lgTerm: "line terminus (number)",
    lgNums: "line numbers along a bundle",
    lgCont: "line continues in an inset (outside Łódź)",
    lgRail: "railway, railway station",
    lgTrain: "railway station near the stop",
    lgHosp: "hospital",
    lgMall: "Manufaktura",
    lgPark: "park, forest",
    lgZone: "Łódź city limit; beyond it (purple background) fare zone 2",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    zoomFit: "Whole diagram",
    footerHtml:
      '<a href="../">GISBoost</a> · data: GTFS ZDiT Łódź, background: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · ' +
      'layout: <a href="https://github.com/ad-freiburg/loom">LOOM</a> · for print: ' +
      'trams <a href="druk/lodz_tramwaje.pdf">PDF</a>/<a href="druk/lodz_tramwaje.svg">SVG</a>/<a href="druk/lodz_tramwaje.jpg">JPG</a>, ' +
      'buses <a href="druk/lodz_autobusy.pdf">PDF</a>/<a href="druk/lodz_autobusy.svg">SVG</a>/<a href="druk/lodz_autobusy.jpg">JPG</a>, ' +
      'night <a href="druk/lodz_nocne.pdf">PDF</a>/<a href="druk/lodz_nocne.svg">SVG</a>/<a href="druk/lodz_nocne.jpg">JPG</a>; ' +
      'before 5 Oct: trams <a href="druk/lodz_tramwaje_przed.pdf">PDF</a>/<a href="druk/lodz_tramwaje_przed.svg">SVG</a>/<a href="druk/lodz_tramwaje_przed.jpg">JPG</a>, ' +
      'buses <a href="druk/lodz_autobusy_przed.pdf">PDF</a>/<a href="druk/lodz_autobusy_przed.svg">SVG</a>/<a href="druk/lodz_autobusy_przed.jpg">JPG</a>, ' +
      'night <a href="druk/lodz_nocne_przed.pdf">PDF</a>/<a href="druk/lodz_nocne_przed.svg">SVG</a>/<a href="druk/lodz_nocne_przed.jpg">JPG</a> · ' +
      'see also: <a href="https://lodzcalanaprzod.pl/lodz-schemat-linii-tramwajowych-pazdziernik-2026/">tram diagram by Łódź Cała Naprzód</a>',
    stateAria: "Timetable state",
    stateAfter: "From 5 Oct 2026",
    stateBefore: "Before 5 Oct 2026",
    metaBefore: "Timetable before 5 Oct 2026 · weekday 1 Oct 2026 · GTFS ZDiT Łódź",
    changesHead: "Changes",
    changesNote:
      "Differences computed from the timetable (GTFS), not from the drawing: weekday 1 Oct 2026 (before) vs 8 Oct 2026 (from 5 Oct). " +
      "Route change = a different stop sequence of the most frequent variant in some direction. " +
      "Each state's layout is computed separately, so diagrams differ even where the network did not change.",
    chAdded: "new line · {b} trips",
    chRemoved: "discontinued · was {a} trips",
    chRoute: "route change (+{p} / −{m} stops)",
    chTrips: "trips {a} → {b}",
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
