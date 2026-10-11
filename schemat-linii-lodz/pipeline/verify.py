import json,re,sys,xml.etree.ElementTree as ET
ns='{http://www.w3.org/2000/svg}'
def clean(s):
    s=re.sub(r'\s*-\s*','-',s.strip()); s=re.sub(r'\s+',' ',s)
    return s.title() if s.isupper() and len(s)>4 else s
# verify.py [svg_dir]  -- env WORK, SUF as in run.sh, MAPS (default 'tram bus night'); svg_dir: check final svgs
# (lodz_<name><SUF>.svg) instead of out/. Also: every line listed at a stop must stop there by the timetable (data<SUF>/<m>/).
import os; W=os.environ.get('WORK','/home/claude'); SUF=os.environ.get('SUF','')
NAMES={'tram':'lodz_tramwaje','bus':'lodz_autobusy','night':'lodz_nocne'}
import pandas as pd
for m in os.environ.get('MAPS','tram bus night').split():
    info=json.load(open(f'{W}/data{SUF}/meta/{m}.json'))
    root=ET.parse(f'{sys.argv[1]}/{NAMES[m]}{SUF}.svg' if len(sys.argv)>1 else f'{W}/out{SUF}/{m}.svg').getroot()
    drawn={g.get('data-l'):len(g.findall(ns+'polyline')) for g in root.iter(ns+'g') if g.get('class')=='ln'}
    term={}
    for g in root.iter(ns+'g'):
        if g.get('class')=='lb':
            name=''.join(t.text for t in g.findall(ns+'text'))
            for c in g.findall(ns+'g'):
                if c.get('class')=='chip': term.setdefault(c.get('data-l'),[]).append(name)
    nolabel=sum(1 for p in root.iter(ns+'polygon'))-sum(1 for g in root.iter(ns+'g') if g.get('class')=='lb')
    miss=[n for n in info if not drawn.get(n)]
    bad=[]; tot=0
    norm=lambda x: re.sub(r'[\s-]','',x)
    for n,v in info.items():
        t=[norm(x) for x in term.get(n,[])]
        for e in v['ends']:
            tot+=1
            if norm(clean(e[0])) not in t and not any(norm(clean(e[0])) in x.split('/') for x in t): bad.append((n,clean(e[0]),term.get(n,[])))
    print(m,'lines',len(info),'drawn',sum(1 for n in info if drawn.get(n)),'missing',miss,'| stops without label',nolabel)
    print('  termini checked',tot,'mismatches:',len(bad)); [print('   ',b) for b in bad[:12]]
    rd=lambda f: pd.read_csv(f'{W}/data{SUF}/{m}/{f}.txt',dtype=str)
    x=rd('stop_times').merge(rd('trips')[['trip_id','route_id']]).merge(rd('routes')[['route_id','route_short_name']]).merge(rd('stops')[['stop_id','stop_name']])
    words=lambda v: frozenset(re.split(r'[\s-]+',clean(v).strip()))  # Kilińskiego-Piłsudskiego = Piłsudskiego-Kilińskiego
    at={L:{words(v) for v in g.stop_name} for L,g in x.groupby('route_short_name')}
    wrong=[]
    for g in root.iter(ns+'g'):
        if (g.get('class') or '').split()[:1]==['lb'] and g.get('data-l'):
            name=[words(n) for n in ' '.join(''.join(t.itertext()) for t in g.findall(ns+'text')).replace('- ','-').split('/')]
            for L in g.get('data-l').split():
                if L in at and not any(n in at[L] for n in name): wrong.append((L,' / '.join('-'.join(sorted(n)) for n in name)))
    print('  lines at a stop none of whose names they stop at (topo merges):',len(wrong)); [print('   ',w) for w in wrong[:int(os.environ.get('SHOW',40))]]
