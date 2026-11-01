"use strict";

// Lodz hour by hour: hex map of "places reachable within 30 min by public transport" per departure hour (06-22) and month.
// Data: data/counts.bin (uint16 [month][meta][hour][hex]), data/hex.geojson (feature i = column i), data/manifest.json.
// Pipeline and method: easy-R5/tools/lodz_hourly_seasons.
(function () {
  const MONTH_VARS = ["--c-aug", "--c-sep", "--c-oct"];
  // value ramps; the dark variant is lifted so the last blues stay visible on the inverted OSM tiles
  const RAMP_DARK = ["#ffffcc", "#c7e9b4", "#7fcdbb", "#41b6c4", "#3190d0", "#3a5cc4"];
  const RAMP_LIGHT = ["#ffffcc", "#c7e9b4", "#7fcdbb", "#41b6c4", "#2c7fb8", "#253494"];
  // difference: red = fewer places than the reference month, blue = more; neutral grey in the middle
  const DIFF_RAMP = ["#b2182b", "#ef8a62", "#fddbc7", "#c9cdd2", "#d1e5f0", "#67a9cf", "#2166ac"];
  const DIFF_MULT = [-0.5, -0.2, -0.04, 0.04, 0.2, 0.5];
  const SPEEDS = [1, 2, 4];
  const STEP_MS = 1100;
  const HEIGHT_M = 1500;                 // bar height (m) of a hex at the reference value, times the height slider
  const GROW_MS = 1300;
  const UI_KEY = "mapyAnalizyHexUi";
  const isPhone = () => matchMedia("(max-width: 700px)").matches;

  const isDark = () => document.documentElement.getAttribute("data-theme") !== "light";
  const $ = (id) => document.getElementById(id);

  let man, counts, N, H, M, C;          // manifest, data, hexes, hours, months, meta count
  let map, hoverId = -1;
  let target, shown, colors, lastH, lastC, grow, delay;   // per hex: bar height 0..1.2, colour, last pushed height (m) / colour, grow 0..1, wave delay 0..1
  let growRaf = 0, tweenRaf = 0, loadTimer = 0;
  const state = { month: 2, cat: "all", view: "diff", base: 0, hour: 2, playing: false, speed: 0, three: false, opacity: 0.82, hscale: 1 };
  let timer = null;
  const scaleCache = {};

  // ---- data access ----
  const fmtHour = (h) => String(h).padStart(2, "0") + ":00";
  const frameOffset = (m, c, h) => (((m * C) + c) * H + h) * N;
  function frame(m, cat, h, out) {
    if (cat !== "all") return counts.subarray(frameOffset(m, man.meta.indexOf(cat), h), frameOffset(m, man.meta.indexOf(cat), h) + N);
    out.fill(0);
    for (let c = 0; c < C; c++) { const o = frameOffset(m, c, h); for (let i = 0; i < N; i++) out[i] += counts[o + i]; }
    return out;
  }
  const bufs = [new Int32Array(0), new Int32Array(0)];
  function currentFrames() {
    const a = frame(state.month, state.cat, state.hour, bufs[0]);
    const b = state.view === "diff" ? frame(state.base, state.cat, state.hour, bufs[1]) : null;
    return [a, b];
  }
  const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

  function scaleFor(cat, view) {
    const key = cat + "|" + view;
    if (scaleCache[key]) return scaleCache[key];
    const tmp = new Int32Array(N);
    let s;
    if (view === "values") {
      const vals = [];
      for (let m = 0; m < M; m++) for (let h = 0; h < H; h++) { const f = frame(m, cat, h, tmp); for (let i = 0; i < N; i++) if (f[i] > 0) vals.push(f[i]); }
      vals.sort((x, y) => x - y);
      const br = [0.1, 0.3, 0.5, 0.7, 0.9].map((q) => quantile(vals, q));
      for (let i = 1; i < br.length; i++) br[i] = Math.max(br[i], br[i - 1] + 1);
      s = { breaks: br, ref: Math.max(1, quantile(vals, 0.99)) };
    } else {
      const d = [], tmp2 = new Int32Array(N);
      for (let m = 0; m < M; m++) for (let b = m + 1; b < M; b++) for (let h = 0; h < H; h++) {
        const fa = frame(m, cat, h, tmp).slice(), fb = frame(b, cat, h, tmp2);
        for (let i = 0; i < N; i++) { const v = Math.abs(fa[i] - fb[i]); if (v > 0) d.push(v); }
      }
      d.sort((x, y) => x - y);
      const L = Math.max(4, d.length ? quantile(d, 0.98) : 4);
      s = { edges: DIFF_MULT.map((k) => k * L), ref: L };
    }
    return (scaleCache[key] = s);
  }

  function classOf(v, s, view) {
    if (view === "values") {
      if (v <= 0) return -1;
      const br = s.breaks;
      for (let i = 0; i < br.length; i++) if (v <= br[i]) return i;
      return br.length;
    }
    const e = s.edges;
    for (let i = 0; i < e.length; i++) if (v <= e[i]) return i;
    return e.length;
  }
  const colorOf = (cls, view) => (view === "values" ? (isDark() ? RAMP_DARK : RAMP_LIGHT)[cls] : DIFF_RAMP[cls]);

  // ---- rendering ----
  const fmtNum = (v) => (Math.round(v * 10) / 10).toString();
  const signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmtNum(Math.abs(v));

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const TRANSPARENT = "rgba(0,0,0,0)";

  function computeTargets() {
    const [a, b] = currentFrames();
    const s = scaleFor(state.cat, state.view);
    for (let i = 0; i < N; i++) {
      const v = b ? a[i] - b[i] : a[i];
      const cls = classOf(v, s, state.view);
      const none = cls < 0 || (b && v === 0);   // nothing in reach, or exactly no change between the two months
      colors[i] = none ? TRANSPARENT : colorOf(cls, state.view);
      target[i] = none ? 0 : state.view === "values" ? Math.sqrt(Math.min(1.2, v / s.ref)) : Math.min(1.2, Math.abs(v) / s.ref);
    }
  }
  // push only what changed to the GPU (feature-state), heights = target * slider * per-hex grow
  function pushStates() {
    const k = HEIGHT_M * state.hscale;
    for (let i = 0; i < N; i++) {
      const h = Math.round(shown[i] * grow[i] * k), c = colors[i];
      if (h === lastH[i] && c === lastC[i]) continue;
      lastH[i] = h; lastC[i] = c;
      map.setFeatureState({ source: "hex", id: i }, { c, h });
    }
  }
  // in 3D a change of hour/month/category slides every bar to its new height instead of jumping
  function tweenHeights() {
    cancelAnimationFrame(tweenRaf);
    if (!state.three || matchMedia("(prefers-reduced-motion: reduce)").matches) { shown.set(target); pushStates(); return; }
    const from = Float32Array.from(shown), t0 = performance.now(), dur = Math.min(550, (STEP_MS / SPEEDS[state.speed]) * 0.9);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      for (let i = 0; i < N; i++) shown[i] = from[i] + (target[i] - from[i]) * e;
      pushStates();
      if (p < 1) tweenRaf = requestAnimationFrame(step);
    };
    tweenRaf = requestAnimationFrame(step);
  }

  // extrusions ignore colour alpha, so hexes with no place in reach are cut out with a layer filter (only re-set when the set changes)
  let emptyKey = null;
  function filterEmpty() {
    const ids = [];
    for (let i = 0; i < N; i++) if (colors[i] === TRANSPARENT) ids.push(i);
    const key = ids.join(",");
    if (key === emptyKey) return;
    emptyKey = key;
    map.setFilter("hex", ids.length ? ["!", ["in", ["get", "hex_id"], ["literal", ids]]] : null);
  }
  function renderMap() {
    computeTargets(); filterEmpty(); tweenHeights();
    if (hoverId >= 0) showTip();
  }

  // 2D <-> 3D: the map tilts while the hexes grow out of the ground in a wave from the centre (and sink back the same way)
  function setThree(on) {
    state.three = on;
    cancelAnimationFrame(tweenRaf); shown.set(target);
    map.easeTo({ pitch: on ? 58 : 0, bearing: on ? -20 : 0, duration: 1100 });
    cancelAnimationFrame(growRaf);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, t0 = performance.now(), dur = reduce ? 1 : GROW_MS;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      for (let i = 0; i < N; i++) {
        grow[i] = on ? easeOut(clamp01((p - delay[i] * 0.45) / 0.55)) : 1 - easeOut(clamp01((p - (1 - delay[i]) * 0.45) / 0.55));
      }
      pushStates();
      if (p < 1) growRaf = requestAnimationFrame(step);
    };
    growRaf = requestAnimationFrame(step);
    buildControls(); legend();
  }

  function tipHtml(id) {
    const [a, b] = currentFrames();
    const mName = (k) => t("monthSeg")[man.months[k]];
    let h = "<div>" + t("tipHex", { id }) + "</div><div>" + t("tipValue", { m: mName(state.month), v: "<b>" + a[id] + "</b>" }) + "</div>";
    if (b) h += "<div>" + t("tipValue", { m: mName(state.base), v: "<b>" + b[id] + "</b>" }) + "</div><div>" + t("tipDiff", { v: "<b>" + signed(a[id] - b[id]) + "</b>" }) + "</div>";
    return h;
  }
  let tipPt = { x: 0, y: 0 };
  function showTip(pt) {
    if (pt) tipPt = pt;
    const el = $("tip");
    el.innerHTML = tipHtml(hoverId);
    el.style.left = tipPt.x + "px"; el.style.top = tipPt.y + "px"; el.hidden = false;
  }
  function hideTip() { hoverId = -1; $("tip").hidden = true; }
  function pick(e) {
    const f = map.queryRenderedFeatures(e.point, { layers: ["hex"] })[0];
    const id = f ? f.properties.hex_id : -1;
    if (id < 0) return hideTip();
    hoverId = id; showTip(e.point);
  }

  function legend() {
    const s = scaleFor(state.cat, state.view), el = $("legend");
    const rows = [];
    if (state.view === "values") {
      const br = s.breaks;
      let lo = 1;
      br.forEach((hi, i) => { rows.push([colorOf(i, "values"), lo === hi ? "" + lo : lo + "–" + hi]); lo = hi + 1; });
      rows.push([colorOf(br.length, "values"), "> " + br[br.length - 1]]);
    } else {
      const e = s.edges, f = fmtNum;
      rows.push([DIFF_RAMP[0], "< " + signed(e[0])]);
      for (let i = 1; i < e.length; i++) rows.push([DIFF_RAMP[i], signed(e[i - 1]) + " … " + signed(e[i])]);
      rows.push([DIFF_RAMP[e.length], "> " + signed(e[e.length - 1])]);
      rows[3][1] = "± " + f(e[3]);
    }
    el.innerHTML = rows.map((r) => '<div class="legend-row"><i style="background:' + r[0] + '"></i><span>' + r[1] + "</span></div>").join("");
    $("legendTitle").textContent = t(state.view === "values" ? "legendValues" : "legendDiff");
    $("legendNote").textContent = t(state.view === "values" ? "legendNoteValues" : "legendNoteDiff") + (state.three ? " " + t(state.view === "values" ? "legendNote3dValues" : "legendNote3dDiff") : "");
  }

  // population-weighted mean by hour for a category, from the manifest
  function meanSeries(mIdx, cat) {
    const pm = man.pop_weighted_mean[man.months[mIdx]];
    return man.hours.map((_, h) => (cat === "all" ? man.meta.reduce((s, k) => s + pm[k][h], 0) : pm[cat][h]));
  }

  function renderChart() {
    const W = 300, Hh = 140, L = 32, R = 8, T = 8, B = 20, svg = $("chartSvg");
    const series = [];
    if (state.view === "values") for (let m = 0; m < M; m++) series.push({ m, y: meanSeries(m, state.cat), dim: m !== state.month });
    else { const a = meanSeries(state.month, state.cat), b = meanSeries(state.base, state.cat); series.push({ m: state.month, y: a.map((v, i) => v - b[i]) }); }
    const all = series.flatMap((s) => s.y);
    let lo = Math.min(...all), hi = Math.max(...all);
    if (state.view === "diff") { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const pad = (hi - lo) * 0.12 || 1;
    lo -= pad; hi += pad;
    const x = (i) => L + (i / (H - 1)) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (Hh - T - B);
    let g = "";
    for (let k = 0; k <= 3; k++) {
      const v = lo + ((hi - lo) * k) / 3;
      g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 4) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + Math.round(v * (state.view === "diff" ? 10 : 1)) / (state.view === "diff" ? 10 : 1) + "</text>";
    }
    man.hours.forEach((hr, i) => { if ((hr - 6) % 3 === 0) g += '<text x="' + x(i) + '" y="' + (Hh - 5) + '" text-anchor="middle">' + hr + "</text>"; });
    if (state.view === "diff") g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>';
    series.forEach((s) => {
      const pts = s.y.map((v, i) => x(i).toFixed(1) + "," + y(v).toFixed(1)).join(" ");
      g += '<polyline class="line' + (s.dim ? " dim" : "") + '" points="' + pts + '" style="stroke:var(' + MONTH_VARS[s.m] + ')"/>';
    });
    g += '<line class="cursor" x1="' + x(state.hour) + '" x2="' + x(state.hour) + '" y1="' + T + '" y2="' + (Hh - B) + '"/>';
    series.forEach((s) => { g += '<circle cx="' + x(state.hour) + '" cy="' + y(s.y[state.hour]) + '" r="3" fill="var(' + MONTH_VARS[s.m] + ')" stroke="none"/>'; });
    svg.innerHTML = g;
    svg.dataset.x0 = L; svg.dataset.x1 = W - R;
    const mn = t("monthSeg");
    $("chartTitle").textContent = state.view === "values" ? t("chartValues") : t("chartDiff", { a: mn[man.months[state.month]], b: mn[man.months[state.base]] });
    $("chartLegend").innerHTML = state.view === "values"
      ? man.months.map((m, i) => '<span style="--c:var(' + MONTH_VARS[i] + ')">' + mn[m] + "</span>").join("")
      : '<span style="--c:var(' + MONTH_VARS[state.month] + ')">' + mn[man.months[state.month]] + " − " + mn[man.months[state.base]] + "</span>";
  }

  function renderPill() {
    $("pillClock").textContent = fmtHour(man.hours[state.hour]) + "–" + fmtHour(man.hours[state.hour] + 1);
    const mn = t("monthSeg"), cur = meanSeries(state.month, state.cat)[state.hour];
    $("pillMonth").textContent = t("monthFull")[man.months[state.month]];
    if (state.view === "values") $("pillStat").textContent = t("statMean", { v: fmtNum(cur) });
    else $("pillStat").textContent = t("statDiff", { v: signed(cur - meanSeries(state.base, state.cat)[state.hour]), m: t("monthGen")[man.months[state.base]] });
  }

  function buildControls() {
    const mn = t("monthSeg"), cats = t("cat");
    const seg = (id, items, cur, onPick) => {
      const el = $(id); el.innerHTML = "";
      items.forEach(([key, label]) => {
        const b = document.createElement("button"); b.type = "button"; b.textContent = label;
        b.setAttribute("aria-pressed", String(key === cur));
        b.addEventListener("click", () => onPick(key)); el.appendChild(b);
      });
    };
    seg("monthSeg", man.months.map((m, i) => [i, mn[m]]), state.month, (i) => { state.month = i; if (state.base === i) state.base = (i + 1) % M; update(); });
    seg("catChips", ["all"].concat(man.meta).map((k) => [k, cats[k]]), state.cat, (k) => { state.cat = k; update(); });
    seg("viewSeg", [["values", t("viewValues")], ["diff", t("viewDiff")]], state.view, (v) => { state.view = v; update(); });
    seg("baseSeg", man.months.map((m, i) => [i, mn[m]]).filter(([i]) => i !== state.month), state.base, (i) => { state.base = i; update(); });
    $("baseRow").hidden = state.view !== "diff";
    seg("modeSeg", [[false, "2D"], [true, "3D"]], state.three, (v) => { if (v !== state.three) setThree(v); });
    $("heightRow").hidden = !state.three;
    $("btn3d").setAttribute("aria-pressed", String(state.three));
  }

  function update() { buildControls(); legend(); renderMap(); renderChart(); renderPill(); }
  function setHour(h) { state.hour = Math.max(0, Math.min(H - 1, h)); $("hourSlider").value = state.hour; renderMap(); renderChart(); renderPill(); }

  // ---- player ----
  function play(on) {
    state.playing = on;
    $("playIcon").hidden = on; $("pauseIcon").hidden = !on;
    $("playBtn").setAttribute("aria-label", t(on ? "pauseAria" : "playAria"));
    clearInterval(timer);
    if (on) timer = setInterval(() => setHour((state.hour + 1) % H), STEP_MS / SPEEDS[state.speed]);
  }

  function bindUi() {
    $("playBtn").addEventListener("click", () => play(!state.playing));
    $("hourSlider").addEventListener("input", (e) => setHour(+e.target.value));
    $("speedBtn").addEventListener("click", () => { state.speed = (state.speed + 1) % SPEEDS.length; $("speedBtn").textContent = SPEEDS[state.speed] + "×"; if (state.playing) play(true); });
    $("chartSvg").addEventListener("click", (e) => {
      const r = e.currentTarget.getBoundingClientRect(), k = 300 / r.width;
      const x0 = +e.currentTarget.dataset.x0, x1 = +e.currentTarget.dataset.x1;
      setHour(Math.round((((e.clientX - r.left) * k - x0) / (x1 - x0)) * (H - 1)));
    });
    document.addEventListener("keydown", (e) => {
      if (/^(BUTTON|INPUT|SELECT|A)$/.test(e.target.tagName)) return;
      if (e.key === " ") { e.preventDefault(); play(!state.playing); }
      else if (e.key === "ArrowRight") setHour(state.hour + 1);
      else if (e.key === "ArrowLeft") setHour(state.hour - 1);
    });
    // collapsible islands, remembered per browser (desktop); phone has one bottom sheet instead
    let ui = {};
    try { ui = JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { /* private mode */ }
    const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* private mode */ } };
    const setPanel = (closed) => { document.body.classList.toggle("panel-closed", closed); $("panelToggle").setAttribute("aria-expanded", String(!closed)); ui.panelClosed = closed; saveUi(); };
    const setChart = (closed) => { document.body.classList.toggle("chart-closed", closed); ui.chartClosed = closed; saveUi(); };
    setPanel(!!ui.panelClosed); setChart(!!ui.chartClosed);
    $("panelToggle").addEventListener("click", () => setPanel(false));
    $("panelHide").addEventListener("click", () => setPanel(true));
    $("chartToggle").addEventListener("click", () => setChart(false));
    $("chartHide").addEventListener("click", () => setChart(true));
    $("grab").addEventListener("click", () => { const o = document.body.classList.toggle("sheet-open"); $("grab").setAttribute("aria-expanded", String(o)); map.easeTo({ padding: { bottom: o ? $("sheet").offsetHeight : 0 }, duration: 400 }); });

    $("zoomIn").addEventListener("click", () => map.zoomIn());
    $("zoomOut").addEventListener("click", () => map.zoomOut());
    $("btn3d").addEventListener("click", () => setThree(!state.three));
    $("opacitySlider").addEventListener("input", (e) => {
      state.opacity = +e.target.value / 100; $("opacityVal").textContent = e.target.value + "%";
      map.setPaintProperty("hex", "fill-extrusion-opacity", state.opacity);
    });
    $("heightSlider").addEventListener("input", (e) => {
      state.hscale = +e.target.value / 100; $("heightVal").textContent = "×" + state.hscale.toFixed(1).replace(".", ",");
      pushStates();
    });

    $("themeToggleBtn").addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("mapyAnalizyTheme", next); } catch (e) { /* private mode */ }
      basemapTheme(); update();
    });
    setLangChangeHandler(() => { play(state.playing); update(); });
  }

  // dark mode = inverted OSM raster (brightness min/max swapped), like the CSS filter used before on the Leaflet page
  function basemapTheme() {
    const dark = isDark(), set = (k, v) => map.setPaintProperty("osm", k, v);
    set("raster-brightness-min", dark ? 0.86 : 0); set("raster-brightness-max", dark ? 0.04 : 1);
    map.setPaintProperty("border", "line-color", dark ? "#ffffff" : "#000000");
    set("raster-hue-rotate", dark ? 180 : 0); set("raster-saturation", dark ? -0.7 : 0); set("raster-contrast", dark ? -0.1 : 0);
  }

  // outline of the hex grid: edges that belong to exactly one hex = the dissolved boundary (outer edge and holes)
  function outline(geo) {
    const key = (p) => p[0].toFixed(4) + "," + p[1].toFixed(4), edges = new Map();
    for (const f of geo.features) {
      const r = f.geometry.coordinates[0];
      for (let j = 0; j < r.length - 1; j++) {
        const ka = key(r[j]), kb = key(r[j + 1]), k = ka < kb ? ka + "|" + kb : kb + "|" + ka, e = edges.get(k);
        if (e) e.n++; else edges.set(k, { n: 1, a: r[j], b: r[j + 1] });
      }
    }
    return { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: [...edges.values()].filter((e) => e.n === 1).map((e) => [e.a, e.b]) } };
  }

  // ---- loading screen: progress bar + one-liners that swap every ~2.4 s ----
  async function fetchBuf(url, onChunk) {
    const r = await fetch(url), total = +r.headers.get("content-length") || 0;
    if (!r.body || !total) { const b = await r.arrayBuffer(); onChunk(1, 1); return b; }
    const rd = r.body.getReader(), parts = [];
    let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onChunk(got, total); }
    return new Blob(parts).arrayBuffer();
  }
  function loadProgress(p) { $("loadBar").style.width = p + "%"; $("loadPct").textContent = Math.round(p) + "%"; }
  function startLoader() {
    const msgs = t("loadMsgs"), el = $("loadMsg");
    let i = 0;
    el.textContent = msgs[0];
    loadTimer = setInterval(() => {
      el.classList.add("out");
      setTimeout(() => { i = (i + 1) % msgs.length; el.textContent = msgs[i]; el.classList.remove("out"); }, 350);
    }, 2400);
  }
  function endLoader() {
    clearInterval(loadTimer); loadProgress(100);
    setTimeout(() => $("mapLoading").classList.add("hidden"), 250);
  }

  // ---- start ----
  async function init() {
    startLoader();
    const frac = [0, 0];
    const bump = (k) => (got, total) => { frac[k] = Math.min(1, got / total); loadProgress(((frac[0] * 2.2 + frac[1] * 1.6) / 3.8) * 55); };
    const [m, buf, geo] = await Promise.all([
      fetch("data/manifest.json").then((r) => r.json()),
      fetchBuf("data/counts.bin", bump(0)),
      fetchBuf("data/hex.geojson", bump(1)).then((b) => JSON.parse(new TextDecoder().decode(b))),
    ]);
    loadProgress(60);
    man = m; N = m.hexes; H = m.hours.length; M = m.months.length; C = m.meta.length;
    counts = new Uint16Array(buf);
    if (counts.length !== M * C * H * N || geo.features.length !== N) throw new Error("data size mismatch");
    bufs[0] = new Int32Array(N); bufs[1] = new Int32Array(N);
    target = new Float32Array(N); shown = new Float32Array(N); colors = new Array(N).fill(TRANSPARENT); grow = new Float32Array(N);
    lastH = new Int32Array(N).fill(-1); lastC = new Array(N).fill(null); delay = new Float32Array(N);

    // hex centroids -> wave delay by distance from the middle of the extent, plus the bounds for the first view
    const cen = geo.features.map((f) => { const r = f.geometry.coordinates[0]; return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]; });
    const xs = cen.map((c) => c[0]), ys = cen.map((c) => c[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const kx = Math.cos(((y0 + y1) / 2) * Math.PI / 180), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const dist = cen.map((c) => Math.hypot((c[0] - mx) * kx, c[1] - my)), dmax = Math.max(...dist);
    dist.forEach((d, i) => { delay[i] = d / dmax; });

    const phone = isPhone();
    map = new maplibregl.Map({
      container: "map", attributionControl: false, maxPitch: 75, dragRotate: true, pitchWithRotate: true,
      bounds: [[x0, y0], [x1, y1]], fitBoundsOptions: { padding: { top: 70, bottom: phone ? 220 : 90, left: phone ? 10 : 330, right: 10 } },
      style: { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19 } }, layers: [{ id: "osm", type: "raster", source: "osm" }] },
    });
    await new Promise((res) => map.once("load", res));
    loadProgress(80);
    map.addSource("hex", { type: "geojson", data: geo, promoteId: "hex_id" });
    map.addLayer({ id: "hex", type: "fill-extrusion", source: "hex", paint: {
      "fill-extrusion-color": ["to-color", ["coalesce", ["feature-state", "c"], TRANSPARENT]],
      "fill-extrusion-height": ["to-number", ["coalesce", ["feature-state", "h"], 0]],
      "fill-extrusion-base": 0, "fill-extrusion-opacity": state.opacity,
    } });
    map.addSource("border", { type: "geojson", data: outline(geo) });
    map.addLayer({ id: "border", type: "line", source: "border", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": 2, "line-opacity": 0.9, "line-color": "#ffffff" } });
    basemapTheme();
    map.on("mousemove", pick); map.on("click", pick);
    map.getCanvas().addEventListener("mouseleave", hideTip);

    $("hourSlider").value = state.hour;
    $("speedBtn").textContent = SPEEDS[state.speed] + "×";
    bindUi();
    update();
    loadProgress(92);
    await Promise.race([new Promise((res) => map.once("idle", res)), new Promise((res) => setTimeout(res, 8000))]);
    endLoader();
    setTimeout(() => setThree(true), 500);   // opens in 3D (October minus August): the hexes grow in once the map is up
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => { console.error(e); clearInterval(loadTimer); $("loadMsg").textContent = t("loadError"); });
  });
})();
