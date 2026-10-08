import json,re,sys,xml.etree.ElementTree as ET
ns='{http://www.w3.org/2000/svg}'
def clean(s):
    s=re.sub(r'\s*-\s*','-',s.strip()); s=re.sub(r'\s+',' ',s)
    return s.title() if s.isupper() and len(s)>4 else s
# verify.py [svg_dir]  -- env WORK, SUF as in run.sh; svg_dir: check final svgs (lodz_<name><SUF>.svg) instead of out/
import os; W=os.environ.get('WORK','/home/claude'); SUF=os.environ.get('SUF','')
NAMES={'tram':'lodz_tramwaje','bus':'lodz_autobusy','night':'lodz_nocne'}
for m in ['tram','bus','night']:
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
            if norm(clean(e[0])) not in t: bad.append((n,clean(e[0]),term.get(n,[])))
    print(m,'lines',len(info),'drawn',sum(1 for n in info if drawn.get(n)),'missing',miss,'| stops without label',nolabel)
    print('  termini checked',tot,'mismatches:',len(bad)); [print('   ',b) for b in bad[:12]]
