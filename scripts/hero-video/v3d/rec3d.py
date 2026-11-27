"""Record one full 3D play from /chase-cam with a virtual clock -> frames/<name>/NNNNN.jpg (30 fps)."""
import asyncio, time, sys, os
from playwright.async_api import async_playwright
name, force, cam = sys.argv[1], sys.argv[2], sys.argv[3]
DPR = float(sys.argv[4]) if len(sys.argv) > 4 else 1.25
URL = "https://bs-football.com/chase-cam/index.html?model=mh2&motion=2&speed=1.5&run=1.33&look=2"
CSS = open("t3d.py").read().split('CSS = """')[1].split('"""')[0]
async def main():
    out = f"frames/{name}"; os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 1280, "height": 720}, device_scale_factor=DPR)
        await ctx.add_init_script(path="vt.js")
        pg = await ctx.new_page()
        await pg.goto(URL, wait_until="load", timeout=120000)
        await pg.wait_for_function("/Pre-snap/.test(document.getElementById('hint')?.textContent||'')", timeout=180000)
        await pg.add_style_tag(content=CSS)
        await pg.evaluate(f"document.querySelector('[data-cam={cam}]').click()")
        await pg.evaluate("dispatchEvent(new Event('resize'))")
        await pg.wait_for_timeout(2000)
        await pg.evaluate("__vtStart()")
        lead = 18   # pre-snap frames before the call
        t0 = time.time(); i = 0; done_at = None
        while True:
            if i == lead:
                await pg.evaluate(f"document.querySelector('[data-force={force}]').click()")
            await pg.evaluate("__vtStep(1000/30)")
            await pg.screenshot(path=f"{out}/{i:05d}.jpg", type="jpeg", quality=92)
            busy = await pg.evaluate("document.querySelector('[data-call]').disabled")
            if i > lead + 15 and not busy and done_at is None: done_at = i
            i += 1
            if done_at is not None and i >= done_at + 10: break
            if i > 30 * 16: break
            if i % 30 == 0: print(name, i, "frames", round((time.time() - t0) / i, 2), "s/frame", flush=True)
        print(name, "DONE", i, "frames")
        await b.close()
asyncio.run(main())
