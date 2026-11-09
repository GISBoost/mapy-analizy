"use strict";
// Road works in Lodz: map + time scrubber + report. Data: data/remonty.json (remonty/pipeline/e8_web_export.py).
(() => {
  const $ = (id) => document.getElementById(id);
  const T0 = "2021-01-01", T1 = "2026-11-09", BILET_END = "2024-12-31", OSM_COLOR = "#bf5af2";  // T1: lodz.pl restrictions snapshot (9.11); BZP data itself ends 7.11
  const DAY = 864e5, t = (d) => Date.parse(d + "T00:00:00Z"), iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const SPAN = (t(T1) - t(T0)) / DAY;
  // OSM classes (e10_osm_balance.py): x = only OSM (in the balance), p = confirmed by city data, u = unnamed (not counted)
  const OSM_K = { x: OSM_COLOR, p: "#e5c4ff", u: "#8a7a99" };
  const OSM_PL = { x: "OSM: tylko OSM (w bilansie)", p: "OSM: potwierdzone w danych urzędu", u: "OSM: bez nazwy (poza bilansem)" };
  const ST = { plan: "#64d2ff", ogloszone: "#ffd60a", udzielone: "#ff9f0a", wykonane: "#30d158" };
  const ST_PL = { plan: "plan zamówień (BIP)", ogloszone: "przetarg ogłoszony", udzielone: "umowa zawarta", wykonane: "umowa wykonana" };
  const YC = { 2017: "#8e8e93", 2019: "#8e8e93", 2020: "#8e8e93", 2021: "#5e5ce6", 2022: "#0a84ff", 2023: "#64d2ff", 2024: "#30d158", 2025: "#ffd60a", 2026: "#ff9f0a" };
  const SRC = { plan: "Plany UMŁ (BIP)", bzp_zim: "Przetargi ZIM", bzp_zdit: "Przetargi ZDiT", bzp_uml: "Przetargi UMŁ" };
  // traffic restrictions (remonty/pipeline/e11_lodzpl.py): impact groups shown as filter chips, own palette
  const IMP = {
    czesciowe: ["Częściowe zajęcie", "#ff375f", ["one_lane_closed", "one_lane_open", "lane_narrowing"]],
    wahadlo: ["Ruch wahadłowy", "#ff8fab", ["alternating_traffic"]],
    kierunek: ["Jeden kierunek / zakaz skrętu", "#ac8e68", ["one_direction_only", "turn_ban"]],
    utrzymany: ["Ruch utrzymany", "#66d4cf", ["both_directions_maintained", "temporary_carriageway", "no_impact"]],
    zamkniecie: ["Zamknięcie / tylko dojazd", "#c1121f", ["full_closure", "local_access_only"]],
    nieustalone: ["Nieustalone", "#8e8e93", ["unknown"]],
  };
  const IMP_PL = { full_closure: "pełne zamknięcie", one_lane_closed: "zajęty jeden pas", one_lane_open: "przejazd jednym pasem", lane_narrowing: "zwężenie (liczba pasów zmienna lub nieznana)",
    alternating_traffic: "ruch wahadłowy", one_direction_only: "ruch tylko w jednym kierunku", both_directions_maintained: "ruch w obu kierunkach utrzymany", temporary_carriageway: "jezdnia tymczasowa",
    local_access_only: "zamknięte, tylko wjazdy docelowe", turn_ban: "zakaz skrętu", no_impact: "brak utrudnień", unknown: "nieustalone (np. „prace pod ruchem”)" };
  const impGroup = (k) => Object.keys(IMP).find((g) => IMP[g][2].includes(k)) || "nieustalone";
  const PREC_PL = { approximate: "około", month: "miesiąc", season: "pora roku", year: "rok" };
  const STAT_PL = { planned: "planowane", observed: "zaobserwowane", actual: "faktyczne", cancelled: "odwołane" };
  const SPEEDS = [[7, "1 tydz."], [1, "1 dzień"], [30, "1 mies."]];
  const YEARS = ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];
  const METRICS = [["roboty", "Roboty"], ["dni_ge1", "Dni ≥1"], ["dni_ge3", "≥3"], ["dni_ge5", "≥5"]];
  const fmtDate = (d) => new Date(t(d)).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const fmtZl = (v) => v >= 1e6 ? (v / 1e6).toLocaleString("pl-PL", { maximumFractionDigits: 1 }) + " mln zł" : Math.round(v).toLocaleString("pl-PL") + " zł";
  const isPhone = () => matchMedia("(max-width: 760px)").matches;
  const isDark = () => document.documentElement.getAttribute("data-theme") !== "light";

  const state = { day: "2022-06-15", view: "dzien", year: null, src: new Set(Object.keys(SRC)), osm: true, imp: new Set(Object.keys(IMP)), color: "status", metric: "roboty", playing: null, speed: 0, card: null };
  let D, map, roczne, weekly = [], utrWeekly = [], osmY = {}, osmDay = new Map();
  const osmWorks = (y) => (osmY[y] || {}).roboty || 0;

  const shown = (i) => state.src.has(i.zrodlo);
  const activeOn = (i, d) => i.od && i.od <= d && d <= i.do;
  // "Rok" = works whose contract period overlaps the year (UTRUDNIENIA.md, decision 9); plan items without dates keep their plan year.
  // i.rok is the procurement year: a 2026 notice can describe works done in 2025.
  const inYear = (i, y) => i.od ? i.od <= y + "-12-31" && i.do >= y + "-01-01" : i.rok === y;
  const lit = (i) => state.view === "dzien" ? activeOn(i, state.day) : state.view === "rok" ? inYear(i, state.year || state.day.slice(0, 4)) : true;
  const utrLit = (u) => { const [s, e] = u.okres, y = state.year || state.day.slice(0, 4);
    return !s ? state.view === "wszystko" : state.view === "dzien" ? s <= state.day && state.day <= e : state.view === "rok" ? s <= y + "-12-31" && e >= y + "-01-01" : true; };

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
      let m = 0, sp = {};
      for (let k = 0; k < 7; k++) {
        const d = iso(ms + k * DAY), c = {}; let n = 0;
        for (const i of its) if (activeOn(i, d)) { n++; c[i.status] = (c[i.status] || 0) + 1; }
        if (n > m) { m = n; sp = c; }
      }
      weekly.push([iso(ms), m, sp]);
    }
    utrWeekly = [];
    const us = (D.utrudnienia || []).filter((u) => u.okres[0] && state.imp.has(impGroup(u.traffic_impact)));
    for (let ms = t(T0); ms <= t(T1); ms += 7 * DAY) {
      let best = {}, bn = 0;
      for (let k = 0; k < 7; k++) {
        const d = iso(ms + k * DAY), c = {}; let n = 0;
        for (const u of us) if (u.okres[0] <= d && d <= u.okres[1]) { n++; const g = impGroup(u.traffic_impact); c[g] = (c[g] || 0) + 1; }
        if (n > bn) { bn = n; best = c; }
      }
      utrWeekly.push([iso(ms), bn, best]);
    }
  }
  function drawChart() {
    const mx = Math.max(10, ...weekly.map((w) => w[1]), ...utrWeekly.map((w) => w[1])), Y = (n) => 100 - (n / mx) * 94;
    // restrictions (lodz.pl, archive from XI 2024): own stack by impact group, translucent, drawn behind the contracts
    const G = Object.keys(IMP);
    const utrLayers = G.map((g, gi) => {
      const top = (w) => G.slice(0, gi + 1).reduce((a, q) => a + (w[2][q] || 0), 0), below = (w) => top(w) - (w[2][g] || 0);
      if (!utrWeekly.some((w) => w[2][g])) return "";
      let p = "M0 100";
      for (const w of utrWeekly) p += `L${X(w[0]).toFixed(1)} ${Y(top(w)).toFixed(1)}`;
      for (const w of [...utrWeekly].reverse()) p += `L${X(w[0]).toFixed(1)} ${Y(below(w)).toFixed(1)}`;
      return `<path d="${p}Z" fill="${IMP[g][1]}" fill-opacity=".5" stroke="none"/>`;
    }).join("");
    // stacked by status, same colours as the map and the yearly bars (bottom layer first)
    const layers = ["wykonane", "udzielone"].map((st, li) => {
      const top = (w) => ["wykonane", "udzielone"].slice(0, li + 1).reduce((a, q) => a + (w[2][q] || 0), 0);
      const below = (w) => li ? top(w) - (w[2].udzielone || 0) : 0;
      let p = "M0 100";
      for (const w of weekly) p += `L${X(w[0]).toFixed(1)} ${Y(top(w)).toFixed(1)}`;
      for (const w of [...weekly].reverse()) p += `L${X(w[0]).toFixed(1)} ${Y(below(w)).toFixed(1)}`;
      return `<path d="${p}Z" fill="${ST[st]}" fill-opacity=".85" stroke="none"/>`;
    }).join("");
    const om = Math.max(...osmDay.values(), 1);
    let op = "";
    for (let ms = t(T0), k = 0; ms <= t(T1); ms += 7 * DAY, k++) { const d = iso(ms); op += `${k ? "L" : "M"}${X(d).toFixed(1)} ${(100 - ((osmDay.get(d) || 0) / om) * 94).toFixed(1)}`; }
    const osmLine = `<path d="${op}" fill="none" stroke="${OSM_COLOR}" stroke-width="1.6" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"/>`;
    const lines = [1, 3, 5].map((n) => `<path d="M0 ${Y(n)}H1000" stroke="var(--grid)" stroke-width="1" vector-effect="non-scaling-stroke" ${n === 5 ? 'stroke-dasharray="4 3"' : ""}/>`).join("");
    const years = ["2021", "2022", "2023", "2024", "2025", "2026"].map((y) => `<span class="ax" style="left:${X(y + "-07-01") / 10}%">${y}</span>`).join("");
    $("chart").innerHTML = `<svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V6" stroke="var(--gap)" stroke-width="3"/></pattern></defs>
        <rect x="0" y="0" width="${X(BILET_END)}" height="100" fill="var(--bilet)" stroke="none"/>
        <rect x="${X("2026-01-01")}" y="0" width="${1000 - X("2026-01-01")}" height="100" fill="rgba(255,69,58,.2)" stroke="none"/>
        ${lines}${utrLayers}${layers}${osmLine}</svg>
      <span class="tag" style="left:4px">wydłużony bilet MPK (do 31.12.2024)</span>
      <span class="tag gap" style="left:${X("2025-01-01") / 10 + 0.5}%">po bilecie</span>
      <span class="tag low" style="left:${X("2026-01-01") / 10 + 0.5}%">mało danych</span>
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
      <p class="note"><b>Tylko OSM</b> (osobna kategoria, nazwane odcinki „w budowie” bez odpowiednika w danych urzędu): ${["2021", "2022", "2023", "2024"].map(osmWorks).join(" · ")} robót w latach 2021–2024, ${osmWorks("2025")} w 2025, ${osmWorks("2026")} w 2026 (do 7 XI).</p>
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
    if (!$("bars").children.length) $("bars").innerHTML = YEARS.map((y) => `<button type="button" class="bar ${y >= "2025" ? "po" : ""}" data-y="${y}"><span class="v"></span><span class="track"><span class="fill"></span><span class="osm"></span><span class="utr"></span></span><span class="y">${y}</span></button>`).join("");
    // "Roboty": stacked by status (legend colours) + "only OSM" on top. Day metrics come from BZP contracts only: one colour.
    const osmV = YEARS.map((y) => dayMetric ? 0 : osmWorks(y));
    const utrV = YEARS.map((y) => dayMetric ? 0 : (D.utrudnienia || []).filter((u) => u.okres[0] && u.okres[0] <= y + "-12-31" && u.okres[1] >= y + "-01-01" && state.imp.has(impGroup(u.traffic_impact))).length);
    const mxO = Math.max(mx, ...osmV, ...utrV);
    const parts = (y, i) => dayMetric ? [[ST.udzielone, vals[i]]]
      : Object.keys(ST).map((s) => [ST[s], D.items.filter((x) => x.rok === y && x.status === s).length]);
    [...$("bars").children].forEach((b, i) => {
      const y = YEARS[i], nodata = dayMetric && y < "2021";
      b.classList.toggle("nodata", nodata); b.classList.toggle("cur", y === cy); b.classList.toggle("future", !!cy && y > cy);
      b.setAttribute("aria-pressed", String(sel === y));
      b.setAttribute("aria-label", `${y}: ${nodata ? "brak danych" : vals[i]}${osmV[i] ? `, plus ${osmV[i]} tylko OSM` : ""}`);
      b.title = nodata ? "brak danych" : ""; b.querySelector(".v").innerHTML = nodata ? "–" : vals[i] + (osmV[i] ? `<small>+${osmV[i]}</small>` : "") + (utrV[i] ? `<small class="u">${utrV[i]} utr.</small>` : "");
      b.style.setProperty("--u", (utrV[i] / mxO) * 100 + "%");
      const f = b.querySelector(".fill");
      f.style.setProperty("--p", (nodata ? 100 : (vals[i] / mxO) * 100) + "%");
      b.style.setProperty("--o", (osmV[i] / mxO) * 100 + "%");
      f.innerHTML = nodata ? "" : parts(y, i).filter(([, n]) => n > 0).map(([c, n]) => `<i style="flex:${n};background:${c}"></i>`).join("");
    });
    $("barsLeg").innerHTML = dayMetric ? `<span><i style="background:${ST.udzielone}"></i>umowy BZP (bez podziału na status)</span><span><i class="nd"></i>brak danych (przed 2021 nie ma umów w BZP)</span>`
      : Object.keys(ST).map((s) => `<span><i style="background:${ST[s]}"></i>${ST_PL[s]}</span>`).join("") + `<span><i style="background:${OSM_COLOR}"></i>tylko OSM (fioletowy słupek obok)</span>`
        + `<span><i style="background:${IMP.czesciowe[1]}"></i>utrudnienia w ruchu w roku (różowy słupek; 2019–2024 komunikaty MPK, tylko roboty zmieniające trasy; od 2025 lodz.pl; poza bilansem)</span>`;
    $("barsNote").textContent = dayMetric
      ? "Dni w roku, w których trwało co najmniej tyle umów z BZP. Okres umowy to górna granica zajęcia drogi. 2026: do 7 listopada."
      : "Roboty na jezdniach i torowiskach (plany + przetargi ZDiT, ZIM, UMŁ), bez umów utrzymaniowych, wg roku postępowania (metoda bilansu). Mapa w widoku „Rok” liczy umowy trwające w danym roku, więc może pokazać więcej. Lata przed 2021 mają tylko plany zamówień, 2026 jest niepełny.";
  }
  function kpis() {
    const y = state.view === "rok" ? (state.year || state.day.slice(0, 4)) : null, r = y ? roczne[y] : null;
    $("kpiTitle").textContent = y ? `Rok ${y}` : "Wszystkie lata (2017–2026)";
    $("yearClear").hidden = !y;
    const its = D.items.filter((i) => shown(i) && (!y || inYear(i, y)));
    const val = its.filter((i) => i.zrodlo !== "plan").reduce((s, i) => s + (i.wartosc_zl || 0), 0);
    const tile = (v, tt, w) => `<div><div class="v ${w ? "w" : ""}">${v}</div><div class="t">${tt}</div></div>`;
    const oy = y ? osmY[y] : null, oAll = D.osm_bilans.stats.only_osm_works;
    $("osmLine").innerHTML = `<b>Tylko OSM</b> (nazwane odcinki bez odpowiednika w danych urzędu, poza powyższymi liczbami): ${oy ? `${oy.roboty} robót, ${oy.dni_ge1} dni z ≥1 w trakcie` : `${oAll} robót w latach 2019–2026`}.`;
    $("kpis").innerHTML = tile(its.length, y ? "robót w trakcie w roku (wg dat umowy)" : "robót (wybrane źródła)") + tile(its.filter((i) => i.lat).length, "na mapie")
      + (r ? tile(r.dni_ge1, "dni z ≥1 w trakcie") + tile(r.dni_ge5, "dni z ≥5 w trakcie", 1) : tile(its.filter((i) => i.od).length, "z datami umowy") + tile(val ? fmtZl(val) : "–", "wartość (BZP)", 1));
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
        s += `<rect data-d="${d}" x="${30 + w * cw}" y="${r * (h + 3)}" width="${cw - 1.2}" height="${h}" rx="2" fill="${col(m)}"><title>${fmtDate(d)}: maks. ${m} w trakcie</title></rect>`;
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
  function utrData() {
    const pts = [], lines = [];
    for (const u of D.utrudnienia || []) {
      const g = impGroup(u.traffic_impact); if (!u.geom || !state.imp.has(g)) continue;
      const f = { type: "Feature", properties: { id: u.id, g, a: utrLit(u) ? 1 : 0 }, geometry: u.geom };
      (u.geom.type === "Point" ? pts : lines).push(f);
    }
    return [{ type: "FeatureCollection", features: pts.sort((a, b) => a.properties.a - b.properties.a) }, { type: "FeatureCollection", features: lines }];
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
    map.getSource("pts").setData(pts); map.getSource("secs").setData(secs); map.getSource("osmb").setData(osmData()); map.getSource("reps").setData(repData());
    const c = colorExpr(), dim = isDark() ? "rgba(255,255,255,.38)" : "rgba(0,0,0,.3)";
    map.setPaintProperty("pts", "circle-color", ["case", ["==", ["get", "a"], 1], c, dim]);
    map.setPaintProperty("pts", "circle-radius", ["case", ["==", ["get", "a"], 1], 6, 2.5]);
    map.setPaintProperty("pts", "circle-stroke-width", ["case", ["==", ["get", "a"], 1], 1.2, 0]);
    map.setPaintProperty("secs", "line-color", ["case", ["==", ["get", "a"], 1], c, dim]);
    map.setPaintProperty("secs", "line-opacity", ["case", ["==", ["get", "a"], 1], 1, 0.5]);
    const [up, ul] = utrData(); map.getSource("utrp").setData(up); map.getSource("utrl").setData(ul);
    const ic = ["match", ["get", "g"], ...Object.entries(IMP).flatMap(([k, v]) => [k, v[1]]), "#8e8e93"];
    map.setPaintProperty("utrp", "circle-color", ["case", ["==", ["get", "a"], 1], ic, dim]);
    map.setPaintProperty("utrp", "circle-radius", ["case", ["==", ["get", "a"], 1], 6, 2.5]);
    map.setPaintProperty("utrp", "circle-stroke-width", ["case", ["==", ["get", "a"], 1], 1.2, 0]);
    map.setPaintProperty("utrl", "line-color", ["case", ["==", ["get", "a"], 1], ic, dim]);
    map.setPaintProperty("utrl", "line-opacity", ["case", ["==", ["get", "a"], 1], 1, 0.45]);
    map.setPaintProperty("utrl-case", "line-opacity", ["case", ["==", ["get", "a"], 1], 0.5, 0]);
    map.setPaintProperty("osmb", "line-color", ["match", ["get", "k"], ...Object.entries(OSM_K).flat(), OSM_COLOR]);
    map.setPaintProperty("osmb", "line-opacity", ["match", ["get", "k"], "u", 0.5, 0.9]);
  }
  function basemapTheme() {
    if (!map) return;
    const dark = isDark(), set = (k, v) => map.setPaintProperty("osm", k, v);
    set("raster-brightness-min", dark ? 0.86 : 0); set("raster-brightness-max", dark ? 0.04 : 1);
    set("raster-hue-rotate", dark ? 180 : 0); set("raster-saturation", dark ? -0.7 : -0.3); set("raster-contrast", dark ? -0.1 : 0);
    map.setPaintProperty("pts", "circle-stroke-color", dark ? "rgba(0,0,0,.6)" : "#fff");
    map.setPaintProperty("utrp", "circle-stroke-color", dark ? "#fff" : "#1c1c1e");
  }

  // ---------- record card ----------
  function openOsmCard(p, lngLat) {
    state.card = { id: "osm", lngLat };
    const mi = p.m && D.items.find((x) => x.id === p.m);
    const cls = { x: "Nazwany odcinek bez odpowiednika w danych urzędu: liczy się w bilansie jako kategoria „tylko OSM”.",
      p: `Potwierdzone w danych urzędu (${mi ? (mi.ulica || "bez ulicy") + ", " + SRC[mi.zrodlo] : "tej samej robocie"}): nie liczy się podwójnie.`,
      u: "Odcinek bez nazwy: zostaje na mapie, ale nie liczy się do żadnych liczb." }[p.k];
    $("card").innerHTML = `<div class="hd"><span class="dot" style="background:${OSM_K[p.k] || OSM_COLOR}"></span><b>${p.n || "droga bez nazwy"}</b><button class="ib sm" id="cardX" type="button" aria-label="Zamknij"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="opis">Odcinek oznaczony w OpenStreetMap jako droga w budowie (highway=construction), przycięty do granicy Łodzi. To oznaczenie społeczności OSM, nie dane urzędu. ${cls}</div>
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
        ${i.od && i.rok ? `<dt>Rok postępowania</dt><dd>${i.rok}</dd>` : ""}
        ${i.zadanie ? `<dt>Część zamówienia</dt><dd>zadanie ${i.zadanie}: ${i.opis_zadania}${i.id !== i.contract_id ? " (wartość w zadaniu 1)" : ""}</dd>` : ""}
        <dt>Wartość</dt><dd>${i.wartosc_zl ? fmtZl(i.wartosc_zl) + (i.zrodlo === "plan" ? " (szacunek z planu)" : "") : "–"}</dd>
        <dt>Źródło</dt><dd>${SRC[i.zrodlo]}${i.osm ? ` · potwierdzone w OSM (${i.osm} odc.)` : ""}</dd></dl>
      <ul>${src}</ul>`;
    $("card").hidden = false;
    $("cardX").onclick = closeCard;
    placeCard();
  }
  const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtPart = (d, prec) => !d ? "?" : d.length === 4 ? d : d.length === 7 ? new Date(t(d + "-01")).toLocaleDateString("pl-PL", { month: "long", year: "numeric", timeZone: "UTC" }) + (prec === "season" ? " (pora roku)" : "") : (prec === "approximate" ? "ok. " : "") + fmtDate(d);
  function openUtrCard(id, lngLat) {
    const u = (D.utrudnienia || []).find((x) => x.id === id); if (!u) return;
    state.card = { id, lngLat };
    const g = impGroup(u.traffic_impact), rel = [u.od && u.do ? `${u.od} – ${u.do}` : u.od, u.kierunek, u.jezdnia, u.wlot, u.pas && `pas ${u.pas}`].filter(Boolean).map(esc).join(" · ");
    const lanes = [u.lanes_open != null && `otwarte: ${u.lanes_open}`, u.lanes_closed != null && `zajęte: ${u.lanes_closed}`].filter(Boolean).join(", ");
    const link = (u.links || []).map((l) => { const i = D.items.find((x) => x.id === l.id); return i ? `<li><button class="linkbtn" type="button" data-item="${esc(i.id)}">Przetarg: ${esc(i.ulica || i.id)}${l.how === "auto" ? " (dopasowany automatycznie: ta sama ulica, nakładające się daty)" : ""}</button></li>` : ""; }).join("");
    const obs = (u.obserwacje || []).map((o) => `<li><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(u.source || "źródło")}${o.published_at ? " · " + o.published_at : ""}${o.captured_at ? " · pobrano " + o.captured_at.slice(0, 10) : ""}</a></li>`).join("");
    const geo = { odcinek: "odcinek między skrzyżowaniami", odcinek_punkt: "środek odcinka (przybliżenie)", skrzyzowanie: "skrzyżowanie", ulica: "środek ulicy (przybliżenie)" }[u.geom_typ] || "brak";
    $("card").innerHTML = `<div class="hd"><span class="dot" style="background:${IMP[g][1]}"></span><b>${esc(u.ulica)}</b><button class="ib sm" id="cardX" type="button" aria-label="Zamknij"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="opis"><b>${IMP_PL[u.traffic_impact] || u.traffic_impact}</b>${u.cytat ? `<br>„${esc(u.cytat)}”` : ""}</div>
      <dl>${rel ? `<dt>Gdzie</dt><dd>${rel}</dd>` : ""}${lanes ? `<dt>Pasy</dt><dd>${lanes}</dd>` : ""}${u.faza ? `<dt>Etap</dt><dd>${esc(u.faza)}</dd>` : ""}
        <dt>Termin</dt><dd>${fmtPart(u.date_start, u.start_precision)} → ${fmtPart(u.date_end, u.end_precision)}${STAT_PL[u.date_status] ? ` (${STAT_PL[u.date_status]})` : ""}</dd>
        <dt>Pewność</dt><dd>${{ high: "wysoka", medium: "średnia", low: "niska" }[u.confidence] || "–"}${u.needs_review ? ` · do weryfikacji: ${esc(u.needs_review)}` : ""}</dd>
        <dt>Na mapie</dt><dd>${geo}</dd>${u.zakres_prac && u.zakres_prac.length ? `<dt>Prace</dt><dd>${u.zakres_prac.map(esc).join(", ")}</dd>` : ""}</dl>
      <ul>${obs}${link}</ul>`;
    $("card").hidden = false; $("cardX").onclick = closeCard;
    $("card").querySelectorAll("[data-item]").forEach((b) => b.addEventListener("click", () => { const i = D.items.find((x) => x.id === b.dataset.item); openCard(i.id, i.lat ? [i.lon, i.lat] : state.card.lngLat); }));
    placeCard();
  }
  function utrSection() {
    const all = D.utrudnienia || [], lit = all.filter(utrLit);
    $("impChips").innerHTML = Object.entries(IMP).map(([k, [l, c]]) => { const n = lit.filter((u) => impGroup(u.traffic_impact) === k).length;
      return `<button type="button" data-g="${k}" aria-pressed="${state.imp.has(k)}"><i class="dot" style="background:${c}"></i>${l} <small>${n}</small></button>`; }).join("");
    const cur = all.filter((u) => u.na_stronie).length;
    $("utrNote").innerHTML = `${lit.length} z ${all.length} utrudnień w wybranym okresie. ${cur} z bieżącej listy <a href="https://lodz.pl/remonty/" target="_blank" rel="noopener">lodz.pl/remonty</a> (stan z 9.11.2026). Wcześniejsze z kopii tej strony w Internet Archive (22 kopie od XI 2024; czytelne karty od 2025) , z ręcznie sprawdzonych komunikatów, a dla 2019–2024 z komunikatów MPK o zmianach tras (Internet Archive): widać tylko roboty, które zmieniły trasy autobusów lub tramwajów, zwykle bez typu zajęcia pasa; brak końca w komunikacie = start plus ok. 2,5 mies. Gdy karta nie podaje startu, start to pierwsza kopia z kartą albo szacunek (koniec minus ok. 2,5 mies.). Liczba pasów tylko wtedy, gdy podaje ją źródło. Utrudnienia nie wchodzą do liczby robót ani do bilansu biletu.`;
    const ng = all.filter((u) => !u.geom);
    $("utrNoGeoSum").textContent = `Bez miejsca na mapie (${ng.length})`;
    $("utrNoGeo").innerHTML = ng.map((u) => `<li><button class="linkbtn" type="button" data-utr="${esc(u.id)}">${esc(u.ulica)}</button>: ${IMP_PL[u.traffic_impact] || u.traffic_impact}</li>`).join("");
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
      $("cWhat").innerHTML = "umów na roboty drogowe w trakcie" + (state.osm ? (state.day > "2026-11-07" ? "<br>OSM i BZP: dane do 7.11" : `<br>+ ${osmDay.get(state.day) || 0} robót tylko OSM`) : ""); $("cDate").textContent = fmtDate(state.day);
    } else if (state.view === "rok") {
      const y = state.year || state.day.slice(0, 4);
      $("cNum").textContent = its.filter((i) => inYear(i, y)).length;
      $("cWhat").innerHTML = "robót drogowych w trakcie w roku" + (state.osm ? `<br>+ ${osmWorks(y)} robót tylko OSM` : ""); $("cDate").textContent = y;
    } else {
      $("cNum").textContent = its.length; $("cWhat").innerHTML = "robót drogowych w bazie" + (state.osm ? `<br>+ ${D.osm_bilans.stats.only_osm_works} robót tylko OSM` : ""); $("cDate").textContent = "2017–2026";
    }
    // restrictions lit in the current view; lodz.pl archive starts II 2025, earlier = no data, not zero
    const u0 = (D.utrudnienia || []).reduce((m, u) => u.okres[0] && u.okres[0] < m ? u.okres[0] : m, "9999");
    const per = state.view === "dzien" ? state.day : state.view === "rok" ? (state.year || state.day.slice(0, 4)) + "-12-31" : "9999";
    const nU = (D.utrudnienia || []).filter((u) => state.imp.has(impGroup(u.traffic_impact)) && utrLit(u)).length;
    $("cWhat").innerHTML += per < u0 ? "<br>utrudnienia: brak danych przed " + u0.slice(5, 7) + "." + u0.slice(0, 4)
      : `<br><b>${nU}</b> ${state.view === "dzien" ? "utrudnień w ruchu" : state.view === "rok" ? "utrudnień w ruchu w roku" : "utrudnień w bazie"}`;
    moveCursor(); bars(); kpis(); utrSection(); calendar(); paintMap(); legend();
  }
  function legend() {
    let h = state.color === "status"
      ? Object.keys(ST).map((k) => `<span><i style="background:${ST[k]}"></i>${ST_PL[k]}</span>`).join("")
      : ["2021", "2022", "2023", "2024", "2025"].map((y) => `<span><i style="background:${YC[y]}"></i>${y}</span>`).join("") + `<span><i style="background:#8e8e93"></i>inne</span>`;
    if (state.imp.size) h += `<span>${Object.entries(IMP).filter(([k]) => state.imp.has(k)).map(([, [, c]]) => `<i class="ring" style="background:${c}"></i>`).join("")}utrudnienia w ruchu (kolory jak w raporcie)</span>`;
    if (state.osm) h += Object.keys(OSM_K).map((k) => `<span><i class="ln" style="background:${OSM_K[k]}"></i>${OSM_PL[k]}</span>`).join("");
    if (repOn) h += `<span><i style="background:${REP_COLOR}"></i>zgłoszenia mieszkańców (zatwierdzone)</span><span><i style="background:${REP_PENDING};opacity:.55"></i>zgłoszone, czekają na weryfikację</span>`;
    $("legend").innerHTML = h;
    $("chartLeg").innerHTML = ["wykonane", "udzielone"].map((k) => `<span><i style="background:${ST[k]}"></i>${ST_PL[k]}</span>`).join("") + `<span><i style="background:${OSM_COLOR}"></i>tylko OSM</span>`
      + `<span>${Object.entries(IMP).filter(([k]) => state.imp.has(k)).map(([, [, c]]) => `<i style="background:${c};opacity:.6;margin-right:1px"></i>`).join("")}utrudnienia (MPK 2019–2024, lodz.pl od 2025)</span>`;
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

  // ---------- citizen reports (Supabase REST; the public sees only status=approved, enforced by RLS) ----------
  // Separate layer: not part of the counters, bars, KPIs or the report (unverified data), only filtered by the day slider.
  const REP = window.REMONTY_REPORTS || {}, repOn = !!(REP.url && REP.key), REP_COLOR = "#ff375f", REP_PENDING = "#8e8e93", LODZ = [19.28, 51.65, 19.70, 51.90];
  const REP_THANKS = "Dziękujemy! Zgłoszenie zostało przyjęte i oczekuje na weryfikację. Po zatwierdzeniu pojawi się na mapie.";
  let reps = [], repMode = "idle", repMarker = null, toastT = 0;  // repMode: idle | pick | form
  // publishable key goes in `apikey` only (it is not a JWT, so no Authorization header)
  const repApi = (q, init = {}) => fetch(`${REP.url}/rest/v1/remonty_reports${q}`, { ...init, headers: { apikey: REP.key, "Content-Type": "application/json", ...init.headers } });
  const inLodz = (p) => p.lng >= LODZ[0] && p.lng <= LODZ[2] && p.lat >= LODZ[1] && p.lat <= LODZ[3];
  const repLit = (r) => {
    const end = r.ends_on || "9999-12-31", y = state.year || state.day.slice(0, 4);
    return state.view === "dzien" ? r.starts_on <= state.day && state.day <= end : state.view === "rok" ? r.starts_on <= y + "-12-31" && end >= y + "-01-01" : true;
  };
  const repData = () => ({ type: "FeatureCollection", features: reps.filter(repLit).map((r) => ({ type: "Feature", properties: { id: r.id, st: r.status }, geometry: { type: "Point", coordinates: [r.lng, r.lat] } })) });
  function say(msg, ms = 4500) {  // hint / toast line; ms = 0 keeps it until the next call
    clearTimeout(toastT);
    $("rhintTx").textContent = msg; $("rhint").hidden = !msg;
    $("rhintC").hidden = $("rhintX").hidden = repMode !== "pick";
    if (msg && ms) toastT = setTimeout(() => { $("rhint").hidden = true; }, ms);
  }
  async function loadReports(manual) {
    try {
      const r = await repApi("?select=id,lat,lng,description,starts_on,ends_on,source_url,status&status=in.(approved,pending)&order=starts_on.desc&limit=1000");
      if (!r.ok) throw new Error(r.status);
      reps = await r.json();  // replace, never append: no duplicate markers
      paintMap();
      if (manual) say(`Zgłoszenia odświeżone: ${reps.length}.`);
    } catch (e) { console.warn("reports:", e); if (manual) say("Nie udało się pobrać zgłoszeń. Spróbuj później."); }  // the rest of the map is unaffected
  }
  function openRepCard(id, lngLat) {  // user text only via textContent
    const r = reps.find((x) => x.id === id); if (!r) return;
    state.card = { id, lngLat };
    const el = (tag, txt, cls) => { const n = document.createElement(tag); if (txt != null) n.textContent = txt; if (cls) n.className = cls; return n; };
    const dot = el("span", null, "dot"), x = el("button", null, "ib sm");
    const pend = r.status === "pending"; dot.style.background = pend ? REP_PENDING : REP_COLOR; x.type = "button"; x.setAttribute("aria-label", "Zamknij"); x.onclick = closeCard;
    x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    const hd = el("div", null, "hd"), dl = el("dl");
    hd.append(dot, el("b", pend ? "Zgłoszenie czeka na weryfikację" : "Zgłoszenie mieszkańca"), x);
    [["Początek", fmtDate(r.starts_on)], ["Koniec", r.ends_on ? fmtDate(r.ends_on) : "nieznany lub trwa"]].forEach(([k, v]) => dl.append(el("dt", k), el("dd", v)));
    const kids = [hd, el("div", r.description, "opis rep"), dl, el("p", pend ? "Ktoś już zgłosił to miejsce. Moderator jeszcze go nie sprawdził, więc dane mogą być błędne. Nie wchodzi do liczb w raporcie." : "Zgłoszenie mieszkańca zatwierdzone przez moderatora. To nie są dane urzędu i nie wchodzą do liczb w raporcie.", "note")];
    if (!pend && /^https?:\/\//i.test(r.source_url || ""))  // no links from unmoderated reports
      { const a = el("a", "Źródło zgłoszenia ↗"); a.href = r.source_url; a.target = "_blank"; a.rel = "noopener nofollow"; kids.push(a); }
    $("card").replaceChildren(...kids); $("card").hidden = false; placeCard();
  }
  function repStart() {
    closeCard(); if (isPhone()) $("reportHide").click();
    repMode = "pick"; document.body.classList.add("rep-busy"); map.getCanvas().style.cursor = "crosshair";
    say("Kliknij na mapie miejsce remontu.", 0);
  }
  function repEnd() {
    if (repMode === "idle") return;
    repMode = "idle"; document.body.classList.remove("rep-busy"); map.getCanvas().style.cursor = "";
    if (repMarker) { repMarker.remove(); repMarker = null; }
    $("rform").hidden = true; $("rform").reset(); $("rmsg").textContent = ""; $("rform").querySelector(".rsend").disabled = false;
    say("");
  }
  const repCoords = () => { const p = repMarker.getLngLat(); $("rloc").textContent = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`; };
  function repPlace(p) {  // first click opens the form, later clicks / dragging only move the pin
    if (!inLodz(p)) return say(repMode === "pick" ? "To miejsce jest poza Łodzią. Wybierz punkt w granicach miasta." : "Poza Łodzią: pinezka musi stać w granicach miasta.", repMode === "pick" ? 0 : 4500);
    if (!repMarker) {
      const pin = document.createElement("div"); pin.className = "repin";
      repMarker = new maplibregl.Marker({ element: pin, draggable: true }).setLngLat([p.lng, p.lat]).addTo(map);
      repMarker.on("dragend", repCoords);
    } else repMarker.setLngLat([p.lng, p.lat]);
    repCoords();
    if (repMode === "pick") { repMode = "form"; say(""); $("rform").hidden = false; $("rdesc").focus(); }
  }
  async function repSend(e) {
    e.preventDefault();
    const f = e.target, v = (n) => f.elements[n].value.trim(), msg = (m) => { $("rmsg").textContent = m; };
    if (v("website")) { repEnd(); return say(REP_THANKS, 12000); }  // honeypot: only bots fill the hidden field; pretend success
    let src = v("source_url");
    if (src) {  // "lodz.pl/x" is accepted and gets https://; anything that is not an address is refused here with a clear message
      if (!/^https?:\/\//i.test(src)) src = "https://" + src;
      try { if (/\s/.test(src) || !new URL(src).hostname.includes(".")) throw 0; } catch (_) { return msg("Źródło musi być adresem strony, np. https://lodz.pl/remonty. Zostaw puste, jeśli nie masz linku."); }
    }
    const p = repMarker.getLngLat(), s = v("starts_on"), en = v("ends_on"), btn = f.querySelector(".rsend");
    if (!inLodz(p)) return msg("Pinezka jest poza Łodzią.");
    if (en && en < s) return msg("Koniec nie może być wcześniejszy niż początek.");
    btn.disabled = true; msg("Wysyłanie…");  // disabled while in flight: no double submit
    try {
      const r = await repApi("", { method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), description: v("description"), starts_on: s, ends_on: en || null, source_url: src || null }) });
      if (!r.ok) throw await r.json().catch(() => ({}));  // PostgREST error body: {code, message}
      // show the new report at once as a grey "pending" pin (the next fetch replaces it with the real row)
      const row = { id: "local-" + Date.now(), lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), description: v("description"), starts_on: s, ends_on: en || null, source_url: null, status: "pending" };
      reps.push(row); repEnd();
      if (!repLit(row)) { state.view = "wszystko"; state.year = null; paintView(); }  // otherwise the day slider would hide it
      update(); say(REP_THANKS, 12000);
    } catch (err) {
      console.warn("report:", err);
      const m = String((err && err.message) || "");
      msg(err && err.code === "P0001" ? (m === "rate_limit_user" ? "Wysłałeś kilka zgłoszeń w ciągu minuty. Spróbuj ponownie za chwilę." : "Dostaliśmy teraz bardzo dużo zgłoszeń. Spróbuj ponownie później.") : m.includes("no_links") ? "Opis nie może zawierać linków. Link wpisz w polu „Źródło”." : "Nie udało się wysłać zgłoszenia. Sprawdź dane i spróbuj ponownie.");
      btn.disabled = false;
    }
  }
  function repInit() {
    $("repTools").hidden = false;
    $("addBtn").addEventListener("click", repStart);
    $("repRefresh").addEventListener("click", () => loadReports(true));
    $("rhintX").addEventListener("click", repEnd); $("rformX").addEventListener("click", repEnd);
    $("rhintC").addEventListener("click", () => repPlace(map.getCenter()));  // keyboard route: pan the map, then use the centre
    $("rform").addEventListener("submit", repSend);
    loadReports();
  }

  // ---------- init ----------
  async function init() {
    D = await (await fetch("data/remonty.json?v=19")).json();
    roczne = Object.fromEntries(D.roczne.map((r) => [r.rok, r]));
    osmY = Object.fromEntries(D.osm_bilans.roczne.map((r) => [r.rok, r])); osmDay = new Map(D.osm_bilans.dzienne);
    new ResizeObserver(() => document.documentElement.style.setProperty("--bar-h", $("bar").offsetHeight + "px")).observe($("bar"));
    buildWeekly();
    if (isPhone()) document.body.classList.add("report-closed");
    $("reportBtn").setAttribute("aria-expanded", String(!document.body.classList.contains("report-closed")));

    paintView = seg($("viewSeg"), [["dzien", "W trakcie danego dnia"], ["rok", "Rok"], ["wszystko", "Wszystkie"]], () => state.view, (v) => { state.view = v; if (v !== "rok") state.year = null; });
    seg($("colorSeg"), [["status", "Status"], ["rok", "Rok"]], () => state.color, (v) => { state.color = v; });
    $("srcChips").innerHTML = Object.entries(SRC).map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="true">${l}</button>`).join("") + `<button type="button" data-osm="1" aria-pressed="true" title="Odcinki oznaczone w OpenStreetMap jako droga w budowie, przycięte do granicy Łodzi">OSM: w budowie</button>`;
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
    $("impChips").addEventListener("click", (e) => { const b = e.target.closest("button[data-g]"); if (!b) return;
      state.imp.has(b.dataset.g) ? state.imp.delete(b.dataset.g) : state.imp.add(b.dataset.g); buildWeekly(); drawChart(); update(); });
    $("utrAll").addEventListener("click", () => { state.view = "wszystko"; state.year = null; paintView(); update(); });
    $("utrNoGeo").addEventListener("click", (e) => { const b = e.target.closest("[data-utr]"); if (b) openUtrCard(b.dataset.utr, map ? map.getCenter() : [19.46, 51.76]); });

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
    addEventListener("keydown", (e) => { if (e.key === "Escape") { closeCard(); repEnd(); if (isPhone()) report(false); } });
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
    // restrictions on top: lines with a dark casing, points with a contrasting ring, so they read apart from contract dots
    map.addSource("utrl", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "utrl-case", type: "line", source: "utrl", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1c1c1e", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 15, 12], "line-opacity": 0.5 } });
    map.addLayer({ id: "utrl", type: "line", source: "utrl", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 15, 8] } });
    map.addSource("utrp", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "utrp", type: "circle", source: "utrp", paint: {} });
    map.addSource("reps", { type: "geojson", data: repData() });
    map.addLayer({ id: "reps", type: "circle", source: "reps", paint: { "circle-color": ["case", ["==", ["get", "st"], "pending"], REP_PENDING, REP_COLOR], "circle-radius": ["case", ["==", ["get", "st"], "pending"], 6.5, 8], "circle-opacity": ["case", ["==", ["get", "st"], "pending"], 0.55, 1], "circle-stroke-width": 2, "circle-stroke-opacity": ["case", ["==", ["get", "st"], "pending"], 0.5, 1], "circle-stroke-color": "#fff" } });
    basemapTheme();
    // click opens the record; hover only changes the cursor (no tooltip, by design)
    const hit = (p, r = 12) => [[p.x - r, p.y - r], [p.x + r, p.y + r]];  // click tolerance in px around points and lines
    map.on("click", (e) => {
      if (repMode !== "idle") return repPlace(e.lngLat);
      const rf = map.queryRenderedFeatures(hit(e.point), { layers: ["reps"] })[0];
      if (rf) return openRepCard(rf.properties.id, rf.geometry.coordinates);
      const pri = (l) => l.startsWith("utr") ? 2 : l !== "osmb" ? 1 : 0;
      const f = map.queryRenderedFeatures(hit(e.point), { layers: ["utrp", "utrl", "pts", "secs", "osmb"] })
        .sort((a, b) => (b.properties.a || 0) - (a.properties.a || 0) || pri(b.layer.id) - pri(a.layer.id))[0];
      if (f && f.layer.id.startsWith("utr")) openUtrCard(f.properties.id, f.geometry.type === "Point" ? f.geometry.coordinates : e.lngLat);
      else if (f && f.layer.id === "osmb") openOsmCard(f.properties, e.lngLat);
      else if (f) openCard(f.properties.id, f.geometry.type === "Point" ? f.geometry.coordinates : e.lngLat); else closeCard();
    });
    map.on("mousemove", (e) => { if (repMode === "idle") map.getCanvas().style.cursor = map.queryRenderedFeatures(hit(e.point), { layers: ["utrp", "utrl", "pts", "secs", "osmb", "reps"] }).length ? "pointer" : ""; });
    map.on("move", placeCard);
    $("zIn").addEventListener("click", () => map.zoomIn()); $("zOut").addEventListener("click", () => map.zoomOut());
    if (repOn) repInit();
    update();
  }
  init().catch((e) => { console.error(e); $("cNum").textContent = "!"; $("cWhat").textContent = "Nie udało się wczytać danych"; });
})();
