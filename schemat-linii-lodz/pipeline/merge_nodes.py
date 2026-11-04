"""merge_nodes.py in.json out.json 'keep label' 'drop label' : contract the (single) edge between two station nodes into one node (hub).

With the same label twice ('X' 'X') the two nodes of that name joined by an edge are merged (twin stops of one place);
with '-' as the second label the unlabelled junction node next to the first one is absorbed."""
import json, sys
g = json.load(open(sys.argv[1], encoding='utf-8')); keep_l, drop_l = sys.argv[3], sys.argv[4]
F = g['features']
nd = {f['properties']['id']: f for f in F if f['geometry']['type'] == 'Point'}
lab = lambda i: nd[i]['properties'].get('station_label')
if keep_l == drop_l:
    keep, drop = next((p['from'], p['to']) for p in (f['properties'] for f in F if f['geometry']['type'] == 'LineString') if lab(p['from']) == lab(p['to']) == keep_l)
else:
    keep = next(i for i in nd if lab(i) == keep_l)
    if drop_l == '-':  # the unlabelled junction node next to `keep`
        drop = next(q for p in (f['properties'] for f in F if f['geometry']['type'] == 'LineString') for q in ((p['to'],) if p['from'] == keep else (p['from'],) if p['to'] == keep else ()) if not lab(q))
    else: drop = next(i for i in nd if lab(i) == drop_l)
ck, cd = nd[keep]['geometry']['coordinates'], nd[drop]['geometry']['coordinates']
mid = [(ck[0] + cd[0]) / 2, (ck[1] + cd[1]) / 2]
out = []
for f in F:
    if f['geometry']['type'] == 'Point':
        if f['properties']['id'] == drop: continue
        if f['properties']['id'] == keep:
            f['geometry']['coordinates'] = mid; f['properties'].pop('not_serving', None)
        out.append(f)
    else:
        p = f['properties']; ends = {p['from'], p['to']}
        if ends == {keep, drop}: continue
        cs = f['geometry']['coordinates']
        if p['from'] in (keep, drop): p['from'] = keep; cs[0] = mid
        if p['to'] in (keep, drop): p['to'] = keep; cs[-1] = mid
        out.append(f)
# clean-up after the contraction: self-loops go, parallel edges with the same lines become one, unlabelled dead ends go
def clean(out):
    while True:
        seen, keep_, changed = {}, [], False
        for f in out:
            if f['geometry']['type'] != 'LineString': keep_.append(f); continue
            p = f['properties']
            if p['from'] == p['to']: changed = True; continue
            k = (frozenset((p['from'], p['to'])), frozenset(l['id'] for l in p['lines']))
            if k in seen: changed = True; continue
            seen[k] = 1; keep_.append(f)
        d = {}
        for f in keep_:
            if f['geometry']['type'] == 'LineString':
                for e in (f['properties']['from'], f['properties']['to']): d[e] = d.get(e, 0) + 1
        dead = {f['properties']['id'] for f in keep_ if f['geometry']['type'] == 'Point' and not f['properties'].get('station_label') and d.get(f['properties']['id'], 0) <= 1}
        if dead:
            changed = True
            keep_ = [f for f in keep_ if not (f['geometry']['type'] == 'Point' and f['properties']['id'] in dead) and not (f['geometry']['type'] == 'LineString' and ({f['properties']['from'], f['properties']['to']} & dead))]
        out = keep_
        if not changed: return out
out = clean(out)
deg = {}
for f in out:
    if f['geometry']['type'] == 'LineString':
        for e in (f['properties']['from'], f['properties']['to']): deg[e] = deg.get(e, 0) + 1
for f in out:
    if f['geometry']['type'] == 'Point':
        d = str(deg.get(f['properties']['id'], 0)); f['properties'].update(deg=d, deg_in=d, deg_out=d)
json.dump({'type': 'FeatureCollection', 'features': out}, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
print('merged', drop_l, 'into', keep_l, 'deg', deg[keep])
