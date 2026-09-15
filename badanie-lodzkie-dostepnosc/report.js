"use strict";

// Static research write-up: transport accessibility across the whole Łódzkie
// voivodeship (static GTFS) plus the Łódź schedule-vs-realized delta, in three
// independent day variants. Vanilla JS, no build step, chart helpers from
// ../charts.js (see that file's header for when to promote a report-local
// copy into the shared one). All numbers below are transcribed directly from
// tools/lodzkie_na_mapach_2026/out/*.csv in easy-R5 (woj_level_summary.csv,
// woj_threshold_summary.csv, lodz_delta_summary_multiday.csv,
// lodz_delta_summary_vacation.csv, work/gtfs_raw/diff_summary_*.csv) —
// no new computation happens here.

const LANG_KEY = "mapyAnalizyLang";
const getLang = () => (localStorage.getItem(LANG_KEY) === "en" ? "en" : "pl");

const CAT_ORDER = ["przedszkole", "szkola", "przychodnia", "apteka", "park",
  "plac_zabaw", "boisko_sport", "supermarket", "poczta", "urzad_gminy", "total"];
const CAT_LABEL = {
  pl: {
    przedszkole: "przedszkola", szkola: "szkoły", przychodnia: "przychodnie", apteka: "apteki",
    park: "parki", plac_zabaw: "place zabaw", boisko_sport: "boiska sportowe",
    supermarket: "supermarkety", poczta: "poczta", urzad_gminy: "urząd gminy", total: "razem",
  },
  en: {
    przedszkole: "kindergartens", szkola: "schools", przychodnia: "clinics", apteka: "pharmacies",
    park: "parks", plac_zabaw: "playgrounds", boisko_sport: "sports fields",
    supermarket: "supermarkets", poczta: "post offices", urzad_gminy: "town/gmina offices", total: "total",
  },
};

// woj_level_summary.csv, mean_level_pop_weighted, cutoff=30
const LEVEL = {
  przedszkole: 10.61, szkola: 10.21, przychodnia: 11.31, apteka: 14.34, park: 12.26,
  plac_zabaw: 41.26, boisko_sport: 31.08, supermarket: 9.80, poczta: 3.99, urzad_gminy: 6.77,
  total: 151.63,
};

// woj_threshold_summary.csv, ratio_of_pop_weighted_sums (c60/c30)
const GROWTH_RATIO = {
  przedszkole: 5.57, szkola: 5.61, przychodnia: 5.02, apteka: 4.89, park: 5.85,
  plac_zabaw: 5.94, boisko_sport: 6.22, supermarket: 5.30, poczta: 4.97, urzad_gminy: 4.20,
  total: 5.63,
};

// lodz_delta_summary_multiday.csv / lodz_delta_summary_vacation.csv, category=total, cutoff=30
const DELTA_LODZ_VARIANTS = [
  { key: "ref", value: -12.15 },
  { key: "avg3", value: -12.37 },
  { key: "vacation", value: -1.47 },
];
const VACATION_DAYS = [
  { date: "2026-08-13", value: 1.40 },
  { date: "2026-08-14", value: -2.32 },
  { date: "2026-08-17", value: -2.75 },
  { date: "2026-08-18", value: -2.19 },
  { date: null, value: -1.47 }, // avg_4day, label filled in per-language below
];

// work/gtfs_raw/diff_summary_<date>.csv, "ALL" aggregate row
const RT_DELAY_ROWS = [
  { date: "2026-08-13", pct: 18.37, mean: 6.48 },
  { date: "2026-08-14", pct: 18.10, mean: 6.00 },
  { date: "2026-08-17", pct: 18.48, mean: 7.93 },
  { date: "2026-08-18", pct: 18.49, mean: 10.44 },
  { date: "2026-09-10", pct: 38.46, mean: 27.19 },
];

// prepare_poi.py / out/poi_coverage_powiaty.csv -- categories on the coverage
// threshold boundary (>=5 objects in >=18/24 powiats to survive into the
// voivodeship layer); all four kept for the Lodz-only 21-category layer.
const BORDERLINE_ROWS = [
  { key: "biblioteka", n: 15 },
  { key: "dom_kultury", n: 16 },
  { key: "basen", n: 11 },
  { key: "centrum_handlowe", n: 9 },
];
const BORDERLINE_LABEL = {
  pl: { biblioteka: "biblioteka", dom_kultury: "dom kultury", basen: "basen", centrum_handlowe: "centrum handlowe" },
  en: { biblioteka: "library", dom_kultury: "cultural centre", basen: "swimming pool", centrum_handlowe: "shopping mall" },
};

