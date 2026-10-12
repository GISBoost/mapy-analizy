// Geographic variant of the diagram: the lines on an OpenStreetMap basemap (Leaflet). Loaded on first use by index.html.
// The lines and stations are loom's own rendering: transitmap's vector tiles for every zoom from z11 to z17 (pipeline/geo_tiles.sh,
// merged into the data by geo_tiles.py), drawn as they are, so bundles, node curves and stations look as on loom's maps. Between
// two zooms (and past z17) the geometry of the zoom below is scaled, as tiles are. On top: stop names, termini with their line chips,
// tooltips, and a click on a line (or on the list) highlights it.
window.GeoMap = function (el, D, S) {  // D = mapy/tram_geo.json; S = {sel: Set, pick(line), meta: {line: {a, b, d (dark colour)}}}
  // junctions (3+ edges): the only through stops named between z15 and z17, where naming every stop crowds the map
  const deg = {}; for (const e of D.edges) for (const q of [e.p[0], e.p[e.p.length - 1]]) deg[q[0] + ',' + q[1]] = (deg[q[0] + ',' + q[1]] || 0) + 1;
  const ZS = Object.keys(D.z).map(Number), Z0 = Math.min(...ZS), Z1 = Math.max(...ZS);
  const map = L.map(el, { preferCanvas: true, zoomSnap: 0.5, maxZoom: Z1 + 0.5 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">autorzy OpenStreetMap</a> (ODbL)' }).addTo(map);
  const bounds = L.latLngBounds(D.edges.flatMap(e => e.p.map(q => [q[1], q[0]])));
  // no zooming out past the whole network, no panning far off it
  const lock = () => { map.setMinZoom(map.getBoundsZoom(bounds)); map.setMaxBounds(bounds.pad(0.15)); };
  map.options.maxBoundsViscosity = 0.8; map.fitBounds(bounds); lock();
  // the map may be created while its view is still hidden: fit again once the container has its real size, until the user moves it
  let touched = false; for (const t of ['pointerdown', 'wheel', 'keydown']) el.addEventListener(t, () => { touched = true; }, { passive: true });
  new ResizeObserver(() => { if (!el.clientWidth) return; map.invalidateSize(); lock(); if (!touched) map.fitBounds(bounds); }).observe(el);
  const cv = L.canvas({ padding: 0.3, tolerance: 5 }), grp = L.layerGroup().addTo(map), stopGrp = L.layerGroup().addTo(map);
  let byLine = {}, markers = [], hits = null, look = {}, drawn = null;  // drawn: [tile zoom, scale] of the layers on the map
  const P = (x, y) => L.point(x, y), lerp = (a, b, t) => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  const dark = () => (document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  const col = ln => '#' + (look.dark && S.meta[ln] && S.meta[ln].d || D.lines[ln]);
  const rgb = c => c[0] === '#' ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : c.match(/\d+/g).slice(0, 3).map(Number);
  const mix = (c, t) => { const a = rgb(c), b = rgb(look.bg); return `rgb(${a.map((v, i) => Math.round(v * t + b[i] * (1 - t))).join(',')})`; };  // opaque stand-in for opacity t
  const tileZ = z => Math.min(Math.max(Math.floor(z), Z0), Z1);
  // points of a tile zoom are quarter pixels of that zoom; converted to lat/lng once per zoom
  const cache = {};
  const geo = zi => cache[zi] || (cache[zi] = (() => { const Z = D.z[zi], ll = a => { const r = []; for (let i = 0; i < a.length; i += 2) r.push(map.unproject(P(a[i] / 4, a[i + 1] / 4), zi)); return r; };
    return { l: Object.fromEntries(Object.entries(Z.l).map(([ln, ps]) => [ln, ps.map(ll)])), st: Z.st.map(([sid, ring]) => [sid, ll(ring), ring]) }; })());
  const stopBySid = {}; for (const d of D.stops) (stopBySid[d.sid] = stopBySid[d.sid] || []).push(d);
  function draw() {
    const z = map.getZoom(), zi = tileZ(z), Z = D.z[zi], k = 2 ** (z - zi), w = Z.w * k, cw = w + 2 * Z.o * k, G = geo(zi);
    look = { dark: dark() }; look.cas = '#16181d'; look.bg = look.dark ? getComputedStyle(el).backgroundColor : '#ececec';
    grp.clearLayers(); byLine = {}; drawn = [zi, k];
    // all outlines under all lines, as each tile draws them
    const cas = {}; for (const ln in G.l) cas[ln] = G.l[ln].map(p => L.polyline(p, { renderer: cv, color: look.cas, weight: cw, lineCap: 'butt', lineJoin: 'round', interactive: false }).addTo(grp));
    for (const ln in G.l) G.l[ln].forEach((p, i) => {
      const pl = L.polyline(p, { renderer: cv, color: col(ln), weight: w, lineCap: 'round', lineJoin: 'round', interactive: true }).addTo(grp);
      pl.ln = ln; pl.cas = cas[ln][i];
      const m = S.meta[ln]; pl.bindTooltip(`<b>${ln}</b>${m ? '<br>' + m.a + ' – ' + m.b : ''}`, { sticky: true, className: 'stl' });
      pl.on('click', ev => { L.DomEvent.stopPropagation(ev); S.pick(ln); });
      pl.on('mouseover', () => { if (!S.sel.size || S.sel.has(ln)) pl.setStyle({ weight: drawnW() + 2 }); });
      pl.on('mouseout', () => pl.setStyle({ weight: drawnW() }));
      (byLine[ln] = byLine[ln] || []).push(pl);
    });
    // line points in a grid (layer pixels of this zoom), so the labels can keep off the lines
    hits = new Map(); const cell = 12, f = k / 4;
    for (const ln in Z.l) for (const a of Z.l[ln]) for (let i = 2; i < a.length; i += 2) { const p = P(a[i - 2] * f, a[i - 1] * f), q = P(a[i] * f, a[i + 1] * f), n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 4);
      for (let j = 0; j <= n; j++) { const r = lerp(p, q, j / n), c = Math.floor(r.x / cell) + ',' + Math.floor(r.y / cell); (hits.get(c) || hits.set(c, []).get(c)).push(r); } }
    hits.cell = cell;
    stops(); repaint();
  }
  const drawnW = () => D.z[drawn[0]].w * drawn[1];
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
  // stations as transitmap drew them for this zoom (it drops the smaller of two overlapping ones, never a terminus);
  // a stop is named and gets a tooltip where its station is
  function stops() {
    stopGrp.clearLayers(); markers = [];
    const z = map.getZoom(), [zi, k] = drawn, Z = D.z[zi], f = k / 4, boxes = [], labels = [], at = {};
    for (const [sid, ll, ring] of geo(zi).st) {
      const pg = L.polygon(ll, { renderer: cv, color: look.cas, weight: Math.max(Z.s * k, 1), fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(stopGrp);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < ring.length; i += 2) { const x = ring[i] * f, y = ring[i + 1] * f; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const r = { x0, y0, x1, y1 }, a = at[sid] || (at[sid] = { polys: [], r: { ...r }, rs: [] }); a.rs.push(r);
      a.polys.push(pg); a.r = { x0: Math.min(a.r.x0, x0), y0: Math.min(a.r.y0, y0), x1: Math.max(a.r.x1, x1), y1: Math.max(a.r.y1, y1) };
    }
    // names of through stops only in and around the view (a permanent tooltip per stop is what makes z15+ slow); redone on moveend
    const vb = map.getPixelBounds(), pad = vb.getSize().multiplyBy(0.25), inView = c => c.x > vb.min.x - pad.x && c.x < vb.max.x + pad.x && c.y > vb.min.y - pad.y && c.y < vb.max.y + pad.y;
    // hard obstacles for the labels: other labels and the termini; through stations are avoided like the lines, if possible
    const soft = []; for (const sid in at) ((stopBySid[sid] || []).some(d => d.t.length) ? boxes : soft).push(...at[sid].rs);
    for (const sid in at) for (const d of stopBySid[sid] || []) {
      const { r, polys } = at[sid], c = P((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), term = d.t.length > 0, key = d.ll[0] + ',' + d.ll[1];
      const m = L.circleMarker(map.unproject(c, z), { renderer: cv, radius: Math.max((r.x1 - r.x0) / 2, (r.y1 - r.y0) / 2, 4), stroke: false, fillOpacity: 0, interactive: true }).addTo(stopGrp);
      m.d = d; m.polys = polys; markers.push(m);
      if (term && z >= 11 || (z >= 17 || z >= 15 && deg[key] > 2) && inView(c)) labels.push({ m, d, c, r, term });
      else m.bindTooltip(`<b>${d.n}</b><br>${d.l.map(chip).join('')}`, { direction: 'top', className: 'stl' });
    }
    // labels: termini first, then the stops with most lines; each tries right, left, above, below and keeps clear of the other labels
    // and termini, and of the lines and other stations if it can; one that fits nowhere shows on hover instead
    labels.sort((a, b) => (b.term - a.term) || (b.d.l.length - a.d.l.length));
    const hitLine = q => { const c = hits.cell; for (let x = Math.floor(q.x0 / c); x <= Math.floor(q.x1 / c); x++) for (let y = Math.floor(q.y0 / c); y <= Math.floor(q.y1 / c); y++)
      for (const p of hits.get(x + ',' + y) || []) if (p.x > q.x0 && p.x < q.x1 && p.y > q.y0 && p.y < q.y1) return true; return false; };
    const hit = (B, q, own) => B.some(b => !(b.x0 >= own.x0 && b.x1 <= own.x1 && b.y0 >= own.y0 && b.y1 <= own.y1) && q.x0 < b.x1 && q.x1 > b.x0 && q.y0 < b.y1 && q.y1 > b.y0);
    for (const L_ of labels) {
      const { m, d, c, r, term } = L_, chips = term ? d.t : [];
      const wd = Math.max(tw(d.n, (term ? 800 : 600) + ' 11px'), chips.reduce((s, x) => s + tw(x, '700 10px') + 10, 0)) + 12, ht = term ? 34 : 17;
      const hx = Math.max(r.x1 - c.x, c.x - r.x0) + 2, hy = Math.max(r.y1 - c.y, c.y - r.y0) + 2;
      const opts = [['right', [hx, 0], c.x + hx + 6, c.y - ht / 2], ['left', [-hx, 0], c.x - hx - 6 - wd, c.y - ht / 2],
        ['top', [0, -hy], c.x - wd / 2, c.y - hy - 6 - ht], ['bottom', [0, hy], c.x - wd / 2, c.y + hy + 6]].map(([dir, off, x, y]) => ({ dir, off, q: { x0: x - 1, y0: y - 1, x1: x + wd + 1, y1: y + ht + 1 } }));
      const ok = opts.filter(o => !hit(boxes, o.q, r)), free = o => !hit(soft, o.q, r);
      const pick = ok.find(o => free(o) && !hitLine(o.q)) || ok.find(free) || ok.find(o => !hitLine(o.q)) || ok[0];
      const html = term ? `<b>${d.n}</b><br>${chips.map(chip).join('')}` : d.n;
      if (pick) { boxes.push(pick.q); m.bindTooltip(html, { permanent: true, direction: pick.dir, offset: pick.off, className: 'stl' + (term ? ' stt' : '') }); }
      else m.bindTooltip(`<b>${d.n}</b><br>${d.l.map(chip).join('')}`, { direction: 'top', className: 'stl' });
    }
  }
  function paintStops() {  // with a selection, stations none of the selected lines stops at fade out
    const any = S.sel.size > 0;
    for (const m of markers) { const on = !any || m.d.l.some(x => S.sel.has(x));
      for (const pg of m.polys) pg.setStyle({ opacity: on ? 1 : .2, fillOpacity: on ? 1 : .2 }).bringToFront();  // above a highlighted line
      const t = m.getTooltip(); if (t && t.options.permanent && t.getElement()) t.getElement().style.opacity = on ? 1 : .25; }
  }
  function repaint() { paintLines(); paintStops(); }
  map.on('moveend', () => { const z = map.getZoom(); if (tileZ(z) !== drawn[0] || 2 ** (z - drawn[0]) !== drawn[1]) draw(); else if (z >= 15) { stops(); paintStops(); } }); draw();
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
