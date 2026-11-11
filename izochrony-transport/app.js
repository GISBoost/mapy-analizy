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

  // Hour packs load one at a time, and only while a point is pinned: the
  // hand-to-slider window. Hover reads the current pack and does not walk
  // the day. Origin-neighbor .pbf prefetch is gone.
  // Wheel zoom would otherwise pick a new origin every frame; pause preview
  // the same 180 ms as dijkstra-paths.
  const WHEEL_PAUSE_MS = 180;
  // Slider drags must not decode or redraw on every notch. The label updates
  // immediately; polygons and the next queued pack wait until the thumb rests.
  const SLIDER_SETTLE_MS = 150;

  // Every origin in the grid has complete data (checked directly: all 1479
  // Lodz origin files carry exactly 17 hours x 3 cutoffs, zero gaps) -- so
  // "looks stuck" near the city edge isn't missing data, it's hovering
  // *outside* the analyzed grid entirely, where nearestOrigins() still
  // returns the closest origin no matter how far away it actually is,
  // silently rendering an increasingly-irrelevant isochrone. Past this
  // distance (roughly one hex-cell radius past the grid's own spacing, well
  // clear of normal edge-of-hex hovering) treat it as no coverage instead.
  //
  // Grid spacing varies by city (500m most cities, 1000m Warszawa, 2000m
  // GZM -- see tools/isochrones_lodz/compute_isochrones_city.R), so this
  // can't be one global constant: a 450m threshold tuned for a 500m grid
  // covers only a sliver of a 2000m-spaced hex, making GZM hover/click flip
  // in and out of "outside coverage" across most of each hex's own area --
  // reported as hover/drag "feeling broken/slow" (it isn't a perf issue --
  // GZM's per-origin files are smaller than Warszawa's, not bigger). Ratio
  // 0.9 preserves the original tuning: 450 / 500m spacing = 0.9.
  const HOVER_COVERAGE_RATIO = 0.9;
  let maxHoverDistDegSq = ((500 * HOVER_COVERAGE_RATIO) / 111320) ** 2; // placeholder until first loadCity() sets it from real spacing

  // Median nearest-neighbor distance (meters) across a sample of origins --
  // cheap (O(sampleSize x n), a few ms even at n~2500) and only runs once
  // per city load, not per hover tick.
  function estimateGridSpacingM(origins) {
    const sampleSize = Math.min(origins.length, 40);
    const step = Math.max(1, Math.floor(origins.length / sampleSize));
    const dists = [];
    for (let i = 0; i < origins.length; i += step) {
      const o = origins[i];
      const cosLat = Math.cos((o.lat * Math.PI) / 180);
      let minDistSq = Infinity;
      for (const other of origins) {
        if (other === o) continue;
        const dLat = other.lat - o.lat;
        const dLng = (other.lon - o.lon) * cosLat;
        const distSq = dLat * dLat + dLng * dLng;
        if (distSq < minDistSq) minDistSq = distSq;
      }
      dists.push(Math.sqrt(minDistSq) * 111320);
    }
    dists.sort((a, b) => a - b);
    return dists[Math.floor(dists.length / 2)];
  }

  const citytabsEl = document.getElementById("citytabs");
  const variantbarEl = document.getElementById("variantbar");
  const cutoffsEl = document.getElementById("cutoffs");
  const hourSliderEl = document.getElementById("hourslider");
  const hourValEl = document.getElementById("hourval");
  const statlineEl = document.getElementById("statline");

  // Resolve each custom property once instead of forcing a getComputedStyle()
  // on every render; a theme switch (the cutoff bands have dark variants)
  // empties the memo, see onThemeChange at the bottom.
  const rootStyle = getComputedStyle(document.documentElement);
  let resolved = {};
  const cssVar = (name) => resolved[name] || (resolved[name] = rootStyle.getPropertyValue(name).trim());

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
    style: () => ({ className: "boundary", weight: 1.4, fill: false }), // colour from --boundary in styles.css
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
  let cursor = null;
  let hoverFrame = 0;
  let wheelUntil = 0;
  let outsideCoverage = false; // hovering farther than maxHoverDistDegSq from any origin

  // city -> { manifest, boundary, hourPack: { variant: { hour: Promise<Map> } } }
  const cache = {};
  let packLoading = false;
  let packFail = false;
  let drawnHour = null; // clock hour currently on the map; null until the first paint
  let skippedHours = new Set(); // failed this pass; slider landing on one retries it
  let queueGen = 0;
  let queuePumping = false;
  let sliderTimer = 0;
  let sliderMoving = false;

  function cityCache(city) {
    if (!cache[city]) cache[city] = { manifest: null, boundary: null, hourPack: {} };
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

  function packSlot(city, variant, hour) {
    const c = cache[city];
    return c && c.hourPack[variant] && c.hourPack[variant][hour];
  }

  function packReady(city, variant, hour) {
    const slot = packSlot(city, variant, hour);
    return !!(slot && slot.pack);
  }

  function fetchHourPack(city, variant, hour) {
    const c = cityCache(city);
    if (!c.hourPack[variant]) c.hourPack[variant] = {};
    const slots = c.hourPack[variant];
    let slot = slots[hour];
    if (!slot) {
      slot = slots[hour] = {};
      slot.promise = fetch(HourPack.packUrl(city, variant, hour))
        .then((r) => {
          if (!r.ok) throw new Error("hour pack " + r.status);
          return r.arrayBuffer();
        })
        .then((buf) => {
          const pack = HourPack.indexHourPack(geobuf.decode(new Pbf(new Uint8Array(buf))));
          if (!pack) {
            delete slots[hour];
            return null;
          }
          slot.pack = pack;
          return pack;
        })
        .catch(() => {
          delete slots[hour];
          return null;
        });
    }
    return slot.promise;
  }

  function dropVariantPacks(city, variant) {
    const c = cache[city];
    if (c && c.hourPack) delete c.hourPack[variant];
  }

  function nearestOrigins(latlng, n) {
    // Flat-plane approx is fine at city scale (~30km across). Sorting the
    // full origin list (up to ~2500 points for the largest city) per call is
    // still sub-millisecond and only runs once per throttled/settled hover
    // tick, not per animation frame. Returns {origin, distSq} (degrees^2) so
    // callers can tell a nearby origin from a far one, not just find one.
    const lat0 = latlng.lat, lng0 = latlng.lng;
    const cosLat = Math.cos((lat0 * Math.PI) / 180);
    const scored = cityManifest.origins.map((o) => {
      const dLat = o.lat - lat0;
      const dLng = (o.lon - lng0) * cosLat;
      return { origin: o, distSq: dLat * dLat + dLng * dLng };
    });
    scored.sort((a, b) => a.distSq - b.distSq);
    return scored.slice(0, n);
  }

  function paintSlot(slot) {
    for (const c of CUTOFFS) {
      const layer = isoLayers[c.min];
      layer.clearLayers();
      if (!activeCutoffs.has(c.min)) continue;
      const feat = slot && slot[c.min];
      if (feat) layer.addData(feat);
    }
  }

  function paintOrigin(pack, originId, hour) {
    paintSlot(HourPack.lookupOrigin(pack, originId));
    drawnHour = hour;
    packLoading = false;
    packFail = false;
    updateStat();
  }

  function notePackFail(hour) {
    skippedHours.add(hour);
    packLoading = false;
    packFail = true;
    updateStat();
  }

  // Polygons stay until this hour's pack arrives. The loader is only for an empty map.
  function showHour(originId) {
    if (!originId || !cityManifest) return;
    const hour = cityManifest.hours[hourIndex];
    const city = currentCity;
    const variant = currentVariant;
    if (packReady(city, variant, hour)) {
      paintOrigin(packSlot(city, variant, hour).pack, originId, hour);
      return;
    }
    packFail = false;
    packLoading = drawnHour == null;
    updateStat();
    // Bytes for the visible hour are not here yet. While pinned, the queue
    // is already fetching that hour; it paints when the bytes arrive.
    if (pinnedOriginId) return;
    const requestedOrigin = originId;
    fetchHourPack(city, variant, hour).then((pack) => {
      if (currentCity !== city || currentVariant !== variant || !cityManifest) return;
      if (cityManifest.hours[hourIndex] !== hour || displayOriginId !== requestedOrigin) return;
      if (!pack) {
        notePackFail(hour);
        return;
      }
      paintOrigin(pack, requestedOrigin, hour);
    });
  }

  function cancelSliderSettle() {
    sliderMoving = false;
    clearTimeout(sliderTimer);
    sliderTimer = 0;
  }

  function settleSlider() {
    sliderMoving = false;
    sliderTimer = 0;
    if (!cityManifest) return;
    const hour = cityManifest.hours[hourIndex];
    skippedHours.delete(hour);
    if (displayOriginId) showHour(displayOriginId);
    else if (!pinnedOriginId) fetchHourPack(currentCity, currentVariant, hour);
    if (pinnedOriginId) recenterQueue();
  }

  function stopHourQueue() {
    queueGen++;
  }

  function kickHourQueue() {
    if (!pinnedOriginId || !cityManifest || queuePumping) return;
    queuePumping = true;
    const gen = queueGen;
    pumpHourQueue(gen);
  }

  function recenterQueue() {
    queueGen++;
    kickHourQueue();
  }

  async function pumpHourQueue(gen) {
    try {
      while (pinnedOriginId && gen === queueGen && cityManifest) {
        const hours = cityManifest.hours;
        const city = currentCity;
        const variant = currentVariant;
        const hour = HourQueue.nextHour(
          hours,
          hourIndex,
          (h) => packReady(city, variant, h),
          (h) => skippedHours.has(h)
        );
        if (hour == null) return;
        const pack = await fetchHourPack(city, variant, hour);
        if (!pinnedOriginId || currentCity !== city || currentVariant !== variant || !cityManifest) return;
        const stillThisWalk = gen === queueGen && !sliderMoving;
        if (!pack) {
          skippedHours.add(hour);
          if (stillThisWalk && cityManifest.hours[hourIndex] === hour) notePackFail(hour);
          if (!stillThisWalk) return;
          continue;
        }
        if (!sliderMoving && cityManifest.hours[hourIndex] === hour && displayOriginId) {
          paintOrigin(pack, displayOriginId, hour);
        }
        if (!stillThisWalk) return;
      }
    } finally {
      queuePumping = false;
      if (pinnedOriginId && gen !== queueGen && !sliderMoving) kickHourQueue();
    }
  }

  function updateStat() {
    if (packFail) {
      statlineEl.innerHTML = t("statPackFail");
      return;
    }
    if (packLoading) {
      statlineEl.innerHTML = t("statLoading");
      return;
    }
    if (outsideCoverage) {
      statlineEl.innerHTML = t("statOutsideArea");
      return;
    }
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
    outsideCoverage = false; // onMapClick already checked -- this origin is in range
    pinnedOriginId = origin.id;
    displayOriginId = origin.id;
    if (pinMarker) map.removeLayer(pinMarker);
    pinMarker = L.circleMarker([origin.lat, origin.lon], {
      radius: 6, color: cssVar("--pin"), weight: 2, fillColor: cssVar("--pin"), fillOpacity: 0.9,
    }).addTo(map);
    showHour(origin.id);
    recenterQueue();
  }

  function unpin() {
    pinnedOriginId = null;
    stopHourQueue();
    if (pinMarker) { map.removeLayer(pinMarker); pinMarker = null; }
    updateStat();
  }

  function armHover() {
    if (!IsoHover.shouldArmHoverFrame(hoverFrame !== 0)) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      if (!cursor) return;
      processHover(cursor);
    });
  }

  function processHover(latlng) {
    if (pinnedOriginId || !cityManifest) return;
    if (performance.now() < wheelUntil) return;
    const [{ origin: nearest, distSq }] = nearestOrigins(latlng, 1);
    const next = IsoHover.applyHover(false, displayOriginId, nearest.id, distSq, maxHoverDistDegSq);
    if (next.action === "skip") return;
    if (next.action === "outside") {
      outsideCoverage = true;
      displayOriginId = null;
      drawnHour = null;
      for (const c of CUTOFFS) isoLayers[c.min].clearLayers();
      updateStat();
      return;
    }
    outsideCoverage = false;
    displayOriginId = next.displayId;
    showHour(next.displayId);
  }

  function onMapMouseMove(e) {
    cursor = e.latlng;
    if (pinnedOriginId) return;
    armHover();
  }

  function onMapClick(e) {
    if (!cityManifest) return;
    const [{ origin: nearest, distSq }] = nearestOrigins(e.latlng, 1);
    if (distSq > maxHoverDistDegSq) return; // nothing to pin outside the analyzed area
    placePin(nearest);
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
    // Hides the toggle when a city's manifest only lists one variant.
    // As of 2026-08-27 all 6 cities list both ("rt" + "static") -- an
    // earlier comment here claimed only Lodz did; that was stale, see
    // tools/isochrones_lodz/README.md's correction note.
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
        if (v === currentVariant) return;
        const previous = currentVariant;
        currentVariant = v;
        variantbarEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        dropVariantPacks(currentCity, previous);
        skippedHours = new Set();
        if (displayOriginId) showHour(displayOriginId);
        if (pinnedOriginId) recenterQueue();
        else stopHourQueue();
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
        const hour = cityManifest && cityManifest.hours[hourIndex];
        if (displayOriginId && hour != null && packReady(currentCity, currentVariant, hour)) {
          paintOrigin(packSlot(currentCity, currentVariant, hour).pack, displayOriginId, hour);
        }
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
    cancelSliderSettle();
    // Drop the pin before touching the queue. A generation bump while the
    // pin is still set makes the pump restart during the manifest fetch.
    unpin();
    skippedHours = new Set();
    drawnHour = null;
    // Only one city is ever on screen -- drop decoded hour packs for every
    // other city so touring several cities doesn't keep every pack in RAM.
    for (const k of Object.keys(cache)) if (k !== city) delete cache[k];
    const [cm, boundary] = await Promise.all([fetchCityManifest(city), fetchCityBoundary(city)]);
    if (currentCity !== requestedCity) return; // superseded by a later tab click

    cityManifest = cm;
    unpin();
    displayOriginId = null;
    outsideCoverage = false;
    const gridSpacingM = estimateGridSpacingM(cityManifest.origins);
    maxHoverDistDegSq = ((gridSpacingM * HOVER_COVERAGE_RATIO) / 111320) ** 2;

    hourSliderEl.max = String(cityManifest.hours.length - 1);
    hourIndex = Math.min(hourIndex, cityManifest.hours.length - 1);
    hourSliderEl.value = String(hourIndex);
    hourValEl.textContent = `${String(cityManifest.hours[hourIndex]).padStart(2, "0")}:00`;

    buildVariantBar(cityManifest.variants);
    boundaryLayer.clearLayers();
    boundaryLayer.addData(boundary);
    for (const c of CUTOFFS) isoLayers[c.min].clearLayers();

    map.fitBounds(cityManifest.bounds, { padding: [20, 20] });
    packLoading = true;
    packFail = false;
    updateStat();
    const hour = cityManifest.hours[hourIndex];
    fetchHourPack(city, currentVariant, hour).then((pack) => {
      if (currentCity !== requestedCity) return;
      packLoading = false;
      packFail = !pack;
      updateStat();
    });
  }

  hourSliderEl.addEventListener("input", () => {
    hourIndex = parseInt(hourSliderEl.value, 10);
    const hour = cityManifest ? cityManifest.hours[hourIndex] : hourIndex;
    hourValEl.textContent = `${String(hour).padStart(2, "0")}:00`;
    if (!cityManifest) return;
    sliderMoving = true;
    stopHourQueue();
    packFail = false;
    if (displayOriginId && drawnHour != null) updateStat();
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(settleSlider, SLIDER_SETTLE_MS);
  });

  map.on("mousemove", onMapMouseMove);
  map.on("click", onMapClick);
  map.on("zoomstart", () => { wheelUntil = performance.now() + WHEEL_PAUSE_MS; });
  map.on("zoomend", () => { if (!pinnedOriginId && cursor) armHover(); });

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

  // Theme button in the top bar: an explicit light/dark choice over the system default, one key for all the map pages
  // (applied before the first paint by the inline script in index.html). Tiles and boundary follow it through CSS.
  // the --cut-* bands differ per theme and are baked into the band styles: re-read them on a click and on a system switch
  const onThemeChange = () => {
    resolved = {};
    for (const c of CUTOFFS) isoLayers[c.min].setStyle({ fillColor: cssVar(c.css) });
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", onThemeChange);
  const isDark = () => (document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
  document.getElementById("themeToggleBtn").addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("mapyAnalizyTheme", next); } catch (e) { /* private mode */ }
    onThemeChange();
  });
})();
