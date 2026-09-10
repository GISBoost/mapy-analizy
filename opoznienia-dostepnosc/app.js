// Ile kosztuja opoznienia? -- 6 cities. Vanilla JS + Leaflet, no build step
// (mirrors uczelnie-dostepnosc / gtfs-dashboard).
//
// Three independent switches: CITY (top select, reloads data + refits the map),
// RESOLUTION (top tabs, reloads a GeoJSON file -- per-city, Warszawa has 500 m
// only) and CATEGORY (left panel, just restyles the already-loaded data).
//
// Classification mirrors tools/realtime_delay_lodz/style_delay_layers.py
// EXACTLY: same half-integer class edges, same ColorBrewer RdBu-7 colours.
// A hexagon with no static-schedule baseline for a category (delta_<category>
// / net_delta = null) is filtered out of the layer entirely -- same as QGIS's
// graduated renderer drawing no symbol for an unmatched (null) value.
//
// Two reference overlays sit above the choropleth (fill:false): the city
// boundary (per city+resolution -- the 250 m and 500 m hex grids dissolve to
// different staircases) and "siatka", the full hex grid outline per
// city+resolution -- it includes the hexagons the data layer
// filters out as null, so the grid stays visible even where there is nothing
// to colour.
(function () {
  "use strict";

  const CATEGORIES = ["school", "pharmacy", "university", "mall"];
  const MODES = [...CATEGORIES, "net"];

  const RDBU7 = ["#b2182b", "#d6604d", "#f4a582", "#f7f7f7", "#92c5de", "#4393c3", "#2166ac"];
  const CATEGORY_EDGES = [-Infinity, -3.5, -1.5, -0.5, 0.5, 1.5, 3.5, Infinity];
  const NET_EDGES = [-Infinity, -5.5, -1.5, -0.5, 0.5, 1.5, 5.5, Infinity];
  const CATEGORY_LEGEND_KEYS = [
    "legendClassLe4", "legendClassM3M2", "legendClassM1", "legendClass0",
    "legendClassP1", "legendClassP2P3", "legendClassGe4",
  ];
  const NET_LEGEND_KEYS = [
    "legendClassLe6", "legendClassM5M2", "legendClassM1", "legendClass0",
    "legendClassP1", "legendClassP2P5", "legendClassGe6",
  ];

  const MODE_META = {
    school: { titleKey: "catSchoolTitle", subKey: "catSchoolSub" },
    pharmacy: { titleKey: "catPharmacyTitle", subKey: "catPharmacySub" },
    university: { titleKey: "catUniversityTitle", subKey: "catUniversitySub" },
    mall: { titleKey: "catMallTitle", subKey: "catMallSub" },
    net: { titleKey: "catNetTitle", subKey: "catNetSub" },
  };

  const cityselectEl = document.getElementById("cityselect");
  const restabsEl = document.getElementById("restabs");
  const modeswitchEl = document.getElementById("modeswitch");
  const legendEl = document.getElementById("legend");
  const statlineEl = document.getElementById("statline");
  const opacityInput = document.getElementById("opacity");
  const opacityVal = document.getElementById("opacity-val");
  const tooltipsToggle = document.getElementById("tooltipsToggle");
  const loadingEl = document.getElementById("maploading");

  const map = L.map("map", { zoomControl: true, minZoom: 3 });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  let manifest = null;
  let cityByKey = {};
  let currentCity = null;
  let currentRes = null;
  let currentMode = "net";
  let opacity = parseFloat(opacityInput.value);
  let tooltipsEnabled = tooltipsToggle.checked;
  let currentLayer = null;
  let boundaryLayer = null;
  let siatkaLayer = null;

  const cache = {};        // "<city>_<res>" -> parsed hex geojson
  const siatkaCache = {};  // "<city>_<res>" -> parsed siatka geojson
  const boundaryCache = {}; // "<city>_<res>" -> parsed boundary geojson

  function key() { return currentCity + "_" + currentRes; }
  function fieldFor(mode) { return mode === "net" ? "net_delta" : "delta_" + mode; }
  function edgesFor(mode) { return mode === "net" ? NET_EDGES : CATEGORY_EDGES; }
  function legendKeysFor(mode) { return mode === "net" ? NET_LEGEND_KEYS : CATEGORY_LEGEND_KEYS; }

  function classify(value, edges) {
    for (let i = 0; i < edges.length - 1; i++) {
      if (value <= edges[i + 1]) return i;
    }
    return edges.length - 2;
  }

  function signed(v) {
    const r = Math.round(v);
    return (r > 0 ? "+" : "") + r;
  }

  function tooltipHtml(p, mode) {
    let rows;
    if (mode === "net") {
      const breakdown = CATEGORIES.map((cat) => {
        const v = p["delta_" + cat];
        const label = t(MODE_META[cat].titleKey);
        return '<div class="tt-row"><span>' + label + "</span><b>" +
          (v === null || v === undefined ? t("tooltipNoBase") : signed(v)) + "</b></div>";
      }).join("");
      rows =
        '<div class="tt-row"><span>' + t("tooltipNetDelta") + "</span><b>" + signed(p.net_delta) + "</b></div>" +
        '<div class="tt-row"><span>' + t("tooltipNetN") + "</span><b>" + p.net_delta_n + "/4</b></div>" +
        '<div class="tt-sep">' + t("tooltipBreakdown") + "</div>" + breakdown;
    } else {
      rows =
        '<div class="tt-row"><span>' + t("tooltipBase") + "</span><b>" + Math.round(p["base_" + mode]) + "</b></div>" +
        '<div class="tt-row"><span>' + t("tooltipDelta") + "</span><b>" + signed(p["delta_" + mode]) + "</b></div>";
    }
    return (
      '<div class="tt-title">' + t("tooltipHexTitle", { id: p.hex_id }) + "</div>" +
      '<div class="tt-row"><span>' + t("tooltipPop") + "</span><b>" + Math.round(p.pop_total) + "</b></div>" +
      rows
    );
  }

  function buildLayerForMode(mode) {
    const data = cache[key()];
    const field = fieldFor(mode);
    const edges = edgesFor(mode);
    return L.geoJSON(data, {
      filter: (f) => f.properties[field] !== null && f.properties[field] !== undefined,
      style: (f) => ({
        color: "#808080", weight: 0.4, opacity: 0.5,
        fillColor: RDBU7[classify(f.properties[field], edges)], fillOpacity: opacity,
      }),
      onEachFeature: (f, l) => {
        if (tooltipsEnabled) l.bindTooltip(tooltipHtml(f.properties, mode), { sticky: true });
      },
    });
  }

  function renderLegend(mode) {
    legendEl.innerHTML = "";
    legendKeysFor(mode).forEach((k, i) => {
      const div = document.createElement("div");
      div.className = "legend-row";
      div.innerHTML = '<span class="swatch" style="background:' + RDBU7[i] + '"></span>' + t(k);
      legendEl.appendChild(div);
    });
  }

  function updateStat(mode) {
    const field = fieldFor(mode);
    const feats = cache[key()].features;
    let weightedSum = 0, weightSum = 0, n = 0;
    feats.forEach((f) => {
      const v = f.properties[field];
      if (v === null || v === undefined) return;
      weightedSum += (f.properties.pop_total || 0) * v;
      weightSum += f.properties.pop_total || 0;
      n += 1;
    });
    const mean = weightSum ? weightedSum / weightSum : 0;
    const unit = mode === "net" ? t("statLineUnitNet") : t("statLineUnitCategory");
    statlineEl.innerHTML = t("statLineHtml", {
      n: n,
      total: feats.length,
      mean: mean.toFixed(3) + " " + unit,
    });
  }

  function render(mode) {
    currentMode = mode;
    renderLegend(mode);
    if (currentLayer) map.removeLayer(currentLayer);
    currentLayer = buildLayerForMode(mode);
    currentLayer.addTo(map);
    if (siatkaLayer) siatkaLayer.bringToFront();
    if (boundaryLayer) boundaryLayer.bringToFront();
    updateStat(mode);
  }

  function applyOpacity() {
    if (currentLayer) currentLayer.setStyle({ fillOpacity: opacity });
  }

  async function fetchJSON(path) {
    return fetch(path).then((r) => r.json());
  }

  async function fetchResolution() {
    const k = key();
    if (!cache[k]) cache[k] = await fetchJSON("data/hex_" + k + ".geojson");
    return cache[k];
  }

  async function fetchSiatka() {
    const k = key();
    if (!siatkaCache[k]) siatkaCache[k] = await fetchJSON("data/siatka_" + k + ".geojson");
    return siatkaCache[k];
  }

  async function fetchBoundary() {
    const k = key();
    if (!boundaryCache[k]) boundaryCache[k] = await fetchJSON("data/boundary_" + k + ".geojson");
    return boundaryCache[k];
  }

  async function loadResolution(res) {
    currentRes = res;
    loadingEl.classList.add("visible");
    const [, siatkaData, boundaryData] = await Promise.all([fetchResolution(), fetchSiatka(), fetchBoundary()]);
    loadingEl.classList.remove("visible");

    if (siatkaLayer) map.removeLayer(siatkaLayer);
    siatkaLayer = L.geoJSON(siatkaData, {
      style: () => ({ color: "#808080", weight: 0.5, opacity: 0.45, fill: false }),
      interactive: false,
    }).addTo(map);

    if (boundaryLayer) map.removeLayer(boundaryLayer);
    boundaryLayer = L.geoJSON(boundaryData, {
      style: () => ({ color: "#232323", weight: 2, opacity: 0.9, fill: false }),
      interactive: false,
    }).addTo(map);

    render(currentMode);
  }

  async function loadCity(cityKey, fit) {
    currentCity = cityKey;
    const city = cityByKey[cityKey];

    if (fit) map.fitBounds(city.bounds, { padding: [20, 20] });

    currentRes = city.resolutions[0].key;
    buildRestabs(city);
    await loadResolution(currentRes);
  }

  function buildCitySelect() {
    cityselectEl.innerHTML = "";
    manifest.cities.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = c.label;
      if (c.key === currentCity) opt.selected = true;
      cityselectEl.appendChild(opt);
    });
    cityselectEl.addEventListener("change", () => loadCity(cityselectEl.value, true));
  }

  function buildRestabs(city) {
    restabsEl.innerHTML = "";
    city.resolutions.forEach((r) => {
      const btn = document.createElement("button");
      btn.textContent = r.label;
      btn.dataset.res = r.key;
      if (r.key === currentRes) btn.classList.add("active");
      btn.addEventListener("click", () => {
        restabsEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        loadResolution(r.key);
      });
      restabsEl.appendChild(btn);
    });
  }

  function buildModeswitch() {
    modeswitchEl.innerHTML = "";
    MODES.forEach((mode) => {
      const meta = MODE_META[mode];
      const btn = document.createElement("button");
      btn.dataset.mode = mode;
      if (mode === currentMode) btn.classList.add("active");
      btn.innerHTML =
        '<span data-i18n="' + meta.titleKey + '">' + t(meta.titleKey) + "</span>" +
        '<span class="sub" data-i18n="' + meta.subKey + '">' + t(meta.subKey) + "</span>";
      btn.addEventListener("click", () => {
        modeswitchEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        render(mode);
      });
      modeswitchEl.appendChild(btn);
    });
  }

  opacityInput.addEventListener("input", () => {
    opacity = parseFloat(opacityInput.value);
    opacityVal.textContent = Math.round(opacity * 100) + "%";
    applyOpacity();
  });
  opacityVal.textContent = Math.round(opacity * 100) + "%";

  tooltipsToggle.addEventListener("change", () => {
    tooltipsEnabled = tooltipsToggle.checked;
    if (currentRes) render(currentMode);
  });

  setLangChangeHandler(() => {
    buildModeswitch();
    if (currentRes) render(currentMode);
  });

  fetchJSON("data/manifest.json").then((m) => {
    manifest = m;
    m.cities.forEach((c) => { cityByKey[c.key] = c; });
    currentCity = m.cities[0].key;
    buildCitySelect();
    buildModeswitch();
    loadCity(currentCity, true);
  });
})();
