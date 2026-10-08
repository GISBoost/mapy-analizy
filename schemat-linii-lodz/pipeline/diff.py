# diff.py <gtfs_before> <date_before> <gtfs_after> <date_after> <out.json>
# Line changes between two timetables, from GTFS only (not from the drawings):
# added / removed lines, changed route (main variant's stop sequence differs in some
# direction) and changed weekday trip count. Same mode filters as filt.py.
import pandas as pd, sys, json, re
GB, DB, GA, DA, OUT = sys.argv[1:6]
key = lambda s: (int(re.sub(r'\D', '', s) or 999), s)

def load(G, D):
    rd = lambda f: pd.read_csv(f'{G}/{f}.txt', dtype=str, encoding='utf-8-sig')
    r, t, st, cd, stops = rd('routes'), rd('trips'), rd('stop_times'), rd('calendar_dates'), rd('stops')
    sv = set(cd[(cd.date == D) & (cd.exception_type == '1')].service_id)
    t = t[t.service_id.isin(sv)]
    st = st[st.trip_id.isin(t.trip_id)].copy(); st['ss'] = st.stop_sequence.astype(int)
    sn = dict(zip(stops.stop_id, stops.stop_name))
    st['nm'] = st.stop_id.map(sn)
    pat = st.sort_values(['trip_id', 'ss']).groupby('trip_id').nm.agg(tuple)
    t = t.join(pat.rename('pat'), on='trip_id').merge(r[['route_id', 'route_short_name', 'route_type']], on='route_id')
    night = t.route_short_name.str.match(r'^N\d')
    modes = {'tram': t[t.route_type == '0'],
             'bus': t[(t.route_type == '3') & ~night & ~t.route_short_name.str.match(r'^o?P\d')],
             'night': t[(t.route_type == '3') & night]}
    res = {}
    for m, tm in modes.items():
        res[m] = {}
        for n, g in tm.groupby('route_short_name'):
            main = {d: gd.pat.value_counts().index[0] for d, gd in g.groupby('direction_id')}
            res[m][n] = dict(k=len(g), main=main)
    return res

B, A = load(GB, DB), load(GA, DA)
out = {}
for m in A:
    rows = []
    for n in sorted(set(A[m]) | set(B[m]), key=key):
        b, a = B[m].get(n), A[m].get(n)
        r = dict(n=n, k0=b['k'] if b else 0, k1=a['k'] if a else 0, kinds=[])
        if not b: r['kinds'].append('added')
        elif not a: r['kinds'].append('removed')
        else:
            if any(b['main'].get(d) != a['main'].get(d) for d in set(b['main']) | set(a['main'])):
                r['kinds'].append('route')
                s0 = {x for p in b['main'].values() for x in p}; s1 = {x for p in a['main'].values() for x in p}
                r['plus'] = sorted(s1 - s0); r['minus'] = sorted(s0 - s1)
            if b['k'] != a['k']: r['kinds'].append('trips')
        p = a or b; d0 = min(p['main']); r['a'], r['b'] = p['main'][d0][0], p['main'][d0][-1]
        if r['kinds']: rows.append(r)
    out[m] = rows
    print(m, {k: sum(k in r['kinds'] for r in rows) for k in ('added', 'removed', 'route', 'trips')})
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
