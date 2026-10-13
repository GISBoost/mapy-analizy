# geo_export.py <m>.geo.json <meta.json> <colors.json> <out mapy/<m><SUF>_geo.json>
# Geographic view for the page: edges (true geometry from loom.json, lines in loom's bundle order) and stops with the lines
# that stop there (serving.py on a copy of loom.json: <m>.geo.json). Stop names and termini follow render.py, so the map
# says what the diagram says: the merged stop name more lines stop at, LABELS (env) for hand-named merges, termini from
# the timetable (meta 'ends') on the nearest node of the line within 700 m, own name first. Copied from schemat-linii-gzm.
import json, math, os, re, sys
from shapely.geometry import LineString
geo, meta, cols, out = sys.argv[1:5]
feats = json.load(open(geo, encoding='utf-8'))['features']; meta = json.load(open(meta, encoding='utf-8'))
cols = json.load(open(cols, encoding='utf-8'))
LABELS = json.loads(os.environ.get('LABELS', '{}'))
def clean(s):  # as render.py: OLECHÓW -> Olechów
    s = re.sub(r'\s+', ' ', re.sub(r'\s*-\s*', '-', s.strip()))
    return s.title() if s.isupper() and len(s) > 4 else s
nodes = {f['properties']['id']: f for f in feats if f['geometry']['type'] == 'Point'}
edges, at = [], {}  # at: node id -> {line label: edges count}
for f in feats:
    if f['geometry']['type'] != 'LineString': continue
    p = f['properties']; ls = [l['label'] for l in p['lines']]
    for n in (p['from'], p['to']):
        for l in ls: at.setdefault(n, {})[l] = at.setdefault(n, {}).get(l, 0) + 1
    g = LineString(f['geometry']['coordinates']).simplify(0.00002)
    edges.append(dict(p=[[round(x, 5), round(y, 5)] for x, y in g.coords], l=ls))
missing = sorted({l for e in edges for l in e['l']} - set(cols)); assert not missing, f'no colour for {missing}'
# termini: per line end, the nearest station node carrying the line, its own name first (render.py, GEO branch)
term, tnames = {}, {}
for ln, v in meta.items():
    for nm, lo, la in v['ends']:
        cand = [(f['properties'].get('station_label') != nm, math.hypot((f['geometry']['coordinates'][0] - lo) * 69000, (f['geometry']['coordinates'][1] - la) * 111000), i)
                for i, f in nodes.items() if f['properties'].get('station_id') and ln in at.get(i, {})]
        cand = [c for c in cand if c[1] < 700]
        if not cand: print('terminus not placed:', ln, nm); continue
        i = min(cand)[2]; term.setdefault(i, set()).add(ln); tnames.setdefault(i, []).append(clean(nm))
W_ = lambda v: set(re.split(r'[\s-]+', v.lower()))
stops = []
for i, f in nodes.items():
    p = f['properties']
    if not p.get('station_label'): continue
    sn = {clean(k): set(v) for k, v in (p.get('stop_names') or {}).items()}
    serve = set(at.get(i, {})) - set(p.get('not_serving', []))
    nm = clean(p['station_label'])
    if sn:
        b = max(sn, key=lambda k: len(sn[k]))
        if sn[b] > sn.get(nm, set()): nm = b
    if i in tnames and nm not in tnames[i]:
        t = max(set(tnames[i]), key=tnames[i].count)  # a terminus merged into a through stop of another street keeps both names
        nm = f'{nm} / {t}' if sn and serve - sn.get(t, set()) and not (W_(nm) <= W_(t) or W_(t) <= W_(nm)) else t
    nm = LABELS.get(nm, nm)
    lines = sorted({l for v in sn.values() for l in v} if sn else serve)
    lon, lat = f['geometry']['coordinates']
    stops.append(dict(ll=[round(lon, 5), round(lat, 5)], n=nm, l=lines, t=sorted(term.get(i, ())), sid=p.get('station_id')))
json.dump(dict(lines=cols, edges=edges, stops=stops), open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('geo.json: edges', len(edges), 'stops', len(stops), 'terminus marks', sum(len(s['t']) for s in stops))
