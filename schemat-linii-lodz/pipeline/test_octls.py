"""test_octls.py - self-check for octls.py on a toy graph: py test_octls.py (needs numpy only)."""
import json, math, os, tempfile
import octls as O

# L-shaped line A-B-C-D, B and C slightly off-axis; goal forces B-C vertical
pts = {'A': (19.40, 51.70), 'B': (19.41, 51.701), 'C': (19.4105, 51.71), 'D': (19.42, 51.711)}
feats = [{'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': list(c)},
          'properties': {'id': n, 'station_label': n}} for n, c in pts.items()]
for u, v in ('AB', 'BC', 'CD'):
    feats.append({'type': 'Feature', 'geometry': {'type': 'LineString', 'coordinates': [list(pts[u]), list(pts[v])]},
                  'properties': {'from': u, 'to': v, 'lines': [{'label': '1', 'id': '1', 'color': 'ff0000'}]}})
tmp = tempfile.mkdtemp()
inp, out, goals = (os.path.join(tmp, f) for f in ('in.json', 'out.json', 'goals.json'))
json.dump({'type': 'FeatureCollection', 'features': feats}, open(inp, 'w'))
json.dump([{'axis': 'V', 'path': ['B', 'C']}], open(goals, 'w'))
r = O.run(O.args([inp, out, '--goals', goals, '--minlen', '10']))
g = json.load(open(out))
P = {f['properties']['id']: f['geometry']['coordinates'] for f in g['features'] if f['geometry']['type'] == 'Point'}
for f in g['features']:
    if f['geometry']['type'] != 'LineString': continue
    c = f['geometry']['coordinates']
    for a, b in zip(c[:-1], c[1:]):
        dx, dy = (b[0] - a[0]) * O.C * O.K, (b[1] - a[1]) * O.K
        ang = math.degrees(math.atan2(dx, dy)) % 45
        assert min(ang, 45 - ang) < 0.5 or math.hypot(dx, dy) < 1, 'segment not octilinear'
assert abs(P['B'][0] - P['C'][0]) * O.C * O.K < 1, 'goal edge B-C is not vertical'
assert r['cross'] == 0
print('ok', r)
