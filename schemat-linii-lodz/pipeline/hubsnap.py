# hubsnap.py topo.json [R=300]  -- contract the street tangle around railway-station hubs (edits topo.json in place)
# Lines reach a big station on different streets in and out (terminal loops); topo keeps those as parallel
# edges and small cycles through helper nodes, which octi can only draw as knots. For every station node
# labelled 'Dw. Łódź ...', non-station nodes within R m are merged into it, self-loops are dropped and
# parallel edges merged (union of lines). Real stops inside R stay untouched.
import json, sys, math
TOPO = sys.argv[1]; R = float(sys.argv[2]) if len(sys.argv) > 2 else 300
g = json.load(open(TOPO, encoding='utf-8')); F = g['features']
k = math.cos(math.radians(51.76)) * 111320
dist = lambda a, b: math.hypot((a[0] - b[0]) * k, (a[1] - b[1]) * 111320)
nodes = {f['properties']['id']: f for f in F if f['geometry']['type'] == 'Point'}
edges = [f for f in F if f['geometry']['type'] == 'LineString']
to = {}
for h, f in nodes.items():
    if not str(f['properties'].get('station_label', '')).startswith('Dw. Łódź '): continue
    hp = f['geometry']['coordinates']
    for n, x in nodes.items():
        if n != h and n not in to and not x['properties'].get('station_id') and dist(x['geometry']['coordinates'], hp) <= R: to[n] = h
    f['properties'].pop('excluded_conn', None)
M = lambda n: to.get(n, n)
keep = {}
for e in edges:
    p = e['properties']; a, b = M(p['from']), M(p['to'])
    if a == b: continue
    c = e['geometry']['coordinates']; c[0], c[-1] = nodes[a]['geometry']['coordinates'], nodes[b]['geometry']['coordinates']
    p['from'], p['to'] = a, b
    key = frozenset((a, b))
    if key in keep:  # parallel edge: merge line sets
        q = keep[key]['properties']; have = {l['label'] for l in q['lines']}
        q['lines'] += [{x: l[x] for x in ('color', 'id', 'label')} for l in p['lines'] if l['label'] not in have]
        q['lines'] = [{x: l[x] for x in ('color', 'id', 'label')} for l in q['lines']]  # directions no longer meaningful
        q['dbg_lines'] = ','.join(l['label'] for l in q['lines'])
    else: keep[key] = e
for n in nodes.values():
    ex = n['properties'].get('excluded_conn')
    if ex: n['properties']['excluded_conn'] = [dict(c, node_from=M(c['node_from']), node_to=M(c['node_to'])) for c in ex if M(c['node_from']) != M(c['node_to'])]
g['features'] = [f for n, f in nodes.items() if n not in to] + list(keep.values())
json.dump(g, open(TOPO, 'w', encoding='utf-8'), ensure_ascii=False)
print(f'hubsnap: {len(to)} helper nodes merged into hubs, {len(edges) - len(keep)} edges dropped/merged', file=sys.stderr)
