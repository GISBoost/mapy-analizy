import sys, asyncio
from playwright.async_api import async_playwright
# crop.py svg out x y w h pxwidth  (svg user units)
async def main(src,dst,x,y,w,h,pw):
    x,y,w,h,pw=map(float,(x,y,w,h,pw))
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={'width':int(pw),'height':int(pw*h/w)})
        await pg.goto('file://'+src)
        await pg.evaluate(f"""()=>{{const s=document.querySelector('svg');s.setAttribute('viewBox','{x} {y} {w} {h}');s.setAttribute('width','100vw');s.setAttribute('height','100vh');s.style.background='#fff';document.body&&(document.body.style.margin='0')}}""")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=dst)
        await b.close()
asyncio.run(main(*sys.argv[1:8]))
