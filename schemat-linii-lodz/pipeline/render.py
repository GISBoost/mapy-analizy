import sys, json, math, re, xml.etree.ElementTree as ET
from shapely.geometry import LineString, Polygon, Point, box
from shapely import affinity, STRtree
from PIL import ImageFont

SVG_IN, OCTI, LINES, OUT, TITLE, SUB = sys.argv[1:7]
FS = float(sys.argv[7]) if len(sys.argv) > 7 else 9.0     # station font size (svg units)
LABEL_MODE = sys.argv[8] if len(sys.argv) > 8 else 'all'  # all | key
LL_SVG = sys.argv[9] if len(sys.argv) > 9 else None
PFX = sys.argv[10] if len(sys.argv) > 10 else 'm'
GEO = sys.argv[11] if len(sys.argv) > 11 and sys.argv[11] else None
FIXED = json.load(open(sys.argv[12])) if len(sys.argv) > 12 else {}  # {line: 'RRGGBB'} kept as-is (colours of another state)
import os; FONT_DIR = os.environ.get('FONT_DIR', '/usr/share/fonts/opentype/inter')
FR = ImageFont.truetype(f'{FONT_DIR}/Inter-Medium.otf', 100)
FB = ImageFont.truetype(f'{FONT_DIR}/Inter-Bold.otf', 100)
tw = lambda s, f, size: f.getlength(s) * size / 100.0

PAL = ["E32017","0098D4","00782A","EE7C0E","9B0056","003688","E8B600","00A4A7","B36305","6950A1","84B817","F06EA9",
       "1D1D1B","6F777B","D1495B","2E86AB","5C4033","C1440E","4B0082","00B2A9","A6761D","1B9E77","7570B3","66A61E",
       "377EB8","B8336A","0B6E4F","FF8C42"]
def rgb(h): return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def cdist(a, b):
    (r1, g1, b1), (r2, g2, b2) = rgb(a), rgb(b); rm = (r1 + r2) / 2
    return math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2)
def txtcol(h):
    r, g, b = rgb(h); return '#111' if (0.299 * r + 0.587 * g + 0.114 * b) > 165 else '#fff'
nkey = lambda s: (int(re.sub(r'\D', '', s) or 999), s)

def clean0(s):
    s = re.sub(r'\s*-\s*', '-', s.strip()); s = re.sub(r'\s+', ' ', s)
    if s.isupper() and len(s) > 4: s = s.title()
    return s
# ---------- line metadata + colour assignment (co-running lines get distant colours)
info = json.load(open(LINES, encoding='utf-8'))
names = sorted(info, key=nkey)
pairs = {n: set(map(tuple, info[n]['pairs'])) for n in names}
nb = {n: {m for m in names if m != n and pairs[n] & pairs[m]} for n in names}
col = {n: FIXED[n] for n in names if n in FIXED}; used = {p: sum(1 for c in col.values() if c == p) for p in PAL}
for n in sorted((n for n in names if n not in col), key=lambda n: (-len(nb[n]), nkey(n))):
    best = max(PAL, key=lambda p: (min([cdist(p, col[m]) for m in nb[n] if m in col] + [400]) - 60 * used[p], -PAL.index(p)))
    col[n] = best; used[best] += 1
byidx = {info[n]['idx']: n for n in names}

# ---------- parse transitmap svg
root = ET.parse(SVG_IN).getroot()
ns = '{http://www.w3.org/2000/svg}'
W0, H0 = float(root.get('width')), float(root.get('height'))
lon0, lat0, lon1, lat1 = map(float, root.get('latlng-box').split(','))
my = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
def proj(lon, lat):
    return ((lon - lon0) / (lon1 - lon0) * W0, (my(lat1) - my(lat)) / (my(lat1) - my(lat0)) * H0)
