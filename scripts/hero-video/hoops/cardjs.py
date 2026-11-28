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