const FEED_ROWS = [
  { key: "lodz", rt: true },
  { key: "lka_bus", rt: false },
  { key: "lka_train", rt: false },
  { key: "kutno", rt: false },
  { key: "opoczno_mpk", rt: false },
  { key: "opoczno_pks", rt: false },
  { key: "rozprza", rt: false },
  { key: "tomaszow_mazowiecki", rt: false },
];
const FEED_LABEL = {
  pl: {
    lodz: "MPK Łódź", lka_bus: "ŁKA/KKA (autobusy)", lka_train: "ŁKA + Kolej Wąskotorowa Rogów–Rawa–Biała",
    kutno: "MZK Kutno", opoczno_mpk: "MPK Opoczno", opoczno_pks: "PKS Opoczno",
    rozprza: "Gmina Rozprza", tomaszow_mazowiecki: "MZK Tomaszów Mazowiecki",
  },
  en: {
    lodz: "MPK Łódź", lka_bus: "ŁKA/KKA (buses)", lka_train: "ŁKA + Rogów–Rawa–Biała narrow-gauge rail",
    kutno: "MZK Kutno", opoczno_mpk: "MPK Opoczno", opoczno_pks: "PKS Opoczno",
    rozprza: "Rozprza commune", tomaszow_mazowiecki: "MZK Tomaszów Mazowiecki",
  },
};

