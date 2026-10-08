# pdf.py <work> <suffix> <deliver_dir>  -- <work>/out<suffix>/<m>.svg -> <deliver_dir>/lodz_<name><suffix>.{svg,pdf}
# Prints with headless Chrome (env CHROME = path to the binary); page size comes from the CSS @page rule.
import sys, re, os, subprocess, pathlib
W, SUF, DST = sys.argv[1:4]
CHROME = os.environ.get('CHROME', 'chromium')
for m,name,wmm in [('tram','lodz_tramwaje',594),('bus','lodz_autobusy',1189),('night','lodz_nocne',841)]:
    s=open(f'{W}/out{SUF}/{m}.svg',encoding='utf-8').read()
    w,h=map(float,re.search(r'width="([\d.]+)" height="([\d.]+)"',s).groups()); hmm=wmm*h/w
    open(f'{DST}/{name}{SUF}.svg','w',encoding='utf-8',newline='\n').write(s)
    html=f'<!doctype html><meta charset="utf-8"><style>@page{{size:{wmm}mm {hmm:.1f}mm;margin:0}}html,body{{margin:0}}svg{{width:{wmm}mm;height:{hmm:.1f}mm;display:block}}</style>'+re.sub(r'(<svg[^>]*?) width="[^"]*" height="[^"]*"',r'\1',s,count=1)
    tmp=pathlib.Path(f'{W}/out{SUF}/_p.html').resolve(); tmp.write_text(html,encoding='utf-8')
    pdf=pathlib.Path(f'{DST}/{name}{SUF}.pdf').resolve()
    subprocess.run([CHROME,'--headless=new','--disable-gpu','--no-pdf-header-footer','--virtual-time-budget=1500',
                    f'--user-data-dir={pathlib.Path(W).resolve()}/chrome-profile',  # don't attach to a running browser
                    f'--print-to-pdf={pdf}',tmp.as_uri()],check=True,capture_output=True,timeout=300)
    assert pdf.exists() and pdf.stat().st_size>10000, f'no pdf for {name}'
    print(name+SUF,wmm,round(hmm),pdf.stat().st_size//1024,'KB')
