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
  const WEIGHT_KEYS = ["tram_stop", "bus_stop", "frequency", "green", "canopy", "noise_road", "noise_rail", "noise_industry"];
  const NOISE = ["road", "rail", "industry"];
  let SVC = [], SVC_KEYS = [];   // daily-service meta-categories, set from services/index.json (see init)
  const SOFT_DB = [55, 60, 65];          // comfort limit options (Lden); the penalty grows over L, L+5, L+10 (see score.js noisePenalty)
  const NOISE_SRC = { road: "road", rail: "rail_all", industry: "industry" };
  const RAMP = [[0, "#440154"], [0.25, "#3b528b"], [0.5, "#21918c"], [0.75, "#5ec962"], [1, "#fde725"]];

  const $ = (id) => document.getElementById(id);
  let M = null;          // manifest
  let HEX = null;        // hex.json
  let LAY = {};          // layer arrays (Float32Array, NaN = null)
  let N = 0;
  let map, hexRenderer, polys = [], markers = [], pickMode = false, selected = null;
  const colors = RAMP.map(([p, h]) => [p, [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))]);

  const state = {
    win: "morning", ttype: "static", rides: "unlimited", lka: false, dir: "auto", bedroom: false,
    weights: {}, hardNoise: { road: false, rail: false, industry: false }, noiseCfg: {}, canopy: { hard: false, min: 15 }, canopyOverlay: false, svc: {}, minScore: 0, showRejected: false, targets: [],
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
      wt: state.weights, hn: state.hardNoise, nc: state.noiseCfg, cn: { h: state.canopy.hard ? 1 : 0, m: state.canopy.min }, co: state.canopyOverlay ? 1 : 0,
      sv: Object.fromEntries(Object.entries(state.svc).map(([k, c]) => [k, { m: c.mode, y: c.y, x: c.x, h: c.hard ? 1 : 0 }])), ms: state.minScore, sr: state.showRejected ? 1 : 0,
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
      WEIGHT_KEYS.concat(SVC_KEYS).forEach((k) => { if (s.wt && Number.isFinite(+s.wt[k])) state.weights[k] = Math.max(0, Math.min(5, +s.wt[k])); });
      if (!s.wt || s.wt.canopy == null) state.weights.canopy = 0;   // links made before the canopy criterion existed keep their scores
      if (s.sv && SVX) SVC.forEach((k) => {
        const c = s.sv[k]; if (!c || !state.svc[k]) return;
        if (SVX.levels[c.m]) { state.svc[k].mode = c.m; state.svc[k].y = SVX.levels[c.m].includes(+c.y) ? +c.y : SVX.levels[c.m][0]; }
        if (Number.isFinite(+c.x)) state.svc[k].x = Math.max(1, Math.min(50, Math.round(+c.x)));
        state.svc[k].hard = !!c.h;
      });
      if (s.hn) Object.keys(state.hardNoise).forEach((k) => { state.hardNoise[k] = !!s.hn[k]; });
      if (s.nc) NOISE.forEach((k) => {
        const c = s.nc[k]; if (!c) return;
        if (SOFT_DB.includes(+c.soft)) state.noiseCfg[k].soft = +c.soft;
        if (M.noise_steps.lden.includes(+c.hard)) state.noiseCfg[k].hard = +c.hard;
        if (Number.isFinite(+c.share)) state.noiseCfg[k].share = Math.max(0, Math.min(100, +c.share));
      });
      if (s.cn) { state.canopy.hard = !!s.cn.h; if (s.cn.m != null && Number.isFinite(+s.cn.m)) state.canopy.min = Math.max(0, Math.min(100, +s.cn.m)); }
      state.canopyOverlay = !!s.co;
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
  const modeVec = (vecs, active, m) => vecs[active.indexOf(m)];
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
      tg.lkaN = null;
      if (tg.modes.transit) {   // how much does ŁKA matter for this destination? (compare with the same scenario without/with ŁKA)
        const flip = state.win + "_" + state.ttype + "_" + state.rides + "_" + (state.lka ? "nolka" : "lka");
        const other = await readVector(flip, effDir(), tg.hex);
        if (tok !== tg.token) return;
        const cur = modeVec(vecs, active, "transit"); let n = 0;
        for (let i = 0; i < N; i++) if (cur[i] !== other[i] && Math.abs((cur[i] === 255 ? 99 : cur[i]) - (other[i] === 255 ? 99 : other[i])) >= 2) n++;
        tg.lkaN = n;
      }
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
    const L = { tram_m: col("d_tram_m"), bus_m: col("d_bus_m"), green_m: col("d_green_m"), canopy: col("canopy") };
    const ft = col("freq_tram_" + state.win), fb = col("freq_bus_" + state.win);
    L.freq = new Float32Array(N); for (let i = 0; i < N; i++) L.freq[i] = (ft[i] || 0) + (fb[i] || 0);
    NOISE.forEach((s) => {
      const c = state.noiseCfg[s];
      const sh = [0, 5, 10].map((d) => col(noiseCol(s, c.soft + d).name));   // share of area at/above L, L+5, L+10
      L["noiseShare_" + s] = sh[0];
      L["noise_" + s] = new Float32Array(N);                                  // graded penalty 0..1 (NaN = no data)
      for (let i = 0; i < N; i++) L["noise_" + s][i] = Score.noisePenalty([sh[0][i], sh[1][i], sh[2][i]]);
      L["hard_" + s] = col(noiseCol(s, c.hard).name);
    });
    return L;
  }

  // ---------- daily services (exact R5 counts; one JSON per scenario, see export_services.py) ----------
  let SVX = null;                    // services/index.json (null = services unavailable, section hidden)
  const svcFiles = {}, svcState = {}; // name -> loaded JSON / "loading" | "failed"
  function svcScenario(mode) {
    return mode === "transit" ? "transit_" + state.win + "_" + state.ttype + "_" + (state.lka ? "lka" : "nolka")
      : mode === "car" ? "car_" + state.win : mode;
  }
  function loadSvc(name) {
    if (svcState[name]) return;
    svcState[name] = "loading";
    fetch(DATA + "services/" + name + ".json").then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((j) => { svcFiles[name] = j; svcState[name] = "ok"; }).catch(() => { svcState[name] = "failed"; })
      .then(() => recompute());
  }
  function svcInput() {
    const out = {};
    SVC.forEach((k) => {
      const c = state.svc[k]; if (!c || !(state.weights["svc_" + k] > 0 || c.hard)) return;
      const name = svcScenario(c.mode), f = svcFiles[name];
      if (!f) { loadSvc(name); out[k] = { x: c.x, hard: false, count: NAN_COL() }; return; }   // not loaded yet: skipped until it arrives
      const li = f.levels.indexOf(c.y), arr = li >= 0 && f.c[k] ? f.c[k][li] : null;
      out[k] = { x: c.x, hard: arr ? c.hard : false, count: arr ? Float32Array.from(arr) : NAN_COL() };   // no data: skipped, never a hard reject
    });
    return out;
  }

  // ---------- compute + draw ----------
  let result = null, layersNow = null, svcNow = {};
  function recompute() {
    layersNow = buildLayers();
    const ready = state.targets.filter((tg) => tg.times && MODES.some((m) => tg.modes[m]));
    result = Score.compute({
      n: N, curves: M.curves, weights: Object.assign({ price: 0 }, state.weights), minScore: state.minScore,
      svc: (svcNow = svcInput()), hardNoise: state.hardNoise, canopyHard: { on: state.canopy.hard, min: state.canopy.min / 100 }, hardShare: Object.fromEntries(NOISE.map((k) => [k, state.noiseCfg[k].share / 100])), layers: layersNow,
      targets: ready.map((tg) => ({ times: tg.times, idealMin: tg.idealMin, maxMin: tg.maxMin, weight: tg.weight, hard: tg.hard })),
    });
    result.ready = ready;
    draw(); stats(); if (selected != null) renderCard(selected); saveHash();
    document.querySelectorAll("[data-svcnote]").forEach((el) => {   // a scenario without service data (e.g. not exported) is skipped; say so
      const c = state.svc[el.dataset.svcnote]; el.textContent = c && svcState[svcScenario(c.mode)] === "failed" ? t("svcMissing") : "";
    });
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
    if (key === "canopy") return t("canopyRaw", { p: fmt(100 * L.canopy[i], 1) });
    if (key.startsWith("svc_")) {
      const k = key.slice(4), c = state.svc[k], sv = svcNow[k];
      return sv ? t("svcCard", { n: fmt(sv.count[i]), y: c.y, mode: t("mode_" + c.mode + "_short") }) : "";
    }
    if (key.startsWith("noise_")) {
      const s = key.slice(6), c = noiseCol(s, state.noiseCfg[s].soft);
      return t("cardNoiseShare", { p: fmt(100 * L["noiseShare_" + s][i]), db: c.db, pen: fmt(100 * L["noise_" + s][i]) });
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
    const sliderRow = (k, label) => {
      const row = document.createElement("div"); row.className = "wrow" + (state.weights[k] ? "" : " off");
      row.innerHTML = "<label for='w_" + k + "'>" + label + "</label><input type='range' id='w_" + k + "' min='0' max='5' step='1' value='" + (state.weights[k] || 0) + "'><span class='mono'>" + (state.weights[k] || 0) + "</span>";
      row.querySelector("input").oninput = (e) => { state.weights[k] = +e.target.value; row.querySelector("span").textContent = e.target.value; row.className = "wrow" + (+e.target.value ? "" : " off"); recompute(); };
      return row;
    };
    WEIGHT_KEYS.filter((k) => !k.startsWith("noise_") && k !== "canopy").forEach((k) => w.appendChild(sliderRow(k, t("w_" + k))));
    // noise: one block per source = importance of quiet + comfort limit (soft) + optional requirement (hard, typed %)
    const nb = $("noiseBlocks"); nb.innerHTML = "";
    const ind = state.bedroom ? "Ln" : "Lden", shift = state.bedroom ? M.curves.noise.bedroom_db_shift : 0;
    const dbOpts = (list, cur) => list.map((v) => "<option value='" + v + "'" + (v === cur ? " selected" : "") + ">" + (v + shift) + " dB " + ind + "</option>").join("");
    const mk = (s, parent) => {
      const c = state.noiseCfg[s], box = document.createElement("div"); box.className = "nblock";
      box.appendChild(sliderRow("noise_" + s, t("wq_noise_" + s)));
      const comfort = document.createElement("div"); comfort.className = "nrow";
      comfort.innerHTML = "<label>" + t("noiseComfort") + " <select data-k='soft'>" + dbOpts(SOFT_DB, c.soft) + "</select></label>";
      const hard = document.createElement("div"); hard.className = "nrow";
      hard.innerHTML = "<label class='toggle'><input type='checkbox' data-k='on'" + (state.hardNoise[s] ? " checked" : "") + "><span>" + t("noiseRequire") + "</span></label> " +
        "<select data-k='hard'>" + dbOpts(M.noise_steps.lden, c.hard) + "</select> <span>" + t("noiseMaxShare") + "</span> " +
        "<input type='number' data-k='share' min='0' max='100' step='1' value='" + c.share + "'> %";
      comfort.querySelector("select").onchange = (e) => { c.soft = +e.target.value; recompute(); };
      hard.querySelector("[data-k=on]").onchange = (e) => { state.hardNoise[s] = e.target.checked; recompute(); };
      hard.querySelector("[data-k=hard]").onchange = (e) => { c.hard = +e.target.value; recompute(); };
      hard.querySelector("[data-k=share]").onchange = (e) => { c.share = Math.max(0, Math.min(100, +e.target.value || 0)); e.target.value = c.share; recompute(); };
      box.appendChild(comfort); box.appendChild(hard); parent.appendChild(box);
    };
    mk("road", nb);
    const more = document.createElement("details"); more.className = "nmore"; more.open = !!(state.weights.noise_rail || state.weights.noise_industry || state.hardNoise.rail || state.hardNoise.industry);
    more.innerHTML = "<summary>" + t("noiseMore") + "</summary>"; mk("rail", more); mk("industry", more); nb.appendChild(more);
    renderCanopy(sliderRow);
    renderSvc(sliderRow);
    $("noNoteTargets").hidden = state.targets.length > 0;
    renderTargets();
  }
  // tree canopy: importance + optional requirement "at least X % of the hex under canopy" + map preview toggle
  function renderCanopy(sliderRow) {
    const has = !!(M.canopy && LAY.canopy), box = $("canopyBlock"); box.innerHTML = "";
    document.querySelectorAll("[data-i18n=secCanopy]").forEach((e) => { e.hidden = !has; });
    $("canopyHintP").hidden = !has;
    if (!has) return;
    $("canopyHintP").textContent = t("canopyHint", { full: Math.round(100 * M.curves.canopy.full_share) });
    box.className = "nblock";
    box.appendChild(sliderRow("canopy", t("w_canopy")));
    const hard = document.createElement("div"); hard.className = "nrow";
    hard.innerHTML = "<label class='toggle'><input type='checkbox' data-k='on'" + (state.canopy.hard ? " checked" : "") + "><span>" + t("canopyRequire") + "</span></label> " +
      "<input type='number' data-k='min' min='0' max='100' step='1' value='" + state.canopy.min + "'> %";
    hard.querySelector("[data-k=on]").onchange = (e) => { state.canopy.hard = e.target.checked; recompute(); };
    hard.querySelector("[data-k=min]").onchange = (e) => { state.canopy.min = Math.max(0, Math.min(100, +e.target.value || 0)); e.target.value = state.canopy.min; recompute(); };
    box.appendChild(hard);
    const ov = M.canopy.overlay;
    if (ov) {
      const pv = document.createElement("div"); pv.className = "nrow";
      pv.innerHTML = "<label class='toggle'><input type='checkbox' data-k='ov'" + (state.canopyOverlay ? " checked" : "") + "><span>" + t("canopyOverlay") + "</span></label>";
      pv.querySelector("input").onchange = (e) => { state.canopyOverlay = e.target.checked; applyCanopyOverlay(); saveHash(); };
      box.appendChild(pv);
    }
    const note = document.createElement("p"); note.className = "hint"; note.textContent = t("canopyNote", { year: M.canopy.year, h: M.canopy.height_m }); box.appendChild(note);
  }
  let canopyLayer = null;
  function applyCanopyOverlay() {
    const ov = M.canopy && M.canopy.overlay; if (!map || !ov) return;
    if (!map.getPane("canopyPane")) { map.createPane("canopyPane").style.zIndex = 405; map.getPane("canopyPane").style.pointerEvents = "none"; }
    if (!canopyLayer) canopyLayer = L.imageOverlay(DATA + ov.url, ov.bounds, { pane: "canopyPane", opacity: 0.85, interactive: false });
    if (state.canopyOverlay) canopyLayer.addTo(map); else map.removeLayer(canopyLayer);
  }
  // services: one block per criterion = importance + mode + "at least X within Y min" + optional requirement
  function renderSvc(sliderRow) {
    const box = $("svcBlocks"); box.innerHTML = "";
    if (!SVX) { document.querySelectorAll("[data-i18n=secServices],[data-i18n=servicesHint]").forEach((e) => { e.hidden = true; }); return; }
    document.querySelectorAll("[data-i18n=secServices],[data-i18n=servicesHint]").forEach((e) => { e.hidden = false; });
    SVC.forEach((k) => {
      const c = state.svc[k], b = document.createElement("div"); b.className = "nblock";
      b.appendChild(sliderRow("svc_" + k, t("w_svc_" + k)));
      const comp = document.createElement("div"); comp.className = "hint"; comp.textContent = SVX.composition[k].map((x) => t("svcType_" + x)).join(", ");
      b.appendChild(comp);
      const row = document.createElement("div"); row.className = "nrow";
      const modes = Object.keys(SVX.levels).map((m) => "<option value='" + m + "'" + (m === c.mode ? " selected" : "") + ">" + t("mode_" + m) + "</option>").join("");
      const lv = (m) => SVX.levels[m].map((y) => "<option value='" + y + "'" + (y === c.y ? " selected" : "") + ">" + y + " " + t("unitMin") + "</option>").join("");
      row.innerHTML = "<span>" + t("svcAtLeast") + "</span> <input type='number' data-k='x' min='1' max='50' step='1' value='" + c.x + "'> " +
        "<span>" + t("svcWithin") + "</span> <select data-k='y'>" + lv(c.mode) + "</select> <select data-k='mode'>" + modes + "</select>";
      const req = document.createElement("div"); req.className = "nrow";
      req.innerHTML = "<label class='toggle'><input type='checkbox' data-k='hard'" + (c.hard ? " checked" : "") + "><span>" + t("svcRequire") + "</span></label>";
      row.querySelector("[data-k=x]").onchange = (e) => { c.x = Math.max(1, Math.min(50, Math.round(+e.target.value) || 1)); e.target.value = c.x; recompute(); };
      row.querySelector("[data-k=y]").onchange = (e) => { c.y = +e.target.value; recompute(); };
      row.querySelector("[data-k=mode]").onchange = (e) => {
        c.mode = e.target.value; const L = SVX.levels[c.mode]; if (!L.includes(c.y)) c.y = L.reduce((a, q) => (Math.abs(q - c.y) < Math.abs(a - c.y) ? q : a));
        renderSvc(sliderRow); recompute();
      };
      req.querySelector("input").onchange = (e) => { c.hard = e.target.checked; recompute(); };
      const note = document.createElement("div"); note.className = "tmsg"; note.dataset.svcnote = k;
      b.appendChild(row); b.appendChild(req); b.appendChild(note); box.appendChild(b);
    });
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
        "<div class='tmsg'>" + (tg.lkaN != null && !tg.loading ? t("lkaEffect", { n: tg.lkaN, total: N }) + " " : "") + (tg.loading ? t("tLoading") : tg.error ? t("tFail", { msg: escapeHtml(tg.error) }) : !MODES.some((m) => tg.modes[m]) ? t("tNoMode") : "") + "</div>";
      d.querySelector("input[type=text]").onchange = (e) => { tg.name = e.target.value.slice(0, 40); markerFor(k); saveHash(); if (selected != null) renderCard(selected); };
      d.querySelector(".del").onclick = () => { state.targets.splice(k, 1); drawMarkers(); renderTargets(); recompute(); };
      d.querySelectorAll("[data-m]").forEach((c) => { c.onchange = () => { tg.modes[c.dataset.m] = c.checked; refreshTarget(tg); }; });
      d.querySelectorAll("[data-f]").forEach((c) => {
        c.onchange = () => { const f = c.dataset.f; tg[f] = c.type === "checkbox" ? c.checked : Math.max(0, Math.min(f === "weight" ? 5 : M.matrix.cap, +c.value)); recompute(); };
      });
      box.appendChild(d);
    });
    $("addTarget").disabled = state.targets.length >= M.curves.max_targets;
    $("noNoteTargets").hidden = state.targets.length > 0;
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
      markers.push(L.circleMarker([lat, lon], { renderer: hexRenderer, radius: 9, color: "#fff", weight: 2, fillColor: TARGET_COLORS[k % 5], fillOpacity: 1, interactive: true })
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
    const renderer = hexRenderer = L.canvas({ padding: 0.3 });   // markers must share it: a second canvas on top would swallow the hex clicks
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
      if (!M.canopy) delete LAY.canopy;   // a layer without its method block (year, version) is not used
      WEIGHT_KEYS.forEach((k) => { state.weights[k] = M.curves.defaults.weights[k] || 0; });
      if (M.curves.canopy) state.canopy.min = Math.round(M.curves.canopy.default_hard_min * 100);
      try { SVX = await fetch(DATA + "services/index.json").then((r) => (r.ok ? r.json() : null)); } catch (e) { SVX = null; }
      if (SVX) { SVC = SVX.criteria; SVC_KEYS = SVC.map((k) => "svc_" + k); }
      if (SVX) SVC.forEach((k) => { const d = SVX.defaults[k]; state.svc[k] = { mode: d.mode, y: d.y, x: d.x, hard: false }; state.weights["svc_" + k] = 0; });
      NOISE.forEach((k) => { const c = M.curves.noise[k]; state.noiseCfg[k] = { soft: c.soft_db, hard: c.hard_db, share: Math.round(c.hard_max_share * 100) }; });
      loadHash();
      initMap(); renderStatic(); drawMarkers(); drawContext(); applyCanopyOverlay();
      $("win").onchange = (e) => { state.win = e.target.value; renderStatic(); refreshAllTargets(); recompute(); };
      $("ttype").onchange = (e) => { state.ttype = e.target.value; $("ttypeHint").textContent = t("ttypeHint_" + state.ttype); refreshAllTargets(); recompute(); };
      $("rides").onchange = (e) => { state.rides = e.target.value; refreshAllTargets(); };
      $("lka").onchange = (e) => { state.lka = e.target.checked; refreshAllTargets(); recompute(); };
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
