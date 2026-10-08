import json, re, sys
O='/home/claude/out/'
MAPS=[('tram','Tramwaje',sys.argv[1]),('bus','Autobusy',sys.argv[2]),('night','Nocne',sys.argv[3])]
import colorsys
def rgb(h): return tuple(int(h[i:i+2],16) for i in (0,2,4))
def lum(h): r,g,b_=rgb(h); return 0.299*r+0.587*g+0.114*b_
def darkv(h):
    r,g,b_=[v/255 for v in rgb(h)]; H,L,S=colorsys.rgb_to_hls(r,g,b_)
    if S<0.15: L=max(L,0.80)
    elif L<0.58: L=0.62; S=min(S,0.85)
    r,g,b_=colorsys.hls_to_rgb(H,L,S); return '%02X%02X%02X'%(int(r*255),int(g*255),int(b_*255))
tc=lambda h: '#111' if lum(h)>165 else '#fff'
def themed(s,cols):
    v=lambda n: f'--c:#{cols[n]};--cd:#{darkv(cols[n])};--t:{tc(cols[n])};--td:{tc(darkv(cols[n]))}'
    s=re.sub(r'<g class="(ln|chip)" data-l="([^"]+)"', lambda m: f'<g class="{m.group(1)}" data-l="{m.group(2)}" style="{v(m.group(2))}"', s)
    s=re.sub(r'<tspan class="lln" data-l="([^"]+)"([^>]*?) fill="(#[0-9a-f]+)"', lambda m: f'<tspan class="lln" data-l="{m.group(1)}"{m.group(2)} style="--c:{m.group(3)};--cd:#{darkv(cols[m.group(1)])}"', s)
    return s
svgs={}; meta={}
for key,_,src in MAPS:
    s=open(O+src+'.svg').read()
    s=re.sub(r'(<svg[^>]*?) width="[^"]*" height="[^"]*"', r'\1', s, count=1)
    s=s.replace('<svg ', f'<svg id="svg-{key}" class="map" preserveAspectRatio="xMidYMid meet" ',1)
    s=re.sub(r'<style>.*?</style>','',s,count=1,flags=re.S)
    meta[key]=json.load(open(O+src+'.lines.json'))
    for m_ in meta[key]: m_['d']=darkv(m_['c']); m_['td']=tc(m_['d'])
    svgs[key]=themed(s,{m_['n']:m_['c'] for m_ in meta[key]})
tabs=''.join(f'<button class="tab" role="tab" id="tab-{k}" data-map="{k}" aria-selected="{"true" if i==0 else "false"}"><span data-i18n="tab{k.capitalize()}">{n}</span><span class="cnt">{len(meta[k])}</span></button>' for i,(k,n,_) in enumerate(MAPS))
panes=''.join(f'<div class="pane" id="pane-{k}" {"" if i==0 else "hidden"}>{svgs[k]}</div>' for i,(k,_,_) in enumerate(MAPS))
html=open('/home/claude/page_tpl.html').read().replace('/*TABS*/',tabs).replace('<!--PANES-->',panes).replace('/*META*/',json.dumps(meta,ensure_ascii=False))
open('/home/claude/page/lodz-schemat.html','w').write(html); print(len(html)//1024,'KB')
import os; os.makedirs('/home/claude/site',exist_ok=True)
open('/home/claude/site/index.html','w').write('<!doctype html>\n<html lang="pl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n'+html+'\n</body>\n</html>\n')
