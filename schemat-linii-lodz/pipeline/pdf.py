# pdf.py <work> <suffix> <deliver_dir>  -- <work>/out<suffix>/<m>[.poster].svg -> <deliver_dir>/lodz_<name><suffix>.{svg,pdf}
#   and the dark variant                                    -> <deliver_dir>/lodz_<name><suffix>_ciemny.{svg,pdf}
# Prints with headless Chrome (env CHROME = path to the binary); page size comes from the CSS @page rule.
import sys, re, os, subprocess, pathlib, colorsys
# same as build_page.darkv
def rgb(h): return tuple(int(h[i:i+2],16) for i in (0,2,4))
def lum(h): r,g,b_=rgb(h); return 0.299*r+0.587*g+0.114*b_
def darkv(h):
    r,g,b_=[v/255 for v in rgb(h)]; H,L,S=colorsys.rgb_to_hls(r,g,b_)
    if S<0.15: L=max(L,0.80)
    elif L<0.58: L=0.62; S=min(S,0.85)
    r,g,b_=colorsys.hls_to_rgb(H,L,S); return '%02X%02X%02X'%(int(r*255),int(g*255),int(b_*255))
tc=lambda h: '#111' if lum(h)>165 else '#fff'
# neutral colours of the light drawing -> dark theme (keys lower-case, whole-token match)
NEUT={'#fff':'#12151a','#ffffff':'#12151a','#16181d':'#e8eaee','#5b6270':'#98a0ae',
      '#f3f4f6':'#1b1f26','#d5d9e0':'#2c313a','#c8102e':'#ff5a6e','#111':'#111',
      # orientation layer (render.py LANDMARKS): railway, its labels, district names, ul. Piotrkowska, pictograms
      '#9ba2ad':'#737c8a','#7a818d':'#8e96a3','#e2e5ea':'#232831','#ebdfc4':'#4a4231','#9c8350':'#c2a76e',
      '#3b4250':'#c3c9d2','#1e5bb8':'#5b9bf5','#f1eef7':'#1a1822','#a18bd0':'#9a86cc','#8a75bd':'#a08fd0',
      '#dcecd6':'#16261a','#5c8a52':'#7fb173','#c9b48a':'#8a7752'}
def dark_svg(s):
    s=re.sub(r'#[0-9a-fA-F]{3,6}(?![0-9a-fA-F])', lambda m: NEUT.get(m.group(0).lower(), m.group(0)), s)
    cols={d:c[1:] for d,c in re.findall(r'<g class="ln" data-l="([^"]+)"[^>]*? stroke="(#[0-9a-fA-F]{6})"', s)}
    s=re.sub(r'(<g class="ln" data-l="([^"]+)"[^>]*? stroke=)"#[0-9a-fA-F]{6}"', lambda m: f'{m.group(1)}"#{darkv(cols[m.group(2)])}"', s)
    def chip(m):
        d=darkv(cols[m.group(1)]); g=re.sub(r' fill="#[0-9a-fA-F]{6}"', f' fill="#{d}"', m.group(0), count=1)
        return re.sub(r'style="fill:[^"]*"', f'style="fill:{tc(d)}"', g)
    s=re.sub(r'<g class="chip" data-l="([^"]+)">.*?</g>', chip, s, flags=re.S)
    return re.sub(r'(<tspan class="lln" data-l="([^"]+)"[^>]*? fill=)"#[0-9a-fA-F]{6}"', lambda m: f'{m.group(1)}"#{darkv(cols[m.group(2)])}"', s)

def emit(s, base, wmm):  # writes <DST>/<base>.svg and prints <DST>/<base>.pdf
    w,h=map(float,re.search(r'width="([\d.]+)" height="([\d.]+)"',s).groups()); hmm=wmm*h/w
    open(f'{DST}/{base}.svg','w',encoding='utf-8',newline='\n').write(s)
    html=f'<!doctype html><meta charset="utf-8"><style>@page{{size:{wmm}mm {hmm:.1f}mm;margin:0}}html,body{{margin:0}}svg{{width:{wmm}mm;height:{hmm:.1f}mm;display:block}}</style>'+re.sub(r'(<svg[^>]*?) width="[^"]*" height="[^"]*"',r'\1',s,count=1)
    tmp=pathlib.Path(f'{W}/out{SUF}/_p.html').resolve(); tmp.write_text(html,encoding='utf-8')
    pdf=pathlib.Path(f'{DST}/{base}.pdf').resolve()
    subprocess.run([CHROME,'--headless=new','--disable-gpu','--no-pdf-header-footer','--virtual-time-budget=1500',
                    f'--user-data-dir={pathlib.Path(W).resolve()}/chrome-profile',  # don't attach to a running browser
                    f'--print-to-pdf={pdf}',tmp.as_uri()],check=True,capture_output=True,timeout=300)
    assert pdf.exists() and pdf.stat().st_size>10000, f'no pdf for {base}'
    print(base,wmm,round(hmm),pdf.stat().st_size//1024,'KB')

if __name__=='__main__':
    W, SUF, DST = sys.argv[1:4]
    CHROME = os.environ.get('CHROME', 'chromium')
    for m,name,wmm in [('tram','lodz_tramwaje',594),('bus','lodz_autobusy',1189),('night','lodz_nocne',594)]:
        f=f'{W}/out{SUF}/{m}'; s=open(f+'.poster.svg' if os.path.exists(f+'.poster.svg') else f+'.svg',encoding='utf-8').read()  # framed poster when render.py made one
        emit(s,name+SUF,wmm)
        emit(dark_svg(s),name+SUF+'_ciemny',wmm)
