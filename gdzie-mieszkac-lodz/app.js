// Gdzie mieszkac w Lodzi? -- vanilla JS + Leaflet, no build step (same pattern as the other analyses).
// Data lives in the separate repo gdzie-mieszkac-lodz-data (Pages: gisboost.github.io/gdzie-mieszkac-lodz-data/),
// written by easy-R5/tools/apartment_finder/scripts/export_web.py. Same origin as this page, so no CORS; the relative
// path DATA resolves to that repo both on Pages and when serving the parent of both repos locally.
//   manifest.json  windows, curves, matrix params, basemap, method version
//   hex.json       {c:[[lon,lat]...], p:[[lon,lat,...12]...]}  centroids + hexagon rings (index = hex_id)
//   layers.json    {column: [value|null, ...]}  static layers per hex
//   m/<scenario>.r.bin / .c.bin   OD matrix rows (from a hex) / columns (to a hex), range-readable
// Scoring is in score.js (pure, unit-tested). Everything shown comes from the pipeline; nothing is invented here.
(function () {
  "use strict";

  const DATA = "../../gdzie-mieszkac-lodz-data/";
  const MODES = ["transit", "walk", "bike", "car"];
  const TARGET_COLORS = ["#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00"];
  const WEIGHT_KEYS = ["tram_stop", "bus_stop", "frequency", "green", "noise_road", "noise_rail", "noise_industry"];
  const NOISE_SRC = { road: "road", rail: "rail_all", industry: "industry" };
  const RAMP = [[0, "#440154"], [0.25, "#3b528b"], [0.5, "#21918c"], [0.75, "#5ec962"], [1, "#fde725"]];

  const $ = (id) => document.getElementById(id);
  let M = null;          // manifest
  let HEX = null;        // hex.json
  let LAY = {};          // layer arrays (Float32Array, NaN = null)
  let N = 0;
  let map, polys = [], markers = [], pickMode = false, selected = null;
  const colors = RAMP.map(([p, h]) => [p, [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))]);

  const state = {
    win: "morning", ttype: "static", rides: "unlimited", lka: false, dir: "auto", bedroom: false,
    weights: {}, hardNoise: { road: false, rail: false, industry: false }, minScore: 0, showRejected: false, targets: [],
  };

  // ---------- helpers ----------
  function rampColor(s) {
    const x = Math.max(0, Math.min(1, s / 100));
    for (let k = 1; k < colors.length; k++) {
      if (x <= colors[k][0]) {
        const [p0, c0] = colors[k - 1], [p1, c1] = colors[k], f = (x - p0) / (p1 - p0);
        return "rgb(" + c0.map((v, i) => Math.round(v + f * (c1[i] - v))).join(",") + ")";
      }
    }
    return RAMP[RAMP.length - 1][1];
  }
  const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? "–" : Number(v).toFixed(d));
  function effDir() { return state.dir === "auto" ? M.default_dir[state.win] : state.dir; }

  // ---------- URL state ----------
  function saveHash() {
    const s = { w: state.win, t: state.ttype, r: state.rides, l: state.lka ? 1 : 0, d: state.dir, b: state.bedroom ? 1 : 0,
      wt: state.weights, hn: state.hardNoise, ms: state.minScore, sr: state.showRejected ? 1 : 0,
      tg: state.targets.map((x) => ({ h: x.hex, n: x.name, m: MODES.filter((k) => x.modes[k]).join(","), x: x.maxMin, i: x.idealMin, w: x.weight, k: x.hard ? 1 : 0 })) };
    try { history.replaceState(null, "", "#s=" + encodeURIComponent(JSON.stringify(s))); } catch (e) { /* ignore */ }
  }
  function loadHash() {
    const m = /#s=([^&]+)/.exec(location.hash);
    if (!m) return;
    try {
      const s = JSON.parse(decodeURIComponent(m[1]));
      const ok = (v, list, d) => (list.includes(v) ? v : d);
      state.win = ok(s.w, Object.keys(M.windows), state.win);
      state.ttype = ok(s.t, ["static", "p50", "p85"], state.ttype);
      state.rides = ok(s.r, ["unlimited", "max1transfer"], state.rides);
      state.lka = !!s.l; state.dir = ok(s.d, ["auto", "to", "from"], "auto"); state.bedroom = !!s.b;
      WEIGHT_KEYS.forEach((k) => { if (s.wt && Number.isFinite(+s.wt[k])) state.weights[k] = Math.max(0, Math.min(5, +s.wt[k])); });
      if (s.hn) Object.keys(state.hardNoise).forEach((k) => { state.hardNoise[k] = !!s.hn[k]; });
      state.minScore = Math.max(0, Math.min(95, +s.ms || 0)); state.showRejected = !!s.sr;
      (s.tg || []).slice(0, M.curves.max_targets).forEach((x, k) => {
        if (!(x.h >= 0 && x.h < N)) return;
        const modes = {}; MODES.forEach((q) => { modes[q] = String(x.m || "").split(",").includes(q); });
        state.targets.push(newTarget(x.h, x.n, modes, +x.x || 45, +x.i || 10, Number.isFinite(+x.w) ? +x.w : 3, !!x.k, k));
      });
    } catch (e) { /* bad hash: ignore */ }
  }

  // ---------- matrix access (range requests into row/column files) ----------
  const headers = {};
  async function fetchRange(url, a, b) {
    const r = await fetch(url, { headers: { Range: "bytes=" + a + "-" + b } });
    if (r.status === 206) return new Uint8Array(await r.arrayBuffer());
    if (r.status === 200) { const all = new Uint8Array(await r.arrayBuffer()); return all.subarray(a, b + 1); } // server ignored Range (e.g. file://-like dev server)
    throw new Error(url + ": HTTP " + r.status);
  }
  async function header(url) {
    if (!headers[url]) {
      headers[url] = (async () => {
        const n = M.n, hdr = await fetchRange(url, 0, 16 + 4 * (n + 1) - 1);
        const dv = new DataView(hdr.buffer, hdr.byteOffset, hdr.byteLength);
        if (dv.getUint32(0) !== 0x48584d31) throw new Error("bad matrix header: " + url);
        const off = new Uint32Array(n + 1); for (let i = 0; i <= n; i++) off[i] = dv.getUint32(16 + 4 * i);
        return { off, base: 16 + 4 * (n + 1), scale: dv.getUint32(8) };
      })();
    }
    return headers[url];
  }
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  const blockCache = new Map();
  // stored units per hex for one file (Uint8Array; 255 = not reached; transit deltas still need their base)
  async function readUnits(scenario, dir, hex) {
    const url = DATA + "m/" + scenario + (dir === "to" ? ".c.bin" : ".r.bin"); // "to target" = column, "from target" = row
    const key = url + "#" + hex;
    if (!blockCache.has(key)) {
      blockCache.set(key, (async () => {
        const h = await header(url);
        const raw = await fetchRange(url, h.base + h.off[hex], h.base + h.off[hex + 1] - 1);
        return { u: await inflateRaw(raw), scale: h.scale };
      })());
    }
    return blockCache.get(key);
  }
  // minutes per hex (Uint8Array, 255 = not reached), for a scenario file and direction
  async function readVector(scenario, dir, hex) {
    const base = M.matrix.base[scenario];
    const [d, b] = await Promise.all([readUnits(scenario, dir, hex), base ? readUnits(base, dir, hex) : null]);
    const out = new Uint8Array(d.u.length);
    for (let i = 0; i < out.length; i++) {
      const u = b ? (b.u[i] + d.u[i]) & 255 : d.u[i]; // lossless wrap-around difference (see export_web.py)
      out[i] = u === 255 ? 255 : u * d.scale;
    }
    return out;
  }
  function scenarioFor(mode) {
    if (mode === "transit") return state.win + "_" + state.ttype + "_" + state.rides + "_" + (state.lka ? "lka" : "nolka");
    if (mode === "car") return state.win + "_car";
    return mode; // walk, bike
  }

  // ---------- targets ----------
  function newTarget(hex, name, modes, maxMin, idealMin, weight, hard, k) {
    return { hex, name: name || t("targetDefaultName", { n: k + 1 }), modes: modes || { transit: true, walk: false, bike: false, car: false },
      maxMin: maxMin || M.curves.travel.default_max_min, idealMin: idealMin || M.curves.travel.default_ideal_min,
      weight: weight == null ? 3 : weight, hard: !!hard, times: null, modeTimes: {}, loading: false, error: null, token: 0 };
  }
  async function refreshTarget(tg) {
    const tok = ++tg.token; tg.loading = true; tg.error = null; renderTargets();
    const active = MODES.filter((m) => tg.modes[m]);
    try {
      const vecs = await Promise.all(active.map((m) => readVector(scenarioFor(m), effDir(), tg.hex)));
      if (tok !== tg.token) return;
      tg.modeTimes = {}; active.forEach((m, i) => { tg.modeTimes[m] = vecs[i]; });
      const out = new Uint8Array(N).fill(255);
      vecs.forEach((v) => { for (let i = 0; i < N; i++) if (v[i] < out[i]) out[i] = v[i]; });
      tg.times = active.length ? out : null;
    } catch (e) {
      if (tok !== tg.token) return;
      tg.times = null; tg.modeTimes = {}; tg.error = String(e.message || e);
    }
    tg.loading = false; renderTargets(); recompute();
  }
  function refreshAllTargets() { state.targets.forEach(refreshTarget); }

  // ---------- layers -> scoring inputs ----------
  function pickStep(kind, db) { // nearest stored noise step
    const steps = M.noise_steps[kind]; return steps.reduce((a, b) => (Math.abs(b - db) < Math.abs(a - db) ? b : a));
  }
  function noiseCol(src, db) {
    const ind = state.bedroom ? "ln" : "lden", shifted = state.bedroom ? db + M.curves.noise.bedroom_db_shift : db;
    const step = pickStep(ind, shifted);
    return { name: NOISE_SRC[src] + "_" + ind + "_ge" + step, db: step, ind };
  }
  const NAN_COL = () => new Float32Array(N).fill(NaN); // missing layer => criterion skipped (O9), never a crash
  const col = (name) => LAY[name] || NAN_COL();
  function buildLayers() {
    const L = { tram_m: col("d_tram_m"), bus_m: col("d_bus_m"), green_m: col("d_green_m") };
    const ft = col("freq_tram_" + state.win), fb = col("freq_bus_" + state.win);
    L.freq = new Float32Array(N); for (let i = 0; i < N; i++) L.freq[i] = (ft[i] || 0) + (fb[i] || 0);
    ["road", "rail", "industry"].forEach((s) => {
      const c = M.curves.noise[s];
      L["noise_" + s] = col(noiseCol(s, c.soft_db).name);
      L["hard_" + s] = col(noiseCol(s, c.hard_db).name);
    });
    return L;
  }

  // ---------- compute + draw ----------
  let result = null, layersNow = null;
  function recompute() {
    layersNow = buildLayers();
    const ready = state.targets.filter((tg) => tg.times && MODES.some((m) => tg.modes[m]));
    result = Score.compute({
      n: N, curves: M.curves, weights: Object.assign({ price: 0 }, state.weights), minScore: state.minScore,
      hardNoise: state.hardNoise, layers: layersNow,
      targets: ready.map((tg) => ({ times: tg.times, idealMin: tg.idealMin, maxMin: tg.maxMin, weight: tg.weight, hard: tg.hard })),
    });
    result.ready = ready;
    draw(); stats(); if (selected != null) renderCard(selected); saveHash();
  }
  function draw() {
    const { score, status } = result;
    for (let i = 0; i < N; i++) {
      const ok = !Number.isNaN(score[i]);
      polys[i].setStyle(ok ? { fillColor: rampColor(score[i]), fillOpacity: 0.78, weight: 0 }
        : state.showRejected ? { fillColor: "#999", fillOpacity: 0.12, weight: 0 } : { fillOpacity: 0, weight: 0 });
    }
  }
  function stats() {
    let ok = 0, hard = 0, low = 0, none = 0;
    for (let i = 0; i < N; i++) { const s = result.status[i]; if (!Number.isNaN(result.score[i])) ok++; else if (s === 1) hard++; else if (s === 2) low++; else none++; }
    $("statline").innerHTML = t("stat_html", { n: ok, total: N, hard, low, none });
  }

  // ---------- hex card ----------
  function rawText(key, i) {
    const L = layersNow, num = (a) => a[i];
    if (key === "tram_stop" || key === "bus_stop" || key === "green") {
      const v = num(key === "tram_stop" ? L.tram_m : key === "bus_stop" ? L.bus_m : L.green_m);
      return Number.isNaN(v) ? t("cardFar") : fmt(v) + " " + t("unitM");
    }
    if (key === "frequency") return fmt(L.freq[i], 1) + " " + t("unitPerH");
    if (key.startsWith("noise_")) {
      const s = key.slice(6), c = noiseCol(s, M.curves.noise[s].soft_db);
      return t("cardNoiseShare", { p: fmt(100 * L["noise_" + s][i]), db: c.db });
    }
    return "";
  }
  function renderCard(i) {
    const el = $("hexCard"); selected = i; el.hidden = false;
    const sc = result.score[i], st = result.status[i];
    let head = "<button class='close' aria-label='" + t("cardClose") + "' id='cardClose'>✕</button><h3>" + t("cardTitle", { id: i }) + "</h3>";
    if (!Number.isNaN(sc)) head += "<div class='total'>" + t("cardScore") + ": " + fmt(sc, 1) + " / 100</div>";
    else head += "<div class='muted'>" + (st === 1 ? t("cardRejectedHard") : st === 2 ? t("cardRejectedLow") : t("cardNoCriteria")) + "</div>";
    let rows = "";
    result.contrib(i).forEach((c) => {
      const label = c.key.startsWith("target") ? (result.ready[+c.key.slice(6)] || {}).name : t("w_" + c.key);
      const raw = c.key.startsWith("target") ? targetRaw(result.ready[+c.key.slice(6)], i) : rawText(c.key, i);
      rows += "<tr><td>" + escapeHtml(label) + "</td><td class='num'>" + raw + "</td><td class='num'>" + fmt(c.score, 2) + "</td><td class='num'>" + c.weight + "</td></tr>";
    });
    let times = "";
    state.targets.forEach((tg) => {
      if (!tg.times) return;
      const parts = MODES.filter((m) => tg.modeTimes[m]).map((m) => t("mode_" + m + "_short") + " " + minText(tg.modeTimes[m][i]));
      times += "<tr><td>" + escapeHtml(tg.name) + "</td><td colspan='3'>" + parts.join(" · ") + "</td></tr>";
    });
    el.innerHTML = head +
      (rows ? "<table><tr class='muted'><td>" + t("cardCriterion") + "</td><td class='num'>" + t("cardRaw") + "</td><td class='num'>" + t("cardPts") + "</td><td class='num'>" + t("cardWeight") + "</td></tr>" + rows + "</table>" : "") +
      (times ? "<h3>" + t("cardTimes") + "</h3><table>" + times + "</table>" : "");
    $("cardClose").onclick = () => { el.hidden = true; selected = null; };
  }
  const minText = (v) => (v === 255 ? t("cardUnreached", { max: M.matrix.cap }) : v + " " + t("unitMin"));
  const targetRaw = (tg, i) => (tg ? minText(tg.times[i]) + " (" + t("cardBest") + ")" : "");
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---------- panel ----------
  function fillSelect(el, items, value) {
    el.innerHTML = ""; items.forEach(([v, label]) => { const o = document.createElement("option"); o.value = v; o.textContent = label; el.appendChild(o); }); el.value = value;
  }
  function renderStatic() {
    fillSelect($("win"), Object.keys(M.windows).map((k) => [k, t("win_" + k)]), state.win);
    fillSelect($("ttype"), ["static", "p50", "p85"].map((k) => [k, t("ttype_" + k)]), state.ttype);
    fillSelect($("rides"), ["unlimited", "max1transfer"].map((k) => [k, t("rides_" + k)]), state.rides);
    fillSelect($("dir"), [["auto", t("dir_auto", { d: t("dir_" + M.default_dir[state.win]).split(" (")[0] })], ["to", t("dir_to")], ["from", t("dir_from")]], state.dir);
    $("ttypeHint").textContent = t("ttypeHint_" + state.ttype);
    $("dirHint").textContent = t("dirHint_" + effDir());
    $("lka").checked = state.lka; $("bedroom").checked = state.bedroom; $("showRejected").checked = state.showRejected;
    $("minScore").value = state.minScore; $("minScoreVal").textContent = state.minScore;
    $("ramp").style.background = "linear-gradient(90deg," + RAMP.map(([p, h]) => h + " " + p * 100 + "%").join(",") + ")";
    $("attrib").innerHTML = t("dataSources") + " " + M.basemap.attribution;
    $("methodVersion").textContent = M.method_version;
    const w = $("weights"); w.innerHTML = "";
    WEIGHT_KEYS.forEach((k) => {
      const row = document.createElement("div"); row.className = "wrow" + (state.weights[k] ? "" : " off");
      row.innerHTML = "<label for='w_" + k + "'>" + t("w_" + k) + "</label><input type='range' id='w_" + k + "' min='0' max='5' step='1' value='" + (state.weights[k] || 0) + "'><span class='mono'>" + (state.weights[k] || 0) + "</span>";
      row.querySelector("input").oninput = (e) => { state.weights[k] = +e.target.value; row.querySelector("span").textContent = e.target.value; row.className = "wrow" + (+e.target.value ? "" : " off"); recompute(); };
      w.appendChild(row);
    });
    const h = $("hardNoise"); h.innerHTML = "";
    ["road", "rail", "industry"].forEach((s) => {
      const c = M.curves.noise[s], col = noiseCol(s, c.hard_db);
      const lab = document.createElement("label"); lab.className = "toggle";
      lab.innerHTML = "<input type='checkbox'" + (state.hardNoise[s] ? " checked" : "") + "><span>" + t("hard_noise", { src: t("w_noise_" + s), db: col.db, share: Math.round(c.hard_max_share * 100) }) + "</span>";
      lab.querySelector("input").onchange = (e) => { state.hardNoise[s] = e.target.checked; recompute(); };
      h.appendChild(lab);
    });
    renderTargets();
  }
  function renderTargets() {
    const box = $("targets"); box.innerHTML = "";
    state.targets.forEach((tg, k) => {
      const d = document.createElement("div"); d.className = "target";
      const modes = MODES.map((m) => "<label><input type='checkbox' data-m='" + m + "'" + (tg.modes[m] ? " checked" : "") + ">" + t("mode_" + m) + "</label>").join("");
      d.innerHTML = "<header><span class='dot' style='background:" + TARGET_COLORS[k % 5] + "'></span><input type='text' value='" + escapeHtml(tg.name) + "' aria-label='name'><button type='button' class='del' title='" + t("tDelete") + "' aria-label='" + t("tDelete") + "'>✕</button></header>" +
        "<div class='modes'>" + modes + "</div>" +
        "<div class='tgrid'><label>" + t("tMaxMin") + "<input type='number' data-f='maxMin' min='5' max='" + M.matrix.cap + "' step='5' value='" + tg.maxMin + "'></label>" +
        "<label>" + t("tIdealMin") + "<input type='number' data-f='idealMin' min='0' max='" + M.matrix.cap + "' step='5' value='" + tg.idealMin + "'></label>" +
        "<label>" + t("tWeight") + "<input type='number' data-f='weight' min='0' max='5' step='1' value='" + tg.weight + "'></label></div>" +
        "<label class='toggle'><input type='checkbox' data-f='hard'" + (tg.hard ? " checked" : "") + ">" + t("tHard") + "</label>" +
        "<div class='tmsg'>" + (tg.loading ? t("tLoading") : tg.error ? t("tFail", { msg: escapeHtml(tg.error) }) : !MODES.some((m) => tg.modes[m]) ? t("tNoMode") : "") + "</div>";
      d.querySelector("input[type=text]").onchange = (e) => { tg.name = e.target.value.slice(0, 40); markerFor(k); saveHash(); if (selected != null) renderCard(selected); };
      d.querySelector(".del").onclick = () => { state.targets.splice(k, 1); drawMarkers(); renderTargets(); recompute(); };
      d.querySelectorAll("[data-m]").forEach((c) => { c.onchange = () => { tg.modes[c.dataset.m] = c.checked; refreshTarget(tg); }; });
      d.querySelectorAll("[data-f]").forEach((c) => {
        c.onchange = () => { const f = c.dataset.f; tg[f] = c.type === "checkbox" ? c.checked : Math.max(0, Math.min(f === "weight" ? 5 : M.matrix.cap, +c.value)); recompute(); };
      });
      box.appendChild(d);
    });
    $("addTarget").disabled = state.targets.length >= M.curves.max_targets;
  }

  // ---------- map ----------
  function nearestHex(lat, lng) {
    let best = -1, bd = Infinity; const kx = Math.cos(lat * Math.PI / 180);
    for (let i = 0; i < N; i++) { const dx = (HEX.c[i][0] - lng) * kx, dy = HEX.c[i][1] - lat, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return Math.sqrt(bd) * 111320 < 400 ? best : -1; // metres; outside the city -> none
  }
  function markerFor(k) { if (markers[k]) markers[k].setTooltipContent(state.targets[k].name); }
  function drawMarkers() {
    markers.forEach((m) => m.remove()); markers = [];
    state.targets.forEach((tg, k) => {
      const [lon, lat] = HEX.c[tg.hex];
      markers.push(L.circleMarker([lat, lon], { radius: 9, color: "#fff", weight: 2, fillColor: TARGET_COLORS[k % 5], fillOpacity: 1, interactive: true })
        .bindTooltip(tg.name, { permanent: false }).addTo(map));
    });
  }
  function setPick(on) {
    pickMode = on; $("map").classList.toggle("picking", on); $("addTarget").classList.toggle("picking", on);
    $("addTarget").textContent = on ? t("addTargetPicking") : t("addTarget");
  }
  function addTargetAt(hex) {
    const tg = newTarget(hex, null, null, null, null, 3, false, state.targets.length);
    state.targets.push(tg); drawMarkers(); renderTargets(); refreshTarget(tg);
  }
  function initMap() {
    map = L.map("map", { zoomControl: true, minZoom: 10, preferCanvas: true });
    if (M.basemap.url) L.tileLayer(M.basemap.url, { attribution: M.basemap.attribution, maxZoom: 19, subdomains: M.basemap.subdomains || "abc" }).addTo(map);
    else map.attributionControl.addAttribution(M.basemap.attribution); // own vector context (drawContext), no third-party tiles
    map.fitBounds(M.bounds);
    const renderer = L.canvas({ padding: 0.3 });
    polys = HEX.p.map((flat, i) => {
      const ring = []; for (let k = 0; k < flat.length; k += 2) ring.push([flat[k + 1], flat[k]]);
      const p = L.polygon(ring, { renderer, stroke: false, fillOpacity: 0 });
      p.on("click", (e) => { if (pickMode) { addTargetAt(i); setPick(false); L.DomEvent.stopPropagation(e); } else renderCard(i); });
      return p.addTo(map);
    });
    map.on("click", (e) => { if (pickMode) { const h = nearestHex(e.latlng.lat, e.latlng.lng); if (h >= 0) addTargetAt(h); setPick(false); } });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setPick(false); });
  }

  // Own vector context from OSM (data/context.json): green areas under the hexagons, roads/rails/water/names above.
  async function drawContext() {
    if (M.basemap.url) return; // real tiles in use
    let c; try { c = await fetch(DATA + "context.json").then((r) => (r.ok ? r.json() : null)); } catch (e) { c = null; }
    if (!c) return;
    map.createPane("ctxGreen").style.zIndex = 380; map.createPane("ctxLines").style.zIndex = 450; map.getPane("ctxLines").style.pointerEvents = "none";
    if (c.green) L.geoJSON(c.green, { pane: "ctxGreen", interactive: false, style: { stroke: false, fillColor: "#4daf4a", fillOpacity: 0.25 } }).addTo(map);
    const rl = L.canvas({ pane: "ctxLines" });
    const lines = (arr, style) => arr.forEach((f) => { const ll = []; for (let i = 0; i < f.length; i += 2) ll.push([f[i + 1], f[i]]); L.polyline(ll, Object.assign({ renderer: rl, interactive: false, lineJoin: "round" }, style)).addTo(map); });
    lines(c.water, { color: "#4f8fd0", weight: 2, opacity: 0.9 });
    lines(c.rail, { color: "#555", weight: 1.2, opacity: 0.8, dashArray: "4 3" });
    lines(c.road, { color: "#777", weight: 0.9, opacity: 0.7 });
    lines(c.tram, { color: "#b2182b", weight: 1.4, opacity: 0.85 });
    c.places.forEach(([name, kind, lon, lat]) => {
      if (kind === "neighbourhood") return; // too dense; suburbs/quarters/cities only
      L.marker([lat, lon], { interactive: false, pane: "ctxLines", icon: L.divIcon({ className: "place place-" + kind, html: "<span>" + escapeHtml(name) + "</span>", iconSize: [0, 0] }) }).addTo(map);
    });
  }

  // ---------- init ----------
  async function init() {
    const loading = $("maploading"); loading.classList.add("visible");
    try {
      const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + " HTTP " + r.status); return r.json(); });
      [M, HEX] = await Promise.all([get(DATA + "manifest.json"), get(DATA + "hex.json")]);
      const layers = await get(DATA + "layers.json");
      N = M.n;
      Object.keys(layers).forEach((k) => { LAY[k] = Float32Array.from(layers[k], (v) => (v == null ? NaN : v)); });
      WEIGHT_KEYS.forEach((k) => { state.weights[k] = M.curves.defaults.weights[k] || 0; });
      loadHash();
      initMap(); renderStatic(); drawMarkers(); drawContext();
      $("win").onchange = (e) => { state.win = e.target.value; renderStatic(); refreshAllTargets(); recompute(); };
      $("ttype").onchange = (e) => { state.ttype = e.target.value; $("ttypeHint").textContent = t("ttypeHint_" + state.ttype); refreshAllTargets(); };
      $("rides").onchange = (e) => { state.rides = e.target.value; refreshAllTargets(); };
      $("lka").onchange = (e) => { state.lka = e.target.checked; refreshAllTargets(); };
      $("dir").onchange = (e) => { state.dir = e.target.value; $("dirHint").textContent = t("dirHint_" + effDir()); refreshAllTargets(); };
      $("bedroom").onchange = (e) => { state.bedroom = e.target.checked; renderStatic(); recompute(); };
      $("showRejected").onchange = (e) => { state.showRejected = e.target.checked; recompute(); };
      $("minScore").oninput = (e) => { state.minScore = +e.target.value; $("minScoreVal").textContent = e.target.value; recompute(); };
      $("addTarget").onclick = () => setPick(!pickMode);
      setLangChangeHandler(() => { renderStatic(); if (selected != null) renderCard(selected); stats(); });
      recompute(); refreshAllTargets();
    } catch (e) {
      $("statline").textContent = t("loadError", { msg: e.message });
      return;
    } finally { loading.classList.remove("visible"); }
  }
  init();
})();
