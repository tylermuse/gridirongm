"""Record one Court Cam possession with a virtual clock -> frames/<name>/NNNNN.jpg at 30 fps.
   python3 rec.py <name> <playtype> <force> <cam> [seconds]"""
import asyncio, time, sys, os
from playwright.async_api import async_playwright
name, pt, force, cam = sys.argv[1:5]
SECS = float(sys.argv[5]) if len(sys.argv) > 5 else 10
URL = "https://www.bs-basketball.com/court-cam/index.html?qa=1"
async def main():
    out = f"frames/{name}"; os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 1280, "height": 720}, device_scale_factor=1.25)
        await ctx.add_init_script(path="vt.js")
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: print("pageerror", str(e)[:120]))
        await pg.goto(URL, wait_until="load", timeout=120000)
        await pg.wait_for_function("(document.getElementById('hint')?.textContent||'Loading') !== 'Loading'", timeout=240000)
        print("hint:", await pg.evaluate("document.getElementById('hint').textContent"), flush=True)
        await pg.evaluate("document.body.classList.add('embed'); document.getElementById('hint').style.opacity='0'; dispatchEvent(new Event('resize'))")
        await pg.evaluate(f"document.querySelector('[data-cam={cam}]').click(); document.querySelector('[data-force={force}]').click()")
        await pg.wait_for_timeout(2500)
        await pg.wait_for_function("window.__ready === true && !__sim.GS.busy", timeout=300000)
        await pg.evaluate("__vtStart()")
        lead, n = 12, int(SECS * 30); t0 = time.time()
        for i in range(n):
            if i == lead:
                await pg.evaluate(f"__sim.run(__sim.demo({{pt: '{pt}', kind: '{force}'}}))")
            await pg.evaluate("__vtStep(1000/30)")
            await pg.screenshot(path=f"{out}/{i:05d}.jpg", type="jpeg", quality=92)
            if i > lead + 30 and not await pg.evaluate("__sim.GS.busy"):
                end = (end if 'end' in dir() else i)
            if 'end' in dir() and i >= end + 20: break
            if i % 30 == 29: print(name, i + 1, "frames", round((time.time() - t0) / (i + 1), 2), "s/frame", flush=True)
        print(name, "DONE", flush=True)
        await b.close()
asyncio.run(main())
