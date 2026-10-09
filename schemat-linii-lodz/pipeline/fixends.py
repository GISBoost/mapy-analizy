# fixends.py topo.json meta.json  -- re-attach line ends that `topo` lost (edits topo.json in place)
# topo sometimes drops a line from the last edges before its terminus (seen at turnaround loops,
# e.g. 59/86 at Pomorska-Edwarda), so the line ends ~1 km early. For every timetable terminus
# farther than MIN m from the line's own nodes, add the line along the shortest graph path from
# its nearest dead end to the station closest to the terminus (if that path is < MAX m).
import json, sys, math, heapq
MIN, MAX = 120, 3000  # MIN below topo -d 150; Fabryczna's 61 lost its last 230 m
TOPO, META = sys.argv[1], sys.argv[2]
g = json.load(open(TOPO, encoding='utf-8')); info = json.load(open(META, encoding='utf-8'))
k = math.cos(math.radians(51.76)) * 111320
dist = lambda a, b: math.hypot((a[0] - b[0]) * k, (a[1] - b[1]) * 111320)
pos = {f['properties']['id']: f['geometry']['coordinates'] for f in g['features'] if f['geometry']['type'] == 'Point'}
stn = {f['properties']['id'] for f in g['features'] if f['geometry']['type'] == 'Point' and f['properties'].get('station_id')}
edges = [f for f in g['features'] if f['geometry']['type'] == 'LineString']
adj = {}
for e in edges:
    p = e['properties']; c = e['geometry']['coordinates']; w = sum(dist(a, b) for a, b in zip(c, c[1:]))
    adj.setdefault(p['from'], []).append((p['to'], w, e)); adj.setdefault(p['to'], []).append((p['from'], w, e))
fixed = 0
for n, v in info.items():
    mine = [e for e in edges if any(l['label'] == n for l in e['properties']['lines'])]
    if not mine: continue
    deg = {}
    for e in mine:
        for x in (e['properties']['from'], e['properties']['to']): deg[x] = deg.get(x, 0) + 1
    for nm, lo, la in v.get('ends', []):
        if min(dist(pos[x], (lo, la)) for x in deg) < MIN: continue
        tgt = min(stn, key=lambda x: dist(pos[x], (lo, la)))
        best = None
        for s in (x for x, d in deg.items() if d == 1):  # Dijkstra from each dead end of the line
            D = {s: (0, None, None)}; q = [(0, s)]
            while q:
                d, u = heapq.heappop(q)
                if u == tgt or d > MAX: break
                if d > D[u][0]: continue
                for w_, l_, e in adj.get(u, []):
                    if w_ not in D or d + l_ < D[w_][0]: D[w_] = (d + l_, u, e); heapq.heappush(q, (d + l_, w_))
            if tgt in D and D[tgt][0] <= MAX and (best is None or D[tgt][0] < best[0]):
                path = []; u = tgt
                while D[u][1] is not None: path.append(D[u][2]); u = D[u][1]
                best = (D[tgt][0], path)
        if not best: print(f'fixends: {n} {nm}: no path', file=sys.stderr); continue
        ref = next(l for l in mine[0]['properties']['lines'] if l['label'] == n)
        for e in best[1]:
            if not any(l['label'] == n for l in e['properties']['lines']):
                e['properties']['lines'].append({x: ref[x] for x in ('color', 'id', 'label')})
        fixed += 1; print(f'fixends: {n} -> {nm}: +{len(best[1])} edges, {best[0]:.0f} m', file=sys.stderr)
json.dump(g, open(TOPO, 'w', encoding='utf-8'), ensure_ascii=False)
print(f'fixends: {fixed} ends re-attached', file=sys.stderr)
