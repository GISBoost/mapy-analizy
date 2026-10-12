# geo_export.py <3_geo.json> <lines.json (meta)> <tram.lines.json (render output: colours)> <out geo.json>
# Geographic variant for the page: edges (shape geometry from GTFS, lines in loom's bundle order) and stops with the lines that stop there.
import json, math, sys
from shapely.geometry import LineString
geo, meta, cols, out = sys.argv[1:5]
feats = json.load(open(geo, encoding='utf-8'))['features']; meta = json.load(open(meta, encoding='utf-8'))
nodes = {f['properties']['id']: f for f in feats if f['geometry']['type'] == 'Point'}
edges = []
for f in feats:
    if f['geometry']['type'] != 'LineString': continue
    g = LineString(f['geometry']['coordinates']).simplify(0.00002)
    edges.append(dict(p=[[round(x, 5), round(y, 5)] for x, y in g.coords], l=[l['label'] for l in f['properties']['lines']]))
ends = [(n, nm, lon, lat) for n, v in meta.items() for nm, lon, lat in v['ends']]
stops = []
for f in nodes.values():
    p = f['properties']
    if not p.get('station_label'): continue
    sn = p.get('stop_names') or {p['station_label']: []}
    name = ' / '.join(sorted(sn, key=lambda k: -len(sn[k])))
    lon, lat = f['geometry']['coordinates']
    lines = sorted({l for v in sn.values() for l in v})
    term = sorted({n for n, nm, a, b in ends if math.hypot((a - lon) * 71000, (b - lat) * 111000) < 250 and (n in lines or not lines)})
    stops.append(dict(ll=[round(lon, 5), round(lat, 5)], n=name, l=lines, t=term))
json.dump(dict(lines={m['n']: m['c'] for m in json.load(open(cols, encoding='utf-8'))}, edges=edges, stops=stops), open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('geo.json: edges', len(edges), 'stops', len(stops), 'terminus marks', sum(len(s['t']) for s in stops))
