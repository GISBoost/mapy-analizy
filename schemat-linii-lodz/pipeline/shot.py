import sys, asyncio
from playwright.async_api import async_playwright
async def main(src,dst,w,clip=None):
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/opt/pw-browsers/chromium' if False else None)
        pg=await b.new_page(viewport={'width':int(w),'height':int(w)})
        await pg.goto('file://'+src)
        if src.endswith('.svg'):
            await pg.evaluate("""()=>{const s=document.documentElement;const w=s.getAttribute('width'),h=s.getAttribute('height');if(!s.getAttribute('viewBox'))s.setAttribute('viewBox',`0 0 ${parseFloat(w)} ${parseFloat(h)}`);s.setAttribute('width','100vw');s.setAttribute('height','100vh');s.style.background='#fff'}""")
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=dst)
        await b.close()
asyncio.run(main(*sys.argv[1:4]))
