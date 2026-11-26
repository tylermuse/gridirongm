import asyncio, re, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width":1280,"height":1500}, device_scale_factor=3)
        await pg.goto("https://bs-football.com/mock-draft", wait_until="networkidle", timeout=90000)
        await pg.get_by_text(re.compile(r"^TEN 1-9")).first.click()
        await pg.get_by_role("button", name="Start draft").click()
        await pg.wait_for_timeout(3000)
        await pg.evaluate("""() => { for (const el of document.querySelectorAll('button,a')) if ((el.innerText||'').trim()==='Feedback') el.style.display='none'; }""")
        lis = pg.locator("li:has(button:text-is('Scout'))")
        await lis.first.scroll_into_view_if_needed(); await pg.wait_for_timeout(1500)
        meta = {}
        # the list card (rounded box holding the rows) for corner radius / width reference
        for i in range(6):
            el = lis.nth(i); bb = await el.bounding_box()
            await el.screenshot(path=f"assets/pros{i}.png"); meta[f"pros{i}"] = bb
        await lis.first.get_by_role("button", name="Scout", exact=True).click()
        await pg.wait_for_timeout(2000)
        el = pg.locator("li:has(button:text-is('Hide'))").first
        bb = await el.bounding_box(); print("expanded", bb)
        await el.screenshot(path="assets/pros0_open.png"); meta["pros0_open"] = bb
        json.dump(meta, open("assets/meta_mock.json", "w"), indent=1)
        await b.close()
asyncio.run(main())