const STR = {
  pl: {
    title: "Dostępność w Łódzkiem: metoda i wyniki — GISBoost",
    brandSub: "/ analizy mapowe",
    navCatalog: "Analizy",
    navReport: "Badanie: dostępność w Łódzkiem",
    crumbHere: "Badanie: dostępność w Łódzkiem",
    langToggleAriaLabel: "Przełącz język",
    kicker: "Easy-R5 · dostępność transportowa · województwo łódzkie",
    h1: "Jak zmierzyliśmy dostępność w całym województwie łódzkim",
    lede1Html:
      "Dla każdego z <b>16 864 heksagonów</b> (siatka 1000 m) pokrywających całe województwo łódzkie policzyliśmy, " +
      "ile z <b>10 kategorii usług</b> da się dojechać w 30 minut transportem publicznym w porannym szczycie " +
      "(7:00–9:00), na statycznym rozkładzie GTFS z <b>8 przewoźników</b> (2026-09-10). Dla Łodzi — jedynego " +
      "miasta w regionie z nagrywanym GTFS-RT — dodatkowo policzyliśmy to samo na <b>rozkładzie faktycznie " +
      "zrealizowanym</b> (mediana P50), na siatce 250 m i 21 kategoriach, w trzech niezależnych wariantach dnia.",
    lede2Html:
      'To jest raport metodologiczny do <a href="../lodzkie-dostepnosc/">interaktywnej mapy</a> — pełna lista ' +
      "feedów, próg przycięcia kategorii, wyniki i, co równie ważne, <b>ograniczenia wprost</b>.",
    tileGminy: "gmin objętych analizą",
    tileHex: "heksagonów: woj. / Łódź",
    tileCats: "kategorii POI: woj. / Łódź",
    tileCutoff: "próg, okno 7:00–9:00",

    s1Heading: "1. Siatka, dasymetria i próg przycięcia kategorii",
    s1SubHtml:
      "Ludność (NSP 2021, obwody spisowe GUS) rozłożona na heksagony <b>po footprintcie budynków OSM</b> " +
      "(dasymetria), nie po powierzchni obwodu — pola, lasy i tereny przemysłowe nie „dostają” mieszkańców. " +
      "Kategoria POI wchodzi do warstwy <b>wojewódzkiej</b>, jeśli ma ≥5 obiektów w ≥18 z 24 powiatów — inaczej " +
      "mapa mierzyłaby kompletność OSM, nie realną rzadkość usługi. Z 21 kandydujących kategorii przeszło " +
      "<b>10</b>; pozostałe 11 (m.in. uczelnia, szpital) zostały użyte tylko w warstwie łódzkiej, gdzie jednego " +
      "dużego miasta wystarczy na sensowną próbkę bez testu pokrycia międzygminnego.",
    s1CaptionHtml:
      "Cztery kategorie na granicy progu — odrzucone z warstwy wojewódzkiej, ale zachowane w warstwie łódzkiej. " +
      "Odrzucone kategorie nie znikają z dokumentacji: to materiał o realnej rzadkości usługi w części gmin, " +
      "nie porażka metody.",
    thCat: "Kategoria", thCoverage: "Pokrycie (powiaty)", thDecision: "Decyzja",
    decisionLodzOnly: "tylko warstwa łódzka",

    s2Heading: "2. Osiem przewoźników w województwie, dwa w Łodzi",
    s2SubHtml:
      "GTFS statyczny na 2026-09-10, zweryfikowany bramką (komplet plików, kursy aktywne &gt; 0, spójne " +
      "<code>trip_id</code> między wariantami) przed jakimkolwiek routingiem.",
    s2CaptionHtml:
      "Dwa kandydaci odrzuceni świadomie: <code>polish_trains.zip</code> (granica edycji rozkładu akurat na " +
      "2026-09-10 — tylko 96 kursów tego dnia zamiast typowych 350–475) i <code>aleksandrow_lodzki</code> (feed " +
      "pokrywa tylko przyszłe ~2 tygodnie od dnia pobrania, nie sięga wstecz do daty analizy). 13 gmin (m.in. " +
      "Piotrków Trybunalski, Sieradz, Bełchatów) sprawdzonych i potwierdzonych jako bez publikowanego GTFS.",
    thFeed: "Feed", thScope: "Zasięg", thRt: "RT?", rtYes: "tak (ZDiT)", rtNo: "nie",

    s3Heading: "3. Poziom dostępności wojewódzki",
    s3SubHtml:
      "Średnia liczba osiągalnych obiektów per kategoria w 30 min, ważona populacją heksagonu, po wszystkich " +
      "16 864 heksagonach województwa (zera wliczone).",
    s3CaptionHtml:
      "Suma po 10 kategoriach: <b>151,6</b> obiektu osiągalnego w 30 min, średnio na mieszkańca województwa. " +
      "Najwięcej ważą boiska sportowe i place zabaw (obiekty częste i rozproszone), najmniej poczta i urząd " +
      "gminy (po jednym na gminę).",

    s4Heading: "4. „Delta” wojewódzka bez danych RT: wzrost 30→60 min",
    s4SubHtml:
      "Poza Łodzią nie ma nagrywanego GTFS-RT, więc delta statyczny-vs-zrealizowany nie istnieje dla reszty " +
      "województwa. Zamiast niej: o ile rośnie dostępność, gdy budżet czasu podwaja się z 30 do 60 minut — " +
      "krotność sum ważonych populacją, per kategoria.",
    s4CaptionHtml:
      "Dostępność <b>nie podwaja się</b> przy podwojeniu czasu — rośnie 4,2–6,2× per kategoria (5,6× łącznie), " +
      "silnie nieliniowo, zgodnie z siecią typu hub-and-spoke. Przy progu 30 min <b>65% heksagonów województwa</b> " +
      "(10 934 z 16 864) nie ma dostępu do żadnej z 10 kategorii; 41,7 punktu procentowego z tego „odblokowuje " +
      "się” dopiero przy 60 min, 23,1 pp zostaje bez dostępu nawet wtedy.",

    s5Heading: "5. Delta Łodzi: rozkład vs realizacja, trzy niezależne dni",
    s5SubHtml:
      "Zmiana sumy 21 kategorii osiągalnych w 30 min, zrealizowany P50 minus rozkład statyczny, ważona " +
      "populacją, tylko heksagony z niezerową bazą statyczną. Trzy niezależne przebiegi: jeden dzień " +
      "referencyjny, średnia z 3 dni września (robustness), średnia z 4 dni sierpnia (wakacje).",
    s5CaptionHtml:
      "Jednorodna ujemna delta (98% kategorii×dni ujemnych we wrześniu) jest robustna na 3 niezależne dni — " +
      "to nie szum jednego pomiaru.",
    legRef: "dzień referencyjny (2026-09-10)", legAvg3: "średnia 3-dniowa (wrzesień)", legVacation: "średnia 4-dniowa (wakacje)",

    s6Heading: "6. Czy to Łódź, czy powrót do szkoły? Wakacje kontra wrzesień",
    s6SubHtml:
      'Ta sama metoda, zastosowana do 4 dni sierpniowych (wakacje) zamiast 3 wrześniowych (rok szkolny) — ' +
      '<a href="../lodzkie-dostepnosc/">warstwa na mapie</a>. Dwie różne bazy statyczne (08-13/14 i 08-17/18 ' +
      "mają różny aktywny <code>service_id</code>, potwierdzone niezależnie), każdy dzień policzony osobno.",
    s6CaptionHtml:
      "Efekt sierpniowy jest ~8,4× słabszy i dużo mniej jednorodny niż wrześniowy (73% ujemnych kategorii×dni " +
      "vs 98%; jeden dzień, 08-13, wyszedł wręcz dodatni). Potwierdzone niezależnie surowymi danymi opóźnień " +
      "GTFS-RT poniżej — ten sam kierunek, ta sama skala.",
    s6Caption2Html:
      "Niezależna, nie-routingowa miara (surowe opóźnienia per kurs z GTFS-RT) zgadza się kierunkiem i rzędem " +
      "wielkości z wynikiem z R5: <b>wniosek to głównie efekt powrotu do szkoły/pracy, nie stała cecha sieci " +
      "łódzkiej</b>. Zastrzeżenie: liczba wierszy danych RT jest ~2× mniejsza we wrześniu niż w sierpniu mimo " +
      "podobnej liczby aktywnych kursów — możliwa różnica w gęstości próbkowania GTFS-RT między oknami, nie " +
      "tylko realny efekt na drodze.",
    thDate: "Dzień", thPctChanged: "% kursów zmienionych", thMeanDelay: "śr. opóźnienie (s)",

    s7Heading: "Ograniczenia — wprost",
    limits: [
      "Jeden dzień, jedno okno (7:00–9:00), jeden szczyt poranny — nie uśredniamy po porach dnia ani dniach tygodnia poza wskazanymi wariantami robustness.",
      "RT (rozkład zrealizowany) istnieje tylko dla Łodzi (ZDiT) — reszta województwa ma wyłącznie statyczny GTFS; „delta” wojewódzka to wzrost 30→60 min, nie static-vs-realized.",
      "ŁKA (kolej aglomeracyjna) jest statyczna po obu stronach delty łódzkiej — zrealizowany rozkład kolei nie wszedł do porównania (jednodniowy P50 dla kolei oceniony jako zbyt cienki, patrz HANDOFF.md §6.4).",
      "Kompletność POI ograniczona kompletnością OpenStreetMap w danej gminie — mapa mierzy dostępność do tego, co jest zmapowane, nie do rzeczywistego stanu na ziemi.",
      "Różny zestaw kategorii dla województwa (10) i Łodzi (21) — nie porównuj wprost sum między dwiema warstwami.",
      "Znany, zgłoszony błąd wtyczki Easy-R5 (issue #3): domyślna bramka „brak kursów tego dnia” fałszywie odrzuca daty poza 90-dniowym oknem od najwcześniejszego feedu; obejście przez jawny parametr ALLOW_NO_SERVICE, po niezależnym potwierdzeniu przez validate_gtfs.py, że kursy realnie istnieją.",
    ],

    s8Heading: "Metoda i źródła",
    s8SubHtml:
      'Pełna interaktywna mapa: <a href="../lodzkie-dostepnosc/">Dostępność w Łódzkiem</a>. Silnik: ' +
      '<a href="https://gisboost.github.io/easy-R5/" target="_blank" rel="noopener">Easy-R5</a> (Conveyal R5) ' +
      "w QGIS. Kod, dane wejściowe, pełna dokumentacja metody i historii decyzji: " +
      '<a href="https://github.com/GISBoost/easy-R5/tree/main/tools/lodzkie_na_mapach_2026" target="_blank" rel="noopener">easy-R5 · tools/lodzkie_na_mapach_2026</a> ' +
      "(<code>HANDOFF.md</code>, <code>MULTIDAY_LODZ_NOTES.md</code>).",
    sourceNoteHtml:
      "Dane: sieć drogowa, budynki i granice z OpenStreetMap; rozkłady statyczne i zrealizowane P50 z GTFS " +
      "operatorów (nagrania GTFS-RT, rekonstrukcja easy-GTFS-RT dla Łodzi); ludność z Narodowego Spisu " +
      "Powszechnego 2021 (GUS), obwody spisowe; granice administracyjne PRG (dane.gov.pl). Analiza przygotowana " +
      "na konkurs „Łódzkie na mapach 2026”.",
    footerBack: "← wszystkie analizy",
  },
  en: {
    title: "Accessibility in Łódzkie: method and results — GISBoost",
    brandSub: "/ map analyses",
    navCatalog: "Analyses",
    navReport: "Study: accessibility in Łódzkie",
    crumbHere: "Study: accessibility in Łódzkie",
    langToggleAriaLabel: "Switch language",
    kicker: "Easy-R5 · transport accessibility · Łódzkie voivodeship",
    h1: "How we measured accessibility across the whole Łódzkie voivodeship",
    lede1Html:
      "For each of <b>16,864 hexagons</b> (1000 m grid) covering the entire Łódzkie voivodeship, we computed " +
      "how many of <b>10 service categories</b> are reachable within 30 minutes by public transit in the " +
      "morning peak (7:00–9:00), on the static GTFS schedule from <b>8 operators</b> (2026-09-10). For Łódź — " +
      "the only city in the region with recorded GTFS-RT — we additionally computed the same on the <b>actually " +
      "realized schedule</b> (P50 median), on a 250 m grid and 21 categories, in three independent day variants.",
    lede2Html:
      'This is the methodology write-up for the <a href="../lodzkie-dostepnosc/">interactive map</a> — the ' +
      "full feed list, the category coverage threshold, the results, and — just as important — <b>the " +
      "limitations, stated plainly</b>.",
    tileGminy: "communes covered",
    tileHex: "hexagons: voivodeship / Łódź",
    tileCats: "POI categories: voivodeship / Łódź",
    tileCutoff: "cutoff, 7:00–9:00 window",

    s1Heading: "1. Grid, dasymetric mapping and the category coverage threshold",
    s1SubHtml:
      "Population (2021 census, GUS precincts) is spread onto hexagons <b>by OSM building footprint</b> " +
      "(dasymetric mapping), not by precinct area — fields, forests and industrial land don't “get” " +
      "residents. A POI category enters the <b>voivodeship</b> layer if it has ≥5 objects in ≥18 of 24 " +
      "powiats — otherwise the map would measure OSM completeness, not real service scarcity. Of 21 candidate " +
      "categories, <b>10</b> survived; the remaining 11 (e.g. university, hospital) were used only in the Łódź " +
      "layer, where a single large city is enough for a meaningful sample without a cross-commune coverage test.",
    s1CaptionHtml:
      "Four categories on the threshold boundary — dropped from the voivodeship layer, kept in the Łódź layer. " +
      "Dropped categories don't vanish from the documentation: this is material about real service scarcity in " +
      "part of the region, not a method failure.",
    thCat: "Category", thCoverage: "Coverage (powiats)", thDecision: "Decision",
    decisionLodzOnly: "Łódź layer only",

    s2Heading: "2. Eight operators in the voivodeship, two in Łódź",
    s2SubHtml:
      "Static GTFS for 2026-09-10, verified by a gate (complete file set, active trips &gt; 0, consistent " +
      "<code>trip_id</code> across variants) before any routing.",
    s2CaptionHtml:
      "Two candidates deliberately rejected: <code>polish_trains.zip</code> (a timetable-edition boundary " +
      "lands exactly on 2026-09-10 — only 96 trips that day vs the typical 350–475) and " +
      "<code>aleksandrow_lodzki</code> (the feed only covers the ~2 weeks ahead of the download date, not back " +
      "to the analysis date). 13 communes (Piotrków Trybunalski, Sieradz, Bełchatów among them) checked and " +
      "confirmed to have no published GTFS.",
    thFeed: "Feed", thScope: "Coverage", thRt: "RT?", rtYes: "yes (ZDiT)", rtNo: "no",

    s3Heading: "3. Voivodeship-wide accessibility level",
    s3SubHtml:
      "Mean number of reachable objects per category within 30 min, population-weighted per hexagon, across " +
      "all 16,864 voivodeship hexagons (zeros included).",
    s3CaptionHtml:
      "Sum across the 10 categories: <b>151.6</b> objects reachable in 30 min, averaged over the " +
      "voivodeship's population. Sports fields and playgrounds carry the most weight (common, dispersed " +
      "objects), post offices and town offices the least (one per commune).",

    s4Heading: "4. A voivodeship-wide “delta” without RT data: growth from 30 to 60 min",
    s4SubHtml:
      "No GTFS-RT is recorded outside Łódź, so a static-vs-realized delta doesn't exist for the rest of the " +
      "voivodeship. Instead: how much accessibility grows when the time budget doubles from 30 to 60 minutes " +
      "— population-weighted sum ratio, per category.",
    s4CaptionHtml:
      "Accessibility <b>doesn't double</b> when the time budget doubles — it grows 4.2–6.2× per category " +
      "(5.6× overall), strongly nonlinear, consistent with a hub-and-spoke network. At the 30-min cutoff, " +
      "<b>65% of voivodeship hexagons</b> (10,934 of 16,864) have zero access to any of the 10 categories; " +
      "41.7 percentage points of that “unlock” only at 60 min, 23.1 pp stay without access even then.",

    s5Heading: "5. Łódź delta: schedule vs realized, three independent days",
    s5SubHtml:
      "Change in the sum of 21 categories reachable within 30 min, realized P50 minus static schedule, " +
      "population-weighted, only hexagons with a nonzero static baseline. Three independent runs: one " +
      "reference day, a 3-day September average (robustness), a 4-day August average (vacation).",
    s5CaptionHtml:
      "The uniform negative delta (98% of category×day cells negative in September) is robust across 3 " +
      "independent days — not the noise of a single measurement.",
    legRef: "reference day (2026-09-10)", legAvg3: "3-day average (September)", legVacation: "4-day average (vacation)",

    s6Heading: "6. Is it Łódź, or back-to-school? Vacation vs September",
    s6SubHtml:
      'The same method applied to 4 August days (vacation) instead of 3 September days (school term) — ' +
      '<a href="../lodzkie-dostepnosc/">map layer</a>. Two different static baselines (08-13/14 and 08-17/18 ' +
      "run a different active <code>service_id</code>, confirmed independently), each day computed separately.",
    s6CaptionHtml:
      "The August effect is ~8.4× weaker and far less uniform than September's (73% of category×day cells " +
      "negative vs 98%; one day, 08-13, came out net positive). Independently confirmed by raw GTFS-RT delay " +
      "data below — same direction, same order of magnitude.",
    s6Caption2Html:
      "An independent, non-routing measure (raw per-trip GTFS-RT delays) agrees in direction and magnitude " +
      "with the R5 result: <b>the effect is mostly a return-to-school/work phenomenon, not a fixed trait of " +
      "the Łódź network</b>. Caveat: the RT data row count is ~2× smaller in September than August despite a " +
      "similar number of active trips — a possible difference in GTFS-RT sampling density between the two " +
      "windows, not purely a real on-road effect.",
    thDate: "Day", thPctChanged: "% trips changed", thMeanDelay: "mean delay (s)",

    s7Heading: "Limitations — stated plainly",
    limits: [
      "One day, one window (7:00–9:00), one morning peak — we do not average across times of day or weekdays beyond the stated robustness variants.",
      "RT (realized schedule) exists only for Łódź (ZDiT) — the rest of the voivodeship has static GTFS only; the voivodeship “delta” is 30→60 min growth, not static-vs-realized.",
      "ŁKA (the regional rail operator) is static on both sides of the Łódź delta — the realized rail schedule was not included in the comparison (a single-day rail P50 was judged too thin, see HANDOFF.md §6.4).",
      "POI completeness is bounded by OpenStreetMap completeness in a given commune — the map measures accessibility to what is mapped, not to ground truth.",
      "The voivodeship (10) and Łódź (21) category sets differ — do not compare sums across the two layers directly.",
      "A known, filed Easy-R5 plugin bug (issue #3): the default “no service that day” gate false-positives on dates outside a 90-day window from the earliest feed; worked around with an explicit ALLOW_NO_SERVICE parameter, after validate_gtfs.py independently confirmed real, nonzero service.",
    ],

    s8Heading: "Method and sources",
    s8SubHtml:
      'Full interactive map: <a href="../lodzkie-dostepnosc/">Accessibility in Łódzkie</a>. Engine: ' +
      '<a href="https://gisboost.github.io/easy-R5/" target="_blank" rel="noopener">Easy-R5</a> (Conveyal R5) ' +
      "in QGIS. Code, input data, full method and decision history: " +
      '<a href="https://github.com/GISBoost/easy-R5/tree/main/tools/lodzkie_na_mapach_2026" target="_blank" rel="noopener">easy-R5 · tools/lodzkie_na_mapach_2026</a> ' +
      "(<code>HANDOFF.md</code>, <code>MULTIDAY_LODZ_NOTES.md</code>).",
    sourceNoteHtml:
      "Data: road network, buildings and boundaries from OpenStreetMap; static and realized P50 schedules " +
      "from operator GTFS (GTFS-RT recordings, reconstructed via easy-GTFS-RT for Łódź); population from the " +
      "2021 National Census (GUS), census precincts; administrative boundaries from PRG (dane.gov.pl). " +
      "Prepared for the “Łódzkie na mapach 2026” competition.",
    footerBack: "← all analyses",
  },
};

