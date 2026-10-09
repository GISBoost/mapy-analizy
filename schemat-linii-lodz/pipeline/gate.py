# gate.py <svg> <gtfs_dir> [ratio=1.5]  -- detour gate: lines drawn much longer than their GTFS route
# Per line: drawn length (sum of its polylines, px) / GTFS length (longest shape per direction, m),
# normalised by the median over all lines. Also lists single polylines >= 1.4x longer than their chord.
import sys, re, math, statistics, pandas as pd, xml.etree.ElementTree as ET
ns = '{http://www.w3.org/2000/svg}'
svg, gd = sys.argv[1], sys.argv[2]; LIM = float(sys.argv[3]) if len(sys.argv) > 3 else 1.5
pts = lambda p: [tuple(map(float, q.split(','))) for q in p.split()]
plen = lambda c: sum(math.dist(a, b) for a, b in zip(c, c[1:]))
drawn, loops = {}, []
for g in ET.parse(svg).getroot().iter(ns + 'g'):
    if g.get('class') != 'ln': continue
    for pl in g.findall(ns + 'polyline'):
        c = pts(pl.get('points')); L = plen(c)
        drawn[g.get('data-l')] = drawn.get(g.get('data-l'), 0) + L
        if L > 150 and L > 1.4 * max(math.dist(c[0], c[-1]), 1): loops.append((g.get('data-l'), round(L), c[0], c[-1]))
r = pd.read_csv(f'{gd}/routes.txt', dtype=str); t = pd.read_csv(f'{gd}/trips.txt', dtype=str)
sh = pd.read_csv(f'{gd}/shapes.txt', dtype={'shape_id': str}).sort_values(['shape_id', 'shape_pt_sequence'])
k = math.cos(math.radians(51.76))  # Łódź: degrees -> metres
geo_sh = {s: sum(math.hypot((x2 - x1) * k, y2 - y1) for x1, y1, x2, y2 in zip(g.shape_pt_lon, g.shape_pt_lat, g.shape_pt_lon[1:], g.shape_pt_lat[1:])) * 111320
          for s, g in ((s, g.reset_index()) for s, g in sh.groupby('shape_id'))}
t = t.merge(r[['route_id', 'route_short_name']]); t['m'] = t.shape_id.map(geo_sh)
geo = t.groupby(['route_short_name', 'direction_id']).m.max().groupby(level=0).max()
ratio = {n: drawn[n] / geo[n] for n in geo.index if n in drawn}
med = statistics.median(ratio.values())
print(f'{svg}: {len(ratio)} lines, median {med:.3f} px/m')
for n, v in sorted(ratio.items(), key=lambda x: -x[1]):
    if v / med >= LIM: print(f'  {n:5} {v / med:.2f}x median  drawn {drawn[n]:.0f}px  gtfs {geo[n] / 1000:.1f}km')
for l in sorted(loops, key=lambda x: -x[1]): print('  loop', *l)
