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
  const FILL_OPACITY = 0.82;

  const isDark = () => document.documentElement.getAttribute("data-theme") !== "light";
  const $ = (id) => document.getElementById(id);

  let man, counts, N, H, M, C;          // manifest, data, hexes, hours, months, meta count
  let layers = [], lastClass = [], map, tip, hoverId = -1;
  const state = { month: 1, cat: "all", view: "values", base: 0, hour: 2, playing: false, speed: 0 };
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
      s = { breaks: br };
    } else {
      const d = [], tmp2 = new Int32Array(N);
      for (let m = 0; m < M; m++) for (let b = m + 1; b < M; b++) for (let h = 0; h < H; h++) {
        const fa = frame(m, cat, h, tmp).slice(), fb = frame(b, cat, h, tmp2);
        for (let i = 0; i < N; i++) { const v = Math.abs(fa[i] - fb[i]); if (v > 0) d.push(v); }
      }
      d.sort((x, y) => x - y);
      const L = Math.max(4, d.length ? quantile(d, 0.98) : 4);
      s = { edges: DIFF_MULT.map((k) => k * L) };
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

  function renderMap() {
    const [a, b] = currentFrames();
    const s = scaleFor(state.cat, state.view);
    for (let i = 0; i < N; i++) {
      const v = b ? a[i] - b[i] : a[i];
      const cls = classOf(v, s, state.view);
      if (cls === lastClass[i]) continue;
      lastClass[i] = cls;
      const col = cls < 0 ? null : colorOf(cls, state.view);
      // a thin stroke in the fill colour hides the anti-aliasing seams between neighbouring hexes on the canvas
      layers[i].setStyle(col ? { fillColor: col, fillOpacity: FILL_OPACITY, stroke: true, color: col, opacity: FILL_OPACITY, weight: 1 } : { fillOpacity: 0, stroke: false });
    }
    if (hoverId >= 0) showTip();
  }

  function tipHtml(id) {
    const [a, b] = currentFrames();
    const mName = (k) => t("monthSeg")[man.months[k]];
    let h = "<div>" + t("tipHex", { id }) + "</div><div>" + t("tipValue", { m: mName(state.month), v: "<b>" + a[id] + "</b>" }) + "</div>";
    if (b) h += "<div>" + t("tipValue", { m: mName(state.base), v: "<b>" + b[id] + "</b>" }) + "</div><div>" + t("tipDiff", { v: "<b>" + signed(a[id] - b[id]) + "</b>" }) + "</div>";
    return h;
  }
  function showTip(latlng) {
    if (latlng) tip.setLatLng(latlng);
    tip.setContent(tipHtml(hoverId));
    if (!map.hasLayer(tip)) tip.addTo(map);
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
    $("legendNote").textContent = t(state.view === "values" ? "legendNoteValues" : "legendNoteDiff");
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
    $("panelToggle").addEventListener("click", () => {
      const closed = document.body.classList.toggle("panel-closed");
      $("panelToggle").setAttribute("aria-expanded", String(!closed));
    });
    if (matchMedia("(max-width: 700px)").matches) { document.body.classList.add("panel-closed"); $("panelToggle").setAttribute("aria-expanded", "false"); }
    $("themeToggleBtn").addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("mapyAnalizyTheme", next); } catch (e) { /* private mode */ }
      lastClass = lastClass.map(() => null); update();
    });
    setLangChangeHandler(() => { play(state.playing); update(); });
  }

  // ---- start ----
  async function init() {
    const [m, buf, geo] = await Promise.all([
      fetch("data/manifest.json").then((r) => r.json()),
      fetch("data/counts.bin").then((r) => r.arrayBuffer()),
      fetch("data/hex.geojson").then((r) => r.json()),
    ]);
    man = m; N = m.hexes; H = m.hours.length; M = m.months.length; C = m.meta.length;
    counts = new Uint16Array(buf);
    if (counts.length !== M * C * H * N || geo.features.length !== N) throw new Error("data size mismatch");
    bufs[0] = new Int32Array(N); bufs[1] = new Int32Array(N);
    lastClass = new Array(N).fill(null);

    map = L.map("map", { zoomControl: false, preferCanvas: true, renderer: L.canvas({ padding: 0.5 }) });
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    tip = L.tooltip({ className: "hex-tip", direction: "top", offset: [0, -6], opacity: 1 });
    const gl = L.geoJSON(geo, {
      style: () => ({ stroke: false, fillOpacity: 0, fillColor: "#000" }),
      onEachFeature: (f, layer) => {
        const id = f.properties.hex_id;
        layers[id] = layer;
        layer.on("mouseover mousemove click", (e) => { hoverId = id; showTip(e.latlng); });
        layer.on("mouseout", () => { hoverId = -1; map.removeLayer(tip); });
      },
    }).addTo(map);
    map.fitBounds(gl.getBounds(), { paddingTopLeft: [window.innerWidth > 700 ? 330 : 0, 60], paddingBottomRight: [0, 90] });

    $("hourSlider").value = state.hour;
    $("speedBtn").textContent = SPEEDS[state.speed] + "×";
    bindUi();
    update();
    $("mapLoading").classList.add("hidden");
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => { console.error(e); $("mapLoading").textContent = t("loadError"); });
  });
})();
