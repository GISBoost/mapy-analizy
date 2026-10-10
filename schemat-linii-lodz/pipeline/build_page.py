# build_page.py <work> <page_tpl.html> <diff.json> <out.html>
# Reads <work>/out<SUF>/<m>.svg + .lines.json for both states (SUF '' = from 5.10.2026, '_przed' = before).
# Each diagram goes to its own <out dir>/mapy/<m><SUF>.svg, fetched by the page when its tab is first opened.
import json, re, sys, os, hashlib
W, TPL, DIFF, OUT = sys.argv[1:5]
MAPS=[('tram','Tramwaje'),('bus','Autobusy'),('night','Nocne')]
STATES=['','_przed']
import colorsys
def rgb(h): return tuple(int(h[i:i+2],16) for i in (0,2,4))
def lum(h): r,g,b_=rgb(h); return 0.299*r+0.587*g+0.114*b_
def darkv(h):
    r,g,b_=[v/255 for v in rgb(h)]; H,L,S=colorsys.rgb_to_hls(r,g,b_)
    if S<0.15: L=max(L,0.80)
    elif L<0.58: L=0.62; S=min(S,0.85)
    r,g,b_=colorsys.hls_to_rgb(H,L,S); return '%02X%02X%02X'%(int(r*255),int(g*255),int(b_*255))
def merge(s):  # all polylines of a group -> one path: subpaths keep their own caps, the look is the same, far fewer DOM nodes
    def g(m): return m.group(1) + '<path d="' + ''.join('M' + p.replace(' ', 'L') for p in re.findall(r'<polyline points="([^"]+)"/>', m.group(2))) + '"/>\n' + m.group(3)
    return re.sub(r'(<g [^>]*>\n)((?:<polyline points="[^"]+"/>\n)+)(</g>)', g, s)
from pdf import NEUT  # light -> dark colours of the print downloads; the orientation layer's ones also theme the page
BASE={'#fff','#ffffff','#16181d','#5b6270','#f3f4f6','#d5d9e0','#c8102e','#111'}  # these the page themes by class
def lmcss():  # dark theme of the orientation layer: its colours are attributes, so they are matched by value
    r=[f'svg.map [{a}="{k}" i]{{{a}:{v}}}' for k,v in NEUT.items() if k not in BASE for a in ('fill','stroke')]+[f'svg.map .lb.rl text{{fill:{NEUT["#7a818d"]}}}']
    return '@media (prefers-color-scheme: dark){'+''.join(':root:not([data-theme="light"]) '+x for x in r)+'}\n'+''.join(':root[data-theme="dark"] '+x for x in r)
tc=lambda h: '#111' if lum(h)>165 else '#fff'
def themed(s,cols):
    v=lambda n: f'--c:#{cols[n]};--cd:#{darkv(cols[n])};--t:{tc(cols[n])};--td:{tc(darkv(cols[n]))}'
    s=re.sub(r'<g class="(ln|chip)" data-l="([^"]+)"', lambda m: f'<g class="{m.group(1)}" data-l="{m.group(2)}" style="{v(m.group(2))}"', s)
    s=re.sub(r'<tspan class="lln" data-l="([^"]+)"([^>]*?) fill="(#[0-9a-f]+)"', lambda m: f'<tspan class="lln" data-l="{m.group(1)}"{m.group(2)} style="--c:{m.group(3)};--cd:#{darkv(cols[m.group(1)])}"', s)
    return s
svgs={}; meta={}
for suf in STATES:
    for m,_ in MAPS:
        key=m+suf; O=f'{W}/out{suf}/{m}'
        s=open(O+'.svg',encoding='utf-8').read()
        s=re.sub(r'(<svg[^>]*?) width="[^"]*" height="[^"]*"', r'\1', s, count=1)
        s=s.replace('<svg ', f'<svg id="svg-{key}" class="map" preserveAspectRatio="xMidYMid meet" ',1)
        s=re.sub(r'<style>.*?</style>','',s,count=1,flags=re.S)
        meta[key]=json.load(open(O+'.lines.json',encoding='utf-8'))
        for m_ in meta[key]: m_['d']=darkv(m_['c']); m_['td']=tc(m_['d'])
        svgs[key]=merge(themed(s,{m_['n']:m_['c'] for m_ in meta[key]}))
ids=re.findall(r' id="([^"]+)"',''.join(svgs.values()))
dup={i for i in ids if ids.count(i)>1}; assert not dup, f'duplicate svg ids across panes: {sorted(dup)[:5]}'
tabs=''.join(f'<button class="tab" role="tab" id="tab-{k}" data-map="{k}" aria-selected="{"true" if i==0 else "false"}"><span data-i18n="tab{k.capitalize()}">{n}</span><span class="cnt">{len(meta[k])}</span></button>' for i,(k,n) in enumerate(MAPS))
os.makedirs(os.path.join(os.path.dirname(OUT),'mapy'),exist_ok=True); urls={}
for k,s in svgs.items():
    open(os.path.join(os.path.dirname(OUT),'mapy',k+'.svg'),'w',encoding='utf-8',newline='\n').write(s)
    urls[k]=f'mapy/{k}.svg?v={hashlib.sha1(s.encode()).hexdigest()[:8]}'  # a new URL when the map changes: no cached old map next to a new page
panes=''.join(f'<div class="pane" id="pane-{k}" {"" if k=="tram" else "hidden"}></div>' for k in svgs)
diff=json.load(open(DIFF,encoding='utf-8'))
html=(open(TPL,encoding='utf-8').read().replace('/*TABS*/',tabs).replace('<!--PANES-->',panes)
      .replace('/*META*/',json.dumps(meta,ensure_ascii=False)).replace('/*SVGS*/',json.dumps(urls)).replace('/*LMCSS*/',lmcss()).replace('/*DIFF*/',json.dumps(diff,ensure_ascii=False)))
open(OUT,'w',encoding='utf-8',newline='\n').write(html); print(OUT, len(html)//1024,'KB')
