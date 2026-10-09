# fisheye.py in.json out.json [M=1.8] [R0=2500] [lon=19.462] [lat=51.768]
# Enlarges the city centre before octi lays the graph on its uniform grid (dense centre stations otherwise
# end up one grid cell apart and bundles of 10+ lines have no room). Radial: r' = r * (1 + (M-1) * exp(-(r/R0)^2)),
# monotonic for M <= ~2.2, ~identity beyond 2*R0. Only geometry changes; topology and properties stay.
import json, math, sys
src, dst = sys.argv[1], sys.argv[2]
M, R0 = (float(sys.argv[i]) if len(sys.argv) > i else d for i, d in ((3, 1.8), (4, 2500)))
C = (float(sys.argv[5]) if len(sys.argv) > 5 else 19.462, float(sys.argv[6]) if len(sys.argv) > 6 else 51.768)
kx, ky = math.cos(math.radians(C[1])) * 111320, 111320
def f(p):
    x, y = (p[0] - C[0]) * kx, (p[1] - C[1]) * ky; r = math.hypot(x, y)
    s = 1 + (M - 1) * math.exp(-(r / R0) ** 2)
    return [C[0] + x * s / kx, C[1] + y * s / ky] + list(p[2:])
rs = [r * (1 + (M - 1) * math.exp(-(r / R0) ** 2)) for r in range(0, 20000, 10)]
assert all(b > a for a, b in zip(rs, rs[1:])), 'fisheye not monotonic (would fold the map), lower M'
g = json.load(open(src, encoding='utf-8'))
for ft in g['features']:
    c = ft['geometry']['coordinates']
    ft['geometry']['coordinates'] = f(c) if ft['geometry']['type'] == 'Point' else [f(p) for p in c]
json.dump(g, open(dst, 'w', encoding='utf-8'), ensure_ascii=False)
