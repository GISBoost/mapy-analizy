import sys, re, asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for m,name,wmm in [('tram','lodz_tramwaje',594),('bus','lodz_autobusy',1189),('night','lodz_nocne',841)]:
            s=open(f'/home/claude/out/{m}.svg').read()
            w,h=map(float,re.search(r'width="([\d.]+)" height="([\d.]+)"',s).groups()); hmm=wmm*h/w
            open(f'/home/claude/deliver/{name}.svg','w').write(s)
            html=f'<!doctype html><meta charset="utf-8"><style>@page{{size:{wmm}mm {hmm:.1f}mm;margin:0}}html,body{{margin:0}}svg{{width:{wmm}mm;height:{hmm:.1f}mm;display:block}}</style>'+re.sub(r'(<svg[^>]*?) width="[^"]*" height="[^"]*"',r'\1',s,count=1)
            open('/home/claude/out/_p.html','w').write(html)
            pg=await b.new_page(); await pg.goto('file:///home/claude/out/_p.html'); await pg.wait_for_timeout(1500)
            await pg.pdf(path=f'/home/claude/deliver/{name}.pdf',width=f'{wmm}mm',height=f'{hmm:.1f}mm',print_background=True,prefer_css_page_size=True)
            await pg.close(); print(name,wmm,round(hmm))
        await b.close()
asyncio.run(main())
