"""BS Hoops UI cut-outs (3x) for the hero video."""
import asyncio, re, json, sys
from playwright.async_api import async_playwright
exec(open("cardjs.py").read())
HIDE = r"""() => { const kill=[/NEW EPISODE/, /THE BOOTH/, /^Feedback/, /^Join the Community/];
  for (const r of kill) { let best=null; for (const el of document.querySelectorAll('body *')) { if (!el.offsetParent || el.offsetHeight>330) continue;
    if (r.test((el.innerText||'').trim()) && (!best || el.offsetHeight>best.offsetHeight)) best=el; } if (best) best.style.visibility='hidden'; } }"""
OUT="assets"; meta={}
async def shot(pg, name, box):
    clip={k: box[k] for k in ("x","y","width","height")}
    await pg.screenshot(path=f"{OUT}/{name}.png", clip=clip); meta[name]=box; print("ok", name, round(box["width"]), round(box["height"]), flush=True)
async def card(pg, name, pat, minH=40, maxH=900, nth=0):
    await pg.evaluate(HIDE); await pg.wait_for_timeout(300)
    box = await pg.evaluate(CARD_JS, [pat, minH, maxH, nth])
    if not box: print("MISSING", name); return
    await pg.wait_for_timeout(400); box = await pg.evaluate(CARD_JS, [pat, minH, maxH, nth]); await shot(pg, name, box)
ROW_JS = r"""([name, withNext]) => { const td=[...document.querySelectorAll('tr')].find(r => r.innerText.includes(name));
  if (!td) return null; td.scrollIntoView({block:'center'}); let a=td.getBoundingClientRect(), b=a;
  if (withNext && td.nextElementSibling) b=td.nextElementSibling.getBoundingClientRect();
  const t=td.closest('table').getBoundingClientRect(); return {x:t.x, y:a.y, width:t.width, height:b.bottom-a.y}; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        if "fresh" in sys.argv:
            ctx = await b.new_context(viewport={"width":1280,"height":1100}, device_scale_factor=3); pg = await ctx.new_page()
            await pg.goto("https://www.bs-basketball.com", wait_until="networkidle", timeout=90000)
            await pg.get_by_role("button", name=re.compile("Dallas")).first.click(); await pg.wait_for_timeout(7000)
            await card(pg, "objectives", r"^OWNER OBJECTIVES", 120, 400)
            await card(pg, "nextgame", r"^NEXT GAME", 60, 400)
            await pg.goto("https://www.bs-basketball.com/trade", wait_until="networkidle"); await pg.wait_for_timeout(3000)
            await pg.get_by_text("Trade Finder", exact=True).first.click(); await pg.wait_for_timeout(2000)
            await pg.locator("select").first.select_option(index=3); await pg.wait_for_timeout(5000)
            await pg.screenshot(path="tf_page.jpg", type="jpeg", quality=60)
            for i in range(4): await card(pg, f"trade{i}", r"^You get:", 60, 200, nth=i)
        if "draft" in sys.argv:
            ctx = await b.new_context(viewport={"width":1280,"height":1400}, device_scale_factor=3, storage_state="state3.json"); pg = await ctx.new_page()
            await pg.goto("https://www.bs-basketball.com/draft", wait_until="networkidle", timeout=90000); await pg.wait_for_timeout(5000)
            names = await pg.evaluate("() => [...document.querySelectorAll('tr')].filter(r => /Scout/.test(r.innerText)).slice(0,7).map(r => { const L=r.innerText.split('\\n').map(x=>x.trim()); return L[L.indexOf('☆')+1]; })")
            print(names)
            await pg.evaluate(HIDE)
            head = await pg.evaluate("""() => { const t=[...document.querySelectorAll('*')].find(e=>e.innerText && e.innerText.trim()==='Draft Board' && e.offsetParent && e.closest('table')===null && e.getBoundingClientRect().y>600);
                let el=t; while(el && !el.querySelector('table')) el=el.parentElement; el.scrollIntoView({block:'start'}); const r=el.getBoundingClientRect(); const tb=el.querySelector('table thead')?.getBoundingClientRect();
                return {x:r.x,y:r.y,width:r.width,height:(tb? tb.bottom : r.y+120)-r.y}; }""")
            await pg.wait_for_timeout(500); await shot(pg, "board_head", head)
            for i, n in enumerate(names):
                bx = await pg.evaluate(ROW_JS, [n, False]); await pg.wait_for_timeout(300); bx = await pg.evaluate(ROW_JS, [n, False]); await shot(pg, f"row{i}", bx)
            await pg.locator("tr", has_text=names[0]).get_by_role("button", name="Scout", exact=True).click(); await pg.wait_for_timeout(2500)
            await pg.evaluate(HIDE)
            bx = await pg.evaluate(ROW_JS, [names[0], True]); await pg.wait_for_timeout(400); bx = await pg.evaluate(ROW_JS, [names[0], True]); await shot(pg, "row0_open", bx)
        json.dump(meta, open(f"{OUT}/meta_{'_'.join(sys.argv[1:])}.json","w"), indent=1)
        await b.close()
asyncio.run(main())
