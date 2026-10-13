# geo_tiles.py <tiles dir> <mapy/<m>_geo.json>: merges the vector tiles transitmap wrote (geo_tiles.sh) into the map's data, as key 'z':
# {zoom: {w: line px, o: outline px, s: station outline px, l: {line: [[x0, y0, x1, y1, ...], ...]}, st: [[station id, [x0, y0, ...]], ...]}}.
# Points are quarter pixels of that zoom (the tiles' own grid: 1024 units per 256 px tile), so the page draws loom's geometry as is.
# Each piece of line is clipped to its own tile (the tiles overlap by a buffer) so the pieces of neighbouring tiles meet without
# duplicates; the dark outlines are not stored (the same geometry, wider), stations are stored once.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mvt

R = 1024  # transitmap's TILE_RES


def raw(data):  # features in tile units, without converting to lon/lat
    out = []
    for f, _, lay in mvt._fields(data):
        if f != 3: continue
        name, keys, vals, feats = None, [], [], []
        for g, _, v in mvt._fields(lay):
            if g == 1: name = v.decode('utf-8')
            elif g == 2: feats.append(v)
            elif g == 3: keys.append(v.decode('utf-8'))
            elif g == 4: vals.append(mvt._value(v))
        for fb in feats:
            tags, cmds = [], []
            for g, _, v in mvt._fields(fb):
                if g == 2: tags = mvt._packed(v)
                elif g == 4: cmds = mvt._packed(v)
            rings, cx, cy, i = [], 0, 0, 0
            while i < len(cmds):
                c = cmds[i]; i += 1; op, cnt = c & 7, c >> 3
                if op == 7: rings[-1].append(rings[-1][0]); continue
                for _ in range(cnt):
                    cx += (cmds[i] >> 1) ^ -(cmds[i] & 1); cy += (cmds[i + 1] >> 1) ^ -(cmds[i + 1] & 1); i += 2
                    if op == 1: rings.append([])
                    rings[-1].append((cx, cy))
            out.append((name, {keys[tags[k]]: vals[tags[k + 1]] for k in range(0, len(tags), 2)}, rings))
    return out


def clip(p, x0, y0, x1, y1):  # polyline -> pieces inside the box (Liang-Barsky per segment)
    pieces, cur = [], []
    for (ax, ay), (bx, by) in zip(p, p[1:]):
        t0, t1, dx, dy = 0.0, 1.0, bx - ax, by - ay
        for q, r in ((-dx, ax - x0), (dx, x1 - ax), (-dy, ay - y0), (dy, y1 - ay)):
            if q == 0:
                if r < 0: t0, t1 = 1, 0
            elif q < 0: t0 = max(t0, r / q)
            else: t1 = min(t1, r / q)
        if t0 > t1:
            if len(cur) > 1: pieces.append(cur)
            cur = []; continue
        a, b = (ax + dx * t0, ay + dy * t0), (ax + dx * t1, ay + dy * t1)
        if not cur or cur[-1] != a:
            if len(cur) > 1: pieces.append(cur)
            cur = [a]
        cur.append(b)
        if t1 < 1: pieces.append(cur); cur = []
    if len(cur) > 1: pieces.append(cur)
    return pieces


def main(tiles, out):
    D = json.load(open(out, encoding='utf-8')); D['z'] = {}
    for z in sorted(os.listdir(tiles), key=int):
        Z = {'l': {}, 'st': []}; seen = set()
        for x in os.listdir(os.path.join(tiles, z)):
            for fn in os.listdir(os.path.join(tiles, z, x)):
                y = int(fn.split('.')[0]); X, Y = int(x) * R, y * R
                for name, pr, rings in raw(open(os.path.join(tiles, z, x, fn), 'rb').read()):
                    g = lambda pts: [v for px, py in pts for v in (round(X + px), round(Y + py))]
                    if name == 'stations':
                        Z['s'] = float(pr['width']); k = (pr.get('stationId'), tuple(g(rings[0])[:4]))
                        if k not in seen: seen.add(k); Z['st'].append([pr.get('stationId'), g(rings[0])])
                    elif pr.get('lineCap') == 'butt': Z['bw'] = float(pr['width'])  # outline: line width + 2 outlines
                    else:
                        Z['w'] = float(pr['width'])
                        for ring in rings:
                            for piece in clip(ring, 0, 0, R, R):
                                pts = g(piece)
                                if len(pts) >= 4: Z['l'].setdefault(pr['line'], []).append(pts)
        Z['o'] = (Z.pop('bw') - Z['w']) / 2  # outline px per side
        D['z'][z] = Z
        print(f"z{z}: line {Z['w']} px, outline {Z['o']} px, {sum(len(v) for v in Z['l'].values())} pieces, {len(Z['st'])} stations")
    json.dump(D, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    if sys.argv[1:] == ['--test']:  # a segment through the tile is cut at its edges, one outside is dropped
        assert clip([(-10, 5), (20, 5)], 0, 0, 10, 10) == [[(0.0, 5.0), (10.0, 5.0)]]
        assert clip([(-10, -5), (20, -5)], 0, 0, 10, 10) == []
        assert clip([(2, 2), (5, 5), (15, 5), (15, 8), (5, 8)], 0, 0, 10, 10) == [[(2.0, 2.0), (5.0, 5.0), (10.0, 5.0)], [(10.0, 8.0), (5.0, 8.0)]]
        print('ok'); sys.exit()
    main(*sys.argv[1:3])
