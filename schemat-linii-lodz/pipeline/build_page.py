# build_page.py <work> <page_tpl.html> <diff.json> <out.html>
# Reads <work>/out<SUF>/<m>.svg + .lines.json for both states (SUF '' = from 5.10.2026, '_przed' = before).
import json, re, sys
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
        svgs[key]=themed(s,{m_['n']:m_['c'] for m_ in meta[key]})
ids=re.findall(r' id="([^"]+)"',''.join(svgs.values()))
dup={i for i in ids if ids.count(i)>1}; assert not dup, f'duplicate svg ids across panes: {sorted(dup)[:5]}'
tabs=''.join(f'<button class="tab" role="tab" id="tab-{k}" data-map="{k}" aria-selected="{"true" if i==0 else "false"}"><span data-i18n="tab{k.capitalize()}">{n}</span><span class="cnt">{len(meta[k])}</span></button>' for i,(k,n) in enumerate(MAPS))
panes=''.join(f'<div class="pane" id="pane-{k}" {"" if k=="tram" else "hidden"}>{svgs[k]}</div>' for k in svgs)
diff=json.load(open(DIFF,encoding='utf-8'))
html=(open(TPL,encoding='utf-8').read().replace('/*TABS*/',tabs).replace('<!--PANES-->',panes)
      .replace('/*META*/',json.dumps(meta,ensure_ascii=False)).replace('/*DIFF*/',json.dumps(diff,ensure_ascii=False)))
open(OUT,'w',encoding='utf-8',newline='\n').write(html); print(OUT, len(html)//1024,'KB')
