"use strict";

const $ = (id) => document.getElementById(id);
const STR = {
  pl: {
    title: "Jak rosną odcinki",
    docTitle: "Jak rosną odcinki w Łodzi — GISBoost",
    nav: "Odcinki Łodzi",
    lead: "Najedź na miasto, suwakiem ustaw próg. Klik przypina heks i puszcza wzrost na 4×. Potem klik w odcinek pokazuje linię.",
    winLabel: "Okno odjazdu",
    timeLabel: "Czas podróży",
    play: "Odtwarzaj", pause: "Pauza", unpin: "Odepnij",
    hover: "Najedź na heks. Suwak ustawia próg podglądu.",
    pinned: "Przypięty heks {id}. Suwak nie liczy trasy od nowa.",
    inspect: "{line} · {mode} · {t} min",
    inspectNone: "{mode} · {t} min",
    inspectClose: "Zamknij",
    stat: "{n} odcinków w {t} min",
    empty: "Nic nie doszło w {t} min.",
    note: "Mediana czasu do końca odcinka w wybranym oknie odjazdu. To nie jest jeden kurs.",
    foot: "Wtorek 6.10.2026, GTFS zrealizowany P50, Conveyal R5 7.6. Ostatni hop linii wpadającej na osiągnięty przystanek zapala się razem z nim.",
    tram: "tramwaj", bus: "autobus",
    loading: "Ładowanie sieci…", fail: "Nie udało się wczytać danych.",
    theme: "Motyw",
  },
  en: {
    title: "How the segments grow",
    docTitle: "How the segments grow in Łódź — GISBoost",
    nav: "Łódź segments",
    lead: "Hover the city and use the slider for the cutoff. A click pins the hex and plays at 4×. Then click a segment to see its line.",
    winLabel: "Departure window",
    timeLabel: "Travel time",
    play: "Play", pause: "Pause", unpin: "Unpin",
    hover: "Hover a hex. The slider sets the preview cutoff.",
    pinned: "Pinned hex {id}. The slider does not recompute the route.",
    inspect: "{line} · {mode} · {t} min",
    inspectNone: "{mode} · {t} min",
    inspectClose: "Close",
    stat: "{n} segments within {t} min",
    empty: "Nothing reached within {t} min.",
    note: "Median time to the end of the segment in the selected departure window. Not a single vehicle.",
    foot: "Tuesday 6 Oct 2026, realized GTFS P50, Conveyal R5 7.6. The last hop of every line into a reached stop lights up with that stop.",
    tram: "tram", bus: "bus",
    loading: "Loading the network…", fail: "Could not load the data.",
    theme: "Theme",
  },
};

const SPEEDS = [0.5, 1, 2, 4];
const PREVIEW = Odcinki.PREVIEW;
const PIN_SPEED = Odcinki.PIN_SPEED;
// Viridis, lifted off black so 0 min shows on the dark map. 0–30 takes most of the ramp.
const RAMP = ["#414487", "#228d8d", "#6ccd5a", "#b5de2b", "#fde725"];
const M = ["coalesce", ["feature-state", "m"], 255];

let lang = "pl";
let manifest, segGeo, morning, afternoon, hexById;
let map, counts;
let hoverId = null, pinId = null, windowId = "morning";
let cutoff = PREVIEW, lastT = -1, speed = 1, playing = false, playT0 = 0, playFrom = 0;
let hoverFrame = 0, wheelUntil = 0, cursor = null, marker, stampedHex = -1, afternoonTask = null;
let inspectId = null, inspectPopup = null;

