# gtfs_fix_shapes.py <gtfs.zip|katalog> <wynik.zip>
# Feedy ZDiT mają kursy z shape_id, którego nie ma w shapes.txt (np. tramwaj 43), a gtfs2graph (cppgtfs) przerywa
# wtedy wczytywanie: "in field 'shape_id', no shape with id ... defined". Skrypt robi feed, który LOOM (też wtyczka
# QGIS loom_qgis) wczyta: kurs z brakującym kształtem znika, jeśli jego linia ma inne kursy z kształtem, a w przeciwnym
# razie zostaje bez shape_id (gtfs2graph poprowadzi go prosto między przystankami). stop_times i frequencies idą za kursami.
import csv, io, sys, zipfile, os

def read(src, name):
    if os.path.isdir(src):
        p = os.path.join(src, name)
        return open(p, encoding='utf-8-sig', newline='').read() if os.path.exists(p) else None
    with zipfile.ZipFile(src) as z:
        n = next((x for x in z.namelist() if x.split('/')[-1] == name), None)
        return z.read(n).decode('utf-8-sig') if n else None

def names(src):
    if os.path.isdir(src): return [x for x in os.listdir(src) if x.endswith('.txt')]
    with zipfile.ZipFile(src) as z: return [x.split('/')[-1] for x in z.namelist() if x.endswith('.txt')]

def rows(text):
    r = csv.reader(io.StringIO(text)); h = next(r); return h, list(r)

def dump(h, rs):
    b = io.StringIO(); w = csv.writer(b, lineterminator='\n'); w.writerow(h); w.writerows(rs); return b.getvalue()

src, dst = sys.argv[1:3]
shapes = set()
h, rs = rows(read(src, 'shapes.txt') or 'shape_id\n'); i = h.index('shape_id')
shapes = {r[i] for r in rs}
th, trips = rows(read(src, 'trips.txt'))
ts, tr, tt = th.index('shape_id'), th.index('route_id'), th.index('trip_id')
ok_routes = {r[tr] for r in trips if r[ts] in shapes}
drop, blank, keep = set(), 0, []
for r in trips:
    if r[ts] and r[ts] not in shapes:
        if r[tr] in ok_routes: drop.add(r[tt]); continue
        r[ts] = ''; blank += 1
    keep.append(r)
out = {'trips.txt': dump(th, keep)}
for name in ('stop_times.txt', 'frequencies.txt'):
    t = read(src, name)
    if t is None: continue
    h, rs = rows(t); j = h.index('trip_id')
    out[name] = dump(h, [r for r in rs if r[j] not in drop])
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in names(src):
        z.writestr(name, out[name] if name in out else read(src, name))
print(f'trips: {len(trips)}, dropped {len(drop)} (missing shape, line has other shapes), '
      f'shape_id cleared on {blank}', file=sys.stderr)
