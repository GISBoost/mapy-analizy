// Jak dlugo czekac na przystanku -- 4 miasta. Vanilla JS + Leaflet, no build step (mirrors uczelnie-dostepnosc).
(function () {
  "use strict";

  // Same 5 classes/colours/labels as tools/transit_charts/styles/stop_headway_hex.qml (I37).
  const CLASSES = [
    { max: 6, css: "--hw-1", label: "0-6 min - odstęp na tyle krótki, że rozkład jest zbędny" },
    { max: 12, css: "--hw-2", label: "6-12 min - nadal można przyjść bez planowania" },
    { max: 18, css: "--hw-3", label: "12-18 min - warto zerknąć w rozkład przed wyjściem" },
    { max: 30, css: "--hw-4", label: "18-30 min - podróż wymaga zaplanowania" },
    { max: Infinity, css: "--hw-5", label: "30+ min - na granicy realnej dostępności transportu" },
  ];

  // window key -> hex filename suffix, matches tools/transit_charts/export_odstepy_przystankow.py WINDOWS.
  const WINDOW_SUFFIX = { all: "", h06_10: "_h06_10", h10_14: "_h10_14", h14_18: "_h14_18", h18_22: "_h18_22" };

  const citytabsEl = document.getElementById("citytabs");
  const windowbarEl = document.getElementById("windowbar");
  const legendEl = document.getElementById("legend");
  const statlineEl = document.getElementById("statline");
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
  let currentWindow = "all";
  let opacity = parseFloat(opacityInput.value);

  const cache = {}; // city -> { boundary, hex: { windowKey -> geojson } }
  const layers = {}; // current city/window's map layers, rebuilt on every switch

  function headwayColor(mean_min) {
    const cls = CLASSES.find((c) => mean_min <= c.max);
    return cssVar(cls.css);
  }

  function hexTooltip(p) {
    return (
      '<div class="tt-title">Heksagon 500 m</div>' +
      '<div class="tt-row"><span>mediana odstępu</span><b>' + p.mean_min.toFixed(1) + " min</b></div>" +
      '<div class="tt-row"><span>przystanki w heksie</span><b>' + p.count + "</b></div>"
    );
  }

  function buildLayers(hexGeojson, boundaryGeojson) {
    const hexLayer = L.geoJSON(hexGeojson, {
      style: (f) => ({ color: "transparent", weight: 0, fillColor: headwayColor(f.properties.mean_min), fillOpacity: opacity }),
      onEachFeature: (f, l) => l.bindTooltip(hexTooltip(f.properties), { sticky: true }),
    });
    const boundaryLayer = L.geoJSON(boundaryGeojson, {
      style: () => ({ color: cssVar("--boundary"), weight: 1.4, fill: false }),
    });
    return { hex: hexLayer, boundary: boundaryLayer };
  }

  function clearMapLayers() {
    Object.keys(layers).forEach((k) => delete layers[k]);
    map.eachLayer((l) => {
      if (l instanceof L.TileLayer) return;
      map.removeLayer(l);
    });
  }

  function applyOpacity() {
    if (!layers.hex) return;
    layers.hex.setStyle({ fillOpacity: opacity });
  }

  function renderLegend() {
    legendEl.innerHTML = "";
    CLASSES.forEach((cls) => {
      const div = document.createElement("div");
      div.className = "legend-row";
      div.innerHTML = '<span class="swatch" style="background:var(' + cls.css + ')"></span>' + cls.label;
      legendEl.appendChild(div);
    });
  }

  function updateStat() {
    const s = manifest.cities[currentCity].windows[currentWindow];
    if (!s.count) {
      statlineEl.innerHTML = "brak wystarczających danych w tym oknie czasowym";
      return;
    }
    statlineEl.innerHTML =
      "<b>" + s.count.toLocaleString("pl-PL") + "</b> przystanków w <b>" + s.hex_count.toLocaleString("pl-PL") +
      "</b> heksagonach (500 m) &middot; mediana ważona odstępu <b>" + s.median_min.toLocaleString("pl-PL") + " min</b>";
  }

  function render() {
    layers.hex.addTo(map);
    layers.boundary.addTo(map);
    applyOpacity();
    updateStat();
  }

  async function fetchJSON(path) {
    return fetch(path).then((r) => r.json());
  }

  async function fetchCityBoundary(city) {
    if (!cache[city]) cache[city] = { boundary: null, hex: {} };
    if (!cache[city].boundary) cache[city].boundary = fetchJSON("data/" + city + "_boundary.geojson");
    return cache[city].boundary;
  }

  async function fetchCityHex(city, windowKey) {
    if (!cache[city]) cache[city] = { boundary: null, hex: {} };
    if (!cache[city].hex[windowKey]) {
      cache[city].hex[windowKey] = fetchJSON("data/" + city + "_hex" + WINDOW_SUFFIX[windowKey] + ".geojson");
    }
    return cache[city].hex[windowKey];
  }

  // Fetches are cached as in-flight/resolved promises (not just their eventual JSON), so a
  // second click on the same city/window before the first fetch lands reuses that same
  // promise instead of firing a duplicate request.
  function prefetchCity(city) {
    manifest.windows.forEach((key) => fetchCityHex(city, key));
    fetchCityBoundary(city);
  }

  async function loadView(city, windowKey) {
    currentCity = city;
    currentWindow = windowKey;
    const alreadyCached = cache[city] && cache[city].hex[windowKey] && cache[city].boundary;
    if (!alreadyCached) loadingEl.classList.add("visible");

    // Build the new layers off-map before touching the old ones, so switching never shows a
    // blank map while data loads -- the previous view stays up until the next one is ready.
    const [hex, boundary] = await Promise.all([fetchCityHex(city, windowKey), fetchCityBoundary(city)]);
    if (city !== currentCity || windowKey !== currentWindow) return; // superseded by a later click
    const newLayers = buildLayers(hex, boundary);

    loadingEl.classList.remove("visible");
    clearMapLayers();
    Object.assign(layers, newLayers);
    render();
  }

  async function loadCity(city) {
    await loadView(city, currentWindow);
    const b = manifest.cities[city].bounds;
    map.fitBounds(b, { padding: [20, 20] });
    prefetchCity(city); // warm the other 4 windows in the background
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

  function buildWindowbar() {
    windowbarEl.innerHTML = "";
    manifest.windows.forEach((key) => {
      const btn = document.createElement("button");
      btn.textContent = manifest.window_labels[key];
      btn.dataset.window = key;
      if (key === currentWindow) btn.classList.add("active");
      btn.addEventListener("click", () => {
        windowbarEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        loadView(currentCity, key);
      });
      windowbarEl.appendChild(btn);
    });
  }

  opacityInput.addEventListener("input", () => {
    opacity = parseFloat(opacityInput.value);
    opacityVal.textContent = Math.round(opacity * 100) + "%";
    applyOpacity();
  });
  opacityVal.textContent = Math.round(opacity * 100) + "%";

  renderLegend();

  fetch("data/manifest.json")
    .then((r) => r.json())
    .then((m) => {
      manifest = m;
      currentCity = manifest.order[0];
      buildTabs();
      buildWindowbar();
      loadCity(currentCity);
    });
})();
