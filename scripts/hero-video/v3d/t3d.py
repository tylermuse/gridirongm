import asyncio, time, sys
from playwright.async_api import async_playwright
URL = "https://bs-football.com/chase-cam/index.html?model=mh2&motion=2&speed=1.5&run=1.33&look=2"
CSS = """header,.panel,#modelCredit,.hint{display:none!important} body{padding:0!important;margin:0;background:#000}
.wrap{max-width:none!important;gap:0!important} .stage{position:fixed!important;inset:0;width:100vw!important;height:100vh!important;max-height:none!important;border:0!important;border-radius:0!important;aspect-ratio:auto!important}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
        await ctx.add_init_script(path="vt.js")
        pg = await ctx.new_page()
        pg.on("console", lambda m: m.type == "error" and print("console:", m.text[:150]))
        t0 = time.time()
        await pg.goto(URL, wait_until="load", timeout=120000)
        await pg.wait_for_function("document.getElementById('hint') && /Pre-snap/.test(document.getElementById('hint').textContent)", timeout=180000)
        print("ready", round(time.time() - t0, 1))
        opts = await pg.evaluate("[...document.querySelectorAll('#teamA option')].map(o=>o.value+':'+o.textContent).slice(0,40)")
        print(opts)
        await pg.add_style_tag(content=CSS)
        await pg.evaluate("dispatchEvent(new Event('resize'))")
        await pg.wait_for_timeout(1500)
        await pg.evaluate("__vtStart()")
        for k in range(3): await pg.evaluate("__vtStep(1000/30)")
        await pg.evaluate("document.querySelector('[data-force=bomb]').click()")
        t1 = time.time()
        for i in range(24):
            n = await pg.evaluate("__vtStep(1000/30)")
            if i % 6 == 0:
                await pg.screenshot(path=f"f{i:03d}.jpg", type="jpeg", quality=85)
            else:
                await pg.screenshot(type="jpeg", quality=85)
        print("per frame", round((time.time() - t1) / 24, 2), "s; rafs", n)
        await b.close()
asyncio.run(main())
