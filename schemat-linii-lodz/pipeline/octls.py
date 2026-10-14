"""octls.py - octilinear layout: edge direction labels + closed-form least squares (own solver).

Model. Every loom edge k=(u,v) gets one of 8 directions d_k. Given the labels, positions solve
  min  sum_k [ wd^2 |p_v-p_u - l_k d_k|^2 + lw^2 (l_k - L0_k)^2 ] + al^2 sum_i |p_i - p0_i|^2
l_k is eliminated analytically, so the fit is one dense linear solve (2n x 2n, ~3 ms).
Labels are improved by local search (single edge, runs along chains, sub-runs) on
  J = E/escale + bend penalties + crossings + short-edge penalty.
usage: octls.py loom.json out.octi.json [--theta 8] [--goals goals/tram.json] ...  (see OCTLS.md)
"""
import json, math, sys, argparse, time, itertools
import numpy as np

K = 111320.0
C = math.cos(math.radians(51.76))
DIRS = np.array([(math.sin(math.radians(a)), math.cos(math.radians(a))) for a in range(0, 360, 45)])  # 0=N 2=E 4=S 6=W


def load(path, theta):
    g = json.load(open(path, encoding='utf-8'))
    F = g['features']
    nodes = [f for f in F if f['geometry']['type'] == 'Point']
    idx = {f['properties']['id']: i for i, f in enumerate(nodes)}
    edges = [f for f in F if f['geometry']['type'] == 'LineString']
    p = np.array([[n['geometry']['coordinates'][0] * C * K, n['geometry']['coordinates'][1] * K] for n in nodes])
    c0 = p.mean(0)
    t = math.radians(theta)
    R = np.array([[math.cos(t), math.sin(t)], [-math.sin(t), math.cos(t)]])
    p0 = (p - c0) @ R.T
    E = np.array([(idx[f['properties']['from']], idx[f['properties']['to']]) for f in edges])
    return g, nodes, edges, p0, c0, E


