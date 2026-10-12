"""prep.py DATA_DIR  -- after filtruj_gtfs.py: finish what render.py expects.

* routes.txt: route_color = idx*16 per line (placeholder id that render.py maps back to a line; the real palette is chosen in render.py)
* lines.json: 'pairs' = adjacent stop-name pairs of every drawn pattern (lines sharing a pair get distant colours)
"""
import csv, json, sys
D = sys.argv[1]
rd = lambda f: list(csv.DictReader(open(f'{D}/{f}', encoding='utf-8-sig')))
meta = json.load(open(f'{D}/lines.json', encoding='utf-8'))
routes = rd('routes.txt'); rn = {r['route_id']: r['route_short_name'] for r in routes}
for r in routes:
    r['route_color'] = '%06X' % (meta[r['route_short_name']]['idx'] * 16); r['route_text_color'] = 'FFFFFF'
with open(f'{D}/routes.txt', 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, list(routes[0])); w.writeheader(); w.writerows(routes)
sn = {s['stop_id']: s['stop_name'] for s in rd('stops.txt')}; line = {t['trip_id']: rn[t['route_id']] for t in rd('trips.txt')}
seq = {}
for x in rd('stop_times.txt'): seq.setdefault(x['trip_id'], []).append((int(x['stop_sequence']), x['stop_id']))
pairs = {n: set() for n in meta}
for t, v in seq.items():
    ids = [i for _, i in sorted(v)]
    pairs[line[t]] |= {tuple(sorted((sn[a], sn[b]))) for a, b in zip(ids, ids[1:])}
for n in meta: meta[n]['pairs'] = sorted(pairs[n])
json.dump(meta, open(f'{D}/lines.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('prep:', len(meta), 'lines,', sum(len(p) for p in pairs.values()), 'pairs')
