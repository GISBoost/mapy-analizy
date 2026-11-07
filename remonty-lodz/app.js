"use strict";
// Road works in Lodz: map + time scrubber + report. Data: data/remonty.json (remonty/pipeline/e8_web_export.py).
(() => {
  const $ = (id) => document.getElementById(id);
  const T0 = "2021-01-01", T1 = "2026-11-07", BILET_END = "2024-12-31", OSM_COLOR = "#bf5af2";
  const DAY = 864e5, t = (d) => Date.parse(d + "T00:00:00Z"), iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const SPAN = (t(T1) - t(T0)) / DAY;
  const ST = { plan: "#64d2ff", ogloszone: "#ffd60a", udzielone: "#ff9f0a", wykonane: "#30d158" };
  const ST_PL = { plan: "plan zamówień (BIP)", ogloszone: "przetarg ogłoszony", udzielone: "umowa zawarta", wykonane: "umowa wykonana" };
  const YC = { 2017: "#8e8e93", 2019: "#8e8e93", 2020: "#8e8e93", 2021: "#5e5ce6", 2022: "#0a84ff", 2023: "#64d2ff", 2024: "#30d158", 2025: "#ffd60a", 2026: "#ff9f0a" };
  const SRC = { plan: "Plany UMŁ (BIP)", bzp_zim: "Przetargi ZIM", bzp_zdit: "Przetargi ZDiT", bzp_uml: "Przetargi UMŁ" };
  const SPEEDS = [[7, "1 tydz."], [1, "1 dzień"], [30, "1 mies."]];
  const YEARS = ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];
  const METRICS = [["roboty", "Roboty"], ["dni_ge1", "Dni ≥1"], ["dni_ge3", "≥3"], ["dni_ge5", "≥5"]];
  const fmtDate = (d) => new Date(t(d)).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const fmtZl = (v) => v >= 1e6 ? (v / 1e6).toLocaleString("pl-PL", { maximumFractionDigits: 1 }) + " mln zł" : Math.round(v).toLocaleString("pl-PL") + " zł";
  const isPhone = () => matchMedia("(max-width: 760px)").matches;
  const isDark = () => document.documentElement.getAttribute("data-theme") !== "light";

  const state = { day: "2022-06-15", view: "dzien", year: null, src: new Set(Object.keys(SRC)), osm: false, color: "status", metric: "roboty", playing: null, speed: 0, card: null };
  let D, map, roczne, weekly = [];

  const shown = (i) => state.src.has(i.zrodlo);
  const activeOn = (i, d) => i.od && i.od <= d && d <= i.do;
  const lit = (i) => state.view === "dzien" ? activeOn(i, state.day) : state.view === "rok" ? i.rok === (state.year || state.day.slice(0, 4)) : true;

  // ---------- segmented controls ----------
  function seg(el, opts, get, set) {
    el.innerHTML = opts.map(([k, l]) => `<button type="button" data-k="${k}">${l}</button>`).join("");
    const paint = () => el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === get())));
    el.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { set(b.dataset.k); paint(); update(); } });
    paint(); return paint;
  }

  // ---------- chart (bottom bar) ----------
  const X = (d) => ((t(d) - t(T0)) / DAY / SPAN) * 1000;
  function buildWeekly() {
    weekly = [];
    const its = D.items.filter((i) => shown(i) && i.od);
    for (let ms = t(T0); ms <= t(T1); ms += 7 * DAY) {
      let m = 0;
      for (let k = 0; k < 7; k++) { const d = iso(ms + k * DAY); let n = 0; for (const i of its) if (activeOn(i, d)) n++; if (n > m) m = n; }
      weekly.push([iso(ms), m]);
    }
  }
  function drawChart() {
    const mx = Math.max(10, ...weekly.map((w) => w[1])), Y = (n) => 100 - (n / mx) * 94;
    let p = "M0 100";
    for (const [d, n] of weekly) p += `L${X(d).toFixed(1)} ${Y(n).toFixed(1)}`;
    p += "L1000 100Z";
    const lines = [1, 3, 5].map((n) => `<path d="M0 ${Y(n)}H1000" stroke="var(--grid)" stroke-width="1" vector-effect="non-scaling-stroke" ${n === 5 ? 'stroke-dasharray="4 3"' : ""}/>`).join("");
    const years = ["2021", "2022", "2023", "2024", "2025", "2026"].map((y) => `<span class="ax" style="left:${X(y + "-07-01") / 10}%">${y}</span>`).join("");
    $("chart").innerHTML = `<svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V6" stroke="var(--gap)" stroke-width="3"/></pattern></defs>
        <rect x="0" y="0" width="${X(BILET_END)}" height="100" fill="var(--bilet)" stroke="none"/>
        ${lines}<path d="${p}" fill="rgba(255,159,10,.35)" stroke="var(--work)" stroke-width="1.4" vector-effect="non-scaling-stroke"/></svg>
      <span class="tag" style="left:4px">wydłużony bilet MPK (do 31.12.2024)</span>
      <span class="tag gap" style="left:${X("2025-01-01") / 10 + 0.5}%">po bilecie</span>
      ${years}<div class="cursor" id="cursor"></div>`;
    $("chart").setAttribute("aria-valuemax", String(SPAN));
    moveCursor();
  }
  function moveCursor() {
    const c = $("cursor"); if (c) c.style.left = X(state.day) / 10 + "%";
    $("chart").setAttribute("aria-valuenow", String((t(state.day) - t(T0)) / DAY));
    $("chart").setAttribute("aria-valuetext", fmtDate(state.day));
  }
  function scrub(e) {
    const r = $("chart").getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setDay(iso(t(T0) + Math.round(f * SPAN) * DAY));
  }
  function setDay(d, keepView) {
    state.day = d < T0 ? T0 : d > T1 ? T1 : d;
    if (!keepView) state.view = "dzien";
    paintView(); update();
  }

  // ---------- report ----------
  function compare() {
    const r = roczne, B = ["2021", "2022", "2023", "2024"], P = ["2025", "2026"];
    const avg = (k, ys) => Math.round(ys.reduce((a, y) => a + (+r[y][k] || 0), 0) / ys.length);
    const dk = (id) => D.deklaracje.find((x) => x.id === id) || {};
    const d01 = dk("d01"), d11 = dk("d11"), d14 = dk("d14");
    const pct = (y) => Math.round((+r[y].dni_ge5 / (y === "2026" ? 311 : y === "2024" ? 366 : 365)) * 100);
    $("compare").innerHTML = `<p class="eyebrow">Bilet wydłużony vs po bilecie</p>
      <div class="cmp">
        <div class="b"><strong>2021–2024 (bilet)</strong><span class="v">${avg("roboty", B)}</span> robót/rok<br><span class="v">${avg("max_jednoczesnie", B)}</span> umów naraz w szczycie (średnio)<br>dni z ≥5 umowami: ${B.map(pct).join(" · ")}%<br>miasto 2019–2023: ${Math.round(d01.wartosc / 5)} ulic/rok <a href="${d01.zrodlo_url}" target="_blank" rel="noopener">↗</a></div>
        <div class="p"><strong>2025 – 7 XI 2026 (po)</strong><span class="v">${r["2025"].roboty}</span> robót w 2025, ${r["2026"].roboty} w 2026 (niepełny)<br><span class="v">${r["2025"].max_jednoczesnie}</span> umów naraz w szczycie 2025<br>dni z ≥5 umowami: ${P.map(pct).join(" · ")}%<br>miasto 2025: ${d11.wartosc} ulic gotowych <a href="${d11.zrodlo_url}" target="_blank" rel="noopener">↗</a>, plan 2026: ${d14.wartosc} <a href="${d14.zrodlo_url}" target="_blank" rel="noopener">↗</a></div>
      </div>
      <p class="note">W 2025 r. robót było ${r["2025"].roboty}, najwięcej od 2021 (średnio ${avg("roboty", B)} w latach bileta). 2026 liczony do 7 listopada.</p>`;
  }
  function bars() {
    const k = state.metric, dayMetric = k !== "roboty";
    const vals = YEARS.map((y) => +(roczne[y] || {})[k] || 0), mx = Math.max(...vals, 1);
    const sel = state.view === "rok" ? (state.year || state.day.slice(0, 4)) : null;
    const cy = state.view === "dzien" ? state.day.slice(0, 4) : null;
    if (dayMetric && cy) {  // current year grows with the cursor: days up to state.day only
      const th = +k.slice(-1), i = YEARS.indexOf(cy);
      if (i >= 0) vals[i] = D.dzienne.filter(([d, n]) => d.startsWith(cy) && d <= state.day && n >= th).length;
    }
    $("bars").classList.toggle("sel", !!sel);
    if (!$("bars").children.length) $("bars").innerHTML = YEARS.map((y) => `<button type="button" class="bar ${y >= "2025" ? "po" : ""}" data-y="${y}"><span class="v"></span><span class="track"><span class="fill"></span></span><span class="y">${y}</span></button>`).join("");
    [...$("bars").children].forEach((b, i) => {
      const y = YEARS[i], nodata = dayMetric && y < "2021";
      b.classList.toggle("nodata", nodata); b.classList.toggle("cur", y === cy); b.classList.toggle("future", !!cy && y > cy);
      b.setAttribute("aria-pressed", String(sel === y)); b.setAttribute("aria-label", `${y}: ${nodata ? "brak danych" : vals[i]}`);
      b.querySelector(".v").textContent = nodata ? "–" : vals[i];
      b.querySelector(".fill").style.setProperty("--p", (nodata ? 100 : (vals[i] / mx) * 100) + "%");
    });
    $("barsNote").textContent = dayMetric
      ? "Dni w roku, w których trwało co najmniej tyle umów z BZP. Okres umowy to górna granica zajęcia drogi. 2026: do 7 listopada."
      : "Roboty na jezdniach i torowiskach (plany + przetargi ZDiT, ZIM, UMŁ), bez umów utrzymaniowych. Lata przed 2021 mają tylko plany zamówień, 2026 jest niepełny.";
  }
  function kpis() {
    const y = state.view === "rok" ? (state.year || state.day.slice(0, 4)) : null, r = y ? roczne[y] : null;
    $("kpiTitle").textContent = y ? `Rok ${y}` : "Wszystkie lata (2017–2026)";
    $("yearClear").hidden = !y;
    const its = D.items.filter((i) => shown(i) && (!y || i.rok === y));
    const val = its.filter((i) => i.zrodlo !== "plan").reduce((s, i) => s + (i.wartosc_zl || 0), 0);
    const tile = (v, tt, w) => `<div><div class="v ${w ? "w" : ""}">${v}</div><div class="t">${tt}</div></div>`;
    $("kpis").innerHTML = tile(its.length, "robót (wybrane źródła)") + tile(its.filter((i) => i.lat).length, "na mapie")
      + (r ? tile(r.dni_ge1, "dni z ≥1 w toku") + tile(r.dni_ge5, "dni z ≥5 w toku", 1) : tile(its.filter((i) => i.od).length, "z datami umowy") + tile(val ? fmtZl(val) : "–", "wartość (BZP)", 1));
  }
  let calKey = "";
  function calendar() {
    const key = weekly.map((w) => w[1]).join();
    if (key !== calKey) { calKey = key; buildCal(); }
    const day = state.view === "dzien" ? state.day : null, wk0 = day ? iso(t(day) - 6 * DAY) : null;
    $("cal").querySelectorAll("rect").forEach((r) => {
      r.classList.toggle("off", !!day && r.dataset.d > day);
      r.classList.toggle("cur", !!day && r.dataset.d > wk0 && r.dataset.d <= day);
    });
  }
  function buildCal() {
    const ys = ["2021", "2022", "2023", "2024", "2025", "2026"], W = 360, cw = (W - 30) / 53, h = 10;
    const col = (m) => m === 0 ? "var(--fill)" : m < 3 ? "#5e3a12" : m < 5 ? "#a35d0b" : m < 10 ? "#ff9f0a" : "#ffd60a";
    const wk = new Map(weekly);
    let s = "";
    ys.forEach((y, r) => {
      s += `<text x="0" y="${r * (h + 3) + 8.5}">${y}</text>`;
      for (let w = 0; w < 53; w++) {
        const d = iso(t(y + "-01-01") + w * 7 * DAY); if (!d.startsWith(y) || d > T1) continue;
        // weekly series is aligned to T0, find the week containing d
        const ws = iso(t(T0) + Math.floor((t(d) - t(T0)) / DAY / 7) * 7 * DAY), m = wk.get(ws) || 0;
        s += `<rect data-d="${d}" x="${30 + w * cw}" y="${r * (h + 3)}" width="${cw - 1.2}" height="${h}" rx="2" fill="${col(m)}"><title>${fmtDate(d)}: maks. ${m} w toku</title></rect>`;
      }
    });
    $("cal").innerHTML = `<svg viewBox="0 0 ${W} ${ys.length * (h + 3)}">${s}</svg>`;
  }

  // ---------- map ----------
  function features() {
    const pts = [], fs = [];
    for (const i of D.items) {
      if (!shown(i) || !i.lat) continue;
      pts.push({ type: "Feature", properties: { id: i.id, st: i.status, rok: i.rok || "", a: lit(i) ? 1 : 0 }, geometry: { type: "Point", coordinates: [i.lon, i.lat] } });
    }
    const byId = new Map(D.items.map((i) => [i.id, i]));
    for (const f of D.odcinki.features) {
      const i = byId.get(f.properties.id); if (!i || !shown(i)) continue;
      fs.push({ ...f, properties: { id: i.id, st: i.status, rok: i.rok || "", a: lit(i) ? 1 : 0 } });
    }
    return [{ type: "FeatureCollection", features: pts.sort((a, b) => a.properties.a - b.properties.a) }, { type: "FeatureCollection", features: fs }];
  }
  function osmData() {
    if (!state.osm) return { type: "FeatureCollection", features: [] };
    const y = state.year || state.day.slice(0, 4);
    const ok = (p) => state.view === "dzien" ? p.od <= state.day && state.day <= p.do : state.view === "rok" ? p.od <= y + "-12-31" && p.do >= y + "-01-01" : true;
    return { type: "FeatureCollection", features: D.osm.features.filter((f) => ok(f.properties)) };
  }
  const colorExpr = () => state.color === "status"
    ? ["match", ["get", "st"], ...Object.entries(ST).flat(), "#8e8e93"]
    : ["match", ["get", "rok"], ...Object.entries(YC).flat(), "#8e8e93"];
  function paintMap() {
    if (!map || !map.getSource("pts")) return;
    const [pts, secs] = features();
    map.getSource("pts").setData(pts); map.getSource("secs").setData(secs); map.getSource("osmb").setData(osmData());
    const c = colorExpr(), dim = isDark() ? "rgba(255,255,255,.38)" : "rgba(0,0,0,.3)";
    map.setPaintProperty("pts", "circle-color", ["case", ["==", ["get", "a"], 1], c, dim]);
    map.setPaintProperty("pts", "circle-radius", ["case", ["==", ["get", "a"], 1], 6, 2.5]);
    map.setPaintProperty("pts", "circle-stroke-width", ["case", ["==", ["get", "a"], 1], 1.2, 0]);
    map.setPaintProperty("secs", "line-color", ["case", ["==", ["get", "a"], 1], c, dim]);
    map.setPaintProperty("secs", "line-opacity", ["case", ["==", ["get", "a"], 1], 1, 0.5]);
  }
  function basemapTheme() {
    if (!map) return;
    const dark = isDark(), set = (k, v) => map.setPaintProperty("osm", k, v);
    set("raster-brightness-min", dark ? 0.86 : 0); set("raster-brightness-max", dark ? 0.04 : 1);
    set("raster-hue-rotate", dark ? 180 : 0); set("raster-saturation", dark ? -0.7 : -0.3); set("raster-contrast", dark ? -0.1 : 0);
    map.setPaintProperty("pts", "circle-stroke-color", dark ? "rgba(0,0,0,.6)" : "#fff");
  }

  // ---------- record card ----------
  function openOsmCard(p, lngLat) {
    state.card = { id: "osm", lngLat };
    $("card").innerHTML = `<div class="hd"><span class="dot" style="background:${OSM_COLOR}"></span><b>${p.n || "droga bez nazwy"}</b><button class="ib sm" id="cardX" type="button" aria-label="Zamknij"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="opis">Odcinek oznaczony w OpenStreetMap jako droga w budowie (highway=construction). To oznaczenie społeczności OSM, nie dane urzędu.</div>
      <dl><dt>W budowie</dt><dd>${fmtDate(p.od)} → ${p.o ? "nadal (stan 7.11.2026)" : fmtDate(p.do)}</dd><dt>Źródło</dt><dd>OpenStreetMap (historia przez ohsome)</dd></dl>
      <ul><li><a href="https://www.openstreetmap.org/way/${p.w}/history" target="_blank" rel="noopener">Historia obiektu w OSM</a></li></ul>`;
    $("card").hidden = false; $("cardX").onclick = closeCard; placeCard();
  }
  function openCard(id, lngLat) {
    const i = D.items.find((x) => x.id === id); if (!i) return;
    state.card = { id, lngLat };
    const src = (i.zrodla || []).map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.typ}${s.data ? " · " + s.data : ""}</a></li>`).join("");
    $("card").innerHTML = `<div class="hd"><span class="dot" style="background:${ST[i.status]}"></span><b>${i.ulica || "bez ulicy"}</b><button class="ib sm" id="cardX" type="button" aria-label="Zamknij"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="opis">${i.opis || "–"}</div>
      <dl><dt>Status</dt><dd>${ST_PL[i.status]}</dd>
        <dt>Umowa</dt><dd>${i.od ? fmtDate(i.od) + " → " + fmtDate(i.do) : "brak dat (plan: rok " + (i.rok || "?") + ")"}</dd>
        <dt>Wartość</dt><dd>${i.wartosc_zl ? fmtZl(i.wartosc_zl) + (i.zrodlo === "plan" ? " (szacunek z planu)" : "") : "–"}</dd>
        <dt>Źródło</dt><dd>${SRC[i.zrodlo]}</dd></dl>
      <ul>${src}</ul>`;
    $("card").hidden = false;
    $("cardX").onclick = closeCard;
    placeCard();
  }
  function placeCard() {
    if (!state.card || isPhone()) return;
    const p = map.project(state.card.lngLat), c = $("card"), st = $("stage").getBoundingClientRect();
    const x = Math.min(st.width - c.offsetWidth - 12, Math.max(12, p.x + 16)), y = Math.min(st.height - c.offsetHeight - 120, Math.max(12, p.y - 40));
    c.style.left = x + "px"; c.style.top = y + "px";
  }
  function closeCard() { state.card = null; $("card").hidden = true; }

  // ---------- update ----------
  function update() {
    const its = D.items.filter(shown);
    if (state.view === "dzien") {
      $("cNum").textContent = its.filter((i) => activeOn(i, state.day)).length;
      const no = state.osm ? osmData().features.length : 0;
      $("cWhat").innerHTML = "umów na roboty drogowe w toku" + (state.osm ? `<br>+ ${no} odcinków OSM oznaczonych „w budowie”` : ""); $("cDate").textContent = fmtDate(state.day);
    } else if (state.view === "rok") {
      const y = state.year || state.day.slice(0, 4);
      $("cNum").textContent = its.filter((i) => i.rok === y).length;
      $("cWhat").textContent = "robót drogowych w roku"; $("cDate").textContent = y;
    } else {
      $("cNum").textContent = its.length; $("cWhat").textContent = "robót drogowych w bazie"; $("cDate").textContent = "2017–2026";
    }
    moveCursor(); bars(); kpis(); calendar(); paintMap(); legend();
  }
  function legend() {
    $("legend").innerHTML = state.color === "status"
      ? Object.keys(ST).map((k) => `<span><i style="background:${ST[k]}"></i>${ST_PL[k]}</span>`).join("")
      : ["2021", "2022", "2023", "2024", "2025"].map((y) => `<span><i style="background:${YC[y]}"></i>${y}</span>`).join("") + `<span><i style="background:#8e8e93"></i>inne</span>`;
    if (state.osm) $("legend").innerHTML += `<span><i class="ln" style="background:${OSM_COLOR}"></i>OSM: droga w budowie</span>`;
  }
  let paintView = () => {};

  // ---------- play ----------
  function togglePlay(force) {
    const on = force ?? !state.playing;
    if (!on) { clearInterval(state.playing); state.playing = null; }
    else {
      if (state.day >= T1) state.day = T0;
      state.view = "dzien"; paintView();
      state.playing = setInterval(() => {
        const n = iso(t(state.day) + SPEEDS[state.speed][0] * DAY);
        if (n > T1) return togglePlay(false);
        setDay(n);
      }, 90);
    }
    $("playIcon").setAttribute("d", state.playing ? "M7 5h4v14H7zM13 5h4v14h-4z" : "M8 5v14l11-7z");
    $("play").setAttribute("aria-label", state.playing ? "Pauza" : "Odtwórz");
  }

  // ---------- init ----------
  async function init() {
    D = await (await fetch("data/remonty.json")).json();
    roczne = Object.fromEntries(D.roczne.map((r) => [r.rok, r]));
    buildWeekly();
    if (isPhone()) document.body.classList.add("report-closed");
    $("reportBtn").setAttribute("aria-expanded", String(!document.body.classList.contains("report-closed")));

    paintView = seg($("viewSeg"), [["dzien", "W toku danego dnia"], ["rok", "Rok"], ["wszystko", "Wszystkie"]], () => state.view, (v) => { state.view = v; if (v !== "rok") state.year = null; });
    seg($("colorSeg"), [["status", "Status"], ["rok", "Rok"]], () => state.color, (v) => { state.color = v; });
    $("srcChips").innerHTML = Object.entries(SRC).map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="true">${l}</button>`).join("") + `<button type="button" data-osm="1" aria-pressed="false" title="Odcinki oznaczone w OpenStreetMap jako droga w budowie">OSM: w budowie</button>`;
    $("srcChips").addEventListener("click", (e) => {
      const o = e.target.closest("button[data-osm]");
      if (o) { state.osm = !state.osm; o.setAttribute("aria-pressed", String(state.osm)); return update(); }
      const b = e.target.closest("button[data-k]"); if (!b) return;
      state.src.has(b.dataset.k) ? state.src.delete(b.dataset.k) : state.src.add(b.dataset.k);
      b.setAttribute("aria-pressed", String(state.src.has(b.dataset.k)));
      buildWeekly(); drawChart(); update();
    });
    $("dekl").innerHTML = D.deklaracje.filter((d) => ["d01", "d06", "d11", "d14", "d16"].includes(d.id))
      .map((d) => `<li><b>${d.okres}:</b> ${d.wartosc} ${d.jednostka} — ${d.wskaznik.toLowerCase()} <a href="${d.zrodlo_url}" target="_blank" rel="noopener">↗</a></li>`).join("");
    compare();

    seg($("metricSeg"), METRICS, () => state.metric, (v) => { state.metric = v; });
    $("bars").addEventListener("click", (e) => { const b = e.target.closest(".bar"); if (!b) return;
      if (state.view === "rok" && state.year === b.dataset.y) { state.view = "dzien"; state.year = null; } else { state.view = "rok"; state.year = b.dataset.y; }
      paintView(); update(); });
    $("yearClear").addEventListener("click", () => { state.view = "wszystko"; state.year = null; paintView(); update(); });
    $("cal").addEventListener("click", (e) => { const r = e.target.closest("rect"); if (r) { togglePlay(false); setDay(r.dataset.d); } });
    $("play").addEventListener("click", () => togglePlay());
    $("speed").addEventListener("click", () => { state.speed = (state.speed + 1) % SPEEDS.length; $("speed").textContent = SPEEDS[state.speed][1]; });
    const ch = $("chart");
    ch.addEventListener("pointerdown", (e) => { e.preventDefault(); togglePlay(false); ch.setPointerCapture(e.pointerId); scrub(e); });
    ch.addEventListener("pointermove", (e) => { if (ch.hasPointerCapture(e.pointerId)) scrub(e); });
    ch.addEventListener("keydown", (e) => {
      const step = { ArrowLeft: -7, ArrowRight: 7, PageDown: -30, PageUp: 30 }[e.key];
      if (step) { e.preventDefault(); setDay(iso(t(state.day) + step * DAY)); }
    });
    const report = (open) => { document.body.classList.toggle("report-closed", !open); $("reportBtn").setAttribute("aria-expanded", String(open)); };
    $("reportBtn").addEventListener("click", () => report(true));
    $("reportHide").addEventListener("click", () => report(false));
    addEventListener("keydown", (e) => { if (e.key === "Escape") { closeCard(); if (isPhone()) report(false); } });
    $("themeBtn").addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("mapyAnalizyTheme", next); } catch (e) { /* private mode */ }
      basemapTheme(); paintMap();
    });
    $("speed").textContent = SPEEDS[0][1];
    drawChart(); update();  // report and chart do not wait for basemap tiles

    const phone = isPhone();
    map = new maplibregl.Map({
      container: "map", attributionControl: { compact: true, customAttribution: "© OpenStreetMap" },
      bounds: [[19.33, 51.69], [19.64, 51.85]],
      fitBoundsOptions: { padding: { top: phone ? 90 : 40, bottom: phone ? 150 : 120, left: phone ? 10 : 70, right: phone ? 10 : 410 } },
      style: { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19 } }, layers: [{ id: "osm", type: "raster", source: "osm" }] },
    });
    await new Promise((res) => map.once("load", res));
    const [pts, secs] = features();
    map.addSource("osmb", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "osmb", type: "line", source: "osmb", layout: { "line-cap": "round" }, paint: { "line-color": OSM_COLOR, "line-width": 2.5, "line-opacity": 0.85, "line-dasharray": [2, 1.5] } });
    map.addSource("secs", { type: "geojson", data: secs });
    map.addLayer({ id: "secs", type: "line", source: "secs", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 7] } });
    map.addSource("pts", { type: "geojson", data: pts });
    map.addLayer({ id: "pts", type: "circle", source: "pts", paint: {} });
    basemapTheme();
    // click opens the record; hover only changes the cursor (no tooltip, by design)
    map.on("click", (e) => {
      const f = map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: ["pts", "secs", "osmb"] })
        .sort((a, b) => (b.layer.id !== "osmb") - (a.layer.id !== "osmb") || b.properties.a - a.properties.a)[0];
      if (f && f.layer.id === "osmb") openOsmCard(f.properties, e.lngLat);
      else if (f) openCard(f.properties.id, f.geometry.type === "Point" ? f.geometry.coordinates : e.lngLat); else closeCard();
    });
    for (const l of ["pts", "secs", "osmb"]) {
      map.on("mouseenter", l, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", l, () => { map.getCanvas().style.cursor = ""; });
    }
    map.on("move", placeCard);
    $("zIn").addEventListener("click", () => map.zoomIn()); $("zOut").addEventListener("click", () => map.zoomOut());
    update();
  }
  init().catch((e) => { console.error(e); $("cNum").textContent = "!"; $("cWhat").textContent = "Nie udało się wczytać danych"; });
})();
