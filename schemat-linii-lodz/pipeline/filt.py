import pandas as pd, sys, os, re, json
G=sys.argv[1]; OUT=sys.argv[2]; MODE=sys.argv[3]; DATE=sys.argv[4] if len(sys.argv)>4 else '20261008'  # weekday YYYYMMDD inside the feed's validity
rd=lambda f: pd.read_csv(f'{G}/{f}.txt',dtype=str,encoding='utf-8-sig')
r=rd('routes'); t=rd('trips'); st=rd('stop_times'); cd=rd('calendar_dates'); stops=rd('stops'); sh=rd('shapes')
night=r.route_short_name.str.match(r'^N\d')
if MODE=='tram': r=r[r.route_type=='0']
elif MODE=='bus': r=r[(r.route_type=='3')&~night&~r.route_short_name.str.match(r'^o?P\d')]
else: r=r[(r.route_type=='3')&night]
allr=set(r.route_short_name)
sv=set(cd[(cd.date==DATE)&(cd.exception_type=='1')].service_id)
t=t[t.service_id.isin(sv)&t.route_id.isin(r.route_id)]
st=st[st.trip_id.isin(t.trip_id)&~st.stop_id.isin(stops[stops.stop_name=='przejazd techniczny'].stop_id)].copy(); st['ss']=st.stop_sequence.astype(int)  # technical pass point, not a passenger stop
st=st.sort_values(['trip_id','ss'])
# railway-station hubs: 'Dw. Łódź X' and every 'Street-Dw. Łódź X' within HUB_M m become one stop at their centroid,
# otherwise LOOM draws each platform as its own node and the terminal loops between them as spaghetti (Fabryczna)
# explicit hubs (HUBS env, JSON list of stop_id lists) come first: Fabryczna is four platform groups around one
# terminal loop - station, Rodziny Poznańskich west and east, pl. Dąbrowskiego (Narutowicza + Sterlinga, which topo
# would merge anyway); fisheye.py's local lens then gives octi room to draw them as a square
HUBS=json.loads(os.environ.get('HUBS','[["2999","2995","2998"],["2989","2990","2991","2992"],["3015","3002","3003"],["769","763","760"]]'))
HUB_M=250; used=stops[stops.stop_id.isin(st.stop_id)].copy(); used['lo']=used.stop_lon.astype(float); used['la']=used.stop_lat.astype(float)
hub={}
for ids in HUBS:
    m=used[used.stop_id.isin(ids)]
    if m.empty: continue
    rep=[i for i in ids if i in set(m.stop_id)][0]; hub.update({i:rep for i in m.stop_id})
    stops.loc[stops.stop_id==rep,['stop_lon','stop_lat']]=['%.6f'%m.lo.mean(),'%.6f'%m.la.mean()]
    print('hub',m[m.stop_id==rep].stop_name.iloc[0],list(m.stop_id))
used=used[~used.stop_id.isin(hub)]
for h,hs in used[used.stop_name.str.startswith('Dw. Łódź ')].groupby('stop_name'):
    near=lambda z: min(((z.lo-x)*69000)**2+((z.la-y)*111320)**2 for x,y in zip(hs.lo,hs.la))**.5<=HUB_M
    m=pd.concat([hs,used[used.stop_name.str.endswith('-'+h)&used.apply(near,axis=1)]])
    rep=hs.stop_id.iloc[0]; hub.update({i:rep for i in m.stop_id})
    stops.loc[stops.stop_id==rep,['stop_lon','stop_lat']]=['%.6f'%m.lo.mean(),'%.6f'%m.la.mean()]
    print('hub',h,'<-',sorted(set(m.stop_name)-{h}),len(m),'stops')
st['stop_id']=st.stop_id.replace(hub); st=st[st.stop_id!=st.groupby('trip_id').stop_id.shift()]  # collapse repeats inside a hub
t=t.join(st.groupby('trip_id').stop_id.agg('|'.join).rename('pat'),on='trip_id')
cnt=t.groupby('route_id').size(); rare=set(cnt[cnt<6].index)
t=t[~t.route_id.isin(rare)]
keep=[]
for (rid,d),g in t.groupby(['route_id','direction_id']):
    vc=g.pat.value_counts(); n=len(g)
    ok=[p for p,c in vc.items() if c/n>=0.25] or [vc.index[0]]
    for p in ok: keep.append(g[g.pat==p].trip_id.iloc[0])   # one representative trip per kept pattern
tfull=t.copy()
t=t[t.trip_id.isin(keep)].drop(columns='pat')
r=r[r.route_id.isin(t.route_id)].copy()
key=lambda s_:(int(re.sub(r'\D','',s_) or 999),s_)
names=sorted(r.route_short_name,key=key)
idx={nm:i+1 for i,nm in enumerate(names)}
# placeholder colours (unique per line) - the real palette is assigned in the renderer
r['route_color']=r.route_short_name.map(lambda x:'%06X'%(idx[x]*16)); r['route_text_color']='FFFFFF'
sn=dict(zip(stops.stop_id,stops.stop_name)); slon=dict(zip(stops.stop_id,stops.stop_lon)); slat=dict(zip(stops.stop_id,stops.stop_lat)); rn=dict(zip(r.route_id,r.route_short_name))
info={}
for rid,g in tfull.groupby('route_id'):
    g0=g[g.direction_id==g.direction_id.min()]
    p=g0.pat.value_counts().index[0].split('|')
    pairs=set()
    for pp in g.pat.unique():
        q=pp.split('|'); pairs|={tuple(sorted((sn[a_],sn[b_]))) for a_,b_ in zip(q,q[1:])}
    ends={}
    for (d_,),gd in g.groupby(['direction_id']):
        vc=gd.pat.value_counts()
        for pp,c in vc.items():
            if c/len(gd)>=0.25 or pp==vc.index[0]:
                q=pp.split('|')
                for sid in (q[0],q[-1]): ends.setdefault(sn[sid],[sn[sid],float(slon[sid]),float(slat[sid])])
    info[rn[rid]]={'idx':idx[rn[rid]],'from':sn[p[0]],'to':sn[p[-1]],'trips':int(len(g)),'pairs':sorted(pairs),'ends':list(ends.values())}
st=st[st.trip_id.isin(t.trip_id)].drop(columns='ss')
stops=stops[stops.stop_id.isin(st.stop_id)]
sh=sh[sh.shape_id.isin(t.shape_id)]
miss=~t.shape_id.isin(sh.shape_id); print('trips without shape:',sorted(set(t[miss].route_id))); t.loc[miss,'shape_id']=''
os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(f'{OUT}/{f}')
json.dump(info,open(f'{OUT}/lines.json','w',encoding='utf-8'),ensure_ascii=False)
for n_,df in [('routes',r),('trips',t),('stop_times',st),('stops',stops),('shapes',sh),('calendar_dates',cd[cd.service_id.isin(t.service_id)]),('agency',rd('agency'))]:
    df.to_csv(f'{OUT}/{n_}.txt',index=False)
print(MODE,'routes',len(r),'patterns',len(t),'stops',len(stops),'| not shown:',sorted(allr-set(names)))
