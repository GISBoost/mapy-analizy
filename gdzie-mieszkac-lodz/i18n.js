"use strict";

// Lightweight PL/EN i18n -- same pattern as the other mapy-analizy apps (flat dicts, {placeholder}
// substitution, localStorage-backed). Loaded before app.js so t()/getLang() are ready.

const LANG_STORAGE_KEY = "mapyAnalizyLang";

const STRINGS = {
  pl: {
    langToggleAriaLabel: "Przełącz język",
    title: "Gdzie mieszkać w Łodzi? — GISBoost",
    navCatalog: "Analizy",
    navThis: "Gdzie mieszkać w Łodzi?",
    introHtml:
      "Ustaw swoje wymagania — mapa pokaże tylko miejsca, które je spełniają, i pokoloruje je wynikiem. " +
      "Czasy dojazdu liczone są z rozkładu oraz ze <b>zmierzonego</b> przebiegu kursów (rekonstrukcja GTFS-RT), " +
      "więc widać też, jak dojazd wygląda w gorszy dzień. To model, nie wyrocznia.",
    secScenario: "Scenariusz",
    fWindow: "Pora dnia",
    fTtype: "Czas przejazdu transportem publicznym",
    fRides: "Przesiadki",
    fLka: "Łódzka Kolej Aglomeracyjna (ŁKA) włączona",
    fDir: "Kierunek dojazdu",
    secTargets: "Cele dojazdu (do 5)",
    addTarget: "+ Dodaj cel (kliknij na mapie)",
    addTargetPicking: "Kliknij miejsce na mapie… (Esc = anuluj)",
    targetHint: "Cel przypina się do najbliższego heksa (błąd do ok. 145 m). Czas dla wielu trybów = najkrótszy z wybranych.",
    secCriteria: "Kryteria miękkie (waga 0–5)",
    fBedroom: "Hałas: tryb „sypialnia\" (wskaźnik nocny Ln)",
    priceHint: "Cena: brak danych w tej wersji (pusty slot).",
    secHard: "Wymagania twarde",
    hardHint: "Dla celu: pole „Twardy\" na liście celów. Heks niespełniający wymagań znika.",
    secMin: "Minimalny wynik",
    fShowRejected: "Pokaż odrzucone jako blade",
    secLegend: "Legenda (wynik 0–100)",
    loadingText: "wczytywanie danych…",
    loadError: "Nie udało się wczytać danych: {msg}",
    win_morning: "Poranny szczyt (07–09)",
    win_midday: "Południe (11–14)",
    win_afternoon: "Popołudniowy szczyt (15–18)",
    ttype_static: "Rozkładowy (rozkład jazdy)",
    ttype_p50: "Zmierzony P50 (rekonstrukcja GTFS-RT)",
    ttype_p85: "Zmierzony P85 (rekonstrukcja GTFS-RT)",
    ttypeHint_static: "Czas z rozkładu jazdy tego samego dnia, bez opóźnień.",
    ttypeHint_p50: "Typowy dzień: połowa przejazdów jest wolniejsza od tego czasu (rekonstrukcja GTFS-RT, mediana z 5 dni roboczych).",
    ttypeHint_p85: "Gorszy dzień: 15% przejazdów jest wolniejszych od tego czasu (rekonstrukcja GTFS-RT, mediana z 5 dni roboczych).",
    rides_unlimited: "Bez limitu przesiadek",
    rides_max1transfer: "Maksymalnie 1 przesiadka",
    dir_auto: "Domyślny dla pory dnia ({d})",
    dir_to: "Do celu (dom → cel)",
    dir_from: "Od celu (cel → dom)",
    dirHint_to: "Odjazd z miejsca zamieszkania w wybranej porze, dojazd do celu.",
    dirHint_from: "Odjazd z celu w wybranej porze, powrót do miejsca zamieszkania.",
    targetDefaultName: "Cel {n}",
    mode_transit: "Transport publiczny",
    mode_walk: "Pieszo",
    mode_bike: "Rower",
    mode_car: "Auto (przybliżenie korków, nie pomiar)",
    mode_transit_short: "TP",
    mode_walk_short: "pieszo",
    mode_bike_short: "rower",
    mode_car_short: "auto",
    tMaxMin: "Maks. czas [min]",
    tIdealMin: "Idealny ≤ [min]",
    tWeight: "Waga 0–5",
    tHard: "Twardy",
    tDelete: "Usuń cel",
    tLoading: "ładowanie czasów…",
    tNoMode: "Wybierz co najmniej jeden tryb.",
    tFail: "Brak danych o czasach dla tego celu: {msg}",
    w_tram_stop: "Przystanek tramwajowy (przedział idealny)",
    w_bus_stop: "Przystanek autobusowy",
    w_frequency: "Częstotliwość kursowania (tramwaj + autobus)",
    w_green: "Zieleń (≥ 1 ha) po sieci pieszej",
    w_noise_road: "Hałas drogowy",
    w_noise_rail: "Hałas szynowy (tramwaj + kolej)",
    w_noise_industry: "Hałas przemysłowy",
    hard_noise: "Wymagaj: {src} ≥ {db} dB na ≤ {share}% powierzchni heksa",
    stat_html: "<b>{n}</b> z <b>{total}</b> heksów spełnia wymagania · odrzucone: twarde <b>{hard}</b>, poniżej minimum <b>{low}</b>, bez kryteriów <b>{none}</b>",
    cardTitle: "Heks {id}",
    cardScore: "Wynik",
    cardRejectedHard: "Odrzucony: nie spełnia wymagania twardego.",
    cardRejectedLow: "Odrzucony: wynik poniżej ustawionego minimum.",
    cardNoCriteria: "Brak aktywnych kryteriów dla tego heksa (wszystkie wagi 0 lub brak danych).",
    cardCriterion: "Kryterium",
    cardRaw: "Wartość",
    cardPts: "Wynik 0–1",
    cardWeight: "Waga",
    cardTimes: "Czasy dojazdu",
    cardBest: "najkrótszy",
    cardUnreached: "poza zasięgiem (> {max} min)",
    cardNoData: "brak danych",
    cardFar: "> 2 km",
    cardNoiseShare: "{p}% pow. ≥ {db} dB",
    cardClose: "Zamknij",
    unitMin: "min",
    unitM: "m",
    unitPerH: "odj./h",
    disclaimerHtml:
      "To <b>model, nie wyrocznia</b>: nie jest poradą inwestycyjną ani wyceną nieruchomości. „Zmierzony\" = rekonstrukcja GTFS-RT z 5 dni roboczych " +
      "(28.09–02.10.2026), nie prawda referencyjna; auto to przybliżenie korków z prędkości autobusów, nie pomiar.",
    footerBackLink: "&larr; wszystkie analizy",
    footerData: "Dane i kod:",
    footerMethod: "wersja metody:",
    dataSources: "Dane: OpenStreetMap (ODbL), GTFS ZDiT Łódź i ŁKA, mapa akustyczna Łodzi (UMŁ).",
  },
  en: {
    langToggleAriaLabel: "Switch language",
    title: "Where to live in Łódź? — GISBoost",
    navCatalog: "Analyses",
    navThis: "Where to live in Łódź?",
    introHtml:
      "Set your requirements — the map shows only the places that meet them and colours them by score. " +
      "Travel times come from the timetable and from <b>measured</b> trip performance (reconstructed GTFS-RT), " +
      "so you also see what a commute looks like on a worse day. This is a model, not an oracle.",
    secScenario: "Scenario",
    fWindow: "Time of day",
    fTtype: "Public transport travel time",
    fRides: "Transfers",
    fLka: "Łódź Agglomeration Railway (ŁKA) included",
    fDir: "Travel direction",
    secTargets: "Destinations (up to 5)",
    addTarget: "+ Add destination (click on the map)",
    addTargetPicking: "Click a place on the map… (Esc = cancel)",
    targetHint: "A destination snaps to the nearest hexagon (error up to ~145 m). With several modes, the shortest time is used.",
    secCriteria: "Soft criteria (weight 0–5)",
    fBedroom: "Noise: \"bedroom\" mode (night indicator Ln)",
    priceHint: "Price: no data in this version (empty slot).",
    secHard: "Hard requirements",
    hardHint: "For destinations: the \"Hard\" box in the destination list. A hexagon that fails a requirement disappears.",
    secMin: "Minimum score",
    fShowRejected: "Show rejected as faint",
    secLegend: "Legend (score 0–100)",
    loadingText: "loading data…",
    loadError: "Could not load data: {msg}",
    win_morning: "Morning peak (07–09)",
    win_midday: "Midday (11–14)",
    win_afternoon: "Afternoon peak (15–18)",
    ttype_static: "Scheduled (timetable)",
    ttype_p50: "Measured P50 (reconstructed GTFS-RT)",
    ttype_p85: "Measured P85 (reconstructed GTFS-RT)",
    ttypeHint_static: "Time from the same day's timetable, without delays.",
    ttypeHint_p50: "A typical day: half of the trips are slower than this time (reconstructed GTFS-RT, median of 5 working days).",
    ttypeHint_p85: "A worse day: 15% of trips are slower than this time (reconstructed GTFS-RT, median of 5 working days).",
    rides_unlimited: "No limit on transfers",
    rides_max1transfer: "At most 1 transfer",
    dir_auto: "Default for time of day ({d})",
    dir_to: "To the destination (home → destination)",
    dir_from: "From the destination (destination → home)",
    dirHint_to: "Leave home at the chosen time, travel to the destination.",
    dirHint_from: "Leave the destination at the chosen time, travel back home.",
    targetDefaultName: "Destination {n}",
    mode_transit: "Public transport",
    mode_walk: "Walk",
    mode_bike: "Bicycle",
    mode_car: "Car (congestion approximation, not a measurement)",
    mode_transit_short: "PT",
    mode_walk_short: "walk",
    mode_bike_short: "bike",
    mode_car_short: "car",
    tMaxMin: "Max time [min]",
    tIdealMin: "Ideal ≤ [min]",
    tWeight: "Weight 0–5",
    tHard: "Hard",
    tDelete: "Remove destination",
    tLoading: "loading times…",
    tNoMode: "Select at least one mode.",
    tFail: "No travel-time data for this destination: {msg}",
    w_tram_stop: "Tram stop (ideal band)",
    w_bus_stop: "Bus stop",
    w_frequency: "Service frequency (tram + bus)",
    w_green: "Green space (≥ 1 ha) by walking network",
    w_noise_road: "Road noise",
    w_noise_rail: "Rail noise (tram + train)",
    w_noise_industry: "Industrial noise",
    hard_noise: "Require: {src} ≥ {db} dB on ≤ {share}% of the hexagon",
    stat_html: "<b>{n}</b> of <b>{total}</b> hexagons pass · rejected: hard <b>{hard}</b>, below minimum <b>{low}</b>, no criteria <b>{none}</b>",
    cardTitle: "Hexagon {id}",
    cardScore: "Score",
    cardRejectedHard: "Rejected: fails a hard requirement.",
    cardRejectedLow: "Rejected: score is below the minimum you set.",
    cardNoCriteria: "No active criteria for this hexagon (all weights 0 or no data).",
    cardCriterion: "Criterion",
    cardRaw: "Value",
    cardPts: "Score 0–1",
    cardWeight: "Weight",
    cardTimes: "Travel times",
    cardBest: "shortest",
    cardUnreached: "out of reach (> {max} min)",
    cardNoData: "no data",
    cardFar: "> 2 km",
    cardNoiseShare: "{p}% of area ≥ {db} dB",
    cardClose: "Close",
    unitMin: "min",
    unitM: "m",
    unitPerH: "dep./h",
    disclaimerHtml:
      "This is a <b>model, not an oracle</b>: not investment advice or a property valuation. \"Measured\" = GTFS-RT reconstruction from 5 working days " +
      "(28 Sep–2 Oct 2026), not ground truth; car is a congestion approximation from bus speeds, not a measurement.",
    footerBackLink: "&larr; all analyses",
    footerData: "Data and code:",
    footerMethod: "method version:",
    dataSources: "Data: OpenStreetMap (ODbL), ZDiT Łódź and ŁKA GTFS, Łódź acoustic map (City Hall).",
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
  if (vars) Object.keys(vars).forEach((k) => { str = str.split(`{${k}}`).join(vars[k]); });
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
