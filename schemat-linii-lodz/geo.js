// Geographic variant of the diagram: the lines on an OpenStreetMap basemap (Leaflet). Loaded on first use by index.html.
// Drawn like the diagram: smoothed centrelines, bundles of parallel lines in loom's order with a dark 1 px outline (as loom's tiles), stops as pills
// across the lines that stop there (boxes where lines cross), termini named with their line chips. A click on a line (or on the list) highlights it.
window.GeoMap = function (el, D, S) {  // D = mapy/tram_geo.json (pipeline/geo_export.py); S = {sel: Set, pick(line), meta: {line: {a, b, d (dark colour)}}}
  dropEyes(D);
  // junctions (3+ edges): the only through stops named between z15 and z17, where naming every stop crowds the map
  const deg = {}; for (const e of D.edges) for (const q of [e.p[0], e.p[e.p.length - 1]]) deg[q[0] + ',' + q[1]] = (deg[q[0] + ',' + q[1]] || 0) + 1;
  chainEdges(D);
  const map = L.map(el, { preferCanvas: true, zoomSnap: 0.5, maxZoom: 17.5 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">autorzy OpenStreetMap</a> (ODbL)' }).addTo(map);
  const bounds = L.latLngBounds(D.edges.flatMap(e => e.p.map(q => [q[1], q[0]])));
  // no zooming out past the whole network, no panning far off it
  const lock = () => { map.setMinZoom(map.getBoundsZoom(bounds)); map.setMaxBounds(bounds.pad(0.15)); };
  map.options.maxBoundsViscosity = 0.8; map.fitBounds(bounds); lock();
  // the map may be created while its view is still hidden: fit again once the container has its real size, until the user moves it
  let touched = false; for (const t of ['pointerdown', 'wheel', 'keydown']) el.addEventListener(t, () => { touched = true; }, { passive: true });
  new ResizeObserver(() => { if (!el.clientWidth) return; map.invalidateSize(); lock(); if (!touched) map.fitBounds(bounds); }).observe(el);
  const cv = L.canvas({ padding: 0.3, tolerance: 5 }), grp = L.layerGroup().addTo(map), stopGrp = L.layerGroup().addTo(map);
  // nodePos, lineDir: stop|line -> place and axis of travel of the line at a stop inside a chained edge;
  // fronts: node group -> [{pts: [[line, point]], ax}], where each bundle is cut before the node
  let byLine = {}, markers = [], nodePos = {}, lineDir = {}, fronts = {}, rootOf = {}, hits = null, look = {}, drawnZ = null;
  const mpp = z => 156543.03 * Math.cos(bounds.getCenter().lat * Math.PI / 180) / 2 ** z;  // metres per pixel
  // line width in pixels by zoom, in steps as on loom's tiles (3 px at z13, 4 px at z16 there), interpolated between the steps
  const WT = [[11, 1.5], [12, 2], [13, 3], [14, 3.5], [15, 4], [16, 5], [17, 6]];
  const width = z => { if (z <= WT[0][0]) return WT[0][1];
    for (let i = 1; i < WT.length; i++) if (z <= WT[i][0]) { const [z0, a] = WT[i - 1], [z1, b] = WT[i]; return a + (b - a) * (z - z0) / (z1 - z0); }
    return WT[WT.length - 1][1]; };
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
  function spikes(p, d) {  // drops a point where the track doubles back (< 35°) next to a segment shorter than d, as loom's smoothenOutliers
    const r = p.slice(), c35 = Math.cos(35 * Math.PI / 180);
    for (let i = 1; i < r.length - 1; i++) { const a = r[i - 1], b = r[i], c = r[i + 1], ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y, la = Math.hypot(ux, uy), lc = Math.hypot(vx, vy);
      if ((la < d || lc < d) && (ux * vx + uy * vy) / (la * lc || 1) > c35) r.splice(i--, 1); }
    return r;
  }
  const chaikin = (p, n) => { for (let k = 0; k < n; k++) { const r = [p[0]]; for (let i = 1; i < p.length; i++) r.push(lerp(p[i - 1], p[i], .25), lerp(p[i - 1], p[i], .75)); r.push(p[p.length - 1]); p = r; } return p; };
  // every centreline is generalised once, in metres, as loom's line graph is: spikes out, Douglas-Peucker, Chaikin's corner cutting.
  // A zoom only scales it, so the bundles keep their shape from zoom to zoom and only the widths and the cuts at the nodes change
  // (smoothing in pixels on every zoom made each zoom look different). R: zoom of the stored points, 1 px ~ 0.37 m in Łódź
  const R = 18, m1 = 1 / mpp(R);
  for (const e of D.edges) e.m = dp(chaikin(dp(spikes(e.p.map(q => map.project(L.latLng(q[1], q[0]), R)), 50 * m1), 3 * m1), 3), 0.5 * m1);
  function offset(p, d) {  // d(i) px to the right of the direction of travel on screen (y down), mitred joints (limited)
    if (p.length < 2) return p;
    const nrm = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    return p.map((q, i) => { const u1 = nrm(p[Math.max(i - 1, 0)], p[i]), u2 = nrm(p[i], p[Math.min(i + 1, p.length - 1)]);
      let mx = u1[0] + u2[0], my = u1[1] + u2[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      const k = Math.min(1 / Math.max(mx * u1[0] + my * u1[1], 0.5), 2); const di = d(i); return P(q.x + mx * di * k, q.y + my * di * k); });
  }
  function draw() {
    const z = drawnZ = map.getZoom(), w = width(z), pitch = w + 1;  // as loom's tiles: every line with a 1 px dark outline, the outlines of neighbours touching
    look = { dark: dark() }; look.cas = '#16181d'; look.bg = look.dark ? getComputedStyle(el).backgroundColor : '#ececec';
    grp.clearLayers(); byLine = {}; nodePos = {}; lineDir = {}; fronts = {}; rootOf = {};
    const key = q => q[0] + ',' + q[1], last = a => a[a.length - 1], f = 2 ** (z - R);
    const E = D.edges.map(e => { const px = dp(e.m.map(q => P(q.x * f, q.y * f)), 0.25);  // the same centreline on every zoom, only scaled
      if (px.length < 2) px.push(px[0]);  // an edge shorter than a pixel at this zoom
      const cum = [0]; for (let i = 1; i < px.length; i++) cum.push(cum[i - 1] + Math.hypot(px[i].x - px[i - 1].x, px[i].y - px[i - 1].y));
      return { e, px, cum, len: last(cum), ends: [key(e.p[0]), key(last(e.p))], s: [0, 0] }; });
    // every line runs at a fixed offset from its bundle's centreline, as on loom's tiles. Where lines join or leave, the lines that run on
    // step sideways inside the node (sliding the bundle near the node instead pulled the lines off the track, apart from each other).
    // loom lists an edge's lines from the left of its direction (geographically, y up); flipping it adds ~150 crossings at the nodes
    const base = (o, k) => ((o.e.l.length - 1) / 2 - k) * pitch;  // to the right of the edge's direction
    for (const o of E) o.off = o.e.l.map((ln, k) => offset(o.px, () => base(o, k)));
    const at = (o, s) => { let i = 1; while (i < o.cum.length - 1 && o.cum[i] < s) i++; const g = o.cum[i] - o.cum[i - 1] || 1; return [i, Math.min(Math.max((s - o.cum[i - 1]) / g, 0), 1)]; };
    const piece = (p, o, s0, s1) => { const [i0, t0] = at(o, s0), [i1, t1] = at(o, s1); return [lerp(p[i0 - 1], p[i0], t0), ...p.slice(i0, i1), lerp(p[i1 - 1], p[i1], t1)]; };
    const dir = (o, s) => { const [i] = at(o, s), a = o.px[i - 1], b = o.px[i], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return [(b.x - a.x) / l, (b.y - a.y) / l]; };
    // stops inside a chained edge: the place of each line across the bundle at the stop
    const near = (o, q) => { let bi = 1, bt = 0, bd = Infinity; for (let i = 1; i < o.px.length; i++) { const a = o.px[i - 1], b = o.px[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = Math.min(Math.max(((q.x - a.x) * dx + (q.y - a.y) * dy) / l2, 0), 1), d = Math.hypot(a.x + dx * t - q.x, a.y + dy * t - q.y); if (d < bd) { bd = d; bi = i; bt = t; } } return [bi, bt]; };
    for (const o of E) for (const k of o.e.mid || []) { const [x, y] = k.split(',').map(Number), [i, t] = near(o, map.project(L.latLng(y, x), z));
      const a = o.px[i - 1], b = o.px[i]; o.e.l.forEach((ln, j) => { nodePos[k + '|' + ln] = lerp(o.off[j][i - 1], o.off[j][i], t); lineDir[k + '|' + ln] = [b.x - a.x, b.y - a.y]; }); }
    // node fronts (loom's writeNodeFronts / expandOverlappinFronts): each bundle ends in a front, a cut square to its track as wide as the
    // bundle. A front starts a pitch before the node and moves back only while it overlaps another front of the node, so a bundle runs
    // straight up to the junction and its lines turn inside it (a fixed cut of half the widest bundle bent them well before it)
    const inc = {}; for (const o of E) o.ends.forEach((k, j) => (inc[k] = inc[k] || []).push([o, j]));  // node -> [[edge, end]]
    const front = (o, j) => { const s = j ? o.len - o.s[j] : o.s[j], [i, t] = at(o, s), c = lerp(o.px[i - 1], o.px[i], t), [dx, dy] = dir(o, s), h = (o.e.l.length * pitch + 1) / 2;
      return [P(c.x + dy * h, c.y - dx * h), P(c.x - dy * h, c.y + dx * h)]; };
    const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const dps = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0), 1); return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y); };
    const hit = (a, b) => side(a[0], a[1], b[0]) * side(a[0], a[1], b[1]) < 0 && side(b[0], b[1], a[0]) * side(b[0], b[1], a[1]) < 0 ||
      Math.min(dps(a[0], b[0], b[1]), dps(a[1], b[0], b[1]), dps(b[0], a[0], a[1]), dps(b[1], a[0], a[1])) < 1;
    const grow = I => { for (let it = 0; it < 400; it++) { const F = I.map(([o, j]) => front(o, j)); let moved = false;
      for (let a = 0; a < I.length; a++) for (let b = a + 1; b < I.length; b++) if (hit(F[a], F[b]))
        for (const [o, j] of [I[a], I[b]]) { const mx = o.len * 0.45; if (o.s[j] < mx) { o.s[j] = Math.min(o.s[j] + pitch / 4, mx); moved = true; } }
      if (!moved) return; } };
    for (const k in inc) if (inc[k].length > 1) { for (const [o, j] of inc[k]) o.s[j] = Math.min(pitch, o.len * 0.45); grow(inc[k]); }
    // nodes whose fronts eat up the short edge between them make one junction (loom's meta nodes): that edge goes, the fronts of all
    // of them are moved apart together and every line crosses the group in a single curve, so the whole bundle turns in one place
    const up = {}, ck = k => up[k] && up[k] !== k ? (up[k] = ck(up[k])) : k;
    for (const o of E) { const [a, b] = o.ends; if (a !== b && inc[a].length > 1 && inc[b].length > 1 && o.len - o.s[0] - o.s[1] < pitch) { o.inner = true; const ra = ck(a), rb = ck(b); if (ra !== rb) up[ra] = rb; } }
    const mem = {}; for (const k in inc) { rootOf[k] = ck(k); (mem[ck(k)] = mem[ck(k)] || []).push(k); }
    for (const r in mem) if (mem[r].length > 1) grow(mem[r].flatMap(k => inc[k]).filter(([o]) => !o.inner));
    const segs = [], ends = {};  // ends: node|line -> [{p: cut point, d: unit vector towards the node, rest: polyline from the cut to the node}]
    for (const o of E) {
      if (o.inner) continue; const [n0, n1] = o.ends.map(ck);
      const s0 = o.s[0], s1 = o.len - o.s[1], d0 = dir(o, s0), d1 = dir(o, s1), F0 = { pts: [], ax: d0 }, F1 = { pts: [], ax: d1 };
      (fronts[n0] = fronts[n0] || []).push(F0); (fronts[n1] = fronts[n1] || []).push(F1);
      o.e.l.forEach((ln, k) => { const c = o.off[k], pts = piece(c, o, s0, s1); segs.push({ ln, pts }); F0.pts.push([ln, pts[0]]); F1.pts.push([ln, last(pts)]);
        (ends[n0 + '|' + ln] = ends[n0 + '|' + ln] || []).push({ p: pts[0], d: [-d0[0], -d0[1]], rest: piece(c, o, 0, s0) });
        (ends[n1 + '|' + ln] = ends[n1 + '|' + ln] || []).push({ p: last(pts), d: d1, rest: piece(c, o, s1, o.len) }); });
    }
    // inside a node each line joins its two cuts with a cubic curve along the tracks (loom's getInnerBezier): the handles reach 0.55 of
    // the way to where the two tracks meet, close to a circular arc; cuts almost in line get a straight piece
    const meet = (p, u, q, v, m) => { const dn = u[0] * v[1] - u[1] * v[0]; if (Math.abs(dn) < 1e-9) return null;
      const t = ((q.x - p.x) * v[1] - (q.y - p.y) * v[0]) / dn, s = ((q.x - p.x) * u[1] - (q.y - p.y) * u[0]) / dn;
      return t > 0 && s > 0 && t < m && s < m ? (t + s) / 2 : null; };
    for (const id in ends) {
      const L_ = ends[id], ln = id.slice(id.lastIndexOf('|') + 1);
      if (L_.length === 1) { segs.push({ ln, pts: L_[0].rest }); continue; }  // the line ends here
      // join every end to the one it continues into most straight (a branch of the same line gets its own curve)
      const done = new Set();
      L_.forEach((a, i) => { let m = -1, s = -2; L_.forEach((b, j) => { if (j !== i) { const v = -(a.d[0] * b.d[0] + a.d[1] * b.d[1]); if (v > s) { s = v; m = j; } } });
        const pk = Math.min(i, m) + ',' + Math.max(i, m); if (done.has(pk)) return; done.add(pk);
        const b = L_[m], d = Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y);
        if (d < 1.5) { segs.push({ ln, pts: [a.p, b.p] }); return; }
        const r = meet(a.p, a.d, b.p, b.d, 2 * d), h = r && r * 0.55 < d ? r * 0.55 : d * 0.55;
        const c1 = P(a.p.x + a.d[0] * h, a.p.y + a.d[1] * h), c2 = P(b.p.x + b.d[0] * h, b.p.y + b.d[1] * h), pts = [];
        for (let t = 0; t <= 1.0001; t += 1 / 12) { const u = 1 - t; pts.push(P(u * u * u * a.p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.p.x, u * u * u * a.p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.p.y)); }
        segs.push({ ln, pts }); });
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
    const w = width(z), th = w * 1.5 + 3.5, boxes = [], labels = [];  // th: pill thickness; its length spans the lines that stop there
    // names of through stops only in and around the view (a permanent tooltip per stop is what makes z15+ slow); redone on moveend
    const vb = map.getPixelBounds(), pad = vb.getSize().multiplyBy(0.25), inView = c => c.x > vb.min.x - pad.x && c.x < vb.max.x + pad.x && c.y > vb.min.y - pad.y && c.y < vb.max.y + pad.y;
    for (const d of D.stops) {
      const term = d.t.length > 0; if (z < 14 && !term) continue;  // below z14 only the termini: through stops cluttered the overview
      const m = L.circleMarker([0, 0], { renderer: cv, radius: Math.max(th / 2, 4), stroke: false, fillOpacity: 0, interactive: true });
      m.d = d; m.key = d.ll[0] + ',' + d.ll[1]; m.th = th; m.pill = [['#16181d', th], ['#fff', th - 2.6]].map(([c, wt]) => L.polyline([[0, 0], [0, 0]], { renderer: cv, color: c, weight: wt, lineCap: 'round', interactive: false }).addTo(stopGrp));
      m.hub = L.polygon([], { renderer: cv, color: '#16181d', weight: 1.4, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(stopGrp);
      const r = shape(m, d.l), c = P((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2); m.setLatLng(map.unproject(c, z)).addTo(stopGrp); markers.push(m); boxes.push(r);
      if (term && z >= 11 || (z >= 17 || z >= 15 && deg[m.key] > 2) && inView(c)) labels.push({ m, d, c, r, term });
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
  // a stop is drawn over the fronts of the bundles that stop there (as loom's stations): where they all travel along one axis
  // (straight, diagonal or turning together) a pill along the fronts, square to the track; where they cross (one line goes up,
  // another sideways: a transfer between directions) a rounded box around the fronts, so the bundles run straight into it.
  // Only the lines that stop there (or the selected ones) count. Returns the shape's box in layer pixels.
  function shape(m, lines) {
    const z = map.getZoom(), h = m.th / 2, on = new Set(lines), F = fronts[rootOf[m.key]]; let v = [], ax = [];
    if (F) { for (const f of F) for (const [ln, p] of f.pts) if (on.has(ln)) { v.push(p); ax.push(f.ax); } }  // an axis per line: the widest bundle sets the box
    else for (const ln of lines) { const p = nodePos[m.key + '|' + ln]; if (p) { v.push(p); ax.push(lineDir[m.key + '|' + ln]); } }  // inside a chained edge
    if (!v.length) v = [map.project(L.latLng(m.d.ll[1], m.d.ll[0]), z)];
    ax = ax.map(([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }); if (!ax.length) ax = [[1, 0]];
    const par = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1]) > 0.866;  // within 30 degrees, either way
    const u = ax.reduce((b, a) => ax.filter(x => par(x, a)).length > ax.filter(x => par(x, b)).length ? a : b, ax[0]), n = [-u[1], u[0]];  // the axis most lines share
    const S_ = v.map(p => p.x * u[0] + p.y * u[1]), T_ = v.map(p => p.x * n[0] + p.y * n[1]), g = h - 0.7;
    if (ax.every(a => ax.every(b => par(a, b)))) {
      m.hub.setLatLngs([]);
      const s = S_.reduce((a, b) => a + b, 0) / S_.length, A = P(s * u[0] + Math.min(...T_) * n[0], s * u[1] + Math.min(...T_) * n[1]), B = P(s * u[0] + Math.max(...T_) * n[0], s * u[1] + Math.max(...T_) * n[1]);
      m.pill.forEach(q => q.setLatLngs([map.unproject(A, z), map.unproject(B, z)]));
      return { x0: Math.min(A.x, B.x) - h, x1: Math.max(A.x, B.x) + h, y0: Math.min(A.y, B.y) - h, y1: Math.max(A.y, B.y) + h };
    }
    m.pill.forEach(q => q.setLatLngs([]));
    const s0 = Math.min(...S_) - g, s1 = Math.max(...S_) + g, t0 = Math.min(...T_) - g, t1 = Math.max(...T_) + g, rr = Math.min(g, (s1 - s0) / 2, (t1 - t0) / 2), pts = [];
    for (const [cs, ct, a0] of [[s1 - rr, t1 - rr, 0], [s0 + rr, t1 - rr, 90], [s0 + rr, t0 + rr, 180], [s1 - rr, t0 + rr, 270]])
      for (let a = a0; a <= a0 + 90; a += 30) { const ss = cs + rr * Math.cos(a * Math.PI / 180), tt = ct + rr * Math.sin(a * Math.PI / 180); pts.push(P(ss * u[0] + tt * n[0], ss * u[1] + tt * n[1])); }
    m.hub.setLatLngs(pts.map(p => map.unproject(p, z)));
    return { x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) };
  }
  function paintStops() {  // with a selection a pill spans only the selected lines; stops none of them serves fade out
    const any = S.sel.size > 0;
    for (const m of markers) { const sel = m.d.l.filter(x => S.sel.has(x)), on = !any || sel.length > 0;
      shape(m, any && on ? sel : m.d.l); for (const q of m.pill) q.setStyle({ opacity: on ? 1 : .2 }).bringToFront();  // above a highlighted line
      m.hub.setStyle({ opacity: on ? 1 : .2, fillOpacity: on ? 1 : .2 }).bringToFront();
      const t = m.getTooltip(); if (t && t.options.permanent && t.getElement()) t.getElement().style.opacity = on ? 1 : .25; }
  }
  function repaint() { paintLines(); paintStops(); }
  map.on('moveend', () => { if (map.getZoom() !== drawnZ) draw(); else if (drawnZ >= 15) { stops(drawnZ); paintStops(); } }); draw();
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
// Join the edges that meet at a node where the same lines just continue in the same places (nearly every stop), so a bundle is one
// smoothed polyline from junction to junction and runs straight through its stops, as in loom (fronts only move off a node where they overlap).
function chainEdges(D) {
  const K = q => q[0] + ',' + q[1], last = a => a[a.length - 1], inc = {}, E = D.edges;
  E.forEach((e, i) => [K(e.p[0]), K(last(e.p))].forEach((k, j) => (inc[k] = inc[k] || []).push([i, j])));
  const rev = a => a.slice().reverse(), eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const through = k => { const v = inc[k]; if (v.length !== 2 || v[0][0] === v[1][0]) return false; const [[a, ja], [b, jb]] = v;
    return eq(ja ? E[a].l : rev(E[a].l), jb ? rev(E[b].l) : E[b].l); };
  const orient = (i, k) => K(E[i].p[0]) === k ? { p: E[i].p, l: E[i].l } : { p: rev(E[i].p), l: rev(E[i].l) };
  const used = new Set(), out = [];
  const walk = (i, k) => { let o = orient(i, k), j = i; const p = o.p.slice(), mid = []; used.add(i); let nk = K(last(p));
    while (through(nk)) { const nx = inc[nk].find(x => x[0] !== j)[0]; if (used.has(nx)) break; const q = orient(nx, nk); mid.push(nk); p.push(...q.p.slice(1)); used.add(nx); j = nx; nk = K(last(q.p)); }
    out.push({ p, l: o.l, mid }); };
  for (const k in inc) if (!through(k)) for (const [i] of inc[k]) if (!used.has(i)) walk(i, k);
  E.forEach((e, i) => { if (!used.has(i)) walk(i, K(e.p[0])); });  // loops of through nodes only
  D.edges = out;
}
