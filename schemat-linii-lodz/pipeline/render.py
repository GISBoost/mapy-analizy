import sys, json, math, re, xml.etree.ElementTree as ET
from shapely.geometry import LineString, Polygon, Point, box
from shapely import affinity, STRtree
from shapely.ops import unary_union
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
    # transitmap -l widens the canvas for labels sticking out: map its coordinates back onto the -l-less drawing
    a0, b0, a1, b1 = map(float, r2.get('latlng-box').split(',')); W2, H2 = float(r2.get('width')), float(r2.get('height'))
    t2 = lambda x, y: proj(a0 + x / W2 * (a1 - a0), math.degrees(2 * math.atan(math.exp(my(b1) - y / H2 * (my(b1) - my(b0)))) - math.pi / 2))
    paths = {p.get('id'): p.get('d') for p in r2.iter(ns + 'path') if p.get('id')}
    for t in r2.iter(ns + 'text'):
        if t.get('class') != 'line-label': continue
        tp = t.find(ns + 'textPath'); d = paths.get(tp.get(XL).lstrip('#'))
        items = [byidx.get(int(ts.get('fill').lstrip('#'), 16) // 16) for ts in tp.findall(ns + 'tspan')]
        items = [i for i in items if i]
        nums = [float(v) for v in re.findall(r'-?\d+\.?\d*', d)]
        P = [t2(nums[i], nums[i + 1]) for i in range(0, len(nums), 2)]
        if items and len(P) > 1: linelabels.append(dict(d='M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in P), items=items, pts=P, dy=t.get('dy')))

# ---------- graph from octi json
feats = json.load(open(OCTI))['features']
nodes = {}; adj = {}; egeo = {}
for f in feats:
    if f['geometry']['type'] == 'Point':
        p = f['properties']; nodes[p['id']] = dict(sid=p.get('station_id'), xy=proj(*f['geometry']['coordinates']), label=p.get('station_label', ''),
                                                   ns=set(p.get('not_serving', [])), edges=[])
for f in feats:
    if f['geometry']['type'] == 'LineString':
        p = f['properties']; ls = {l['id']: l['label'] for l in p['lines']}
        egeo[p['from'], p['to']] = egeo[p['to'], p['from']] = [proj(*c) for c in f['geometry']['coordinates']]
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
    for e in egeo: egeo[e] = [(ax_ * x + bx_, ay_ * y + by_) for x, y in egeo[e]]
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
# a node that lost its polygon to a nearer node (transitmap drew both as one symbol) hands its termini to that station
if GEO:
    by_poly = {_np[s['id']]: s for s in stations}
    for nid, nd in nodes.items():
        if not nd['label'] or nid in _np or not term_by_sid.get(nd['sid']): continue
        P = Point(nd['xy']); i = int(tree.nearest(P))
        if i in by_poly and polys[i].distance(P) < 60:
            s = by_poly[i]; extra = set(term_by_sid[nd['sid']]) - set(s['term'])
            if not s['term']: s['name'] = max(set(name_by_sid[nd['sid']]), key=name_by_sid[nd['sid']].count)
            s['term'] = sorted(set(s['term']) | extra, key=nkey)
            print('termini moved:', nd['label'], '->', s['name'], sorted(extra, key=nkey))
print('stations', len(stations), 'polys', len(polys), 'lines', len(col))

# ---------- cut-outs (env CUTS, JSON list of {lines, cut, k, box, title, at}): the tail beyond station `cut` served by
# exactly `lines` (e.g. 41 to Pabianice, 9+10B to Olechów) either goes into a framed inset in the `at` corner (bl/tl/br/tr)
# of the main map, straightened, or (box=false) stays in place scaled by k toward the cut station (shortens a radial)
CUTS = json.loads(os.environ.get('CUTS', '[]')); cuts = []
R0 = min(math.sqrt(p.area / math.pi) for p in polys)  # radius of a one-line stop symbol
DL = LW * float(os.environ.get('LINE_PITCH', 37 / 30))  # distance between parallel lines (transitmap width + spacing)
for cfg in CUTS:
    L = sorted(cfg.get('lines') or [cfg['line']], key=nkey); Ls = set(L); cn = cfg['cut'] if isinstance(cfg['cut'], list) else [cfg['cut']]
    css = [next((s for s in stations if s['name'] == n_ and any(Ls & set(ls.values()) for _, ls in nodes[s['id']]['edges'])), None) for n_ in cn]  # not lines: 41 passes IKEA as not_serving
    if None in css: print('cut station not found:', cfg); continue
    cs = css[0]; cids = {s['id'] for s in css}; tail, te, ents = set(), set(), []
    if 'to' in cfg:  # loops, branches, several ways out: the components beyond the cut stations made of the group's lines
        for s in css:  # only, that reach a terminus named in `to`
            for b0, ls0 in nodes[s['id']]['edges']:
                if b0 in cids or not set(ls0.values()) <= Ls: continue
                comp, ce, todo, lk = {b0}, {frozenset((s['id'], b0))}, [b0], set()
                while todo:
                    a = todo.pop()
                    for b, ls in nodes[a]['edges']:
                        if not set(ls.values()) <= Ls:
                            if b not in cids: lk.add(nodes[a]['label'] or a)
                            continue
                        ce.add(frozenset((a, b)))
                        if b not in comp and b not in cids: comp.add(b); todo.append(b)
                if any(t in nodes[a]['label'] for a in comp for t in cfg['to']): te |= ce; tail |= comp; ents.append((s, b0)); lk and print('cut: other lines also leave', sorted(lk))
    else:
        todo = [cs['id']]
        while todo:
            a = todo.pop()
            for b, ls in nodes[a]['edges']:
                if set(ls.values()) == Ls and b != cs['id'] and frozenset((a, b)) not in te:
                    te.add(frozenset((a, b))); todo += [b] if b not in tail else []; tail.add(b)
        if te: ents = [(cs, next(b for b, ls in nodes[cs['id']]['edges'] if frozenset((cs['id'], b)) in te))]
    if not te: print('cut has no tail:', cfg); continue
    reg = unary_union([LineString(egeo[tuple(e)]).buffer(LW * (len(L) + 1)) for e in te]).difference(unary_union([s['poly'].buffer(LW * 0.6) for s in css]))
    cuts.append(dict(cfg=cfg, L=L, cs=cs, reg=reg, te=te, ents=ents, st=[s for s in stations if s['id'] in tail],
                     segs={n: [p for p in segs[n] if reg.contains(LineString(p).interpolate(0.5, normalized=True))] for n in L},
                     ll=[l for l in linelabels if reg.contains(LineString(l['pts']).interpolate(0.5, normalized=True))]))
    print('cut', L, 'at', cfg['cut'], len(cuts[-1]['st']), 'stations', sum(map(len, cuts[-1]['segs'].values())), 'polylines')
moved = {id(p) for c in cuts for v in c['segs'].values() for p in v} | {id(s['poly']) for c in cuts for s in c['st']}
maing = [LineString(p) for n in segs for p in segs[n] if id(p) not in moved] + [p for p in polys if id(p) not in moved]
mtree = STRtree(maing); mb = unary_union(maing).bounds; boxes = []; below = []; CG = FS * float(os.environ.get('CUT_GAP', 5))  # inset to map gap
def slot(w, h, at, gap):  # free w x h spot inside the main map's bounds, nearest to corner `at`; outside the bounds if none
    step = FS * 2
    xs = [mb[0] + i * step for i in range(int((mb[2] - mb[0] - w) / step) + 1)] or [mb[0]]
    ys = [mb[1] + i * step for i in range(int((mb[3] - mb[1] - h) / step) + 1)] or [mb[1]]
    corner = lambda x, y: (abs(x - (mb[0] if 'l' in at else mb[2] - w)) + abs(y - (mb[3] - h if 'b' in at else mb[1])))
    free_ = lambda b: not any(maing[i].intersects(b) for i in mtree.query(b)) and not any(o.buffer(gap).intersects(b) for o in boxes)
    pos = next(((x, y) for x, y in sorted(((x, y) for x in xs for y in ys), key=lambda q: corner(*q)) if free_(box(x, y, x + w, y + h).buffer(gap))), None)
    return pos or ((mb[0] - w - gap, mb[3] - h) if 'l' in at else (mb[2] + gap, mb[3] - h))
for c in cuts:
    cx, cy = c['cs']['poly'].centroid.coords[0]; L = c['L']
    if not c['cfg'].get('box', True):  # in place: scale the tail toward the cut station
        k = c['cfg'].get('k', 0.5); sc = lambda x, y: (cx + k * (x - cx), cy + k * (y - cy))
        for v in c['segs'].values():
            for p in v: p[:] = [sc(x, y) for x, y in p]
        for l in c['ll']:
            l['pts'] = [sc(x, y) for x, y in l['pts']]; l['d'] = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in l['pts'])
        for s in c['st']:
            i = next(j for j, p in enumerate(polys) if p is s['poly']); q = s['poly'].centroid; nx, ny = sc(q.x, q.y)
            s['poly'] = polys[i] = affinity.translate(s['poly'], nx - q.x, ny - q.y)
    elif c['cfg'].get('shape') == 'keep':
        # inset keeping the tail's own drawing (for loops and branches): centrelines scaled by k, every line keeps its
        # offset from its centreline (bundles stay as wide as on the map), stop symbols keep their size
        k = c['cfg'].get('k', 0.5); cl = [LineString(egeo[tuple(e)]) for e in c['te']]; ct = STRtree(cl); o0 = unary_union(cl).centroid
        def mp(x, y):
            P_ = Point(x, y); g = cl[int(ct.nearest(P_))]; q = g.interpolate(g.project(P_))
            return o0.x + k * (q.x - o0.x) + x - q.x, o0.y + k * (q.y - o0.y) + y - q.y
        pcs = [p for v in c['segs'].values() for p in v]; new = [[mp(x, y) for x, y in p] for p in pcs]
        sc_ = [mp(*s['poly'].centroid.coords[0]) for s in c['st']]; ug = list({s['id']: s for s, _ in c['ents']}.values()); gc = [mp(*s['poly'].centroid.coords[0]) for s in ug]
        bx = unary_union([LineString(p) for p in new] + [Point(q) for q in sc_ + gc]).bounds
        side, top = FS * 10, FS * 6; w, h = bx[2] - bx[0] + 2 * side, bx[3] - bx[1] + top + side
        at_ = c['cfg'].get('at', 'bl'); pos = (mb[2] + CG, mb[3] - h) if at_ == 'side' else slot(w, h, at_, CG); boxes.append(box(pos[0], pos[1], pos[0] + w, pos[1] + h))
        dx, dy = pos[0] + side - bx[0], pos[1] + top - bx[1]
        for p, n_ in zip(pcs, new): p[:] = [(x + dx, y + dy) for x, y in n_]
        for s, (x, y) in zip(c['st'], sc_):
            j = next(j for j, p in enumerate(polys) if p is s['poly']); q = s['poly'].centroid
            s['poly'] = polys[j] = affinity.translate(s['poly'], x + dx - q.x, y + dy - q.y)
        for l in c['ll']:
            l['pts'] = [(x + dx, y + dy) for x, y in (mp(*q) for q in l['pts'])]; l['d'] = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in l['pts'])
        c.update(box=boxes[-1], ghosts=[])
        for s, (x, y) in zip(ug, gc):  # each cut station again, where the tail leaves it
            q = s['poly'].centroid; gp = affinity.translate(s['poly'], x + dx - q.x, y + dy - q.y)
            gs = dict(id='cut' + s['id'], poly=gp, name=s['name'], term=[], lines=L, deg=3, nbs=[]); stations.append(gs); polys.append(gp); c['ghosts'].append(gs)
    else:
        # inset: the tail straightened into a horizontal bundle (stations in hop order from the cut, SP apart, labels
        # get the room above it at 45 deg), in a box slid from the preferred corner until it keeps clear of the map
        hop, todo = {c['cs']['id']: 0}, [c['cs']['id']]
        while todo:
            a_ = todo.pop(0)
            for b_, _ in nodes[a_]['edges']:
                if b_ not in hop and frozenset((a_, b_)) in c['te']: hop[b_] = hop[a_] + 1; todo.append(b_)
        sts = sorted(c['st'], key=lambda s: hop[s['id']])
        sg = -1 if sum(s['poly'].centroid.x for s in sts) / len(sts) < cx else 1
        off = (len(L) - 1) / 2 * DL; cap = lambda x, y: LineString([(x, y - off), (x, y + off + 0.01)]).buffer(R0)  # stop symbol across the bundle
        gw = tw(c['cs']['name'], FB, FS) + FS * 2  # the cut station's label sits beside the bundle's open end
        SP = FS * 3.2; n = len(sts); top, bot, side = FS * 17, FS * 4 + off, FS * 4
        w, h = n * SP + 2 * side + gw, top + bot
        at = c['cfg'].get('at', 'bl'); gap = CG
        if at == 'below':  # stacked under the map, left-aligned: the poster's band column
            pos = (mb[0], max([o.bounds[3] for o in boxes] + [mb[3] + FS * 6]) + gap); below.append(len(boxes))
        else: pos = slot(w, h, at, gap)
        boxes.append(box(pos[0], pos[1], pos[0] + w, pos[1] + h))
        gx = pos[0] + side + (n * SP if sg < 0 else gw); gy = pos[1] + top  # the cut station again, where the tail starts
        ghost = cap(gx, gy)
        gs = dict(id='cut' + '_'.join(L), poly=ghost, name=c['cs']['name'], term=[], lines=L, deg=3, nbs=[], only={'E', 'W'} - {'W' if sg < 0 else 'E'}); stations.append(gs); polys.append(ghost)
        c.update(box=boxes[-1], ghosts=[gs])
        for i_, s in enumerate(sts):
            j = next(j for j, p in enumerate(polys) if p is s['poly'])
            s['poly'] = polys[j] = cap(gx + sg * (i_ + 1) * SP, gy)
            s['only'] = {'NE', 'NW' if sg < 0 else 'NE'}  # a ladder of 45 deg labels
        for k_, nm in enumerate(L):
            drop = {id(p) for p in c['segs'][nm]}; y_ = gy - off + k_ * DL
            segs[nm] = [p for p in segs[nm] if id(p) not in drop] + [[(gx, y_), (gx + sg * n * SP, y_)]]
        dropl = {id(l) for l in c['ll']}; linelabels = [l for l in linelabels if id(l) not in dropl]
    # stubs on the main map: the bundle leaves the cut station for a few units toward where its tail went
    c['stub'] = []
    for s, first in c['ents']:
        cx, cy = s['poly'].centroid.coords[0]; fx, fy = nodes[first]['xy']; L_ = math.hypot(fx - cx, fy - cy) or 1; ux, uy = (fx - cx) / L_, (fy - cy) / L_
        Le = sorted(set(L) & set(next(ls for b, ls in nodes[s['id']]['edges'] if b == first).values()), key=nkey)
        for k_, nm in enumerate(Le):
            o = (k_ - (len(Le) - 1) / 2) * DL; x_, y_ = cx - uy * o, cy + ux * o
            c['stub'].append((nm, [(x_, y_), (x_ + ux * FS * 4, y_ + uy * FS * 4)]))

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
        if 'only' in st and name not in st['only']: continue
        rows, w, h = layout(st, wrap=True) if ang == 0 else layout(st, wrap=len(st['name']) > 24 and 'only' not in st)
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
obst = [LineString(p).buffer(LW / 2 + 0.6, cap_style=2) for n in segs for p in segs[n]] + [p.buffer(0.5) for p in polys] + [b.exterior.buffer(1) for b in boxes]
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
for c in cuts:  # final inset frame: the reserved box grown to whatever the tail's labels need
    if 'box' in c: c['box'] = box(*unary_union([c['box']] + [s['sel']['geom'].buffer(FS) for s in c['st'] + c['ghosts'] if s.get('sel')]).bounds)
geoms = [p for p in polys] + [s['sel']['geom'] for s in stations_l] + [LineString(p) for n in segs for p in segs[n]] + [c['box'] for c in cuts if 'box' in c]
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
gb = (minx, miny, maxx, maxy)  # the drawing's own bounds (the poster ignores the page legend's spot)
if spot is None: spot = (maxx + M, miny); maxx = spot[0] + legw; maxy = max(maxy, miny + legh)
vx, vy, vw, vh = minx - M, miny - M, maxx - minx + 2 * M, maxy - miny + 2 * M
esc = lambda s: s.replace('&', '&amp;').replace('<', '&lt;')
FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif"
E.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx:.1f} {vy:.1f} {vw:.1f} {vh:.1f}" width="{vw:.0f}" height="{vh:.0f}" font-family="{FONT}">')
E.append(f'<style>.lb text{{paint-order:stroke;stroke:#fff;stroke-width:{FS*0.28:.2f}px;stroke-linejoin:round;fill:#16181d}}.chip text,.leg .chip text{{stroke:none}}.dim{{opacity:.08}}.ln,.lb,.chip{{transition:opacity .15s}}</style>')
E.append(f'<rect class="bg" x="{vx:.1f}" y="{vy:.1f}" width="{vw:.1f}" height="{vh:.1f}" fill="#fff"/>')
pl = lambda p: ' '.join(f'{x:.1f},{y:.1f}' for x, y in p)
for c in cuts:
    if 'box' not in c: continue
    x0, y0, x1, y1 = c['box'].bounds; t = c['cfg'].get('title', '')
    E.append(f'<g class="inset" data-l="{" ".join(c["L"])}"><rect class="box" x="{x0:.1f}" y="{y0:.1f}" width="{x1-x0:.1f}" height="{y1-y0:.1f}" rx="{FS:.1f}" fill="#f3f4f6" stroke="#d5d9e0" stroke-width="{FS*0.15:.2f}"/>'
             f'<text class="it" x="{x0+FS*(1+3.6*len(c["L"])):.1f}" y="{y0+FS*2.25:.1f}" font-size="{FS*1.3:.1f}" font-weight="800" fill="#16181d">{esc(t)}</text></g>')
E.append(f'<g class="casing" fill="none" stroke="#fff" stroke-width="{LW+1.0:.2f}" stroke-linecap="round" stroke-linejoin="round">')
for n in names:
    for p in segs.get(n, []): E.append(f'<polyline points="{pl(p)}"/>')
E.append('</g>')
for n in names:
    E.append(f'<g class="ln" data-l="{n}" fill="none" stroke="#{col[n]}" stroke-width="{LW:.2f}" stroke-linecap="round" stroke-linejoin="round">')
    for p in segs.get(n, []): E.append(f'<polyline points="{pl(p)}"/>')
    E.append('</g>')
for c in cuts:
    for nm, p in c['stub']: E.append(f'<g class="ln" data-l="{nm}" fill="none" stroke="#{col[nm]}" stroke-width="{LW:.2f}" stroke-linecap="round" stroke-dasharray="{LW*0.1:.2f} {LW*1.6:.2f}"><polyline points="{pl(p)}"/></g>')
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
for c in cuts:
    for k_, nm in enumerate(c['L'] if 'box' in c else []): E.append(chip(c['box'].bounds[0] + FS * (1 + 3.6 * k_), c['box'].bounds[1] + FS * 0.9, FS * 3.2, nm, h=FS * 1.8, fs=FS * 1.25))
# legend
lx, ly = spot; body = len(E)
E.append(f'<g class="leg"><text x="{lx:.1f}" y="{ly+LF*2.2:.1f}" font-size="{LF*2.3:.1f}" font-weight="800" fill="#16181d">{esc(TITLE)}</text>')
E.append(f'<text x="{lx:.1f}" y="{ly+LF*4.3:.1f}" font-size="{LF*0.95:.1f}" fill="#5b6270">{esc(SUB)}</text>')
for i, n in enumerate(names):
    cx = lx + (i // nrow) * colw; cy = ly + LF * 6.5 + (i % nrow) * rowh
    E.append(chip(cx, cy, LF * 3.2, n, h=LF * 1.35, fs=LF * 0.95))
    E.append(f'<text class="lt" data-l="{n}" x="{cx+LF*3.9:.1f}" y="{cy+LF*1.0:.1f}" font-size="{LF:.1f}" fill="#16181d">{esc(ltxt[n])}</text>')
E.append('</g></svg>')
open(OUT, 'w', encoding='utf-8').write('\n'.join(E))

# ---------- print poster (<out>.poster.svg): same drawing on a sheet of POSTER_RATIO (height/width, default A1 portrait).
# Title bar with an accent rule; the line list and the key go into the map's empty corners (`place`); the height the map
# leaves over becomes a band under it with a magnifier of the centre (env ZOOM); credits in the footer
LF2 = LF * float(os.environ.get('POSTER_TEXT', 1.4)); pcolw = max(tw(ltxt[n], FR, LF2) for n in names) + LF2 * 5; prowh = LF2 * 1.75  # poster text is larger than the page's
HT, FT, MX = LF2 * 6.5, LF2 * 3.5, FS * 3; RATIO = float(os.environ.get('POSTER_RATIO', 841 / 594)); BG_ = FS * 3
def wrap(t, width, f, size):
    out = ['']
    for w_ in t.split():
        if out[-1] and tw(out[-1] + ' ' + w_, f, size) > width: out.append(w_)
        else: out[-1] = (out[-1] + ' ' + w_).strip()
    return out
sideb = [c['box'] for c in cuts if c['cfg'].get('at') == 'side' and 'box' in c] if RATIO < 1 else []
if sideb: pg = [g for g in geoms if not any(b.buffer(FS).contains(g) for b in sideb)]; gb = tuple(f(g.bounds[i] for g in pg) for i, f in enumerate((min, min, max, max)))
minx, miny, maxx, maxy = gb; vx, vy, vw, vh = minx - M, miny - M, maxx - minx + 2 * M, maxy - miny + 2 * M
placed = []; ptree = STRtree(geoms)
def place(w, h, at):  # free w x h spot inside the map's bounds, nearest to corner `at` (tl/tr/bl/br), or None
    step = FS * 2; gap = FS * 2
    xs = [minx + i * step for i in range(int((maxx - minx - w) / step) + 1)]; ys = [miny + i * step for i in range(int((maxy - miny - h) / step) + 1)]
    d = lambda x, y: abs(x - (minx if 'l' in at else maxx - w)) + abs(y - (miny if 't' in at else maxy - h))
    for x, y in sorted(((x, y) for x in xs for y in ys), key=lambda q: d(*q)):
        b_ = box(x - gap, y - gap, x + w + gap, y + h + gap)
        if not any(geoms[i].intersects(b_) for i in ptree.query(b_)) and not any(o.intersects(b_) for o in placed):
            placed.append(box(x, y, x + w, y + h)); return x, y
# line list panel and key: drawn at the origin, then moved into a free corner of the map, or (no room, e.g. buses
# with their insets in the corners) stacked in a column at the left of the band under the map
def legend(nc):
    nr = math.ceil(len(names) / nc); w, h = nc * pcolw + LF2, LF2 * 3.9 + nr * prowh
    out = [f'<rect width="{w:.1f}" height="{h:.1f}" rx="{FS:.1f}" fill="#f3f4f6" stroke="#d5d9e0" stroke-width="{FS*0.15:.2f}"/>'
           f'<text x="{LF2:.1f}" y="{LF2*2.1:.1f}" font-size="{LF2*1.3:.1f}" font-weight="800" fill="#16181d">Linie</text>']
    for i, n in enumerate(names):
        cx = LF2 + (i // nr) * pcolw; cy = LF2 * 3.4 + (i % nr) * prowh
        out.append(chip(cx, cy, LF2 * 3.2, n, h=LF2 * 1.35, fs=LF2 * 0.95))
        out.append(f'<text x="{cx+LF2*3.9:.1f}" y="{cy+LF2*1.0:.1f}" font-size="{LF2:.1f}" fill="#16181d">{esc(ltxt[n])}</text>')
    return w, h, out
mv = lambda q, els: [f'<g transform="translate({q[0]:.1f},{q[1]:.1f})">'] + els + ['</g>']
LA = os.environ.get('LEGEND_AT', 'tr')  # 'band': straight to the band / side column, even if a corner is free
pw_, ph_, Pl = legend(ncol); lp = None if LA == 'band' else place(pw_, ph_, LA); band = []
if lp: Pl = mv(lp, Pl)
else: pw_, ph_, Pl = legend(int(os.environ.get('BAND_COLS', 2))); band.append((ph_, Pl)); Pl = []
# key + notes block
ZOOM = json.loads(os.environ.get('ZOOM', 'null'))
zc = [s_['poly'].centroid for s_ in stations if ZOOM and s_['name'] in ZOOM['stations']]
SB = (min(q.x for q in zc) - FS * 5, min(q.y for q in zc) - FS * 5, max(q.x for q in zc) + FS * 5, max(q.y for q in zc) + FS * 5) if zc else None
KEY = [(lambda x, y: f'<circle cx="{x+LF2:.1f}" cy="{y:.1f}" r="{LF2*0.45:.1f}" fill="#fff" stroke="#16181d" stroke-width="{LW*0.42:.2f}"/>', 'przystanek'),
       (lambda x, y: f'<rect x="{x:.1f}" y="{y-LF2*0.6:.1f}" width="{LF2*2:.1f}" height="{LF2*1.2:.1f}" rx="{LF2*0.4:.1f}" fill="#fff" stroke="#16181d" stroke-width="{LW*0.42:.2f}"/>', 'węzeł przesiadkowy'),
       (lambda x, y: f'<rect x="{x:.1f}" y="{y-LF2*0.6:.1f}" width="{LF2*2:.1f}" height="{LF2*1.2:.1f}" rx="{LF2*0.3:.1f}" fill="#16181d"/><text x="{x+LF2:.1f}" y="{y:.1f}" font-size="{LF2*0.8:.1f}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#fff">12</text>', 'krańcówka linii'),
       (lambda x, y: f'<text x="{x+LF2:.1f}" y="{y+LF2*0.35:.1f}" font-size="{LF2*0.9:.1f}" font-weight="700" text-anchor="middle" fill="#16181d">4 8</text>', 'numery linii przy wiązce')]
if cuts: KEY.append((lambda x, y: f'<line x1="{x:.1f}" x2="{x+LF2*2:.1f}" y1="{y:.1f}" y2="{y:.1f}" stroke="#16181d" stroke-width="{LW:.2f}" stroke-linecap="round" stroke-dasharray="{LW*0.1:.2f} {LW*1.6:.2f}"/>', 'ciąg dalszy linii w ramce'))
if SB: KEY.append((lambda x, y: f'<rect x="{x:.1f}" y="{y-LF2*0.6:.1f}" width="{LF2*2:.1f}" height="{LF2*1.2:.1f}" rx="{FS*0.4:.1f}" fill="none" stroke="#c8102e" stroke-width="{FS*0.25:.2f}" stroke-dasharray="{FS*0.8:.1f} {FS*0.5:.1f}"/>', 'obszar powiększenia (pod schematem)'))
NOTES = ['Schemat pokazuje główne warianty tras w dzień roboczy: warianty obsługiwane przez co najmniej 25% kursów linii '
         'w danym kierunku. Linie z mniej niż 6 kursami pominięto. Odległości nie są w skali.',
         'Układ oktylinearny policzony automatycznie z rozkładu GTFS ZDiT Łódź programem LOOM (Uniwersytet we Fryburgu); '
         'etykiety, kolory i oprawa: GISBoost.',
         'Wersja interaktywna z wyróżnianiem linii i listą zmian rozkładu: gisboost.github.io/mapy-analizy/schemat-linii-lodz']
kw = pw_; kr = (len(KEY) + 1) // 2
nl = [wrap(t, kw - LF2 * 2, FR, LF2 * 0.95) for t in NOTES]
kh = LF2 * 3.2 + kr * LF2 * 2.2 + LF2 * 1.2 + sum(len(l) * LF2 * 1.35 + LF2 * 0.8 for l in nl)
Pk = []; y = LF2 * 2.1
Pk.append(f'<text x="{LF2:.1f}" y="{y:.1f}" font-size="{LF2*1.3:.1f}" font-weight="800" fill="#16181d">Jak czytać schemat</text>')
for i, (sym, t) in enumerate(KEY):
    x_ = LF2 + (i % 2) * (kw - LF2) / 2; y_ = y + LF2 * 2.2 * (1 + i // 2)
    Pk.append(sym(x_, y_) + f'<text x="{x_+LF2*2.8:.1f}" y="{y_+LF2*0.35:.1f}" font-size="{LF2*0.95:.1f}" fill="#16181d">{esc(t)}</text>')
y += LF2 * 2.2 * kr + LF2 * 1.2
for l in nl:
    for ln in l: y += LF2 * 1.35; Pk.append(f'<text x="{LF2:.1f}" y="{y:.1f}" font-size="{LF2*0.95:.1f}" fill="#5b6270">{esc(ln)}</text>')
    y += LF2 * 0.8
kp = None if band else place(kw, kh, os.environ.get('KEY_AT', 'tl'))
if kp: Pk = mv(kp, Pk)
else: band.append((kh, Pk)); Pk = []
# sheet: width of the drawing, height from RATIO; what the map does not fill becomes the magnifier band
PW = vw + 2 * MX; BH = PW * RATIO - (vh + HT + FT); SIDE = RATIO < 1 and bool(band)
if SIDE:  # landscape sheet: the band is a column right of the map (legend, key, magnifier), the map centred in height
    PW = max(vw + 2 * MX + pw_ + BG_, (vh + HT + FT) / RATIO); BH = 0
    PH = PW * RATIO; X0, Y0 = vx - MX, vy - HT - (PH - vh - HT - FT) / 2
elif BH < LF2 * 20 or not (SB or band): BH = 0; PW = max(PW, (vh + HT + FT) / RATIO)  # no band: pad the sides
if not SIDE: PH = PW * RATIO; X0, Y0 = vx - (PW - vw) / 2, vy - HT
xl, xr = X0 + MX + FS * 2, X0 + PW - MX - FS * 2
P = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{X0:.1f} {Y0:.1f} {PW:.1f} {PH:.1f}" width="{PW:.0f}" height="{PH:.0f}" font-family="{FONT}">',
     E[1], f'<rect class="bg" x="{X0:.1f}" y="{Y0:.1f}" width="{PW:.1f}" height="{PH:.1f}" fill="#fff"/>', f'<g id="{PFX}main">'] + E[3:body] + ['</g>']
t1, _, t2 = TITLE.partition(' — '); by = Y0 + LF2 * 4
P.append(f'<g class="poster"><circle cx="{xl+LF2*1.1:.1f}" cy="{by-LF2*1.05:.1f}" r="{LF2*0.95:.1f}" fill="#fff" stroke="#c8102e" stroke-width="{LF2*0.5:.1f}"/>'
         f'<text x="{xl+LF2*3:.1f}" y="{by:.1f}" font-size="{LF2*3:.1f}" font-weight="800" fill="#16181d">{esc(t1)}'
         f'<tspan dx="{LF2*0.9:.1f}" font-size="{LF2*1.9:.1f}" font-weight="600">{esc(t2)}</tspan></text>'
         f'<text x="{xr:.1f}" y="{by:.1f}" font-size="{LF2*0.95:.1f}" text-anchor="end" fill="#5b6270">{esc(SUB)}</text>'
         f'<line x1="{xl:.1f}" x2="{xr:.1f}" y1="{Y0+HT-LF2*1.2:.1f}" y2="{Y0+HT-LF2*1.2:.1f}" stroke="#c8102e" stroke-width="{LF2*0.3:.1f}"/>')
P += Pl + Pk
zh = LF2 * 2.6
if SIDE:  # column: legend and key from the top, the magnifier under them (at most ZOOM_H x its width tall)
    cx0 = xr - pw_; by_ = Y0 + HT
    for h_, els in band: P += mv((cx0, by_), els); by_ += h_ + BG_
    yb = Y0 + PH - FT - BG_ / 2  # side insets from the column's bottom up: a white patch over the original, a clipped copy
    for b in sideb:
        x0_, y0_, x1_, y1_ = b.bounds; tx, ty = xr - (x1_ - x0_), yb - (y1_ - y0_); yb = ty - BG_
        P.insert(P.index(f'<g id="{PFX}main">') + body - 1, f'<rect x="{x0_-FS:.1f}" y="{y0_-FS:.1f}" width="{x1_-x0_+2*FS:.1f}" height="{y1_-y0_+2*FS:.1f}" fill="#fff"/>')
        P.append(f'<clipPath id="{PFX}sc{len(P)}"><rect x="{x0_:.1f}" y="{y0_:.1f}" width="{x1_-x0_:.1f}" height="{y1_-y0_:.1f}"/></clipPath>'
                 f'<g transform="translate({tx-x0_:.1f},{ty-y0_:.1f})"><g clip-path="url(#{PFX}sc{len(P)})"><use href="#{PFX}main"/></g></g>')
    zx, zy, zw = cx0, by_, pw_; zhh = min(yb - zy - zh, zw * float(os.environ.get('ZOOM_H', 1.0)))
    if zhh < LF2 * 10: print('poster: no room for the magnifier in the column'); SB = None
if BH:  # magnifier across the band, region centred on the named stations, never cropping them
    zx, zy = xl, vy + vh + BG_ / 2; zhh = BH - BG_ - zh
    by_ = zy
    for h_, els in band: P += mv((xl, by_), els); by_ += h_ + BG_
    if by_ - BG_ > zy + BH - BG_: print('poster: band column taller than the band by', f'{by_ - BG_ - zy - BH + BG_:.0f}')
    if band: zx += pw_ + BG_
    zw = xr - zx
if (BH or SIDE) and SB:
    k = min(ZOOM.get('k', 2.5), zw / (SB[2] - SB[0]), zhh / (SB[3] - SB[1])); cx_, cy_ = (SB[0] + SB[2]) / 2, (SB[1] + SB[3]) / 2
    R = (cx_ - zw / k / 2, cy_ - zhh / k / 2, cx_ + zw / k / 2, cy_ + zhh / k / 2)
    P.insert(P.index(f'<g id="{PFX}main">'), f'<rect x="{R[0]:.1f}" y="{R[1]:.1f}" width="{R[2]-R[0]:.1f}" height="{R[3]-R[1]:.1f}" rx="{FS*0.6:.1f}" fill="none" stroke="#c8102e" stroke-width="{FS*0.3:.2f}" stroke-dasharray="{FS*0.8:.1f} {FS*0.5:.1f}"/>')
    P.append(f'<clipPath id="{PFX}zc"><rect x="{zx:.1f}" y="{zy+zh:.1f}" width="{zw:.1f}" height="{zhh:.1f}"/></clipPath>'
             f'<rect x="{zx:.1f}" y="{zy:.1f}" width="{zw:.1f}" height="{zhh+zh:.1f}" rx="{FS:.1f}" fill="#fff" stroke="#c8102e" stroke-width="{FS*0.25:.2f}"/>'
             f'<text x="{zx+FS*1.2:.1f}" y="{zy+zh*0.7:.1f}" font-size="{LF2*1.3:.1f}" font-weight="800" fill="#16181d">{esc(ZOOM.get("title", "Centrum"))}'
             f'<tspan font-weight="500" fill="#5b6270"> · powiększenie ×{f"{k:.1f}".replace(".", ",")} · obszar w czerwonej ramce na schemacie</tspan></text>'
             f'<g clip-path="url(#{PFX}zc)"><use href="#{PFX}main" transform="translate({zx - R[0]*k:.1f},{zy + zh - R[1]*k:.1f}) scale({k:.3f})"/>'
             + ''.join(f'<rect x="{zx+(q[0]-R[0])*k-FS:.1f}" y="{zy+zh+(q[1]-R[1])*k-FS:.1f}" width="{(q[2]-q[0])*k+2*FS:.1f}" height="{(q[3]-q[1])*k+2*FS:.1f}" fill="#fff"/>'
                       for q in [c['box'].bounds for c in cuts if 'box' in c]) + '</g>')  # insets don't belong in the magnifier
    print('zoom', f'x{k:.2f}', 'box', f'{zw:.0f}x{zhh:.0f}')
fy = Y0 + PH - FT + LF2 * 0.6; ky = fy + LF2 * 1.8
P.append(f'<line x1="{xl:.1f}" x2="{xr:.1f}" y1="{fy:.1f}" y2="{fy:.1f}" stroke="#d5d9e0" stroke-width="{FS*0.15:.2f}"/>'
         f'<text x="{xr:.1f}" y="{ky+LF2*0.35:.1f}" font-size="{LF2*0.95:.1f}" text-anchor="end" fill="#5b6270">dane: GTFS ZDiT Łódź · układ: LOOM (Uniwersytet we Fryburgu) · '
         f'opracowanie: GISBoost · <tspan font-weight="700" fill="#16181d">gisboost.github.io/mapy-analizy/schemat-linii-lodz</tspan></text></g></svg>')
open(OUT.replace('.svg', '.poster.svg'), 'w', encoding='utf-8').write('\n'.join(P))
json.dump([dict(n=n, c=col[n], t=txtcol(col[n]), a=clean(info[n]['from']), b=clean(info[n]['to']), k=info[n]['trips']) for n in names],
          open(OUT.replace('.svg', '.lines.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('wrote', OUT, f'{vw:.0f}x{vh:.0f}')