function t(key, vars) {
  let s = STR[lang][key];
  if (vars) for (const k of Object.keys(vars)) s = s.replace("{" + k + "}", vars[k]);
  return s;
}
function paintLegend() {
  const swatch = [0, 15, 30, 45, 60].map((m, i) => `<span><i style="background:${RAMP[i]}"></i>${m}</span>`).join("");
  $("legend").innerHTML = `<div class="ramp">${swatch}</div><div class="modes"><span><i class="tram"></i>${t("tram")}</span><span><i class="bus"></i>${t("bus")}</span></div>`;
}
function applyLang() {
  document.title = t("docTitle");
  $("title").textContent = t("title");
  $("navHere").textContent = t("nav");
  $("lead").textContent = t("lead");
  $("winLabel").textContent = t("winLabel");
  $("timeLabel").textContent = t("timeLabel");
  $("note").textContent = t("note");
  $("foot").textContent = t("foot");
  $("unpinBtn").textContent = t("unpin");
  $("playBtn").setAttribute("aria-label", playing ? t("pause") : t("play"));
  $("themeBtn").textContent = t("theme");
  $("langBtn").textContent = lang === "pl" ? "EN" : "PL";
  document.documentElement.lang = lang;
  paintLegend();
  paintStat();
  if (inspectId != null && inspectPopup) {
    const feats = segGeo.features;
    const feat = feats[inspectId];
    if (feat) {
      const html = inspectText(feat);
      $("inspect").textContent = html;
      fillInspectPopup(html);
    }
  }
}
function rowOf(hex) {
  const src = windowId === "morning" ? morning : afternoon;
  return src.subarray(hex * manifest.n_stops, (hex + 1) * manifest.n_stops);
}
function activeHex() { return pinId != null ? pinId : hoverId; }

