"use strict";

// Shared inline-SVG chart helpers for the badanie-* report pages (badanie-opoznienia,
// badanie-uczelnie, badanie-dochod-obwody, badanie-dochod-dostepnosc). Hand-rolled SVG,
// no charting library, same approach badanie-opoznienia/report.js used before this file
// existed -- extracted once three report pages needed the same small set of chart shapes
// (see mapy-analizy/README.md: "wspoldzielenie kodu ma sens dopiero gdy sa 2-3 analizy").

const CHART_COL = {
  pos: "#2166ac", neg: "#b2182b", posSoft: "#92c5de", negSoft: "#f4a582",
  neutral: "#b9c0ca", faint: "#e2e6ec",
};

const chEsc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const chRect = (x, y, w, h, fill) =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${fill}"/>`;
const chLine = (x1, y1, x2, y2, cls) =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${cls}"/>`;
const chText = (x, y, s, cls = "", anchor = "start") =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="${cls}" text-anchor="${anchor}">${chEsc(s)}</text>`;

function setSvg(id, inner, vb) {
  const el = document.getElementById(id);
  if (!el) return;
  if (vb) el.setAttribute("viewBox", vb);
  el.innerHTML = inner;
}

function renderLegend(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = items
    .map((it) => `<span class="item"><span class="swatch" style="background:${it.c}"></span>${chEsc(it.l)}</span>`)
    .join("");
}

// Single-series horizontal diverging bar chart. rows = [{label, value}].
// Positive values extend right of the zero line, negative left.
function barChartDiverging(id, rows, opts = {}) {
  const { posColor = CHART_COL.pos, negColor = CHART_COL.neg, unit = "", decimals = 2, labelWidth = 100 } = opts;
  const W = 720, m = { t: 14, r: 60, b: 14, l: labelWidth };
  const rowH = 34, H = m.t + m.b + rows.length * rowH;
  const vals = rows.map((r) => r.value);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const iw = W - m.l - m.r;
  const xFor = (v) => m.l + (iw * (v - lo)) / span;
  const x0 = xFor(0);
  let s = chLine(x0, m.t, x0, H - m.b, "axis");
  rows.forEach((r, i) => {
    const cy = m.t + i * rowH;
    const bh = 16, by = cy + (rowH - bh) / 2;
    s += chText(m.l - 8, by + bh - 3, r.label, "lbl", "end");
    const fill = r.value >= 0 ? posColor : negColor;
    s += chRect(Math.min(x0, xFor(r.value)), by, Math.abs(xFor(r.value) - x0), bh, fill);
    const lx = r.value >= 0 ? xFor(r.value) + 4 : x0 + 4;
    s += chText(lx, by + bh - 3, (r.value > 0 ? "+" : "") + r.value.toFixed(decimals) + unit, "val", "start");
  });
  setSvg(id, s, `0 0 ${W} ${H}`);
}

// Grouped horizontal bar chart, all series sharing one 0-based axis.
// rows = [{label, series:[{value, color}, ...]}].
function barChartGrouped(id, rows, opts = {}) {
  const { unit = "", decimals = 1, labelWidth = 100 } = opts;
  const W = 720, m = { t: 14, r: 60, b: 24, l: labelWidth };
  const seriesCount = rows[0].series.length;
  const barH = 13, gap = 3;
  const rowH = seriesCount * barH + (seriesCount - 1) * gap + 14;
  const H = m.t + m.b + rows.length * rowH;
  const maxV = Math.max(1, ...rows.flatMap((r) => r.series.map((se) => se.value)));
  const iw = W - m.l - m.r;
  const xFor = (v) => (v / maxV) * iw;
  const step = Math.max(1, Math.round(maxV / 5));
  let s = "";
  for (let g = 0; g <= maxV + 0.001; g += step) {
    s += chLine(m.l + xFor(g), m.t, m.l + xFor(g), H - m.b, g === 0 ? "axis" : "grid");
    s += chText(m.l + xFor(g), H - m.b + 14, Math.round(g) + unit, "val", "middle");
  }
  rows.forEach((r, i) => {
    const cy = m.t + i * rowH;
    s += chText(m.l - 8, cy + rowH / 2 + 2, r.label, "lbl", "end");
    r.series.forEach((se, si) => {
      const by = cy + si * (barH + gap);
      s += chRect(m.l, by, xFor(se.value), barH, se.color);
      s += chText(m.l + xFor(se.value) + 4, by + barH - 2.5, se.value.toFixed(decimals) + unit, "val", "start");
    });
  });
  setSvg(id, s, `0 0 ${W} ${H}`);
}

// Small-multiples grid of mini diverging bar charts.
// cells = [{title, verdictLabel, verdictClass, bars:[{label, value}]}].
function smallMultiples(containerId, cells, opts = {}) {
  const { posColor = CHART_COL.pos, negColor = CHART_COL.neg } = opts;
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = cells
    .map((cell) => {
      const w = 224, h = 132, m = { t: 6, r: 6, b: 26, l: 6 };
      const iw = w - m.l - m.r, ih = h - m.t - m.b;
      const maxAbs = Math.max(0.05, ...cell.bars.map((b) => Math.abs(b.value)));
      const y0 = m.t + ih * 0.5;
      const yFor = (v) => m.t + ih * (1 - (v + maxAbs) / (2 * maxAbs));
      const bw = (iw / cell.bars.length) * 0.68;
      let s = chLine(m.l, y0, m.l + iw, y0, "axis");
      cell.bars.forEach((b, i) => {
        const cx = m.l + (i + 0.5) * (iw / cell.bars.length);
        const yv = yFor(b.value);
        s += chRect(cx - bw / 2, Math.min(y0, yv), bw, Math.abs(yv - y0), b.value >= 0 ? posColor : negColor);
        s += chText(cx, h - 6, b.label, "val", "middle");
      });
      const verdict = cell.verdictLabel
        ? `<span class="ring-verdict ${cell.verdictClass || ""}">${chEsc(cell.verdictLabel)}</span>`
        : "";
      return (
        `<div class="ring-cell"><div class="ring-title"><span>${chEsc(cell.title)}</span>${verdict}</div>` +
        `<svg viewBox="0 0 ${w} ${h}" width="100%">${s}</svg></div>`
      );
    })
    .join("");
}

// headers = ["Col", ...]; rows = [[cellOrObj, ...]]. A cell may be a plain value
// (escaped) or {html, cls} to allow markup (e.g. a verdict pill) in one cell.
function renderDataTable(id, headers, rows) {
  const el = document.getElementById(id);
  if (!el) return;
  let html = "<thead><tr>" + headers.map((h) => `<th>${chEsc(h)}</th>`).join("") + "</tr></thead><tbody>";
  rows.forEach((row) => {
    html +=
      "<tr>" +
      row
        .map((c) =>
          c && typeof c === "object" && "html" in c
            ? `<td class="${c.cls || ""}">${c.html}</td>`
            : `<td>${chEsc(String(c))}</td>`
        )
        .join("") +
      "</tr>";
  });
  html += "</tbody>";
  el.innerHTML = html;
}
