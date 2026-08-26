// Dokad dojade? -- interactive transit isochrone, multi-city (Lodz live, more
// cities land as their data is computed). Vanilla JS + Leaflet, no build step
// (mirrors odstepy-przystankow / uczelnie-dostepnosc, including its city-tabs
// pattern for buildCityTabs()/loadCity() below).
(function () {
  "use strict";

  const CUTOFFS = [
    { min: 45, css: "--cut-45", key: "cutoff45" },
    { min: 30, css: "--cut-30", key: "cutoff30" },
    { min: 15, css: "--cut-15", key: "cutoff15" },
  ]; // draw order: widest/lightest first (bottom), narrowest/darkest last (top)
     // -- isoLayers below are created once in this order, so z-order is fixed
     // at init and never needs re-establishing per render. Labels come from
     // i18n.js (t(c.key)), not hardcoded here.

  const VARIANT_KEYS = { rt: "variantRt", static: "variantStatic" };

  // A hover only fires a fetch at most this often -- without it, a fast mouse
  // sweep across many 500m hexes fires a fetch per hex per mousemove tick,
  // which is invisible on localhost but a real, jank-causing round-trip on
  // GitHub Pages (measured: production felt "muli" on hover, this plus the
  // neighbor-prefetch below is the fix).
  const MOVE_THROTTLE_MS = 50;
  // After a hover settles on an origin, warm its nearest neighbors in the
  // background so continuing to hover nearby hits cache instead of the
  // network. Bounded and cheap (~6 fetches), unlike the whole-city prefetch
  // tried earlier and reverted for costing ~10.8s of CPU for no longer-needed
  // benefit -- see tools/isochrones_lodz/README.md decision log.
  const NEIGHBOR_PREFETCH_N = 6;

  const citytabsEl = document.getElementById("citytabs");
  const variantbarEl = document.getElementById("variantbar");
  const cutoffsEl = document.getElementById("cutoffs");
  const hourSliderEl = document.getElementById("hourslider");
  const hourValEl = document.getElementById("hourval");
  const statlineEl = document.getElementById("statline");

  // Colors never change at runtime (no theme toggle), so resolve each custom
  // property once instead of forcing a getComputedStyle() on every render.
  const cssVar = (() => {
    const style = getComputedStyle(document.documentElement);
    const resolved = {};
    return (name) => resolved[name] || (resolved[name] = style.getPropertyValue(name).trim());
  })();

  const map = L.map("map", { zoomControl: true, minZoom: 10 });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  // Persistent layers (created once, populated via clearLayers()+addData()
  // per render instead of destroy+recreate) -- less per-hover allocation/GC,
  // and boundary stays below the cutoff fills simply because it was added
  // to the map first.
  const boundaryLayer = L.geoJSON(null, {
    interactive: false,
    style: () => ({ color: cssVar("--boundary"), weight: 1.4, fill: false }),
  }).addTo(map);

  const isoLayers = {}; // cutoff_min -> persistent L.geoJSON layer
  for (const c of CUTOFFS) {
    isoLayers[c.min] = L.geoJSON(null, {
      interactive: false, // let hover/click pass through to the map -- see onMapMouseMove/onMapClick
      style: () => ({ color: "transparent", weight: 0, fillColor: cssVar(c.css), fillOpacity: 0.55 }),
    }).addTo(map);
  }

  let topManifest = null;
  let currentCity = null;
  let cityManifest = null; // manifest of currentCity: {hours, cutoffs_min, variants, bounds, origins}
  let currentVariant = null;
  let activeCutoffs = new Set([45, 30, 15]);
  let hourIndex = 6; // index into cityManifest.hours
  let displayOriginId = null; // the origin currently drawn (hover or pin)
  let pinnedOriginId = null;
  let pinMarker = null;
  let lastMoveTs = 0;

  // city -> { manifest: Promise, boundary: Promise, origin: { variant: { id: Promise<FeatureCollection> } } }
  const cache = {};

  function cityCache(city) {
    if (!cache[city]) cache[city] = { manifest: null, boundary: null, origin: {} };
    return cache[city];
  }

  function fetchCityManifest(city) {
    const c = cityCache(city);
    if (!c.manifest) c.manifest = fetch(`data/${city}/manifest.json`).then((r) => r.json());
    return c.manifest;
  }

  function fetchCityBoundary(city) {
    const c = cityCache(city);
    if (!c.boundary) c.boundary = fetch(`data/${city}/boundary.geojson`).then((r) => r.json());
    return c.boundary;
  }

  function fetchOrigin(city, variant, originId) {
    const c = cityCache(city);
    if (!c.origin[variant]) c.origin[variant] = {};
    if (!c.origin[variant][originId]) {
      // geobuf binary, not raw GeoJSON -- ~1/5 the size on disk and still
      // ~2x smaller than gzipped GeoJSON would be (see tools/isochrones_lodz
      // README decision log). Decoded client-side via pbf.js + geobuf.js.
      c.origin[variant][originId] = fetch(`data/${city}/${variant}/${originId}.pbf`)
        .then((r) => r.arrayBuffer())
        .then((buf) => geobuf.decode(new Pbf(new Uint8Array(buf))));
    }
    return c.origin[variant][originId];
  }

  function nearestOrigins(latlng, n) {
    // Flat-plane approx is fine at city scale (~30km across). Sorting the
    // full origin list (up to ~2500 points for the largest city) per call is
    // still sub-millisecond and only runs once per throttled/settled hover
    // tick, not per animation frame.
    const lat0 = latlng.lat, lng0 = latlng.lng;
    const cosLat = Math.cos((lat0 * Math.PI) / 180);
    const scored = cityManifest.origins.map((o) => {
      const dLat = o.lat - lat0;
      const dLng = (o.lon - lng0) * cosLat;
      return [dLat * dLat + dLng * dLng, o];
    });
    scored.sort((a, b) => a[0] - b[0]);
    return scored.slice(0, n).map((s) => s[1]);
  }

  function prefetchNeighbors(origin) {
    const neighbors = nearestOrigins({ lat: origin.lat, lng: origin.lon }, NEIGHBOR_PREFETCH_N + 1);
    for (const n of neighbors) {
      if (n.id !== origin.id) fetchOrigin(currentCity, currentVariant, n.id);
    }
  }

  async function renderCurrent() {
    if (!displayOriginId) return;
    const requestedOriginId = displayOriginId;
    const requestedVariant = currentVariant;
    const requestedCity = currentCity;
    const hour = cityManifest.hours[hourIndex];
    // No loading indicator here on purpose: layers are only cleared below,
    // after the new data is ready, so a brief fetch for a not-yet-cached
    // origin never blanks or flashes the map -- the previous isochrone stays
    // on screen throughout.
    const fc = await fetchOrigin(requestedCity, requestedVariant, requestedOriginId);
    // superseded by a later hover/click/variant/city switch while this was in flight
    if (displayOriginId !== requestedOriginId || currentVariant !== requestedVariant || currentCity !== requestedCity) return;

    const features = fc.features.filter((f) => f.properties.hour === hour);
    for (const c of CUTOFFS) {
      const layer = isoLayers[c.min];
      layer.clearLayers();
      if (!activeCutoffs.has(c.min)) continue;
      const feats = features.filter((f) => f.properties.cutoff_min === c.min);
      if (feats.length) layer.addData({ type: "FeatureCollection", features: feats });
    }
    updateStat();
  }

  function updateStat() {
    if (!displayOriginId) {
      statlineEl.innerHTML = t("statHint");
      return;
    }
    const hour = cityManifest.hours[hourIndex];
    const pinState = pinnedOriginId
      ? `<button id="unpin-btn">${t("statUnpinButton")}</button>`
      : t("statClickToPin");
    statlineEl.innerHTML = t("statHtml", { hour: String(hour).padStart(2, "0"), pinState });
    const btn = document.getElementById("unpin-btn");
    if (btn) btn.addEventListener("click", unpin);
  }

  function placePin(origin) {
    pinnedOriginId = origin.id;
    displayOriginId = origin.id;
    if (pinMarker) map.removeLayer(pinMarker);
    pinMarker = L.circleMarker([origin.lat, origin.lon], {
      radius: 6, color: cssVar("--pin"), weight: 2, fillColor: cssVar("--pin"), fillOpacity: 0.9,
    }).addTo(map);
    renderCurrent();
  }

  function unpin() {
    pinnedOriginId = null;
    if (pinMarker) { map.removeLayer(pinMarker); pinMarker = null; }
    updateStat();
  }

  function onMapMouseMove(e) {
    if (pinnedOriginId || !cityManifest) return;
    const now = Date.now();
    if (now - lastMoveTs < MOVE_THROTTLE_MS) return;
    lastMoveTs = now;
    const [nearest] = nearestOrigins(e.latlng, 1);
    if (!nearest || nearest.id === displayOriginId) return;
    displayOriginId = nearest.id;
    renderCurrent();
    prefetchNeighbors(nearest);
  }

  function onMapClick(e) {
    if (!cityManifest) return;
    const [nearest] = nearestOrigins(e.latlng, 1);
    if (nearest) placePin(nearest);
  }

  function buildCityTabs() {
    citytabsEl.innerHTML = "";
    topManifest.cities.forEach((city) => {
      const btn = document.createElement("button");
      btn.textContent = city.label;
      if (city.id === currentCity) btn.classList.add("active");
      btn.addEventListener("click", () => {
        citytabsEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        loadCity(city.id);
      });
      citytabsEl.appendChild(btn);
    });
  }

  function buildVariantBar(variants) {
    // Only Lodz has both a scheduled and a realized (GTFS-RT) run -- the
    // other cities' pipeline only ever downloaded realized GTFS (see
    // tools/isochrones_lodz/README.md), so there's nothing to toggle there.
    const wrapper = variantbarEl.parentElement;
    if (variants.length <= 1) {
      wrapper.style.display = "none";
      currentVariant = variants[0];
      return;
    }
    wrapper.style.display = "";
    if (!variants.includes(currentVariant)) {
      currentVariant = variants.includes("rt") ? "rt" : variants[0];
    }
    variantbarEl.innerHTML = "";
    variants.forEach((v) => {
      const btn = document.createElement("button");
      btn.textContent = t(VARIANT_KEYS[v] || v);
      if (v === currentVariant) btn.classList.add("active");
      btn.addEventListener("click", () => {
        currentVariant = v;
        variantbarEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderCurrent();
      });
      variantbarEl.appendChild(btn);
    });
  }

  function buildCutoffCheckboxes() {
    // Same 3 cutoffs for every city -- built once, not per city switch.
    cutoffsEl.innerHTML = "";
    CUTOFFS.forEach((c) => {
      const row = document.createElement("label");
      row.className = "cutoff-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = activeCutoffs.has(c.min);
      cb.addEventListener("change", () => {
        if (cb.checked) activeCutoffs.add(c.min); else activeCutoffs.delete(c.min);
        renderCurrent();
      });
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = `var(${c.css})`;
      row.appendChild(cb);
      row.appendChild(swatch);
      row.appendChild(document.createTextNode(t(c.key)));
      cutoffsEl.appendChild(row);
    });
  }

  async function loadCity(city) {
    currentCity = city;
    const requestedCity = city;
    const [cm, boundary] = await Promise.all([fetchCityManifest(city), fetchCityBoundary(city)]);
    if (currentCity !== requestedCity) return; // superseded by a later tab click

    cityManifest = cm;
    unpin();
    displayOriginId = null;

    hourSliderEl.max = String(cityManifest.hours.length - 1);
    hourIndex = Math.min(hourIndex, cityManifest.hours.length - 1);
    hourSliderEl.value = String(hourIndex);
    hourValEl.textContent = `${String(cityManifest.hours[hourIndex]).padStart(2, "0")}:00`;

    buildVariantBar(cityManifest.variants);
    boundaryLayer.clearLayers();
    boundaryLayer.addData(boundary);
    for (const c of CUTOFFS) isoLayers[c.min].clearLayers();

    map.fitBounds(cityManifest.bounds, { padding: [20, 20] });
    updateStat();
  }

  hourSliderEl.addEventListener("input", () => {
    hourIndex = parseInt(hourSliderEl.value, 10);
    const hour = cityManifest ? cityManifest.hours[hourIndex] : hourIndex;
    hourValEl.textContent = `${String(hour).padStart(2, "0")}:00`;
    renderCurrent();
  });

  map.on("mousemove", onMapMouseMove);
  map.on("click", onMapClick);

  buildCutoffCheckboxes();

  // Rebuild everything language-dependent: cutoff labels, variant labels,
  // stat line. Cheap -- no data refetch, just re-reads t() with the new lang.
  setLangChangeHandler(() => {
    buildCutoffCheckboxes();
    if (cityManifest) buildVariantBar(cityManifest.variants);
    updateStat();
  });

  fetch("data/manifest.json")
    .then((r) => r.json())
    .then((m) => {
      topManifest = m;
      currentCity = topManifest.cities[0].id;
      buildCityTabs();
      loadCity(currentCity);
    });
})();
