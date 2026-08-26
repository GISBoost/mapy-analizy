// Dojazd na uczelnię -- 6 miast. Vanilla JS + Leaflet, no build step (mirrors gtfs-dashboard).
(function () {
  "use strict";

  const ROLE_VAR = { politechnika: "pl", uniwersytet: "ul", medyczny: "um" };
  const ROLES = ["politechnika", "uniwersytet", "medyczny"];

  const citytabsEl = document.getElementById("citytabs");
  const legendEl = document.getElementById("legend");
  const statlineEl = document.getElementById("statline");
  const toggleListEl = document.getElementById("togglelist");
  const overlapControlsEl = document.getElementById("overlap-controls");
  const opacityInput = document.getElementById("opacity");
  const opacityVal = document.getElementById("opacity-val");
  const loadingEl = document.getElementById("maploading");

  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const map = L.map("map", { zoomControl: true, minZoom: 3 });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  let manifest = null;
  let currentCity = null;
  let currentMode = "dominant";
  let activeUnis = { politechnika: true, uniwersytet: true, medyczny: true };
  let opacity = parseFloat(opacityInput.value);

  const cache = {}; // city -> { hex, buildings }
  const layers = {}; // per-city-load: dom, count, role.{x}, buildings -- rebuilt on every city switch

  function uniCount(p) {
    return (p.politechnika_30min > 0 ? 1 : 0) + (p.uniwersytet_30min > 0 ? 1 : 0) + (p.medyczny_30min > 0 ? 1 : 0);
  }
  function colorDominant(p) {
    if (p.dominant_role === "none" || !ROLE_VAR[p.dominant_role]) return cssVar("--none");
    return cssVar("--" + ROLE_VAR[p.dominant_role]);
  }
  function colorCount(p) {
    return [null, cssVar("--seq-1"), cssVar("--seq-2"), cssVar("--seq-3")][uniCount(p)] || cssVar("--seq-1");
  }

  function hexTooltip(p, names) {
    return (
      '<div class="tt-title">' + t("tooltipHexTitle", { id: p.hex_id }) + "</div>" +
      '<div class="tt-row"><span>' + t("tooltipStudents") + "</span><b>" + Math.round(p.pop_20_29) + "</b></div>" +
      '<div class="tt-row"><span>' + names.politechnika + "</span><b>" + p.politechnika_30min + "</b></div>" +
      '<div class="tt-row"><span>' + names.uniwersytet + "</span><b>" + p.uniwersytet_30min + "</b></div>" +
      '<div class="tt-row"><span>' + names.medyczny + "</span><b>" + p.medyczny_30min + "</b></div>" +
      '<div class="tt-row"><span>' + t("tooltipDominant") + "</span><b>" + p.dominant_label + "</b></div>"
    );
  }

  function buildLayersForCity(city) {
    const d = cache[city];
    const names = manifest.cities[city].names;

    const domLayer = L.geoJSON(d.hex, {
      style: (f) => ({ color: "transparent", weight: 0, fillColor: colorDominant(f.properties), fillOpacity: opacity }),
      onEachFeature: (f, l) => l.bindTooltip(hexTooltip(f.properties, names), { sticky: true }),
    });
    const countLayer = L.geoJSON(d.hex, {
      style: (f) => ({ color: "transparent", weight: 0, fillColor: colorCount(f.properties), fillOpacity: opacity }),
      onEachFeature: (f, l) => l.bindTooltip(hexTooltip(f.properties, names), { sticky: true }),
    });
    const roleLayers = {};
    ROLES.forEach((role) => {
      roleLayers[role] = L.geoJSON(d.hex, {
        filter: (f) => f.properties[role + "_30min"] > 0,
        style: () => ({ color: "transparent", weight: 0, fillColor: cssVar("--" + ROLE_VAR[role]), fillOpacity: opacity }),
        onEachFeature: (f, l) => l.bindTooltip(hexTooltip(f.properties, names), { sticky: true }),
      });
    });
    const buildingsLayer = L.geoJSON(d.buildings, {
      pointToLayer: (f, latlng) =>
        L.circleMarker(latlng, {
          radius: 4.5,
          fillColor: cssVar("--" + (ROLE_VAR[f.properties.role] || "none")),
          color: cssVar("--surface"),
          weight: 1.2,
          fillOpacity: 1,
        }),
      onEachFeature: (f, l) =>
        l.bindTooltip(
          '<div class="tt-title">' + f.properties.name + "</div>" + '<div class="tt-row">' + f.properties.university + "</div>",
          { sticky: true }
        ),
    });

    return { dom: domLayer, count: countLayer, role: roleLayers, buildings: buildingsLayer };
  }

  function clearMapLayers() {
    Object.keys(layers).forEach((k) => delete layers[k]);
    map.eachLayer((l) => {
      if (l instanceof L.TileLayer) return;
      map.removeLayer(l);
    });
  }

  function applyOpacity() {
    if (!layers.dom) return;
    if (currentMode === "dominant") layers.dom.setStyle({ fillOpacity: opacity });
    else if (currentMode === "count") layers.count.setStyle({ fillOpacity: opacity });
    else ROLES.forEach((r) => layers.role[r].setStyle({ fillOpacity: opacity }));
  }

  function renderLegend(mode) {
    const names = manifest.cities[currentCity].names;
    const LEGENDS = {
      dominant: [
        { color: "var(--pl)", label: names.politechnika },
        { color: "var(--ul)", label: names.uniwersytet },
        { color: "var(--um)", label: names.medyczny },
        { color: "var(--none)", label: t("legendNoAccess") },
      ],
      count: [
        { color: "var(--seq-1)", label: t("legendCount1") },
        { color: "var(--seq-2)", label: t("legendCount2") },
        { color: "var(--seq-3)", label: t("legendCount3") },
      ],
      overlap: [
        { color: "var(--pl)", label: names.politechnika },
        { color: "var(--ul)", label: names.uniwersytet },
        { color: "var(--um)", label: names.medyczny },
        { color: "var(--ink-muted)", label: t("legendOverlapMix") },
      ],
    };
    legendEl.innerHTML = "";
    LEGENDS[mode].forEach((row) => {
      const div = document.createElement("div");
      div.className = "legend-row";
      div.innerHTML = '<span class="swatch" style="background:' + row.color + '"></span>' + row.label;
      legendEl.appendChild(div);
    });
  }

  function renderToggles() {
    const names = manifest.cities[currentCity].names;
    toggleListEl.innerHTML = "";
    ROLES.forEach((role) => {
      const label = document.createElement("label");
      label.className = "toggle";
      label.innerHTML =
        '<input type="checkbox" data-uni="' + role + '"' + (activeUnis[role] ? " checked" : "") + '>' +
        '<span class="swatch" style="background:var(--' + ROLE_VAR[role] + ')"></span>' + names[role];
      toggleListEl.appendChild(label);
    });
    toggleListEl.querySelectorAll("input").forEach((cb) => {
      cb.addEventListener("change", () => {
        activeUnis[cb.dataset.uni] = cb.checked;
        showOverlap();
      });
    });
  }

  function showOverlap() {
    ROLES.forEach((role) => {
      if (activeUnis[role]) {
        if (!map.hasLayer(layers.role[role])) layers.role[role].addTo(map);
      } else if (map.hasLayer(layers.role[role])) {
        map.removeLayer(layers.role[role]);
      }
    });
  }

  function updateStat() {
    const feats = cache[currentCity].hex.features;
    const withThree = feats.filter((f) => uniCount(f.properties) === 3).length;
    const totalPop = feats.reduce((s, f) => s + (f.properties.pop_20_29 || 0), 0);
    statlineEl.innerHTML = t("statLineHtml", {
      n: feats.length,
      withThree: withThree,
      pop: Math.round(totalPop).toLocaleString(dtLocale()),
    });
  }

  function render(mode) {
    currentMode = mode;
    renderLegend(mode);
    overlapControlsEl.style.display = mode === "overlap" ? "block" : "none";

    [layers.dom, layers.count, ...ROLES.map((r) => layers.role[r])].forEach((l) => {
      if (map.hasLayer(l)) map.removeLayer(l);
    });

    if (mode === "dominant") layers.dom.addTo(map);
    else if (mode === "count") layers.count.addTo(map);
    else showOverlap();

    if (!map.hasLayer(layers.buildings)) layers.buildings.addTo(map);
    else layers.buildings.bringToFront();

    applyOpacity();
    updateStat();
  }

  async function fetchCity(city) {
    if (cache[city]) return cache[city];
    const [hex, buildings] = await Promise.all([
      fetch("data/" + city + "_hex.geojson").then((r) => r.json()),
      fetch("data/" + city + "_buildings.geojson").then((r) => r.json()),
    ]);
    cache[city] = { hex, buildings };
    return cache[city];
  }

  async function loadCity(city) {
    currentCity = city;
    loadingEl.classList.add("visible");
    await fetchCity(city);
    loadingEl.classList.remove("visible");

    clearMapLayers();
    Object.assign(layers, buildLayersForCity(city));

    const b = manifest.cities[city].bounds;
    map.fitBounds(b, { padding: [20, 20] });

    renderToggles();
    render(currentMode);
  }

  function buildTabs() {
    citytabsEl.innerHTML = "";
    manifest.order.forEach((slug) => {
      const btn = document.createElement("button");
      btn.textContent = manifest.cities[slug].label;
      btn.dataset.city = slug;
      if (slug === currentCity) btn.classList.add("active");
      btn.addEventListener("click", () => {
        citytabsEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        loadCity(slug);
      });
      citytabsEl.appendChild(btn);
    });
  }

  document.querySelectorAll("#modeswitch button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#modeswitch button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      render(btn.dataset.mode);
    });
  });

  opacityInput.addEventListener("input", () => {
    opacity = parseFloat(opacityInput.value);
    opacityVal.textContent = Math.round(opacity * 100) + "%";
    applyOpacity();
  });
  opacityVal.textContent = Math.round(opacity * 100) + "%";

  // Rebuild everything language-dependent: legend, tooltips (baked in at
  // layer-build time), stat line. loadCity() re-fetches from its own cache,
  // so this is cheap after the first load.
  setLangChangeHandler(() => {
    if (currentCity) loadCity(currentCity);
  });

  fetch("data/manifest.json")
    .then((r) => r.json())
    .then((m) => {
      manifest = m;
      currentCity = manifest.order[0];
      buildTabs();
      loadCity(currentCity);
    });
})();