function stamp(hex) {
  if (!map.isSourceLoaded("seg-on")) return;
  if (stampedHex === hex && counts) return;
  const row = rowOf(hex);
  const hist = new Uint16Array(61);
  const feats = segGeo.features;
  // ponytail: rewrites all ~3k segment states per hex. Write only changed minutes if one hex exceeds a frame.
  for (let i = 0; i < feats.length; i++) {
    const minute = row[feats[i].properties.to];
    const m = minute > 60 ? 255 : minute;
    if (m !== 255) hist[m]++;
    map.setFeatureState({source: "seg-on", id: feats[i].id}, {m: m, on: feats[i].id === inspectId});
  }
  for (let i = 1; i < 61; i++) hist[i] += hist[i - 1];
  counts = hist;
  stampedHex = hex;
}
function applyCutoff(tMin) {
  const next = Math.max(0, Math.min(60, tMin | 0));
  cutoff = next;
  // MapLibre rejects feature-state inside a filter, so the cutoff is opacity.
  if (activeHex() == null) {
    if (lastT !== -1) map.setPaintProperty("seg-on", "line-opacity", 0);
    lastT = -1;
  } else if (next !== lastT) {
    map.setPaintProperty("seg-on", "line-opacity", ["case", ["<=", M, next], 0.95, 0]);
    lastT = next;
  }
  $("slider").value = String(next);
  $("timeVal").textContent = next + " min";
  paintStat();
}
function paintStat() {
  if (!manifest) return;
  const hex = activeHex();
  if (hex == null || !counts) {
    $("stat").textContent = t("hover");
    return;
  }
  const n = counts[cutoff];
  const body = n === 0 ? t("empty", {t: cutoff}) : t("stat", {n: n, t: cutoff});
  $("stat").textContent = (pinId != null ? t("pinned", {id: pinId}) + " " : "") + body;
}
function showHex(id, tMin) {
  if (id === hoverId && pinId == null && counts) {
    applyCutoff(tMin);
    return;
  }
  hoverId = id;
  stamp(id);
  lastT = -1;
  applyCutoff(tMin);
}
function clearHex() {
  if (pinId != null) return;
  hoverId = null;
  counts = null;
  applyCutoff(Odcinki.hoverCutoff(false, true, cutoff));
}
function inspectText(feat) {
  const minute = map.getFeatureState({source: "seg-on", id: feat.id}).m;
  const mode = feat.properties.mode === "tram" ? t("tram") : t("bus");
  const line = (feat.properties.line || "").trim();
  const vars = {line: line, mode: mode, t: minute};
  return line ? t("inspect", vars) : t("inspectNone", vars);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
}
function fillInspectPopup(text) {
  inspectPopup.setHTML(
    `<button type="button" class="inspect-x" aria-label="${esc(t("inspectClose"))}">×</button><span>${esc(text)}</span>`
  );
  const x = inspectPopup.getElement() && inspectPopup.getElement().querySelector(".inspect-x");
  if (x) x.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); closeInspect(); });
}
function closeInspect() {
  const id = inspectId;
  inspectId = null;
  if (id != null) map.setFeatureState({source: "seg-on", id: id}, {on: false});
  const pop = inspectPopup;
  inspectPopup = null;
  if (pop) pop.remove();
  $("inspect").hidden = true;
  $("inspect").textContent = "";
}
function openInspect(feat, lngLat) {
  if (inspectId != null && inspectId !== feat.id) {
    map.setFeatureState({source: "seg-on", id: inspectId}, {on: false});
  }
  inspectId = feat.id;
  map.setFeatureState({source: "seg-on", id: feat.id}, {on: true});
  const html = inspectText(feat);
  $("inspect").textContent = html;
  $("inspect").hidden = false;
  if (!inspectPopup) {
    inspectPopup = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 8, className: "inspect-pop"});
  }
  inspectPopup.setLngLat(lngLat).addTo(map);
  fillInspectPopup(html);
}
function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1], yj = ring[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (ring[j][0] - ring[i][0]) * (pt[1] - yi) / (yj - yi) + ring[i][0]) inside = !inside;
  }
  return inside;
}
function hexAt(lng, lat) {
  const pt = [lng, lat];
  for (let i = 0; i < hexById.length; i++) {
    const h = hexById[i];
    if (!h || pt[0] < h.minx || pt[0] > h.maxx || pt[1] < h.miny || pt[1] > h.maxy) continue;
    if (pointInRing(pt, h.ring)) return h.id;
  }
  return null;
}
function movePin(id) {
  const h = id == null ? null : hexById[id];
  if (!h) { marker.remove(); return; }
  marker.setLngLat(h.center).addTo(map);
}
function pin(id, tMin) {
  closeInspect();
  pinId = id;
  hoverId = id;
  $("unpinBtn").hidden = false;
  setSpeed(PIN_SPEED);
  stamp(id);
  movePin(id);
  lastT = -1;
  applyCutoff(tMin == null ? 0 : tMin);
  if (tMin == null && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) startPlay();
  else paintStat();
}
function unpin() {
  stopPlay();
  closeInspect();
  pinId = null;
  $("unpinBtn").hidden = true;
  movePin(null);
  clearHex();
}
function setSpeed(s) {
  speed = s;
  for (const b of $("speeds").querySelectorAll("button")) b.setAttribute("aria-pressed", String(+b.dataset.s === s));
}
function startPlay() {
  playing = true;
  playFrom = cutoff;
  playT0 = performance.now();
  $("playBtn").textContent = "❚❚";
  $("playBtn").setAttribute("aria-label", t("pause"));
  requestAnimationFrame(tick);
}
function stopPlay() {
  playing = false;
  $("playBtn").textContent = "▶";
  $("playBtn").setAttribute("aria-label", t("play"));
}
function tick(now) {
  if (!playing) return;
  const minutes = playFrom + ((now - playT0) / 1000) * (60 / 30) * speed;
  if (minutes >= 60) {
    applyCutoff(60);
    stopPlay();
    return;
  }
  applyCutoff(minutes);
  requestAnimationFrame(tick);
}
function previewAt(at) {
  if (pinId != null || performance.now() < wheelUntil) return;
  const id = hexAt(at[0], at[1]);
  if (id == null) clearHex();
  else showHex(id, cutoff);
}
async function decodeMatrix(buf) {
  const expect = manifest.n_hex * manifest.n_stops;
  if (buf.byteLength !== expect) {
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  const out = new Uint8Array(buf);
  if (out.length !== expect) throw new Error("matrix " + out.length);
  return out;
}
function ensureAfternoon() {
  if (afternoon) return Promise.resolve();
  if (!afternoonTask) {
    afternoonTask = fetch("data/" + manifest.windows.afternoon.file).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.arrayBuffer();
    }).then(decodeMatrix).then((u) => { afternoon = u; });
  }
  return afternoonTask;
}
function readHex(buf) {
  const dv = new DataView(buf);
  const n = dv.getUint32(0, true);
  const lon0 = dv.getInt32(4, true);
  const lat0 = dv.getInt32(8, true);
  const u16 = new Uint16Array(buf, 12);
  let k = 0;
  let minxAll = 180, maxxAll = -180, minyAll = 90, maxyAll = -90;
  hexById = new Array(n);
  for (let id = 0; id < n; id++) {
    const npts = u16[k++];
    const ring = new Array(npts);
    let minx = 180, maxx = -180, miny = 90, maxy = -90, x = 0, y = 0;
    const closed = npts - 1;
    for (let i = 0; i < npts; i++) {
      const p = [(lon0 + u16[k++]) / 1e5, (lat0 + u16[k++]) / 1e5];
      ring[i] = p;
      if (p[0] < minx) minx = p[0];
      if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1];
      if (p[1] > maxy) maxy = p[1];
      if (i < closed) { x += p[0]; y += p[1]; }
    }
    if (minx < minxAll) minxAll = minx;
    if (maxx > maxxAll) maxxAll = maxx;
    if (miny < minyAll) minyAll = miny;
    if (maxy > maxyAll) maxyAll = maxy;
    hexById[id] = {id, ring, center: [x / closed, y / closed], minx, maxx, miny, maxy};
  }
  return [[minxAll, minyAll], [maxxAll, maxyAll]];
}
function basemap() {
  const dark = document.documentElement.getAttribute("data-theme") !== "light";
  map.setPaintProperty("osm", "raster-brightness-min", dark ? 0.86 : 0);
  map.setPaintProperty("osm", "raster-brightness-max", dark ? 0.04 : 1);
  map.setPaintProperty("osm", "raster-hue-rotate", dark ? 180 : 0);
  map.setPaintProperty("osm", "raster-saturation", dark ? -0.7 : 0);
}

