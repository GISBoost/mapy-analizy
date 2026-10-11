# serving.py octi.json loom.json <data dir> [R=400]  -- which lines stop at which drawn station, from the timetable
# (edits octi.json in place: not_serving per station node, which transitmap and render.py read).
# topo/loom lose this: hubsnap clears it around every 'Dw. Łódź' node (63/77 at Leszczowa-Dw. Łódź Pabianicka drew
# 50A/50B/68 as stopping, trams 4/9/19 at Fabryczna) and merged stops can mark passing lines as stopping (N3 at Śląska 28).
# Every stop of a line's drawn trips goes to a station node whose edges carry that line: the nearest one with the stop's
# own name, else the nearest one (topo merged the stop into it); positions are the true ones from loom.json. A line
# serves a node iff at least one of its stops landed there.
import csv, json, math, sys  # stdlib only: run.sh calls it with the WSL python3
OCTI, LOOM, D = sys.argv[1:4]; R = float(sys.argv[4]) if len(sys.argv) > 4 else 400
rd = lambda f: list(csv.DictReader(open(f'{D}/{f}.txt', encoding='utf-8-sig')))
rn = {r['route_id']: r['route_short_name'] for r in rd('routes')}; tr = {t['trip_id']: rn[t['route_id']] for t in rd('trips')}
sp = {s['stop_id']: (s['stop_name'], float(s['stop_lon']), float(s['stop_lat'])) for s in rd('stops')}
stops = {}
for x in rd('stop_times'): stops.setdefault(tr[x['trip_id']], set()).add(sp[x['stop_id']])
k = math.cos(math.radians(51.76))
dist = lambda a, b: math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111320
geo = {f['properties']['station_id']: f['geometry']['coordinates'] for f in json.load(open(LOOM, encoding='utf-8'))['features']
       if f['geometry']['type'] == 'Point' and f['properties'].get('station_id')}
g = json.load(open(OCTI, encoding='utf-8')); F = g['features']
nodes = {f['properties']['id']: f for f in F if f['geometry']['type'] == 'Point' and f['properties'].get('station_id') in geo}
on = {}  # node -> {label: line id}
for f in F:
    if f['geometry']['type'] == 'LineString':
        p = f['properties']
        for e in (p['from'], p['to']):
            if e in nodes: on.setdefault(e, {}).update({l['label']: l['id'] for l in p['lines']})
serve = {n: set() for n in nodes}; far = []; names = {n: {} for n in nodes}
for L, ps in stops.items():
    cand = [n for n in nodes if L in on.get(n, {})]
    for nm, *q in ps:
        if not cand: break
        dd = [(dist(geo[nodes[n]['properties']['station_id']], q), n) for n in cand]
        d, n = min([x for x in dd if nodes[x[1]]['properties']['station_label'] == nm and x[0] <= R] or dd)
        if d <= R: serve[n].add(L); names[n].setdefault(nm, set()).add(L)
        else: far.append((L, nm, round(d)))
deg = {}  # a line on one edge of a node ends there: its terminus, even when topo/fixends moved it from the stop (1 at Mochnackiego)
for f in F:
    if f['geometry']['type'] == 'LineString':
        for e in (f['properties']['from'], f['properties']['to']):
            for l in f['properties']['lines']: deg[e, l['label']] = deg.get((e, l['label']), 0) + 1
for n in nodes: serve[n] |= {L for L in on.get(n, {}) if deg.get((n, L)) == 1}
chg = 0
for n, f in nodes.items():
    p = f['properties']; old = set(p.get('not_serving', []))
    new = {i for L, i in on.get(n, {}).items() if L not in serve[n]}
    if new != old:
        chg += 1; lab = {i: L for L, i in on.get(n, {}).items()}
        print(f"{p['station_label']}: +stop {sorted(lab[i] for i in old - new if i in lab)} -stop {sorted(lab[i] for i in new - old)}", file=sys.stderr)
    p['stop_names'] = {k: sorted(v) for k, v in names[n].items()}  # render.py names merged stops after them
    if new: p['not_serving'] = sorted(new)
    else: p.pop('not_serving', None)
json.dump(g, open(OCTI, 'w', encoding='utf-8'), ensure_ascii=False)
print(f'serving: {chg} stations changed; stops farther than {R:.0f} m from any station of their line: {far[:10]}', file=sys.stderr)
