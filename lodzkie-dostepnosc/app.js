// Dostepnosc w Lodzkiem -- vanilla JS + Leaflet, no build step (mirrors
// opoznienia-dostepnosc / uczelnie-dostepnosc).
//
// Two independent switches: REGION (top select -- wojewodztwo / Lodz, reloads
// data + refits the map) and LAYER (left panel -- what to show for that
// region; each layer has its own field and its own classification "kind").
// Unlike opoznienia-dostepnosc there is no resolution dimension (each region
// has exactly one hex size) and no shared classification across layers --
// "level" (sequential, zero excluded), "growth" (sequential, always >=0),
// "delta" (RdBu-7 diverging, zero isolated, null = no baseline to compare),
// and "rt" (3-class categorical coverage mask) each render differently.
//
// Classification mirrors tools/lodzkie_na_mapach_2026/style_layers.py
// EXACTLY: sequential_level_renderer breaks/min_value for "level",
// classified_delta_renderer's delta_edges_labels(scale=3) for "delta" (the
// Lodz total field sums 21 categories, same as the QGIS project). "growth"
// breaks were picked from the measured field distribution (growth_total:
// p50=2, p90=29, p99=1313, max=3040 across the 16864 voivodeship hexagons)
// since no QGIS renderer call fixed specific breaks for it.
//
// No RT coverage mask here (Michal, 2026-09-15): at hex resolution it
// doesn't read as anything meaningful on a web map -- would only make sense
// aggregated to gmina/powiat. Still exists in the source GPKG / QGIS print
// layouts, where the "flag missing RT data, never silently zero"
// requirement is served by the printed map instead.
(function () {
  "use strict";

  const RDBU7 = ["#b2182b", "#d6604d", "#f4a582", "#f7f7f7", "#92c5de", "#4393c3", "#2166ac"];
  const DELTA_EDGES = [-Infinity, -10.5, -4.5, -0.5, 0.5, 4.5, 10.5, Infinity];
  const DELTA_LEGEND_KEYS = [
    "legendDeltaLe12", "legendDeltaM9M6", "legendDeltaM1",
    "legendDelta0", "legendDeltaP1", "legendDeltaP6P9", "legendDeltaGe12",
  ];

  const LEVEL_RAMP = ["#ffffcc", "#c7e9b4", "#7fcdbb", "#41b6c4", "#2c7fb8", "#253494"];
  const LEVEL_BREAKS = [5, 15, 30, 60, 120]; // matches style_layers.sequential_level_renderer's call

  const GROWTH_RAMP = ["#fff7bc", "#fec44f", "#fe9929", "#d95f0e", "#993404"];
  const GROWTH_BREAKS = [5, 20, 60, 200]; // picked from the measured distribution, see header comment

  const REGIONS = {
    woj: {
      boundary: "boundary_woj.geojson",
      siatka: "siatka_woj.geojson",
      modes: [
        { key: "level", file: "level_woj.geojson", field: "level_total_c30", kind: "level" },
        { key: "growth", file: "growth_woj.geojson", field: "growth_total", kind: "growth" },
      ],
    },
    lodz: {
      boundary: "boundary_lodz.geojson",
      siatka: "siatka_lodz.geojson",
      modes: [
        { key: "delta_wrzesien", file: "delta_lodz_wrzesien.geojson", field: "delta_total_c30", kind: "delta" },
        { key: "delta_3dni", file: "delta_lodz_3dni.geojson", field: "avg_delta_total_c30", kind: "delta" },
        { key: "delta_wakacje", file: "delta_lodz_wakacje.geojson", field: "avg_delta_total_c30", kind: "delta" },
      ],
    },
  };
  const REGION_ORDER = ["woj", "lodz"]; // wojewodztwo first -- the flagship, full-area layer

  const regionselectEl = document.getElementById("regionselect");
  const modeswitchEl = document.getElementById("modeswitch");
  const legendEl = document.getElementById("legend");
  const legendnoteEl = document.getElementById("legendnote");
  const statlineEl = document.getElementById("statline");
  const opacityInput = document.getElementById("opacity");
  const opacityVal = document.getElementById("opacity-val");
  const tooltipsToggle = document.getElementById("tooltipsToggle");
  const loadingEl = document.getElementById("maploading");

  const map = L.map("map", { zoomControl: true, minZoom: 6 });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  let currentRegion = null;
  let currentMode = null;
  let opacity = parseFloat(opacityInput.value);
  let tooltipsEnabled = tooltipsToggle.checked;
  let currentLayer = null;
  let boundaryLayer = null;
  let siatkaLayer = null;

  const cache = {}; // filename -> parsed geojson (data / siatka / boundary alike)

  function modeDef() { return REGIONS[currentRegion].modes.find((m) => m.key === currentMode); }

  function classifySeq(value, breaks) {
    for (let i = 0; i < breaks.length; i++) {
      if (value < breaks[i]) return i;
    }
    return breaks.length;
  }
  function classifyDiv(value, edges) {
    for (let i = 0; i < edges.length - 1; i++) {
      if (value <= edges[i + 1]) return i;
    }
    return edges.length - 2;
  }

  function signed(v) {
    const r = Math.round(v);
    return (r > 0 ? "+" : "") + r;
  }

  function styleFor(mode, props) {
    const v = props[mode.field];
    if (mode.kind === "level") {
      if (v === null || v === undefined || v < 0.5) return null; // no symbol, same as QGIS min_value=0.5
      return { fillColor: LEVEL_RAMP[classifySeq(v, LEVEL_BREAKS)] };
    }
    if (mode.kind === "growth") {
      if (v === null || v === undefined) return null;
      return { fillColor: GROWTH_RAMP[classifySeq(v, GROWTH_BREAKS)] };
    }
    if (mode.kind === "delta") {
      if (v === null || v === undefined) return null; // no baseline to compare -- see legendDelta0 note
      return { fillColor: RDBU7[classifyDiv(v, DELTA_EDGES)] };
    }
    return null;
  }

  function tooltipHtml(mode, p) {
    const rows = [];
    rows.push('<div class="tt-row"><span>' + t("tooltipHexId") + "</span><b>" + p.hex_id + "</b></div>");
    if (p.pop_total !== undefined) {
      rows.push('<div class="tt-row"><span>' + t("tooltipPop") + "</span><b>" + Math.round(p.pop_total) + "</b></div>");
    }
    if (mode.kind === "level") {
      rows.push('<div class="tt-row"><span>' + t("tooltipLevel") + "</span><b>" + Math.round(p[mode.field]) + "</b></div>");
    } else if (mode.kind === "growth") {
      rows.push('<div class="tt-row"><span>' + t("tooltipLevel30") + "</span><b>" + Math.round(p.level_total_c30) + "</b></div>");
      rows.push('<div class="tt-row"><span>' + t("tooltipLevel60") + "</span><b>" + Math.round(p.level_total_c60) + "</b></div>");
      rows.push('<div class="tt-row"><span>' + t("tooltipGrowth") + "</span><b>+" + Math.round(p.growth_total) + "</b></div>");
      rows.push('<div class="tt-row"><span>' + t("tooltipRatio") + "</span><b>" +
        (p.ratio_total === null || p.ratio_total === undefined ? t("tooltipNoBase") : p.ratio_total.toFixed(1) + "x") + "</b></div>");
    } else if (mode.kind === "delta") {
      const v = p[mode.field];
      rows.push('<div class="tt-row"><span>' + t("tooltipDelta") + "</span><b>" +
        (v === null || v === undefined ? t("tooltipNoBase") : signed(v)) + "</b></div>");
    }
    return '<div class="tt-title">' + t("tooltipHexTitle") + "</div>" + rows.join("");
  }

  function buildLayer(mode, data) {
    return L.geoJSON(data, {
      filter: (f) => styleFor(mode, f.properties) !== null,
      style: (f) => Object.assign(
        { color: "#808080", weight: 0.4, opacity: 0.5, fillOpacity: opacity },
        styleFor(mode, f.properties),
      ),
      onEachFeature: (f, l) => {
        if (tooltipsEnabled) l.bindTooltip(tooltipHtml(mode, f.properties), { sticky: true });
      },
    });
  }

  function renderLevelLegend(breaks, ramp) {
    for (let i = 0; i <= breaks.length; i++) {
      const lo = i === 0 ? 1 : breaks[i - 1];
      const hi = i < breaks.length ? breaks[i] : null;
      const label = hi === null ? t("legendGe", { n: lo }) : lo + "–" + hi;
      addLegendRow(ramp[i], label);
    }
  }
  function renderGrowthLegend(breaks, ramp) {
    for (let i = 0; i <= breaks.length; i++) {
      const lo = i === 0 ? 0 : breaks[i - 1];
      const hi = i < breaks.length ? breaks[i] : null;
      const label = hi === null ? t("legendGe", { n: lo }) : lo + "–" + hi;
      addLegendRow(ramp[i], label);
    }
  }
  function addLegendRow(color, label) {
    const div = document.createElement("div");
    div.className = "legend-row";
    div.innerHTML = '<span class="swatch" style="background:' + color + '"></span>' + label;
    legendEl.appendChild(div);
  }

  function renderLegend(mode) {
    legendEl.innerHTML = "";
    if (mode.kind === "level") {
      renderLevelLegend(LEVEL_BREAKS, LEVEL_RAMP);
      legendnoteEl.textContent = t("legendNoteLevel");
    } else if (mode.kind === "growth") {
      renderGrowthLegend(GROWTH_BREAKS, GROWTH_RAMP);
      legendnoteEl.textContent = t("legendNoteGrowth");
    } else if (mode.kind === "delta") {
      DELTA_LEGEND_KEYS.forEach((k, i) => addLegendRow(RDBU7[i], t(k)));
      legendnoteEl.textContent = t("legendNoteDelta");
    }
  }

  function updateStat(mode, data) {
    const feats = data.features;
    let weightedSum = 0, weightSum = 0, n = 0;
    feats.forEach((f) => {
      const v = f.properties[mode.field];
      if (v === null || v === undefined) return;
      if (mode.kind === "level" && v < 0.5) return;
      const pop = f.properties.pop_total || 0;
      weightedSum += pop * v;
      weightSum += pop;
      n += 1;
    });
    const mean = weightSum ? weightedSum / weightSum : 0;
    statlineEl.innerHTML = t("statLineHtml", { n: n, total: feats.length, mean: mean.toFixed(2) });
  }

  function applyOpacity() {
    if (currentLayer) currentLayer.setStyle((f) => Object.assign(
      { color: "#808080", weight: 0.4, opacity: 0.5, fillOpacity: opacity },
      styleFor(modeDef(), f.properties),
    ));
  }

  async function fetchJSON(path) {
    if (!cache[path]) cache[path] = await fetch("data/" + path).then((r) => r.json());
    return cache[path];
  }

  async function render(mode) {
    currentMode = mode.key;
    renderLegend(mode);
    loadingEl.classList.add("visible");
    const data = await fetchJSON(mode.file);
    loadingEl.classList.remove("visible");
    if (currentLayer) map.removeLayer(currentLayer);
    currentLayer = buildLayer(mode, data);
    currentLayer.addTo(map);
    if (siatkaLayer) siatkaLayer.bringToFront();
    if (boundaryLayer) boundaryLayer.bringToFront();
    updateStat(mode, data);
  }

  function buildModeswitch(region) {
    modeswitchEl.innerHTML = "";
    region.modes.forEach((mode) => {
      const btn = document.createElement("button");
      btn.dataset.mode = mode.key;
      if (mode.key === currentMode) btn.classList.add("active");
      btn.innerHTML =
        '<span data-i18n="' + mode.key + 'Title">' + t(mode.key + "Title") + "</span>" +
        '<span class="sub" data-i18n="' + mode.key + 'Sub">' + t(mode.key + "Sub") + "</span>";
      btn.addEventListener("click", () => {
        modeswitchEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        render(mode);
      });
      modeswitchEl.appendChild(btn);
    });
  }

  async function loadRegion(regionKey, fit) {
    currentRegion = regionKey;
    const region = REGIONS[regionKey];

    loadingEl.classList.add("visible");
    const [siatkaData, boundaryData] = await Promise.all([
      fetchJSON(region.siatka), fetchJSON(region.boundary),
    ]);
    loadingEl.classList.remove("visible");

    if (siatkaLayer) map.removeLayer(siatkaLayer);
    siatkaLayer = L.geoJSON(siatkaData, {
      style: () => ({ color: "#808080", weight: 0.4, opacity: 0.4, fill: false }),
      interactive: false,
    }).addTo(map);

    if (boundaryLayer) map.removeLayer(boundaryLayer);
    boundaryLayer = L.geoJSON(boundaryData, {
      style: () => ({ color: "#232323", weight: 2, opacity: 0.9, fill: false }),
      interactive: false,
    }).addTo(map);

    if (fit) map.fitBounds(boundaryLayer.getBounds(), { padding: [20, 20] });

    // currentMode must already point at the new region's first mode before
    // buildModeswitch() runs, or it still holds the previous region's mode
    // key and no button gets the .active class -- render() below sets it
    // again, harmlessly.
    currentMode = region.modes[0].key;
    buildModeswitch(region);
    await render(region.modes[0]);
  }

  function buildRegionSelect() {
    regionselectEl.innerHTML = "";
    REGION_ORDER.forEach((key) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = t(key + "RegionLabel");
      if (key === currentRegion) opt.selected = true;
      regionselectEl.appendChild(opt);
    });
  }
  // Bound once, not inside buildRegionSelect(): that function reruns on every
  // language toggle (rebuilds <option> labels), but innerHTML="" only clears
  // children -- a listener attached to the <select> itself would stack up.
  regionselectEl.addEventListener("change", () => loadRegion(regionselectEl.value, true));

  opacityInput.addEventListener("input", () => {
    opacity = parseFloat(opacityInput.value);
    opacityVal.textContent = Math.round(opacity * 100) + "%";
    applyOpacity();
  });
  opacityVal.textContent = Math.round(opacity * 100) + "%";

  tooltipsToggle.addEventListener("change", () => {
    tooltipsEnabled = tooltipsToggle.checked;
    if (currentMode) render(modeDef());
  });

  setLangChangeHandler(() => {
    buildRegionSelect();
    if (currentRegion) buildModeswitch(REGIONS[currentRegion]);
    if (currentMode) render(modeDef());
  });

  currentRegion = REGION_ORDER[0];
  buildRegionSelect();
  loadRegion(currentRegion, true);
})();