pts = lambda s: [tuple(map(float, p.split(','))) for p in s.split()]
segs = {}; polys = []; LW = 2.0
for el in root.iter():
    c = el.get('class') or ''
    if el.tag == ns + 'polyline' and 'outline' not in c and ('transit-edge' in c or 'inner-geom' in c):
        st = dict(x.split(':', 1) for x in el.get('style').split(';') if ':' in x)
        n = byidx.get(int(st['stroke'].lstrip('#'), 16) // 16)
        if n is None: continue
        LW = float(st['stroke-width']); p = pts(el.get('points'))
        if len(p) > 1: segs.setdefault(n, []).append(list(LineString(p).simplify(0.1).coords) if len(p) > 2 else p)
    elif el.tag == ns + 'polygon' and 'station-poly' in c:
        polys.append(Polygon(pts(el.get('points'))))

# ---------- line-number labels along bundles (taken from transitmap -l)
linelabels = []
if LL_SVG:
    r2 = ET.parse(LL_SVG).getroot(); XL = '{http://www.w3.org/1999/xlink}href'
    paths = {p.get('id'): p.get('d') for p in r2.iter(ns + 'path') if p.get('id')}
    for t in r2.iter(ns + 'text'):
        if t.get('class') != 'line-label': continue
        tp = t.find(ns + 'textPath'); d = paths.get(tp.get(XL).lstrip('#'))
        items = [byidx.get(int(ts.get('fill').lstrip('#'), 16) // 16) for ts in tp.findall(ns + 'tspan')]
        items = [i for i in items if i]
        nums = [float(v) for v in re.findall(r'-?\d+\.?\d*', d)]
        P = [(nums[i], nums[i + 1]) for i in range(0, len(nums), 2)]
        if items and len(P) > 1: linelabels.append(dict(d=d, items=items, pts=P, dy=t.get('dy')))

# ---------- graph from octi json
feats = json.load(open(OCTI))['features']
nodes = {}; adj = {}
for f in feats:
    if f['geometry']['type'] == 'Point':
        p = f['properties']; nodes[p['id']] = dict(sid=p.get('station_id'), xy=proj(*f['geometry']['coordinates']), label=p.get('station_label', ''),
                                                   ns=set(p.get('not_serving', [])), edges=[])
for f in feats:
    if f['geometry']['type'] == 'LineString':
        p = f['properties']; ls = {l['id']: l['label'] for l in p['lines']}
        for a, b in ((p['from'], p['to']), (p['to'], p['from'])):
            if a in nodes: nodes[a]['edges'].append((b, ls))
def clean(s):
    s = re.sub(r'\s*-\s*', '-', s.strip()); s = re.sub(r'\s+', ' ', s)
    if s.isupper() and len(s) > 4: s = s.title()
    return s
# ---------- termini from the timetable: nearest station (geographic graph) that the line actually reaches
term_by_sid = {}; name_by_sid = {}
if GEO:
    gf = json.load(open(GEO))['features']; gn = {}
    for f in gf:
        if f['geometry']['type'] == 'Point' and f['properties'].get('station_id'):
            gn[f['properties']['id']] = dict(sid=f['properties']['station_id'], ll=f['geometry']['coordinates'], lines=set())
    for f in gf:
        if f['geometry']['type'] == 'LineString':
            p = f['properties']
            for e in (p['from'], p['to']):
                if e in gn: gn[e]['lines'] |= {l['label'] for l in p['lines']}
    for n in names:
        for nm, lo, la in info[n].get('ends', []):
            best = None
            for g in gn.values():
                if n not in g['lines']: continue
                d = math.hypot((g['ll'][0] - lo) * 69000, (g['ll'][1] - la) * 111000)
                if best is None or d < best[0]: best = (d, g['sid'])
            if best and best[0] < 700:
                term_by_sid.setdefault(best[1], []).append(n); name_by_sid.setdefault(best[1], []).append(clean0(nm))
            else: print('terminus not placed:', n, nm, best)
tree = STRtree(polys)
# refine the lon/lat -> svg transform by fitting station nodes to station polygons
import numpy as np
_lab = [nd for nd in nodes.values() if nd['label']]
for _it in range(6):
    A = []; Bx = []; By = []
    for nd in _lab:
        P = Point(nd['xy']); i = tree.nearest(P)
        if polys[i].distance(P) < (25 if _it < 2 else 4):
            c = polys[i].centroid; A.append(nd['xy']); Bx.append(c.x); By.append(c.y)
    A = np.array(A); 
    if len(A) < 10: break
    ax_, bx_ = np.polyfit(A[:, 0], Bx, 1); ay_, by_ = np.polyfit(A[:, 1], By, 1)
    for nd in nodes.values(): nd['xy'] = (ax_ * nd['xy'][0] + bx_, ay_ * nd['xy'][1] + by_)
stations = []
_c = []
for nid, nd in nodes.items():
    if not nd['label']: continue
    P = Point(nd['xy'])
    for i in tree.query(P.buffer(60)): _c.append((polys[i].distance(P), nid, int(i)))
_c.sort(); _pn = {}; _np = {}
for d_, nid, i in _c:
    if nid in _np or i in _pn: continue
    _np[nid] = i; _pn[i] = nid
print('unmatched stations:', [nd['label'] for nid, nd in nodes.items() if nd['label'] and nid not in _np])
for nid, nd in nodes.items():
    if nid not in _np: continue
    i = _np[nid]
    cnt = {}; serve = set()
    for b, ls in nd['edges']:
        for lid, lab in ls.items():
            cnt[lab] = cnt.get(lab, 0) + 1
            if lid not in nd['ns']: serve.add(lab)
    term = sorted([l for l, c in cnt.items() if c == 1 and l in col], key=nkey)
    nm_ = clean(nd['label'])
    if GEO:
        term = sorted(set(term_by_sid.get(nd['sid'], [])), key=nkey)
        if term:
            cands_ = name_by_sid[nd['sid']]
            if nm_ not in cands_: nm_ = max(set(cands_), key=cands_.count)
    stations.append(dict(id=nid, poly=polys[i], name=nm_, term=term, lines=sorted(serve & set(col), key=nkey),
                         deg=len(nd['edges']), nbs=[b for b, _ in nd['edges']]))
print('stations', len(stations), 'polys', len(polys), 'lines', len(col))

# ---------- label layout
CH = FS * 0.95; CF = FS * 0.68; LH = FS * 1.12; GAP = FS * 0.35
def layout(st, wrap):
    bold = bool(st['term']) or st['deg'] > 2; f = FB if bold else FR; fs = FS * (1.08 if st['term'] else 1.0)
    name = st['name']; lines = [name]
    if wrap and len(name) > 13 and '-' in name:
        i = min((j for j, ch in enumerate(name) if ch == '-'), key=lambda j: abs(j - len(name) / 2))
        lines = [name[:i + 1], name[i + 1:]]
    elif wrap and len(name) > 16 and ' ' in name:
        i = min((j for j, ch in enumerate(name) if ch == ' '), key=lambda j: abs(j - len(name) / 2))
        lines = [name[:i], name[i + 1:]]
    rows = [dict(kind='t', text=l, w=tw(l, f, fs), h=LH * fs / FS, fs=fs, bold=bold) for l in lines]
    if st['term']:
        chips = [(l, max(CH * 1.25, tw(l, FB, CF) + CH * 0.6)) for l in st['term']]
        per = 6
        for k in range(0, len(chips), per):
            ch = chips[k:k + per]
            rows.append(dict(kind='c', chips=ch, w=sum(w for _, w in ch) + GAP * 0.6 * (len(ch) - 1), h=CH * 1.25))
    return rows, max(r['w'] for r in rows), sum(r['h'] for r in rows)
S2 = math.sqrt(.5)
CAND = [('E', (1, 0), 0, 'l', 0.0), ('W', (-1, 0), 0, 'r', 0.25), ('NE', (S2, -S2), -45, 'l', 0.9), ('SE', (S2, S2), 45, 'l', 1.0),
        ('SW', (-S2, S2), -45, 'r', 1.1), ('NW', (-S2, -S2), 45, 'r', 1.1), ('N', (0, -1), 0, 'c', 0.6), ('S', (0, 1), 0, 'c', 0.6),
        ('NEh', (S2, -S2), 0, 'lb', 0.3), ('SEh', (S2, S2), 0, 'lt', 0.3), ('SWh', (-S2, S2), 0, 'rt', 0.4), ('NWh', (-S2, -S2), 0, 'rb', 0.4)]
def cands(st):
    c = st['poly'].centroid; out = []
    for name, d, ang, al, pref in CAND:
        rows, w, h = layout(st, wrap=True) if ang == 0 else layout(st, wrap=len(st['name']) > 24)
        ext = max((x - c.x) * d[0] + (y - c.y) * d[1] for x, y in st['poly'].exterior.coords) + GAP
        ax, ay = c.x + d[0] * ext, c.y + d[1] * ext
        if len(al) == 2:
            x0 = 0 if al[0] == 'l' else -w; y0 = -h if al[1] == 'b' else 0; al = al[0]
        elif al == 'l': x0, y0 = 0, -h / 2
        elif al == 'r': x0, y0 = -w, -h / 2
        else: x0, y0 = -w / 2, (-h if name == 'N' else 0)
        g = affinity.translate(affinity.rotate(box(x0, y0, x0 + w, y0 + h), ang, origin=(0, 0)), ax, ay)
        out.append(dict(name=name, ang=ang, al=al, pref=pref, rows=rows, w=w, h=h, x0=x0, y0=y0, ax=ax, ay=ay, geom=g, pad=g.buffer(FS * 0.12, join_style=2), area=w * h))
    return out
LLF = FS * 0.62
def ll_geom(l):
    ls = LineString(l['pts']); w = sum(tw(i, FB, LLF) for i in l['items']) + LLF * 0.45 * (len(l['items']) - 1)
    mid = ls.interpolate(0.5, normalized=True); a = ls.interpolate(max(0, ls.length / 2 - w / 2)); b = ls.interpolate(min(ls.length, ls.length / 2 + w / 2))
    return LineString([a, b]).buffer(LLF * 0.75, cap_style=2, single_sided=False) if a.distance(b) > 0 else mid.buffer(LLF)
obst = [LineString(p).buffer(LW / 2 + 0.6, cap_style=2) for n in segs for p in segs[n]] + [p.buffer(0.5) for p in polys]
otree = STRtree(obst)
llg = [ll_geom(l) for l in linelabels]; lltree = STRtree(llg) if llg else None
if LABEL_MODE == 'key':
    stations_l = [s for s in stations if s['term'] or s['deg'] > 2]
else: stations_l = stations
for st in stations_l:
    st['c'] = cands(st)
    for c in st['c']:
        a = 0.0
        for i in otree.query(c['geom']):
            if obst[i].intersects(c['geom']) and not (obst[i] is None): a += obst[i].intersection(c['geom']).area
        c['static'] = min(a / c['area'], 3.0) * 60 + c['pref']
        if lltree is not None and any(llg[i].intersects(c['geom']) for i in lltree.query(c['geom'])): c['static'] += 0.8
    st['sel'] = None
byid = {s['id']: s for s in stations_l}
def dyn(st, c):
    v = c['static']
    for o in placed_near(st, c):
        v += 250 * o['sel']['pad'].intersection(c['pad']).area / c['area'] + 8
    for b in st['nbs']:
        o = byid.get(b)
        if o and o.get('sel') and o['sel']['name'] == c['name']: v -= 0.35
    return v
def placed_near(st, c):
    res = []
    for i in ltree.query(c['geom']):
        o = lstations[i]
        if o is not st and o.get('sel') and o['sel']['pad'].intersects(c['pad']): res.append(o)
    return res
# spatial index over stations (by generous envelope of all their candidates)
lstations = stations_l
from shapely.ops import unary_union
ltree = STRtree([unary_union([c['geom'] for c in s['c']]).envelope for s in lstations])
order = sorted(stations_l, key=lambda s: (sum(1 for c in s['c'] if c['static'] < 3), -len(s['term']), -s['deg']))
for st in order: st['sel'] = min(st['c'], key=lambda c: dyn(st, c))
for it in range(6):
    ch = 0
    for st in order:
        b = min(st['c'], key=lambda c: dyn(st, c))
        if b is not st['sel']: st['sel'] = b; ch += 1
    if not ch: break
bad = [s['name'] for s in stations_l if dyn(s, s['sel']) > 12]
print('label conflicts left:', len(bad), bad[:30])

if llg:
    lt = STRtree([s_['sel']['geom'] for s_ in stations_l])
    keepll = [not any(stations_l[j]['sel']['geom'].intersects(g) for j in lt.query(g)) for g in llg]
    print('line labels kept', sum(keepll), 'of', len(llg))
    linelabels = [l for l, k in zip(linelabels, keepll) if k]
# ---------- emit svg
E = []
geoms = [p for p in polys] + [s['sel']['geom'] for s in stations_l] + [LineString(p) for n in segs for p in segs[n]]
minx = min(g.bounds[0] for g in geoms); miny = min(g.bounds[1] for g in geoms)
maxx = max(g.bounds[2] for g in geoms); maxy = max(g.bounds[3] for g in geoms)
# legend block
LF = FS * 1.25; rowh = LF * 1.75; ncol = 1 if len(names) <= 30 else (2 if len(names) <= 60 else 3)
nrow = math.ceil(len(names) / ncol)
def short(s, n=30):
    s = clean(s); return s if len(s) <= n else s[:n - 1] + '…'
ltxt = {n: f"{short(info[n]['from'])} – {short(info[n]['to'])}" for n in names}
colw = max(tw(ltxt[n], FR, LF) for n in names) + LF * 5
legw = max(ncol * colw + LF * 2, tw(TITLE, FB, LF * 2.3) * 1.08, tw(SUB, FR, LF * 0.95) * 1.05); legh = nrow * rowh + LF * 9
content = STRtree(geoms)
def free(x, y):
    b = box(x, y, x + legw, y + legh)
    return not any(geoms[i].intersects(b) for i in content.query(b))
M = FS * 4
spots = [(minx, miny), (maxx - legw, miny), (minx, maxy - legh), (maxx - legw, maxy - legh)]
spot = next((s for s in spots if free(*s)), None)
if spot is None: spot = (maxx + M, miny); maxx = spot[0] + legw; maxy = max(maxy, miny + legh)
vx, vy, vw, vh = minx - M, miny - M, maxx - minx + 2 * M, maxy - miny + 2 * M
esc = lambda s: s.replace('&', '&amp;').replace('<', '&lt;')
FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif"
E.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx:.1f} {vy:.1f} {vw:.1f} {vh:.1f}" width="{vw:.0f}" height="{vh:.0f}" font-family="{FONT}">')
E.append(f'<style>.lb text{{paint-order:stroke;stroke:#fff;stroke-width:{FS*0.28:.2f}px;stroke-linejoin:round;fill:#16181d}}.chip text,.leg .chip text{{stroke:none}}.dim{{opacity:.08}}.ln,.lb,.chip{{transition:opacity .15s}}</style>')
E.append(f'<rect class="bg" x="{vx:.1f}" y="{vy:.1f}" width="{vw:.1f}" height="{vh:.1f}" fill="#fff"/>')
pl = lambda p: ' '.join(f'{x:.1f},{y:.1f}' for x, y in p)
E.append(f'<g class="casing" fill="none" stroke="#fff" stroke-width="{LW+1.0:.2f}" stroke-linecap="round" stroke-linejoin="round">')
for n in names:
    for p in segs.get(n, []): E.append(f'<polyline points="{pl(p)}"/>')
E.append('</g>')
for n in names:
    E.append(f'<g class="ln" data-l="{n}" fill="none" stroke="#{col[n]}" stroke-width="{LW:.2f}" stroke-linecap="round" stroke-linejoin="round">')
    for p in segs.get(n, []): E.append(f'<polyline points="{pl(p)}"/>')
    E.append('</g>')
E.append(f'<g class="stops" fill="#fff" stroke="#16181d" stroke-width="{LW*0.42:.2f}" stroke-linejoin="round">')
for s in stations:
    E.append(f'<polygon class="st" data-l="{" ".join(s["lines"])}" points="{pl(s["poly"].exterior.coords)}"/>')
E.append('</g>')
def dark(h):
    r, g, b = rgb(h); L = 0.299 * r + 0.587 * g + 0.114 * b
    k = 1.0 if L < 120 else (0.78 if L < 165 else 0.62)
    return '#%02x%02x%02x' % (int(r * k), int(g * k), int(b * k))
E.append('<defs>' + ''.join(f'<path id="{PFX}tp{i}" d="{l["d"]}"/>' for i, l in enumerate(linelabels)) + '</defs>')
E.append(f'<g class="ll" font-size="{LLF:.2f}" font-weight="700" style="paint-order:stroke;stroke:#fff;stroke-width:{LLF*0.3:.2f}px;stroke-linejoin:round">')
for i, l in enumerate(linelabels):
    sp = ''.join(f'<tspan class="lln" data-l="{n}" dx="{0 if k == 0 else LLF*0.45:.2f}" fill="{dark(col[n])}">{esc(n)}</tspan>' for k, n in enumerate(l['items']))
    E.append(f'<text dy="{"-0.45em" if l["dy"].startswith("0") else "1.15em"}"><textPath href="#{PFX}tp{i}" startOffset="50%" text-anchor="middle">{sp}</textPath></text>')
E.append('</g>')
def chip(x, y, w, n, h=CH, fs=CF):
    return (f'<g class="chip" data-l="{n}"><rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{h*0.28:.2f}" fill="#{col[n]}"/>'
            f'<text x="{x+w/2:.2f}" y="{y+h/2:.2f}" font-size="{fs:.2f}" font-weight="700" text-anchor="middle" dominant-baseline="central" style="fill:{txtcol(col[n])}">{esc(n)}</text></g>')
for s in stations_l:
    c = s['sel']; y = c['y0']
    E.append(f'<g class="lb" data-l="{" ".join(s["lines"])}" transform="translate({c["ax"]:.1f},{c["ay"]:.1f}) rotate({c["ang"]})">')
    for r in c['rows']:
        x = c['x0'] if c['al'] == 'l' else (c['x0'] + c['w'] - r['w'] if c['al'] == 'r' else c['x0'] + (c['w'] - r['w']) / 2)
        if r['kind'] == 't':
            E.append(f'<text x="{x:.2f}" y="{y + r["h"]*0.78:.2f}" font-size="{r["fs"]:.2f}" font-weight="{700 if r["bold"] else 500}">{esc(r["text"])}</text>')
        else:
            for n, w in r['chips']:
                E.append(chip(x, y + r['h'] * 0.1, w, n)); x += w + GAP * 0.6
        y += r['h']
    E.append('</g>')
# legend
lx, ly = spot
E.append(f'<g class="leg"><text x="{lx:.1f}" y="{ly+LF*2.2:.1f}" font-size="{LF*2.3:.1f}" font-weight="800" fill="#16181d">{esc(TITLE)}</text>')
E.append(f'<text x="{lx:.1f}" y="{ly+LF*4.3:.1f}" font-size="{LF*0.95:.1f}" fill="#5b6270">{esc(SUB)}</text>')
for i, n in enumerate(names):
    cx = lx + (i // nrow) * colw; cy = ly + LF * 6.5 + (i % nrow) * rowh
    E.append(chip(cx, cy, LF * 3.2, n, h=LF * 1.35, fs=LF * 0.95))
    E.append(f'<text class="lt" data-l="{n}" x="{cx+LF*3.9:.1f}" y="{cy+LF*1.0:.1f}" font-size="{LF:.1f}" fill="#16181d">{esc(ltxt[n])}</text>')
E.append('</g></svg>')
open(OUT, 'w', encoding='utf-8').write('\n'.join(E))
json.dump([dict(n=n, c=col[n], t=txtcol(col[n]), a=clean(info[n]['from']), b=clean(info[n]['to']), k=info[n]['trips']) for n in names],
          open(OUT.replace('.svg', '.lines.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('wrote', OUT, f'{vw:.0f}x{vh:.0f}')
