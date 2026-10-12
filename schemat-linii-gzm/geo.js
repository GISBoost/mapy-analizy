// Geographic variant of the diagram: the lines on an OpenStreetMap basemap (Leaflet). Loaded on first use by index.html.
// Drawn like the diagram: smoothed centrelines, bundles of parallel lines in loom's order with a white casing, stops as white
// discs (interchanges larger), termini named with their line chips. A click on a line (or on the list) highlights it.
window.GeoMap = function (el, D, S) {  // D = mapy/tram_geo.json; S = {sel: Set, pick(line), meta: {line: {a, b}}}
  const map = L.map(el, { preferCanvas: true, zoomSnap: 0.5, minZoom: 9, maxZoom: 18 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">autorzy OpenStreetMap</a> (ODbL)' }).addTo(map);
  const bounds = L.latLngBounds(D.edges.flatMap(e => e.p.map(q => [q[1], q[0]]))); map.fitBounds(bounds);
  const cv = L.canvas({ padding: 0.3, tolerance: 5 }), cas = L.layerGroup().addTo(map), grp = L.layerGroup().addTo(map), stopGrp = L.layerGroup().addTo(map);
  let byLine = {}, casings = [], markers = [], nodeVec = {};
  const SIGMA = 16;  // px: how much the centrelines are smoothed (more = rounder)
  const width = z => z <= 10 ? 2 : z <= 11 ? 3 : z <= 12 ? 3.8 : z <= 13 ? 4.8 : z <= 14 ? 6 : z <= 15 ? 7 : 8;
  const P = (x, y) => L.point(x, y);
  function dp(p, tol) {  // Douglas-Peucker in pixels: drops the shape noise of the GTFS tracks
    if (p.length < 3) return p; const a = p[0], b = p[p.length - 1], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    let m = 0, k = 0; for (let i = 1; i < p.length - 1; i++) { const d = Math.abs(dy * (p[i].x - a.x) - dx * (p[i].y - a.y)) / l; if (d > m) { m = d; k = i; } }
    return m > tol ? dp(p.slice(0, k + 1), tol).slice(0, -1).concat(dp(p.slice(k), tol)) : [a, b];
  }
  function chaikin(p, n) {  // corner cutting, ends fixed so bundles still meet at the stops
    for (let t = 0; t < n; t++) { const q = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; q.push(P(.75 * a.x + .25 * b.x, .75 * a.y + .25 * b.y), P(.25 * a.x + .75 * b.x, .25 * a.y + .75 * b.y)); } q.push(p[p.length - 1]); p = q; }
    return p;
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
  function offset(p, d) {  // d px to the left of the direction of travel, mitred joints (limited)
    if (!d || p.length < 2) return p;
    const nrm = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    return p.map((q, i) => { const u1 = nrm(p[Math.max(i - 1, 0)], p[i]), u2 = nrm(p[i], p[Math.min(i + 1, p.length - 1)]);
      let mx = u1[0] + u2[0], my = u1[1] + u2[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      const k = Math.min(1 / Math.max(mx * u1[0] + my * u1[1], 0.5), 2); return P(q.x + mx * d * k, q.y + my * d * k); });
  }
  function draw() {
    const z = map.getZoom(), w = width(z), pitch = w + 0.6; cas.clearLayers(); grp.clearLayers(); byLine = {}; casings = [];
    // every edge: smoothed centreline once, each line of its bundle offset from it; at the nodes the offsets of a line in the
    // neighbouring edges are blended (over a short ramp) so a line that changes place in the bundle glides instead of jumping
    const E = D.edges.map(e => { const px = smooth(dp(e.p.map(q => map.project(L.latLng(q[1], q[0]), z)), 1.2), SIGMA), n = e.l.length;
      const cum = [0]; for (let i = 1; i < px.length; i++) cum.push(cum[i - 1] + Math.hypot(px[i].x - px[i - 1].x, px[i].y - px[i - 1].y));
      return { e, px, cum, off: e.l.map((ln, k) => offset(px, (k - (n - 1) / 2) * pitch)) }; });
    const node = {}, key = q => q[0] + ',' + q[1], last = a => a[a.length - 1];
    for (const o of E) o.e.l.forEach((ln, k) => {
      for (const [q, i] of [[o.e.p[0], 0], [last(o.e.p), o.px.length - 1]]) { const id = key(q) + '|' + ln; (node[id] = node[id] || []).push([o.off[k][i].x - o.px[i].x, o.off[k][i].y - o.px[i].y]); } });
    nodeVec = node;
    const avg = id => { const v = node[id]; return [v.reduce((s, q) => s + q[0], 0) / v.length, v.reduce((s, q) => s + q[1], 0) / v.length]; };
    for (const o of E) {
      const len = last(o.cum), ramp = Math.min(40, len / 3), i1 = o.px.length - 1;
      o.e.l.forEach((ln, k) => {
        const A = avg(key(o.e.p[0]) + '|' + ln), B = avg(key(last(o.e.p)) + '|' + ln), c = o.off[k];
        const dA = [A[0] - (c[0].x - o.px[0].x), A[1] - (c[0].y - o.px[0].y)], dB = [B[0] - (c[i1].x - o.px[i1].x), B[1] - (c[i1].y - o.px[i1].y)];
        const pts = c.map((p, i) => { const ws = ramp ? Math.max(0, 1 - o.cum[i] / ramp) : 0, we = ramp ? Math.max(0, 1 - (len - o.cum[i]) / ramp) : 0;
          return P(p.x + dA[0] * ws + dB[0] * we, p.y + dA[1] * ws + dB[1] * we); }).map(p => map.unproject(p, z));
        const cs = L.polyline(pts, { renderer: cv, color: '#fff', weight: w + 3, opacity: .95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(cas); casings.push(cs);
        const pl = L.polyline(pts, { renderer: cv, color: '#' + D.lines[ln], weight: w, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: true }).addTo(grp);
        pl.ln = ln; pl.cas = cs;
        const m = S.meta[ln]; pl.bindTooltip(`<b>${ln}</b>${m ? '<br>' + m.a + ' – ' + m.b : ''}`, { sticky: true, className: 'stl' });
        pl.on('click', ev => { L.DomEvent.stopPropagation(ev); S.pick(ln); });
        pl.on('mouseover', () => { if (!S.sel.size || S.sel.has(ln)) pl.setStyle({ weight: w + 2 }); });
        pl.on('mouseout', () => pl.setStyle({ weight: w }));
        (byLine[ln] = byLine[ln] || []).push(pl);
      });
    }
    stops(z); paintLines();
  }
  function paintLines() {
    const any = S.sel.size > 0;
    for (const ln in byLine) { const on = !any || S.sel.has(ln);
      for (const pl of byLine[ln]) { pl.setStyle({ opacity: on ? 1 : 0.13 }); pl.cas.setStyle({ opacity: on ? .95 : 0.05 }); } }
    if (any) for (const ln of S.sel) for (const pl of byLine[ln] || []) { pl.cas.bringToFront(); }
    if (any) for (const ln of S.sel) for (const pl of byLine[ln] || []) pl.bringToFront();
    for (const m of markers) { const on = !any || m.d.l.some(x => S.sel.has(x)); for (const q of m.pill) q.setStyle({ opacity: on ? 1 : .2 }); const t = m.getTooltip && m.getTooltip(); if (t && t.getElement()) t.getElement().style.opacity = on ? 1 : .25; }
  }
  function stops(z) {
    stopGrp.clearLayers(); markers = [];
    const w = width(z), pitch = w + 0.6, th = w + 5;  // pill thickness; its length spans the lines that stop there
    for (const d of D.stops) {
      const term = d.t.length > 0; if (z < 12 && !term) continue;
      const c = map.project(L.latLng(d.ll[1], d.ll[0]), z), key = d.ll[0] + ',' + d.ll[1];
      const v = d.l.map(ln => nodeVec[key + '|' + ln]).filter(Boolean).map(a => [a.reduce((s, q) => s + q[0], 0) / a.length, a.reduce((s, q) => s + q[1], 0) / a.length]);
      let A = [0, 0], B = [0, 0];
      if (v.length > 1) { const far = (o, l) => l.reduce((m, q) => Math.hypot(q[0] - o[0], q[1] - o[1]) > Math.hypot(m[0] - o[0], m[1] - o[1]) ? q : m, o); A = far(v[0], v); B = far(A, v); }
      else if (v.length) A = B = v[0];
      const pa = map.unproject(P(c.x + A[0], c.y + A[1]), z), pb = map.unproject(P(c.x + B[0], c.y + B[1]), z), pill = [];
      for (const [col, wt] of [['#16181d', th], ['#fff', th - 2.6]]) pill.push(L.polyline([pa, pb], { renderer: cv, color: col, weight: wt, lineCap: 'round', opacity: 1, interactive: false }).addTo(stopGrp));
      const hw = Math.max(Math.abs(A[0]), Math.abs(B[0])) + th / 2;
      const m = L.circleMarker([d.ll[1], d.ll[0]], { renderer: cv, radius: Math.max(th / 2, 4), stroke: false, fillOpacity: 0, interactive: true }).addTo(stopGrp);
      m.d = d; m.pill = pill; markers.push(m);
      const chips = d.l.map(x => `<span class="gch" style="background:#${D.lines[x]}">${x}</span>`).join('');
      if (term && z >= 11) m.bindTooltip(`<b>${d.n}</b><br>${d.t.map(x => `<span class="gch" style="background:#${D.lines[x]}">${x}</span>`).join('')}`, { permanent: true, direction: 'right', offset: [hw + 3, 0], className: 'stl stt' });
      else if (z >= 15) m.bindTooltip(d.n, { permanent: true, direction: 'right', offset: [hw + 2, 0], className: 'stl' });
      else m.bindTooltip(`<b>${d.n}</b><br>${chips}`, { direction: 'top', className: 'stl' });
    }
  }
  map.on('zoomend', draw); draw();
  return {
    map, repaint: paintLines, invalidate: () => map.invalidateSize(),
    fit() {  // zoom to the selected lines (or the whole network)
      if (!S.sel.size) return map.fitBounds(bounds);
      const pts = D.edges.filter(e => e.l.some(l => S.sel.has(l))).flatMap(e => e.p.map(q => [q[1], q[0]]));
      if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
    }
  };
};
