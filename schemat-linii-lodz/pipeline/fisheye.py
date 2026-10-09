# fisheye.py in.json out.json "M R0 [lon lat], M R0 lon lat, ..."  -- one or more radial lenses, applied in order
# Enlarges the city centre before octi lays the graph on its uniform grid (dense centre stations otherwise
# end up one grid cell apart and bundles of 10+ lines have no room). Radial: r' = r * (1 + (M-1) * exp(-(r/R0)^2)),
# monotonic for M <= ~3.2, ~identity beyond 2*R0. A second small lens can open up a single knot (Fabryczna).
# Before the lenses, MOVE (env, JSON list of [lon, lat, new_lon, new_lat]) puts the station node nearest to lon/lat
# at a hand-picked spot; default spreads Fabryczna's four hubs into a diamond (station S, pl. Dąbrowskiego N,
# Rodziny Poznańskich W/E), which in reality sit almost on one line and octi would squash into one bundle.
# Only geometry changes; topology and properties stay.
import json, math, os, sys
MOVE = json.loads(os.environ.get('MOVE', '[[19.4687,51.7703,19.4687,51.767605],[19.4664,51.7702,19.464352,51.7703],'
                                 '[19.4720,51.7702,19.473048,51.7703],[19.4697,51.7722,19.4687,51.772995]]'))  # 300 m S/W/E/N
src, dst = sys.argv[1], sys.argv[2]
lenses = [[float(v) for v in q.split()] + [19.462, 51.768][len(q.split()) - 2:] for q in sys.argv[3].split(',')]
def lens(M, R0, lon, lat):
    rs = [r * (1 + (M - 1) * math.exp(-(r / R0) ** 2)) for r in range(0, 20000, 10)]
    assert all(b > a for a, b in zip(rs, rs[1:])), 'fisheye not monotonic (would fold the map), lower M'
    kx, ky = math.cos(math.radians(lat)) * 111320, 111320
    def f(p):
        x, y = (p[0] - lon) * kx, (p[1] - lat) * ky; s = 1 + (M - 1) * math.exp(-(math.hypot(x, y) / R0) ** 2)
        return [lon + x * s / kx, lat + y * s / ky] + list(p[2:])
    return f
fs = [lens(*q) for q in lenses]
def f(p):
    for l in fs: p = l(p)
    return p
g = json.load(open(src, encoding='utf-8'))
k = math.cos(math.radians(51.77)) * 111320
st = [ft for ft in g['features'] if ft['geometry']['type'] == 'Point' and ft['properties'].get('station_id')]
for lo, la, lo2, la2 in MOVE:
    n = min(st, key=lambda ft: math.hypot((ft['geometry']['coordinates'][0] - lo) * k, (ft['geometry']['coordinates'][1] - la) * 111320))
    old = n['geometry']['coordinates'][:2]; n['geometry']['coordinates'][:2] = [lo2, la2]
    for ft in g['features']:
        c = ft['geometry']['coordinates']
        if ft['geometry']['type'] == 'LineString':
            for i in (0, -1):
                if c[i][:2] == old: c[i][:2] = [lo2, la2]
    print('move', n['properties']['station_label'], f'{math.hypot((lo2 - old[0]) * k, (la2 - old[1]) * 111320):.0f} m', file=sys.stderr)
for ft in g['features']:
    c = ft['geometry']['coordinates']
    ft['geometry']['coordinates'] = f(c) if ft['geometry']['type'] == 'Point' else [f(p) for p in c]
json.dump(g, open(dst, 'w', encoding='utf-8'), ensure_ascii=False)
