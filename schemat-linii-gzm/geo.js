// Geographic variant of the diagram: the lines on an OpenStreetMap basemap (Leaflet). Loaded on first use by index.html.
// Drawn like the diagram: smoothed centrelines, bundles of parallel lines in loom's order with a dark 1 px outline (as loom's tiles), stops as pills
// across the lines that stop there, termini named with their line chips. A click on a line (or on the list) highlights it.
window.GeoMap = function (el, D, S) {  // D = mapy/tram_geo.json; S = {sel: Set, pick(line), meta: {line: {a, b, d (dark colour)}}}
  dropEyes(D);
  const map = L.map(el, { preferCanvas: true, zoomSnap: 0.5, minZoom: 9, maxZoom: 18 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">autorzy OpenStreetMap</a> (ODbL)' }).addTo(map);
  const bounds = L.latLngBounds(D.edges.flatMap(e => e.p.map(q => [q[1], q[0]]))); map.fitBounds(bounds);
  // the map may be created while its view is still hidden: fit again once the container has its real size, until the user moves it
  let touched = false; for (const t of ['pointerdown', 'wheel', 'keydown']) el.addEventListener(t, () => { touched = true; }, { passive: true });
  new ResizeObserver(() => { if (!el.clientWidth) return; map.invalidateSize(); if (!touched) map.fitBounds(bounds); }).observe(el);
  const cv = L.canvas({ padding: 0.3, tolerance: 5 }), grp = L.layerGroup().addTo(map), stopGrp = L.layerGroup().addTo(map);
  let byLine = {}, markers = [], nodePos = {}, hits = null, look = {};
  const SIGMA = 16;  // px: how much the centrelines are smoothed (more = rounder)
  const width = z => z <= 10 ? 1.5 : z <= 11 ? 2.3 : z <= 12 ? 2.9 : z <= 13 ? 3.6 : z <= 14 ? 4.5 : z <= 15 ? 5.3 : 6;
  const P = (x, y) => L.point(x, y), lerp = (a, b, t) => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  const dark = () => (document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  const col = ln => '#' + (look.dark && S.meta[ln] && S.meta[ln].d || D.lines[ln]);
  const rgb = c => c[0] === '#' ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : c.match(/\d+/g).slice(0, 3).map(Number);
  const mix = (c, t) => { const a = rgb(c), b = rgb(look.bg); return `rgb(${a.map((v, i) => Math.round(v * t + b[i] * (1 - t))).join(',')})`; };  // opaque stand-in for opacity t
  function dp(p, tol) {  // Douglas-Peucker in pixels: drops the shape noise of the GTFS tracks
    if (p.length < 3) return p; const a = p[0], b = p[p.length - 1], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    let m = 0, k = 0; for (let i = 1; i < p.length - 1; i++) { const d = Math.abs(dy * (p[i].x - a.x) - dx * (p[i].y - a.y)) / l; if (d > m) { m = d; k = i; } }
    return m > tol ? dp(p.slice(0, k + 1), tol).slice(0, -1).concat(dp(p.slice(k), tol)) : [a, b];
  }
  function smooth(p, sig) {  // resample every 3 px, Gaussian-weighted average (sigma sig px); ends stay put (reflected padding)
    const st = 3, r = [p[0]]; let carry = 0;
    for (let i = 1; i < p.length; i++) { const a = p[i - 1], b = p[i], l = Math.hypot(b.x - a.x, b.y - a.y); let t = st - carry;
      while (t <= l) { r.push(P(a.x + (b.x - a.x) * t / l, a.y + (b.y - a.y) * t / l)); t += st; } carry = l - (t - st); }
    const e = p[p.length - 1]; if (Math.hypot(e.x - r[r.length - 1].x, e.y - r[r.length - 1].y) > 0.5) r.push(e); else r[r.length - 1] = e;
    const n = r.length, K = Math.ceil(3 * sig / st); if (n < 4) return r;
    const at = i => i < 0 ? P(2 * r[0].x - r[Math.min(-i, n - 1)].x, 2 * r[0].y - r[Math.min(-i, n - 1)].y) : i > n - 1 ? P(2 * r[n - 1].x - r[Math.max(2 * (n - 1) - i, 0)].x, 2 * r[n - 1].y - r[Math.max(2 * (n - 1) - i, 0)].y) : r[i];
    const w = []; for (let k = -K; k <= K; k++) w.push(Math.exp(-0.5 * (k * st / sig) ** 2)); const ws = w.reduce((a, b) => a + b, 0);
    const out = r.map((_, i) => { let x = 0, y = 0; for (let k = -K; k <= K; k++) { const q = at(i + k), wk = w[k + K]; x += q.x * wk; y += q.y * wk; } return P(x / ws, y / ws); });
    out[0] = r[0]; out[n - 1] = r[n - 1]; return dp(out, 0.35);
  }
  function offset(p, d) {  // d px to the right of the direction of travel on screen (y down), mitred joints (limited)
    if (!d || p.length < 2) return p;
    const nrm = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    return p.map((q, i) => { const u1 = nrm(p[Math.max(i - 1, 0)], p[i]), u2 = nrm(p[i], p[Math.min(i + 1, p.length - 1)]);
      let mx = u1[0] + u2[0], my = u1[1] + u2[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      const k = Math.min(1 / Math.max(mx * u1[0] + my * u1[1], 0.5), 2); return P(q.x + mx * d * k, q.y + my * d * k); });
  }
  function draw() {
    const z = map.getZoom(), w = width(z), pitch = w + 1;  // as loom's tiles: every line with a 1 px dark outline, the outlines of neighbours touching
    look = { dark: dark() }; look.cas = '#16181d'; look.bg = look.dark ? getComputedStyle(el).backgroundColor : '#ececec';
    grp.clearLayers(); byLine = {}; nodePos = {};
    const key = q => q[0] + ',' + q[1], last = a => a[a.length - 1];
    // loom lists an edge's lines from the left of its direction (geographically, y up); flipping it adds ~70 crossings at the nodes
    const E = D.edges.map(e => { const px = smooth(dp(e.p.map(q => map.project(L.latLng(q[1], q[0]), z)), 1.2), SIGMA), n = e.l.length;
      if (px.length < 2) px.push(px[0]);  // an edge shorter than a pixel at this zoom
      const cum = [0]; for (let i = 1; i < px.length; i++) cum.push(cum[i - 1] + Math.hypot(px[i].x - px[i - 1].x, px[i].y - px[i - 1].y));
      return { e, px, cum, len: last(cum), ends: [key(e.p[0]), key(last(e.p))], off: e.l.map((ln, k) => offset(px, ((n - 1) / 2 - k) * pitch)) }; });
    // every node gets a radius: the bundles are cut that far before it and each line's ends are joined by a curve inside it (as in loom).
    // A node where the bundles just continue (same lines, same places) only needs a short one to round the corner.
    const inc = {};  // node -> [[edge, end]]
    for (const o of E) o.ends.forEach((k, j) => (inc[k] = inc[k] || []).push([o, j]));
    const sideVec = (o, k, j) => { const i = j ? o.px.length - 1 : 0, c = o.off[k][i]; return [c.x - o.px[i].x, c.y - o.px[i].y]; };
    const rad = {};
    for (const k in inc) { const I = inc[k]; if (I.length < 2) { rad[k] = 0; continue; }
      let simple = I.length === 2 && I[0][0].e.l.length === I[1][0].e.l.length;
      if (simple) { const [[a, ja], [b, jb]] = I; simple = a.e.l.every((ln, i) => { const m = b.e.l.indexOf(ln); if (m < 0) return false;
        const u = sideVec(a, i, ja), v = sideVec(b, m, jb); return Math.hypot(u[0] - v[0], u[1] - v[1]) < 1; }); }
      rad[k] = simple ? pitch : Math.max(...I.map(([o]) => o.e.l.length)) * pitch / 2 + pitch; }
    const at = (o, s) => { let i = 1; while (i < o.cum.length - 1 && o.cum[i] < s) i++; const g = o.cum[i] - o.cum[i - 1] || 1; return [i, Math.min(Math.max((s - o.cum[i - 1]) / g, 0), 1)]; };
    const piece = (p, o, s0, s1) => { const [i0, t0] = at(o, s0), [i1, t1] = at(o, s1); return [lerp(p[i0 - 1], p[i0], t0), ...p.slice(i0, i1), lerp(p[i1 - 1], p[i1], t1)]; };
    const dir = (o, s) => { const [i] = at(o, s), a = o.px[i - 1], b = o.px[i], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return [(b.x - a.x) / l, (b.y - a.y) / l]; };
    const segs = [], ends = {};  // ends: node|line -> [{p: cut point, d: unit vector towards the node, rest: polyline from the cut to the node}]
    for (const o of E) {
      const s0 = Math.min(rad[o.ends[0]], o.len * 0.45), s1 = o.len - Math.min(rad[o.ends[1]], o.len * 0.45), d0 = dir(o, s0), d1 = dir(o, s1);
      o.e.l.forEach((ln, k) => { const c = o.off[k], pts = piece(c, o, s0, s1); segs.push({ ln, pts });
        (ends[o.ends[0] + '|' + ln] = ends[o.ends[0] + '|' + ln] || []).push({ p: pts[0], d: [-d0[0], -d0[1]], rest: piece(c, o, 0, s0), tip: c[0] });
        (ends[o.ends[1] + '|' + ln] = ends[o.ends[1] + '|' + ln] || []).push({ p: last(pts), d: d1, rest: piece(c, o, s1, o.len), tip: last(c) }); });
    }
    for (const id in ends) {
      const L_ = ends[id], ln = id.slice(id.lastIndexOf('|') + 1);
      if (L_.length === 1) { segs.push({ ln, pts: L_[0].rest }); nodePos[id] = L_[0].tip; continue; }  // the line ends here
      // join every end to the one it continues into most straight (a branch of the same line gets its own curve)
      const done = new Set(); let best = -2;
      L_.forEach((a, i) => { let m = -1, s = -2; L_.forEach((b, j) => { if (j !== i) { const v = -(a.d[0] * b.d[0] + a.d[1] * b.d[1]); if (v > s) { s = v; m = j; } } });
        const pk = Math.min(i, m) + ',' + Math.max(i, m); if (done.has(pk)) return; done.add(pk);
        const b = L_[m], h = Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y) * 0.42, c1 = P(a.p.x + a.d[0] * h, a.p.y + a.d[1] * h), c2 = P(b.p.x + b.d[0] * h, b.p.y + b.d[1] * h), pts = [];
        for (let t = 0; t <= 1.0001; t += 1 / 12) { const u = 1 - t; pts.push(P(u * u * u * a.p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.p.x, u * u * u * a.p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.p.y)); }
        segs.push({ ln, pts }); if (s > best) { best = s; nodePos[id] = pts[6]; } });
    }
    // two passes, all casings under all lines, so no outline cuts into a neighbouring line where pieces meet
    const ll = p => p.map(q => map.unproject(q, z));
    for (const g of segs) g.cs = L.polyline(g.ll = ll(g.pts), { renderer: cv, color: look.cas, weight: w + 2, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(grp);
    for (const g of segs) {
      const pl = L.polyline(g.ll, { renderer: cv, color: col(g.ln), weight: w, lineCap: 'round', lineJoin: 'round', interactive: true }).addTo(grp);
      pl.ln = g.ln; pl.cas = g.cs;
      const m = S.meta[g.ln]; pl.bindTooltip(`<b>${g.ln}</b>${m ? '<br>' + m.a + ' – ' + m.b : ''}`, { sticky: true, className: 'stl' });
      pl.on('click', ev => { L.DomEvent.stopPropagation(ev); S.pick(g.ln); });
      pl.on('mouseover', () => { if (!S.sel.size || S.sel.has(g.ln)) pl.setStyle({ weight: w + 2 }); });
      pl.on('mouseout', () => pl.setStyle({ weight: w }));
      (byLine[g.ln] = byLine[g.ln] || []).push(pl);
    }
    // line points in a grid, so the labels can keep off the lines
    hits = new Map(); const cell = 12;
    for (const g of segs) for (let i = 1; i < g.pts.length; i++) { const a = g.pts[i - 1], b = g.pts[i], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4);
      for (let j = 0; j <= n; j++) { const q = lerp(a, b, j / n), c = Math.floor(q.x / cell) + ',' + Math.floor(q.y / cell); (hits.get(c) || hits.set(c, []).get(c)).push(q); } }
    hits.cell = cell;
    stops(z); repaint();
  }
  function paintLines() {
    const any = S.sel.size > 0;
    for (const ln in byLine) { const on = !any || S.sel.has(ln);
      for (const pl of byLine[ln]) { pl.setStyle({ color: on ? col(ln) : mix(col(ln), .16) }); pl.cas.setStyle({ color: on ? look.cas : look.bg }); } }
    if (any) for (const ln of S.sel) for (const pl of byLine[ln] || []) pl.cas.bringToFront();
    if (any) for (const ln of S.sel) for (const pl of byLine[ln] || []) pl.bringToFront();
  }
  const fam = () => getComputedStyle(el).fontFamily, ctx = document.createElement('canvas').getContext('2d');
  const tw = (t, f) => { ctx.font = f + ' ' + fam(); return ctx.measureText(t).width; };
  const chip = x => `<span class="gch" style="background:${col(x)}">${x}</span>`;
  function stops(z) {
    stopGrp.clearLayers(); markers = [];
    const w = width(z), th = w + 5, boxes = [], labels = [];  // th: pill thickness; its length spans the lines that stop there
    for (const d of D.stops) {
      const term = d.t.length > 0; if (z < 12 && !term) continue;
      const m = L.circleMarker([0, 0], { renderer: cv, radius: Math.max(th / 2, 4), stroke: false, fillOpacity: 0, interactive: true });
      m.d = d; m.key = d.ll[0] + ',' + d.ll[1]; m.pill = [['#16181d', th], ['#fff', th - 2.6]].map(([c, wt]) => L.polyline([[0, 0], [0, 0]], { renderer: cv, color: c, weight: wt, lineCap: 'round', interactive: false }).addTo(stopGrp));
      const [A, B] = pillEnds(m, d.l), c = lerp(A, B, .5); m.setLatLng(map.unproject(c, z)).addTo(stopGrp); markers.push(m);
      const r = { x0: Math.min(A.x, B.x) - th / 2, x1: Math.max(A.x, B.x) + th / 2, y0: Math.min(A.y, B.y) - th / 2, y1: Math.max(A.y, B.y) + th / 2 }; boxes.push(r);
      if (term && z >= 11 || z >= 15) labels.push({ m, d, c, r, term });
      else m.bindTooltip(`<b>${d.n}</b><br>${d.l.map(chip).join('')}`, { direction: 'top', className: 'stl' });
    }
    // labels: termini first, then the stops with most lines; each tries right, left, above, below and keeps clear of the other labels
    // and pills, and of the lines if it can; one that fits nowhere shows on hover instead
    labels.sort((a, b) => (b.term - a.term) || (b.d.l.length - a.d.l.length));
    const hitLine = q => { const c = hits.cell; for (let x = Math.floor(q.x0 / c); x <= Math.floor(q.x1 / c); x++) for (let y = Math.floor(q.y0 / c); y <= Math.floor(q.y1 / c); y++)
      for (const p of hits.get(x + ',' + y) || []) if (p.x > q.x0 && p.x < q.x1 && p.y > q.y0 && p.y < q.y1) return true; return false; };
    const hitBox = (q, own) => boxes.some(b => b !== own && q.x0 < b.x1 && q.x1 > b.x0 && q.y0 < b.y1 && q.y1 > b.y0);
    for (const L_ of labels) {
      const { m, d, c, r, term } = L_, chips = term ? d.t : [];
      const wd = Math.max(tw(d.n, (term ? 800 : 600) + ' 11px'), chips.reduce((s, x) => s + tw(x, '700 10px') + 10, 0)) + 12, ht = term ? 34 : 17;
      const hx = Math.max(r.x1 - c.x, c.x - r.x0) + 2, hy = Math.max(r.y1 - c.y, c.y - r.y0) + 2;
      const opts = [['right', [hx, 0], c.x + hx + 6, c.y - ht / 2], ['left', [-hx, 0], c.x - hx - 6 - wd, c.y - ht / 2],
        ['top', [0, -hy], c.x - wd / 2, c.y - hy - 6 - ht], ['bottom', [0, hy], c.x - wd / 2, c.y + hy + 6]].map(([dir, off, x, y]) => ({ dir, off, q: { x0: x - 1, y0: y - 1, x1: x + wd + 1, y1: y + ht + 1 } }));
      const ok = opts.filter(o => !hitBox(o.q, r)), pick = ok.find(o => !hitLine(o.q)) || ok[0];
      const html = term ? `<b>${d.n}</b><br>${chips.map(chip).join('')}` : d.n;
      if (pick) { boxes.push(pick.q); m.bindTooltip(html, { permanent: true, direction: pick.dir, offset: pick.off, className: 'stl' + (term ? ' stt' : '') }); }
      else m.bindTooltip(`<b>${d.n}</b><br>${d.l.map(chip).join('')}`, { direction: 'top', className: 'stl' });
    }
  }
  function pillEnds(m, lines) {  // the two farthest places of the given lines at the stop (layer pixels)
    const z = map.getZoom(); let v = lines.map(ln => nodePos[m.key + '|' + ln]).filter(Boolean);
    if (!v.length) v = [map.project(L.latLng(m.d.ll[1], m.d.ll[0]), z)];
    const far = (o, l) => l.reduce((a, q) => Math.hypot(q.x - o.x, q.y - o.y) > Math.hypot(a.x - o.x, a.y - o.y) ? q : a, o), A = far(v[0], v);
    m.pill.forEach(q => q.setLatLngs([map.unproject(A, z), map.unproject(far(A, v), z)])); return [A, far(A, v)];
  }
  function paintStops() {  // with a selection a pill spans only the selected lines; stops none of them serves fade out
    const any = S.sel.size > 0;
    for (const m of markers) { const sel = m.d.l.filter(x => S.sel.has(x)), on = !any || sel.length > 0;
      pillEnds(m, any && on ? sel : m.d.l); for (const q of m.pill) q.setStyle({ opacity: on ? 1 : .2 }).bringToFront();  // above a highlighted line
      const t = m.getTooltip(); if (t && t.options.permanent && t.getElement()) t.getElement().style.opacity = on ? 1 : .25; }
  }
  function repaint() { paintLines(); paintStops(); }
  map.on('zoomend', draw); draw();
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  return {
    map, repaint, invalidate: () => map.invalidateSize(),
    fit() {  // zoom to the selected lines (or the whole network)
      if (!S.sel.size) return map.fitBounds(bounds);
      const pts = D.edges.filter(e => e.l.some(l => S.sel.has(l))).flatMap(e => e.p.map(q => [q[1], q[0]]));
      if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
    }
  };
};
// The two directions of the same lines sometimes run on separate tracks between two nodes (an "eye" that topo did not merge),
// which draws as two bundles knotted at both ends. Keep only the shorter path; the paths in between have no stops.
function dropEyes(D) {
  const K = q => q[0] + ',' + q[1], last = a => a[a.length - 1], adj = {}, stops = new Set(D.stops.map(s => K(s.ll)));
  const len = p => p.slice(1).reduce((s, q, i) => s + Math.hypot((q[0] - p[i][0]) * 0.64, q[1] - p[i][1]), 0);
  D.edges.forEach((e, i) => { const a = K(e.p[0]), b = K(last(e.p)); (adj[a] = adj[a] || []).push([i, b]); (adj[b] = adj[b] || []).push([i, a]); });
  const same = (a, b) => a.length === b.length && a.every(x => b.includes(x)), chains = {};
  for (const a in adj) for (const [i, b0] of adj[a]) {  // walk through the nodes that only continue the same lines
    const ids = [i]; let b = b0;
    while (adj[b].length === 2 && !stops.has(b)) { const [j, c] = adj[b].find(x => x[0] !== last(ids)); if (!same(D.edges[j].l, D.edges[i].l)) break; ids.push(j); b = c; }
    if (b === a) continue; const k = [a, b].sort().join('|'), id = ids.slice().sort((x, y) => x - y).join(',');
    ((chains[k] = chains[k] || {})[id] = { ids, l: D.edges[i].l, len: ids.reduce((s, j) => s + len(D.edges[j].p), 0) });
  }
  const drop = new Set();
  for (const k in chains) { const v = Object.values(chains[k]); if (v.length < 2 || !v.every(c => same(c.l, v[0].l))) continue;
    v.sort((x, y) => x.len - y.len).slice(1).forEach(c => c.ids.forEach(j => drop.add(j))); }
  D.edges = D.edges.filter((_, i) => !drop.has(i));
}