class Layout:
    def __init__(self, nodes, edges, p0, E, a):
        self.nodes, self.edges, self.p0, self.E, self.a = nodes, edges, p0, E, a
        self.n, self.m = len(p0), len(E)
        d = p0[E[:, 1]] - p0[E[:, 0]]
        self.L0 = np.hypot(d[:, 0], d[:, 1])
        self.ang0 = np.degrees(np.arctan2(d[:, 0], d[:, 1])) % 360
        self.inc = [[] for _ in range(self.n)]
        for k, (u, v) in enumerate(E):
            self.inc[u].append((k, +1)); self.inc[v].append((k, -1))
        self.lines = [set(l['label'] for l in e['properties']['lines']) for e in edges]
        self.pairs = []; self.pw = []
        for u in range(self.n):
            for (k1, s1), (k2, s2) in itertools.combinations(self.inc[u], 2):
                if self.lines[k1] & self.lines[k2]:
                    self.pairs.append((u, k1, s1, k2, s2))
                    self.pw.append(len(self.lines[k1] & self.lines[k2]))
        self.pw = np.array(self.pw, float)
        self.pu = np.array([q[0] for q in self.pairs]); self.pk1 = np.array([q[1] for q in self.pairs])
        self.ps1 = np.array([q[2] for q in self.pairs]); self.pk2 = np.array([q[3] for q in self.pairs]); self.ps2 = np.array([q[4] for q in self.pairs])
        self.sta = [n['properties'].get('station_label') or '' for n in nodes]
        self.deg = [len(i) for i in self.inc]
        # constant parts of H
        wd, lw, al = a.wdir, a.lenw, a.anchor
        self.s = wd * wd + lw * lw
        self.al2 = al * al
        self.iu, self.iv = E[:, 0], E[:, 1]
        # edge ordering along chains (maximal paths through degree-2 nodes)
        self.chains = self._chains()

    def _chains(self):
        seen = set(); out = []
        for k0 in range(self.m):
            if k0 in seen: continue
            # extend both ways through deg-2 nodes
            run = [k0]; seen.add(k0)
            for end in (0, 1):
                cur = k0; node = self.E[k0][1 - end]  # node at which we extend
                while self.deg[node] == 2:
                    nxt = [kk for kk, s in self.inc[node] if kk != cur]
                    if not nxt or nxt[0] in seen: break
                    kk = nxt[0]; seen.add(kk)
                    if end == 0: run.insert(0, kk)
                    else: run.append(kk)
                    node = self.E[kk][0] if self.E[kk][1] == node else self.E[kk][1]; cur = kk
            out.append(run)
        return out

    # ---- continuous part
    def solve(self, dr):
        a = self.a; wd, lw, s = a.wdir, a.lenw, self.s
        D = DIRS[dr]
        n, m = self.n, self.m
        H = np.zeros((2 * n, 2 * n)); f = np.zeros(2 * n)
        # M_k = wd^2 I - wd^4/s d d^T ; block for edge (u,v): [[M,-M],[-M,M]]
        M = np.zeros((m, 2, 2))
        M[:, 0, 0] = wd * wd - wd ** 4 / s * D[:, 0] * D[:, 0]
        M[:, 1, 1] = wd * wd - wd ** 4 / s * D[:, 1] * D[:, 1]
        M[:, 0, 1] = M[:, 1, 0] = -wd ** 4 / s * D[:, 0] * D[:, 1]
        g = wd * wd * lw * lw / s * self.L0           # linear coeff: E has -2 g (d.Delta)
        iu, iv = self.iu, self.iv
        for r in range(2):
            for c in range(2):
                np.add.at(H, (2 * iu + r, 2 * iu + c), M[:, r, c])
                np.add.at(H, (2 * iv + r, 2 * iv + c), M[:, r, c])
                np.add.at(H, (2 * iu + r, 2 * iv + c), -M[:, r, c])
                np.add.at(H, (2 * iv + r, 2 * iu + c), -M[:, r, c])
        for r in range(2):
            np.add.at(f, 2 * iv + r, g * D[:, r])
            np.add.at(f, 2 * iu + r, -g * D[:, r])
        H[np.arange(2 * n), np.arange(2 * n)] += self.al2
        f += self.al2 * self.p0.reshape(-1)
        x = np.linalg.solve(H, f)
        P = x.reshape(-1, 2)
        dl = P[iv] - P[iu]
        l = (wd * wd * np.einsum('ij,ij->i', dl, D) + lw * lw * self.L0) / s
        res = dl - l[:, None] * D
        E = wd * wd * np.sum(res ** 2) + lw * lw * np.sum((l - self.L0) ** 2) + self.al2 * np.sum((P - self.p0) ** 2)
        return P, l, E, float(np.sum(res ** 2) ** 0.5)

    # ---- discrete part
    def bends(self, dr):
        d1 = (dr[self.pk1] + np.where(self.ps1 < 0, 4, 0)) % 8
        d2 = (dr[self.pk2] + np.where(self.ps2 < 0, 4, 0)) % 8
        diff = np.abs(d1 - d2) % 8
        diff = np.minimum(diff, 8 - diff)
        return 4 - diff, diff == 0   # bend class (0 straight,1=45,2=90,3=135), overlap flag

    def bend_pen(self, dr):
        a = self.a
        b, ov = self.bends(dr)
        tab = np.array([0, a.bend45, a.bend90, a.bend135, 0.0])
        pen = (tab[b] * self.pw ** a.bendpow).sum() + 1e5 * ov.sum()
        # distinct leaving directions at every node
        pen += 1e5 * self.dup(dr)
        return pen

    def dup(self, dr):
        cnt = 0
        for u in range(self.n):
            if self.deg[u] < 2: continue
            ds = [(dr[k] + (4 if s < 0 else 0)) % 8 for k, s in self.inc[u]]
            cnt += len(ds) - len(set(ds))
        return cnt

    def crossings(self, P):
        A = P[self.iu]; B = P[self.iv]
        def o(a, b, c):
            return (b[..., 0] - a[..., 0]) * (c[..., 1] - a[..., 1]) - (b[..., 1] - a[..., 1]) * (c[..., 0] - a[..., 0])
        a1 = A[:, None, :]; b1 = B[:, None, :]; a2 = A[None, :, :]; b2 = B[None, :, :]
        d1 = o(a2, b2, a1); d2 = o(a2, b2, b1); d3 = o(a1, b1, a2); d4 = o(a1, b1, b2)
        X = (d1 * d2 < 0) & (d3 * d4 < 0)
        share = (self.iu[:, None] == self.iu[None, :]) | (self.iu[:, None] == self.iv[None, :]) | (self.iv[:, None] == self.iu[None, :]) | (self.iv[:, None] == self.iv[None, :])
        X &= ~share
        return int(X.sum() // 2)

    def J(self, dr):
        a = self.a
        P, l, E, rs = self.solve(dr)
        bp = self.bend_pen(dr)
        cr = self.crossings(P) if a.xpen > 0 else 0
        short = float(np.sum(np.clip(a.minlen - l, 0, None) ** 2)) / 1e4 * a.shortw + 200.0 * int(np.sum(l < 10))
        return E / a.escale + bp + a.xpen * cr + short, (E / a.escale, bp, cr, short, rs), P, l


def goal_edges(lay, goals):
    import heapq
    lab = {}
    for i, n in enumerate(lay.sta): lab.setdefault(n, []).append(i)
    adj = [[] for _ in range(lay.n)]
    for k, (u, v) in enumerate(lay.E):
        adj[u].append((v, lay.L0[k], k)); adj[v].append((u, lay.L0[k], k))
    fixed = {}
    miss = sorted({w for gl in goals for w in gl['path'] if w not in lab})
    if miss: sys.exit('goals: no station named %s in the graph (goals are tied to one feed, see OCTLS.md)' % miss)
    for gl in goals:
        wp = gl['path']
        for w0, w1 in zip(wp[:-1], wp[1:]):
            a = lab[w0][0]; b = lab[w1][0]
            if len(lab[w1]) > 1:
                b = min(lab[w1], key=lambda i: np.hypot(*(lay.p0[i] - lay.p0[a])))
            D = {a: 0}; Pr = {}; q = [(0, a)]
            while q:
                d, u = heapq.heappop(q)
                if u == b: break
                if d > D[u]: continue
                for v, w, k in adj[u]:
                    if d + w < D.get(v, 1e18): D[v] = d + w; Pr[v] = (u, k); heapq.heappush(q, (d + w, v))
            v = b; ks = []; fw = []
            while v != a:
                u, k = Pr[v]; ks.append(k); fw.append(lay.E[k][0] == u); v = u
            cls = {'V': (0, 4), 'H': (2, 6), 'D': (1, 3, 5, 7)}[gl['axis']]
            dv = lay.p0[b] - lay.p0[a]; ang = math.degrees(math.atan2(dv[0], dv[1])) % 360
            cp = min(cls, key=lambda c: abs((c * 45 - ang + 180) % 360 - 180))
            for k, f in zip(ks, fw): fixed[k] = cp if f else (cp + 4) % 8
    return fixed


def smooth_dirs(lay, win=1):
    """initial labels: length-weighted mean bearing of the edge and its chain neighbours"""
    dr = np.zeros(lay.m, int)
    chord = lay.p0[lay.iv] - lay.p0[lay.iu]
    pos = {}
    for run in lay.chains:
        for i, k in enumerate(run): pos[k] = (run, i)
    for k in range(lay.m):
        run, i = pos[k]
        v = np.zeros(2)
        for j in range(max(0, i - win), min(len(run), i + win + 1)):
            kk = run[j]
            c = chord[kk]
            ref = chord[k]
            if c @ ref < 0: c = -c
            v += c
        ang = math.degrees(math.atan2(v[0], v[1])) % 360
        dr[k] = int(round(ang / 45.0)) % 8
    return dr


def search(lay, dr, log, passes=4, tlimit=600, fixed={}):
    t0 = time.time()
    best, parts, P, l = lay.J(dr)
    log('start J=%.2f %s' % (best, tuple(round(x, 2) for x in parts)))
    for ps in range(passes):
        improved = 0
        # moves: list of (edges, candidate dirs)
        moves = []
        for k in np.argsort(-lay.L0):
            if int(k) not in fixed: moves.append(([int(k)], None))
        for run in lay.chains:
            run = [k for k in run]
            if len(run) >= 2 and not any(k in fixed for k in run): moves.append((run, None))
            if 3 <= len(run) <= 40:
                L = len(run)
                for w in (2, 3, 4, 6):
                    for i in range(0, L - w + 1, max(1, w // 2)):
                        sub = run[i:i + w]
                        if not any(k in fixed for k in sub): moves.append((sub, None))
        for es, _ in moves:
            if time.time() - t0 > tlimit: break
            cur = dr[es].copy()
            c0 = int(cur[0])
            cands = {(c0 + t) % 8 for t in (-2, -1, 1, 2)} if len(es) == 1 else {(c0 + t) % 8 for t in (-1, 0, 1)} | {int(x) for x in cur}
            cands.discard(-1)
            bestd = None
            for cd in cands:
                if len(es) == 1 and cd == c0: continue
                new = cur.copy()
                if len(es) == 1: new[0] = cd
                else: new[:] = cd
                if np.array_equal(new, cur): continue
                dr[es] = new
                v, pt, P2, l2 = lay.J(dr)
                if v < best - 1e-6:
                    best, parts, bestd = v, pt, new.copy()
            dr[es] = bestd if bestd is not None else cur
            if bestd is not None: improved += 1
        log('pass %d improved %d J=%.2f %s  t=%.0fs' % (ps, improved, best, tuple(round(x, 2) for x in parts), time.time() - t0))
        if not improved: break
    return dr, best, parts


def ils(lay, dr, best, fixed, n_it, seed, log, tlimit=900):
    rng = np.random.default_rng(seed); t0 = time.time()
    nb = [set() for _ in range(lay.m)]
    for u in range(lay.n):
        es = [k for k, s in lay.inc[u]]
        for k in es: nb[k].update(es)
    free = [k for k in range(lay.m) if k not in fixed]
    acc = 0
    for it in range(n_it):
        if time.time() - t0 > tlimit: break
        old = dr.copy()
        seeds = rng.choice(free, size=int(rng.integers(1, 4)), replace=False)
        for k in seeds: dr[k] = (dr[k] + int(rng.choice([-2, -1, 1, 2]))) % 8
        zone = set()
        for k in seeds: zone |= nb[k]
        for k in list(zone): zone |= nb[k]
        cur, _, _, _ = lay.J(dr)
        for rep in range(2):
            improved = False
            for k in zone:
                if k in fixed: continue
                c0_ = dr[k]
                for cd in ((c0_ + 1) % 8, (c0_ - 1) % 8, (c0_ + 2) % 8, (c0_ - 2) % 8):
                    dr[k] = cd
                    v, _, _, _ = lay.J(dr)
                    if v < cur - 1e-9: cur = v; c0_ = cd; improved = True
                    else: dr[k] = c0_
                dr[k] = c0_
            if not improved: break
        if cur < best - 1e-6:
            best = cur; acc += 1
        else:
            dr[:] = old
    log('ILS %d accepted of %d, J=%.2f, t=%.0fs' % (acc, n_it, best, time.time() - t0))
    return dr, best


def write(g, lay, dr, P, c0, out):
    feats = []; ni = 0
    ll = lambda q: [(q[0] + c0[0]) / (C * K), (q[1] + c0[1]) / K]
    for f in g['features']:
        if f['geometry']['type'] == 'Point':
            h = json.loads(json.dumps(f)); h['geometry']['coordinates'] = ll(P[ni]); ni += 1; feats.append(h)
    ei = 0; nub = []
    for f in g['features']:
        if f['geometry']['type'] != 'LineString': continue
        u, v = lay.E[ei]; d = P[v] - P[u]; d0 = DIRS[dr[ei]]
        r = d - (d @ d0) * d0
        pts = [P[u]]
        if np.hypot(*r) > 1.5:
            best = None
            for dd in (dr[ei] + 1, dr[ei] - 1):
                d1 = DIRS[dd % 8]
                s = np.linalg.solve(np.array([d0, d1]).T, d)
                if s[0] >= -1e-6 and s[1] >= -1e-6 and (best is None or s[1] < best[0][1]): best = (s, s[1], d1)
            if best: pts.append(P[u] + best[0][0] * d0); nub.append(float(best[0][1]))
        pts.append(P[v])
        h = json.loads(json.dumps(f)); h['geometry']['coordinates'] = [ll(q) for q in pts]; feats.append(h); ei += 1
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    return nub


def args(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('inp'); ap.add_argument('out')
    ap.add_argument('--theta', type=float, default=0.0)
    ap.add_argument('--anchor', type=float, default=0.3)
    ap.add_argument('--lenw', type=float, default=0.5)
    ap.add_argument('--wdir', type=float, default=300.0)
    ap.add_argument('--escale', type=float, default=1.5e5)
    ap.add_argument('--bend45', type=float, default=1.0)
    ap.add_argument('--bend90', type=float, default=6.0)
    ap.add_argument('--bend135', type=float, default=20.0)
    ap.add_argument('--xpen', type=float, default=10.0)
    ap.add_argument('--minlen', type=float, default=120.0)
    ap.add_argument('--shortw', type=float, default=1.0)
    ap.add_argument('--win', type=int, default=1)
    ap.add_argument('--bendpow', type=float, default=0.0)
    ap.add_argument('--ils', type=int, default=0)
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--passes', type=int, default=4)
    ap.add_argument('--tlimit', type=float, default=600)
    ap.add_argument('--goals', default=None)
    return ap.parse_args(argv)


def run(a, log=lambda s: None):
    g, nodes, edges, p0, c0, E = load(a.inp, a.theta)
    lay = Layout(nodes, edges, p0, E, a)
    dr = smooth_dirs(lay, a.win)
    fixed = {}
    if a.goals:
        fixed = goal_edges(lay, json.load(open(a.goals, encoding='utf-8')))
        for k, c in fixed.items(): dr[k] = c
    dr, best, parts = search(lay, dr, log, a.passes, a.tlimit, fixed)
    if a.ils: dr, best = ils(lay, dr, best, fixed, a.ils, a.seed, log)
    v, pt, P, l = lay.J(dr)
    nub = write(g, lay, dr, P, c0, a.out)
    return dict(J=round(v, 2), E=round(pt[0], 2), bend=round(pt[1], 2), cross=pt[2], short=round(pt[3], 2), resid=round(pt[4], 3), nubs=len(nub), nubmax=round(max(nub), 2) if nub else 0)


if __name__ == '__main__':
    a = args()
    t = time.time()
    r = run(a, log=lambda s: print(s, file=sys.stderr))
    print(json.dumps(r), 'time %.0fs' % (time.time() - t), file=sys.stderr)
