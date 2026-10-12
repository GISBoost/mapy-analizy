# straighten.py <gtfs_dir> <out_dir>  -- prostuje wybrane ulice w GTFS przed LOOM (env STRAIGHTEN, JSON)
# Każdy wpis: {"path": [[lon, lat], …], "axis": "v"|"h", "to": lon|lat, "buf": m, "taper": [od, do]}.
# Przystanki (stops.txt) i punkty kształtów (shapes.txt) bliżej niż `buf` metrów od łamanej `path` (w geografii)
# dostają wspólną długość ("v": pionowo) albo szerokość ("h": poziomo) `to`. `taper` (opcjonalny, w tej samej
# współrzędnej co oś wzdłuż ulicy: lat dla "v", lon dla "h") wygasza przesunięcie liniowo między `od` a `do`,
# żeby nie ruszać skrzyżowania na końcu. Wpisy działają po kolei na współrzędnych już przesuniętych przez poprzednie.
import json, math, os, shutil, sys
import pandas as pd

src, dst = sys.argv[1:3]
CFG = json.loads(os.environ.get('STRAIGHTEN', '[]'))
K = math.cos(math.radians(51.76))
def xy(lon, lat): return lon * K * 111320, lat * 110570
def dseg(p, a, b):
    ax, ay = a; bx, by = b; px, py = p; dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy or 1)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)
def moved(lon, lat, origs):
    for c, (olon, olat) in zip(CFG, origs):
        P = [xy(*q) for q in c['path']]; p = xy(olon, olat)
        if min(dseg(p, a, b) for a, b in zip(P, P[1:])) > c.get('buf', 70): continue
        w = 1.0
        if 'taper' in c:
            s = olat if c['axis'] == 'v' else olon; a, b = c['taper']
            w = max(0.0, min(1.0, (b - s) / (b - a))) if b != a else 1.0
        if c['axis'] == 'v': lon += (c['to'] - lon) * w
        else: lat += (c['to'] - lat) * w
    return lon, lat

def apply(df, lonc, latc):
    lon = df[lonc].astype(float); lat = df[latc].astype(float); n = 0
    for i in df.index:
        o = (lon[i], lat[i]); q = moved(*o, [o] * len(CFG))
        if q != o: lon[i], lat[i] = q; n += 1
    df[lonc] = lon.map(lambda v: f'{v:.6f}'); df[latc] = lat.map(lambda v: f'{v:.6f}')
    return n

os.makedirs(dst, exist_ok=True)
for f in os.listdir(src):
    if f.endswith('.txt') and f not in ('stops.txt', 'shapes.txt'): shutil.copy(os.path.join(src, f), dst)
for f, lonc, latc in [('stops.txt', 'stop_lon', 'stop_lat'), ('shapes.txt', 'shape_pt_lon', 'shape_pt_lat')]:
    p = os.path.join(src, f)
    if not os.path.exists(p): continue
    df = pd.read_csv(p, dtype=str)
    n = apply(df, lonc, latc); df.to_csv(os.path.join(dst, f), index=False)
    print(f'{f}: moved {n} points', file=sys.stderr)