async function init() {
  try {
    lang = localStorage.getItem("mapyAnalizyLang") === "en" ? "en" : "pl";
  } catch (e) { /* private mode */ }
  $("loadMsg").textContent = t("loading");
  let hexBuf, morningBuf;
  try {
    const [mj, sj, hj, mb] = await Promise.all([
      fetch("data/manifest.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch("data/segments.geojson").then((r) => r.json()),
      fetch("data/hex.bin").then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
      fetch("data/morning.bin.gz").then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
    ]);
    manifest = mj; segGeo = sj; hexBuf = hj; morningBuf = mb;
    for (let i = 0; i < segGeo.features.length; i++) segGeo.features[i].id = i;
    morning = await decodeMatrix(morningBuf);
  } catch (err) {
    $("loading").textContent = t("fail");
    $("stat").textContent = t("fail") + " " + (err && err.message ? err.message : err);
    return;
  }
  const bounds = readHex(hexBuf);
  map = new maplibregl.Map({
    container: "map",
    attributionControl: false,
    doubleClickZoom: false,
    boxZoom: false,
    dragRotate: false,
    bounds: bounds,
    fitBoundsOptions: {padding: {top: 24, bottom: 24, left: 340, right: 24}},
    style: {
      version: 8,
      sources: {osm: {type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19}},
      layers: [{id: "osm", type: "raster", source: "osm"}],
    },
  });
  map.addControl(new maplibregl.NavigationControl({showCompass: false, visualizePitch: false}), "bottom-right");
  await new Promise((res) => map.once("load", res));
  const centrum = hexById[2389];
  if (centrum) {
    map.jumpTo({
      center: centrum.center,
      zoom: map.getZoom() + 1,
      padding: {top: 24, bottom: 24, left: 340, right: 24},
    });
  }
  const pinEl = document.createElement("div");
  pinEl.className = "pin";
  marker = new maplibregl.Marker({element: pinEl, anchor: "center"});
  const q = new URLSearchParams(location.search);
  if (q.get("w") === "afternoon" || q.get("w") === "morning") windowId = q.get("w");
  if (windowId === "afternoon") await ensureAfternoon();
  const qHex = q.get("hex") == null || !hexById[+q.get("hex")] ? null : +q.get("hex");
  const qT = q.get("t") == null ? 0 : Math.max(0, Math.min(60, +q.get("t") | 0));
  map.addSource("seg-on", {type: "geojson", data: segGeo});
  map.addLayer({
    id: "seg-on", type: "line", source: "seg-on",
    paint: {
      "line-width": ["case",
        ["boolean", ["feature-state", "on"], false],
        ["case", ["==", ["get", "mode"], "tram"], 7, 4],
        ["case", ["==", ["get", "mode"], "tram"], 4.3, 2]],
      "line-opacity": 0,
      "line-color": ["interpolate", ["linear"], M, 0, RAMP[0], 15, RAMP[1], 30, RAMP[2], 45, RAMP[3], 60, RAMP[4]],
    },
  });
  map.on("sourcedata", (e) => {
    if (e.sourceId !== "seg-on" || !e.isSourceLoaded) return;
    const hex = activeHex();
    if (hex == null || counts) return;
    stamp(hex);
    lastT = -1;
    applyCutoff(cutoff);
  });
  basemap();
  const labels = manifest.windows;
  $("windows").innerHTML = ["morning", "afternoon"].map((id) =>
    `<button type="button" data-w="${id}" aria-pressed="${id === windowId}">${labels[id].label}</button>`).join("");
  $("windows").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button");
    if (!btn || btn.dataset.w === windowId) return;
    const prev = windowId;
    windowId = btn.dataset.w;
    for (const b of $("windows").querySelectorAll("button")) b.setAttribute("aria-pressed", b === btn);
    if (windowId === "afternoon" && !afternoon) {
      $("stat").textContent = t("loading");
      try { await ensureAfternoon(); }
      catch (err) {
        windowId = prev;
        for (const b of $("windows").querySelectorAll("button")) b.setAttribute("aria-pressed", b.dataset.w === prev);
        $("stat").textContent = t("fail");
        return;
      }
    }
    const keep = cutoff;
    const hex = activeHex();
    if (hex == null) { paintStat(); return; }
    stampedHex = -1;
    stamp(hex);
    lastT = -1;
    applyCutoff(keep);
  });
  $("speeds").innerHTML = SPEEDS.map((s) => `<button type="button" data-s="${s}" aria-pressed="${s === 1}">${s}×</button>`).join("");
  $("speeds").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    setSpeed(+btn.dataset.s);
    if (playing) { playFrom = cutoff; playT0 = performance.now(); }
  });
  function armHover() {
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      if (!cursor) return;
      previewAt(cursor);
    });
  }
  map.on("mousemove", (e) => {
    cursor = [e.lngLat.lng, e.lngLat.lat];
    if (pinId != null || performance.now() < wheelUntil) return;
    armHover();
  });
  map.on("wheel", () => { wheelUntil = performance.now() + 180; });
  map.on("zoomend", () => { if (pinId == null && cursor) armHover(); });
  map.on("mouseout", () => { if (pinId == null) clearHex(); });
  map.on("click", (e) => {
    if (pinId != null) {
      const hits = map.queryRenderedFeatures(e.point, {layers: ["seg-on"]});
      let feat = null;
      for (const f of hits) {
        const m = map.getFeatureState({source: "seg-on", id: f.id}).m;
        if (m != null && m !== 255 && m <= cutoff) { feat = f; break; }
      }
      if (feat) {
        const next = Odcinki.nextInspectId(inspectId, feat.id);
        if (next == null) closeInspect();
        else openInspect(feat, e.lngLat);
        return;
      }
      return;
    }
    const id = hexAt(e.lngLat.lng, e.lngLat.lat);
    if (id == null) return;
    stopPlay();
    pin(id);
  });
  $("slider").addEventListener("input", () => {
    stopPlay();
    applyCutoff(+$("slider").value);
  });
  $("playBtn").addEventListener("click", () => {
    if (pinId == null) return;
    if (playing) stopPlay();
    else {
      if (cutoff >= 60) applyCutoff(0);
      startPlay();
    }
  });
  $("unpinBtn").addEventListener("click", unpin);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") unpin();
    if (e.key === " " && pinId != null && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      $("playBtn").click();
    }
  });
  $("themeBtn").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("mapyAnalizyTheme", next); } catch (err) { /* ignore */ }
    basemap();
  });
  $("langBtn").addEventListener("click", () => {
    lang = lang === "pl" ? "en" : "pl";
    try { localStorage.setItem("mapyAnalizyLang", lang); } catch (err) { /* ignore */ }
    applyLang();
  });
  applyLang();
  if (q.get("w") === "afternoon" || q.get("w") === "morning") {
    for (const b of $("windows").querySelectorAll("button")) b.setAttribute("aria-pressed", b.dataset.w === windowId);
  }
  if (qHex != null) {
    lastT = q.get("t") == null ? -1 : qT;
    pin(qHex, q.get("t") == null ? null : qT);
  }
  if (!afternoon) ensureAfternoon().catch(() => { afternoonTask = null; });
  $("loading").classList.add("hidden");
}

init().catch((err) => {
  const msg = (err && err.stack) ? err.stack : String(err);
  $("loading").textContent = t("fail");
  $("stat").textContent = msg;
});
