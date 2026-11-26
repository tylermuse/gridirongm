"""Grab crisp element-level cut-outs of the real UI for the motion piece."""
import asyncio, re, os, sys, json
from playwright.async_api import async_playwright
import cap as C
BASE = "https://bs-football.com"; TEAM = sys.argv[1] if len(sys.argv) > 1 else "Detroit"
OUT = "assets"; os.makedirs(OUT, exist_ok=True)
CARD_JS = r"""([pat, minH, maxH, nth]) => {
  const re = new RegExp(pat);
  const hits = [...document.querySelectorAll('body *')].filter(el => el.offsetParent && re.test((el.innerText || '').trim()));
  const leaves = hits.filter(el => !hits.some(o => o !== el && el.contains(o)));
  const leaf = leaves[nth || 0];
  if (!leaf) return null;
  let el = leaf;
  while (el && el !== document.body) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    const boxy = (parseFloat(cs.borderTopWidth) > 0) || cs.boxShadow !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
    if (rad >= 6 && boxy && r.height >= minH && r.height <= maxH) {
      el.scrollIntoView({block: 'center'});
      const b = el.getBoundingClientRect();
      return {x: b.x, y: b.y, width: b.width, height: b.height, radius: rad};
    }
    el = el.parentElement;
  }
  return null;
}"""
meta = {}
async def card(pg, name, pat, minH=40, maxH=900, nth=0):
    await C.clean(pg); await pg.wait_for_timeout(300)
    box = await pg.evaluate(CARD_JS, [pat, minH, maxH, nth])
    if not box: print("  MISSING", name); return
    await pg.wait_for_timeout(400)
    box = await pg.evaluate(CARD_JS, [pat, minH, maxH, nth])
    clip = {k: box[k] for k in ("x", "y", "width", "height")}
    await pg.screenshot(path=f"{OUT}/{name}.png", clip=clip)
    meta[name] = box; print("  ok", name, round(box["width"]), "x", round(box["height"]))

async def main():
    async with async_playwright() as p:
        b, pg = await C.new_league(p, BASE, TEAM)
        await card(pg, "objectives", r"^OWNER OBJECTIVES", 60, 260)
        # trades
        await C.nav(pg, "Trades")
        await pg.get_by_role("button", name=re.compile("Trade Finder")).click(); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=f"{OUT}/_trades_page.jpg", type="jpeg", quality=70)
        for i in range(3):
            await card(pg, f"trade{i}", r"^Your #\d need is", 60, 260, nth=i)
        await card(pg, "teamneeds", r"^NEEDS", 30, 200)
        # free agency negotiation
        await C.nav(pg, "Free Agency")
        await pg.get_by_role("button", name="Negotiate").first.click(); await pg.wait_for_timeout(1500)
        await card(pg, "negotiate", r"^Negotiating with", 200, 900)
        await pg.keyboard.press("Escape")
        # draft grades
        await C.nav(pg, "Draft Preview")
        await card(pg, "grades", r"^Position Group Grades$", 200, 2000)
        for pos in ["Quarterbacks", "Wide Receivers", "Offensive Line", "Edge Rushers", "Cornerbacks", "Running Backs"]:
            await card(pg, "grade_" + pos.split()[0].lower(), rf"^{pos}$", 60, 220)
        # standings / dashboard extras
        await C.nav(pg, "Dashboard")
        await card(pg, "fanpulse", r"^FAN PULSE", 60, 260)
        json.dump(meta, open(f"{OUT}/meta.json", "w"), indent=1)
        await b.close()
asyncio.run(main())
