import asyncio, re, os, sys, json
from playwright.async_api import async_playwright
import cap as C
from assets import card, meta, OUT, BASE
TEAM = sys.argv[1]
async def main():
    async with async_playwright() as p:
        if TEAM == "Buffalo":
            b, pg = await C.new_league(p, BASE, TEAM)
            await C.nav(pg, "Trades")
            await pg.get_by_role("button", name=re.compile("Trade Finder")).click(); await pg.wait_for_timeout(2500)
            for i in range(3): await card(pg, f"btrade{i}", r"^Your #\d need is", 60, 260, nth=i)
            await b.close(); return
        for attempt in range(5):
            b, pg = await C.new_league(p, BASE, TEAM)
            await pg.get_by_role("button", name="Watch Live").first.click(); await pg.wait_for_timeout(2500)
            await pg.get_by_role("button", name="Kick Off").click(); await pg.wait_for_timeout(800)
            tog = pg.get_by_role("button", name=re.compile("3D Sim"))
            if "ON" in await tog.first.inner_text(): await tog.first.click()
            await pg.get_by_role("button", name="5x", exact=True).first.click()
            await pg.get_by_role("button", name="Deep Shot").wait_for(timeout=150000)
            await pg.get_by_role("button", name="1x", exact=True).first.click()
            await pg.wait_for_timeout(1200)
            await card(pg, "callplay", r"^Call the Play$", 150, 700)
            await card(pg, "scoreboard", r"^\d+:\d\d$", 50, 200)
            await pg.get_by_role("button", name="Deep Shot").click()
            hit = False
            for _ in range(30):
                await pg.wait_for_timeout(200)
                if await pg.get_by_text(re.compile(r"1ST DOWN \(\+\d+\)|TOUCHDOWN")).count():
                    hit = True; break
            print("attempt", attempt, "hit", hit)
            if hit:
                await pg.wait_for_timeout(300)
                await card(pg, "firstdown", r"1ST DOWN \(\+\d+\)|TOUCHDOWN", 15, 80)
                await card(pg, "scoreboard_after", r"^\d+:\d\d$", 50, 200)
                await card(pg, "field", r"^SOFT ZONE$|^OWN \d+$", 200, 600)
                await pg.screenshot(path=f"{OUT}/_game_page.jpg", type="jpeg", quality=70)
                # 3D stills
                await pg.get_by_role("button", name="Deep Shot").wait_for(timeout=60000)
                await tog.first.click()
                for _ in range(40):
                    await pg.wait_for_timeout(1500)
                    if not await pg.get_by_text(re.compile("Loading 3D|LOADING PLAYERS")).count(): break
                await pg.wait_for_timeout(4000)
                cv = pg.locator("canvas").first
                for i in range(3):
                    await C.clean(pg)
                    await cv.screenshot(path=f"{OUT}/3d_{i}.png")
                await pg.get_by_role("button", name="Run").first.click()
                for i in range(3, 7):
                    await cv.screenshot(path=f"{OUT}/3d_{i}.png")
                json.dump(meta, open(f"{OUT}/meta_game.json", "w"), indent=1)
                await b.close(); break
            await b.close()
asyncio.run(main())
