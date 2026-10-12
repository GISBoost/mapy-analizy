# mvt.py: minimal Mapbox Vector Tile decoder (stdlib only), enough for the tiles transitmap writes.
# decode(bytes, z, x, y) -> [{layer, type (1 point, 2 line, 3 polygon), props, geom: [[[lon, lat], ...], ...]}]
import math


def _varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1; r |= (c & 0x7F) << s; s += 7
        if c < 0x80: return r, i


def _fields(b):  # (field number, wire type, value) of one protobuf message
    i = 0
    while i < len(b):
        k, i = _varint(b, i); f, t = k >> 3, k & 7
        if t == 0: v, i = _varint(b, i)
        elif t == 2: n, i = _varint(b, i); v = b[i:i + n]; i += n
        elif t == 1: v = b[i:i + 8]; i += 8
        elif t == 5: v = b[i:i + 4]; i += 4
        else: raise ValueError(f'wire type {t}')
        yield f, t, v


def _packed(b):
    i, r = 0, []
    while i < len(b): v, i = _varint(b, i); r.append(v)
    return r


def _value(b):
    import struct
    for f, t, v in _fields(b):
        if f == 1: return v.decode('utf-8')
        if f == 2: return struct.unpack('<f', v)[0]
        if f == 3: return struct.unpack('<d', v)[0]
        if f in (4, 5): return v
        if f == 6: return (v >> 1) ^ -(v & 1)
        if f == 7: return bool(v)


def decode(data, z, x, y):
    out = []
    for f, _, lay in _fields(data):
        if f != 3: continue
        name, keys, vals, feats, ext = None, [], [], [], 4096
        for g, _, v in _fields(lay):
            if g == 1: name = v.decode('utf-8')
            elif g == 2: feats.append(v)
            elif g == 3: keys.append(v.decode('utf-8'))
            elif g == 4: vals.append(_value(v))
            elif g == 5: ext = v
        n = 2 ** z
        def ll(px, py):  # tile pixel -> lon, lat
            lon = (x + px / ext) / n * 360 - 180
            lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + py / ext) / n))))
            return [lon, lat]
        for fb in feats:
            tags, typ, cmds = [], 0, []
            for g, _, v in _fields(fb):
                if g == 2: tags = _packed(v)
                elif g == 3: typ = v
                elif g == 4: cmds = _packed(v)
            rings, cx, cy, i = [], 0, 0, 0
            while i < len(cmds):
                c = cmds[i]; i += 1; op, cnt = c & 7, c >> 3
                if op == 7:
                    if rings: rings[-1].append(rings[-1][0])
                    continue
                for _ in range(cnt):
                    dx = (cmds[i] >> 1) ^ -(cmds[i] & 1); dy = (cmds[i + 1] >> 1) ^ -(cmds[i + 1] & 1); i += 2
                    cx += dx; cy += dy
                    if op == 1: rings.append([])
                    rings[-1].append(ll(cx, cy))
            props = {keys[tags[k]]: vals[tags[k + 1]] for k in range(0, len(tags), 2)}
            out.append(dict(layer=name, type=typ, props=props, geom=rings))
    return out


if __name__ == '__main__':  # self-check: one line from (0,0) to (4096,4096) on tile 0/0/0 spans the world diagonal
    def vi(v):
        r = b''
        while True:
            c = v & 0x7F; v >>= 7
            if v: r += bytes([c | 0x80])
            else: return r + bytes([c])
    def msg(f, payload): return vi(f << 3 | 2) + vi(len(payload)) + payload
    zz = lambda v: (v << 1) ^ (v >> 31)
    geom = b''.join(vi(c) for c in [9, zz(0), zz(0), 10, zz(4096), zz(4096)])
    feat = vi(3 << 3) + vi(2) + msg(4, geom) + msg(2, vi(0) + vi(0))
    layer = msg(1, b'lines') + msg(2, feat) + msg(3, b'line') + msg(4, msg(1, b'4'))
    r = decode(msg(3, layer), 0, 0, 0)
    assert r[0]['layer'] == 'lines' and r[0]['props'] == {'line': '4'} and r[0]['type'] == 2
    (a, b), = r[0]['geom']; assert round(a[0]) == -180 and round(b[0]) == 180 and round(a[1], 1) == 85.1, r
    print('ok')
