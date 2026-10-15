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

# a goal with "len" stretches its edges towards that length (A-B is 1.1 km in the input)
dist = lambda a, b: math.hypot((P[a][0] - P[b][0]) * O.C * O.K, (P[a][1] - P[b][1]) * O.K)
before = dist('A', 'B')
json.dump([{'axis': 'V', 'path': ['B', 'C']}, {'len': 2500, 'path': ['A', 'B']}], open(goals, 'w'))
O.run(O.args([inp, out, '--goals', goals, '--minlen', '10']))
P = {f['properties']['id']: f['geometry']['coordinates'] for f in json.load(open(out))['features'] if f['geometry']['type'] == 'Point'}
assert dist('A', 'B') > before * 1.5, 'len goal did not stretch A-B'

# --dump-dirs then --init --freeze-init reproduces the layout (this is how the published tram layout is kept)
dirs, out2 = os.path.join(tmp, 'dirs.json'), os.path.join(tmp, 'out2.json')
O.run(O.args([inp, out, '--goals', goals, '--minlen', '10', '--dump-dirs', dirs]))
O.run(O.args([inp, out2, '--goals', goals, '--minlen', '10', '--init', dirs, '--freeze-init']))
assert open(out).read() == open(out2).read(), 'dump + init did not reproduce the layout'
print('ok (len goal, dump/init)')

# merge_nodes.py: twin stops 'X' 'X' become one node; the loop through an unlabelled node and the parallel edges it leaves behind go
import subprocess, sys
def feat(i, lab, c): return {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': c}, 'properties': {'id': i, 'station_label': lab} if lab else {'id': i}}
def edge(u, v, cu, cv): return {'type': 'Feature', 'geometry': {'type': 'LineString', 'coordinates': [cu, cv]}, 'properties': {'from': u, 'to': v, 'lines': [{'id': '1', 'label': '1', 'color': 'f00'}]}}
c = {'A': [19.40, 51.70], 'X1': [19.41, 51.70], 'X2': [19.4101, 51.70], 'U': [19.4100, 51.701], 'D': [19.42, 51.70]}
tw = {'type': 'FeatureCollection', 'features': [feat('A', 'A', c['A']), feat('X1', 'X', c['X1']), feat('X2', 'X', c['X2']), feat('U', None, c['U']), feat('D', 'D', c['D'])] +
      [edge(u, v, c[u], c[v]) for u, v in (('A', 'X1'), ('X1', 'X2'), ('X2', 'D'), ('X1', 'U'), ('U', 'X2'))]}
src, dst = os.path.join(tmp, 'tw.json'), os.path.join(tmp, 'tw_out.json'); json.dump(tw, open(src, 'w'))
subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'merge_nodes.py'), src, dst, 'X', 'X'], check=True, capture_output=True)
res = json.load(open(dst))['features']
assert sum(f['geometry']['type'] == 'Point' for f in res) == 3 and sum(f['geometry']['type'] == 'LineString' for f in res) == 2, 'merge_nodes did not clean up'
print('ok (merge_nodes)')
