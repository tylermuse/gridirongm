"""Render motion.html frame by frame (deterministic) -> MP4.
   python3 render.py wide|square [--stills 1.2,4,...]"""
import asyncio, sys, subprocess, os
from playwright.async_api import async_playwright
FPS = 30
async def main():
    mode = sys.argv[1]
    W, H = (1280, 720) if mode == "wide" else (720, 720)
    SCALE = 1.5
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--force-color-profile=srgb"])
        pg = await b.new_page(viewport={"width": W, "height": H}, device_scale_factor=SCALE)
        await pg.goto(f"file://{os.path.abspath('motion.html')}?mode={mode}")
        await pg.wait_for_load_state("networkidle")
        await pg.evaluate("document.fonts.ready")
        await pg.evaluate("window.READY")
        stage = pg.locator("#stage")
        if "--stills" in sys.argv:
            os.makedirs("stills", exist_ok=True)
            for ts in sys.argv[sys.argv.index("--stills") + 1].split(","):
                await pg.evaluate(f"render({ts})")
                await stage.screenshot(path=f"stills/{mode}_{ts}.jpg", type="jpeg", quality=88)
            await b.close(); return
        dur = await pg.evaluate("DURATION")
        n = round(dur * FPS)
        tmp, out = f"motion-{mode}.tmp.mp4", f"motion-{mode}-master.mp4"
        ff = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", str(FPS),
                               "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-crf", "14", "-preset", "veryfast",
                               "-pix_fmt", "yuv420p", tmp], stdin=subprocess.PIPE)
        for i in range(n):
            await pg.evaluate(f"render({i / FPS})")
            ff.stdin.write(await stage.screenshot(type="jpeg", quality=95))
        ff.stdin.close()
        if ff.wait() == 0: os.replace(tmp, out)
        print(out, n, "frames")
        await b.close()
asyncio.run(main())
