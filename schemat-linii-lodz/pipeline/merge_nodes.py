"""merge_nodes.py in.json out.json 'keep label' 'drop label' : contract the (single) edge between two station nodes into one node (hub)."""
import json, sys
g = json.load(open(sys.argv[1], encoding='utf-8')); keep_l, drop_l = sys.argv[3], sys.argv[4]
F = g['features']
nd = {f['properties']['id']: f for f in F if f['geometry']['type'] == 'Point'}
keep = next(i for i, f in nd.items() if f['properties'].get('station_label') == keep_l)
drop = next(i for i, f in nd.items() if f['properties'].get('station_label') == drop_l)
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
deg = {}
for f in out:
    if f['geometry']['type'] == 'LineString':
        for e in (f['properties']['from'], f['properties']['to']): deg[e] = deg.get(e, 0) + 1
for f in out:
    if f['geometry']['type'] == 'Point':
        d = str(deg.get(f['properties']['id'], 0)); f['properties'].update(deg=d, deg_in=d, deg_out=d)
json.dump({'type': 'FeatureCollection', 'features': out}, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
print('merged', drop_l, 'into', keep_l, 'deg', deg[keep])
