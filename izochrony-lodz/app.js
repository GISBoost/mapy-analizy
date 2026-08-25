// Dokad dojade? -- interactive transit isochrone, Lodz pilot. Vanilla JS + Leaflet,
// no build step (mirrors odstepy-przystankow / uczelnie-dostepnosc).
(function () {
  "use strict";

  const CUTOFFS = [
    { min: 45, css: "--cut-45", label: "do 45 min" },
    { min: 30, css: "--cut-30", label: "do 30 min" },
    { min: 15, css: "--cut-15", label: "do 15 min" },
  ]; // draw order: widest/lightest first (bottom), narrowest/darkest last (top)

  const VARIANTS = [
    { key: "rt", label: "Zrealizowany przejazd (GTFS-RT)" },
    { key: "static", label: "Rozkład jazdy" },
  ];

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

  let manifest = null;
  let currentVariant = "rt";
  let activeCutoffs = new Set([45, 30, 15]);
  let hourIndex = 6; // index into manifest.hours (default ~ noon-ish start)
  let displayOriginId = null; // the origin currently drawn (hover or pin)
  let pinnedOriginId = null;
  let pinMarker = null;

  // variant -> originId -> Promise<FeatureCollection> (in-flight or resolved,
  // same dedup pattern as odstepy-przystankow's fetchCityHex)
  const cache = { rt: {}, static: {} };
  const isoLayers = {}; // cutoff_min -> current L.geoJSON layer

  function fetchOrigin(variant, originId) {
    if (!cache[variant][originId]) {
      // geobuf binary, not raw GeoJSON -- ~1/5 the size on disk and still
      // ~2x smaller than gzipped GeoJSON would be (see tools/isochrones_lodz
      // README decision log). Decoded client-side via pbf.js + geobuf.js.
      cache[variant][originId] = fetch(`data/${variant}/${originId}.pbf`)
        .then((r) => r.arrayBuffer())
        .then((buf) => geobuf.decode(new Pbf(new Uint8Array(buf))));
    }
    return cache[variant][originId];
  }

  function nearestOriginId(latlng) {
    // Flat-plane approx is fine at city scale (~30km across); origins are
    // 500m apart so brute force over ~1500 points is trivial per event.
    const lat0 = latlng.lat, lng0 = latlng.lng;
    const cosLat = Math.cos((lat0 * Math.PI) / 180);
    let best = null, bestD = Infinity;
    for (const o of manifest.origins) {
      const dLat = o.lat - lat0;
      const dLng = (o.lon - lng0) * cosLat;
      const d = dLat * dLat + dLng * dLng;
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  function clearIsoLayers() {
    Object.values(isoLayers).forEach((l) => map.removeLayer(l));
    for (const k of Object.keys(isoLayers)) delete isoLayers[k];
  }

  async function renderCurrent() {
    if (!displayOriginId) return;
    const requestedOriginId = displayOriginId;
    const requestedVariant = currentVariant;
    const hour = manifest.hours[hourIndex];
    // No loading indicator here on purpose: the previous isochrone stays on
    // screen (cleared only after the new data is ready, below) so a brief
    // fetch for a not-yet-cached origin (~7ms decode + one small request,
    // measured) never blanks or flashes the map.
    const fc = await fetchOrigin(requestedVariant, requestedOriginId);
    const features = fc.features.filter((f) => f.properties.hour === hour);
    // superseded by a later hover/click/variant switch while this was in flight
    if (displayOriginId !== requestedOriginId || currentVariant !== requestedVariant) return;

    clearIsoLayers();
    // draw bottom-to-top: widest cutoff first
    for (const c of CUTOFFS) {
      if (!activeCutoffs.has(c.min)) continue;
      const feats = features.filter((f) => f.properties.cutoff_min === c.min);
      if (!feats.length) continue;
      const layer = L.geoJSON({ type: "FeatureCollection", features: feats }, {
        interactive: false, // let hover/click pass through to the map -- see onMapMouseMove/onMapClick
        style: () => ({
          color: "transparent", weight: 0,
          fillColor: cssVar(c.css), fillOpacity: 0.55,
        }),
      });
      layer.addTo(map);
      isoLayers[c.min] = layer;
    }
    updateStat();
  }

  function updateStat() {
    if (!displayOriginId) {
      statlineEl.innerHTML = "Najedź na mapę, żeby zobaczyć zasięg dojazdu z tego miejsca.";
      return;
    }
    const hour = manifest.hours[hourIndex];
    const pinState = pinnedOriginId
      ? '<button id="unpin-btn">odepnij pinezkę</button>'
      : "kliknij, żeby przypiąć";
    statlineEl.innerHTML =
      `godz. <b>${String(hour).padStart(2, "0")}:00</b> &middot; ${pinState}`;
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
    if (pinnedOriginId) return; // pin locks the display until unpinned
    if (!manifest) return;
    const nearest = nearestOriginId(e.latlng);
    if (!nearest || nearest.id === displayOriginId) return;
    displayOriginId = nearest.id;
    renderCurrent();
  }

  function onMapClick(e) {
    if (!manifest) return;
    const nearest = nearestOriginId(e.latlng);
    if (nearest) placePin(nearest);
  }

  function buildVariantBar() {
    variantbarEl.innerHTML = "";
    VARIANTS.forEach((v) => {
      const btn = document.createElement("button");
      btn.textContent = v.label;
      if (v.key === currentVariant) btn.classList.add("active");
      btn.addEventListener("click", () => {
        currentVariant = v.key;
        variantbarEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderCurrent();
      });
      variantbarEl.appendChild(btn);
    });
  }

  function buildCutoffCheckboxes() {
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
      row.appendChild(document.createTextNode(c.label));
      cutoffsEl.appendChild(row);
    });
  }

  hourSliderEl.addEventListener("input", () => {
    hourIndex = parseInt(hourSliderEl.value, 10);
    const hour = manifest ? manifest.hours[hourIndex] : hourIndex;
    hourValEl.textContent = `${String(hour).padStart(2, "0")}:00`;
    renderCurrent();
  });

  map.on("mousemove", onMapMouseMove);
  map.on("click", onMapClick);

  buildVariantBar();
  buildCutoffCheckboxes();

  // City boundary (dissolved outline of the 500m hex grid, same source as
  // the origins) -- reference layer so it's clear where isochrone coverage
  // could ever reach vs. where there's just no data. Colour: --boundary in
  // styles.css.
  fetch("data/lodz_boundary.geojson")
    .then((r) => r.json())
    .then((geojson) => {
      L.geoJSON(geojson, {
        interactive: false,
        style: () => ({ color: cssVar("--boundary"), weight: 1.4, fill: false }),
      }).addTo(map);
    });

  fetch("data/manifest.json")
    .then((r) => r.json())
    .then((m) => {
      manifest = m;
      hourSliderEl.max = String(manifest.hours.length - 1);
      hourIndex = Math.min(hourIndex, manifest.hours.length - 1);
      hourSliderEl.value = String(hourIndex);
      hourValEl.textContent = `${String(manifest.hours[hourIndex]).padStart(2, "0")}:00`;
      map.fitBounds(manifest.bounds, { padding: [20, 20] });
    });
})();