function t(key) {
  const d = STR[getLang()];
  return Object.prototype.hasOwnProperty.call(d, key) ? d[key] : key;
}

function applyStaticI18n() {
  document.documentElement.lang = getLang();
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel)); });
  const btn = document.getElementById("langToggleBtn");
  if (btn) btn.textContent = getLang() === "pl" ? "EN" : "PL";
}

function renderCharts() {
  const lang = getLang();
  const catLabel = CAT_LABEL[lang];

  barChartDiverging(
    "levelChart",
    CAT_ORDER.map((c) => ({ label: catLabel[c], value: LEVEL[c] })),
    { decimals: 1, labelWidth: 130 }
  );

  barChartDiverging(
    "growthChart",
    CAT_ORDER.map((c) => ({ label: catLabel[c], value: GROWTH_RATIO[c] })),
    { decimals: 2, unit: "×", labelWidth: 130 }
  );

  barChartDiverging(
    "deltaLodzChart",
    DELTA_LODZ_VARIANTS.map((r) => ({
      label: t(r.key === "ref" ? "legRef" : r.key === "avg3" ? "legAvg3" : "legVacation"),
      value: r.value,
    })),
    { decimals: 2, labelWidth: 190 }
  );

  barChartDiverging(
    "vacationChart",
    VACATION_DAYS.map((r) => ({
      label: r.date || (lang === "pl" ? "średnia 4 dni" : "4-day average"),
      value: r.value,
    })),
    { decimals: 2, labelWidth: 130 }
  );

  renderDataTable(
    "borderlineTable",
    [t("thCat"), t("thCoverage"), t("thDecision")],
    BORDERLINE_ROWS.map((r) => [BORDERLINE_LABEL[lang][r.key], r.n + "/24", t("decisionLodzOnly")])
  );

  renderDataTable(
    "feedsTable",
    [t("thFeed"), t("thScope"), t("thRt")],
    FEED_ROWS.map((r) => [FEED_LABEL[lang][r.key], "", r.rt ? t("rtYes") : t("rtNo")])
  );

  renderDataTable(
    "rtDelayTable",
    [t("thDate"), t("thPctChanged"), t("thMeanDelay")],
    RT_DELAY_ROWS.map((r) => [r.date, r.pct.toFixed(2) + "%", r.mean.toFixed(2)])
  );

  const list = document.getElementById("limitsList");
  if (list) list.innerHTML = t("limits").map((li) => `<li>${li}</li>`).join("");
}

function renderAll() {
  applyStaticI18n();
  renderCharts();
}

document.addEventListener("DOMContentLoaded", () => {
  renderAll();
  const btn = document.getElementById("langToggleBtn");
  if (btn) btn.addEventListener("click", () => { localStorage.setItem(LANG_KEY, getLang() === "pl" ? "en" : "pl"); renderAll(); });
});
