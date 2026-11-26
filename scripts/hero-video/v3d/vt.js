(() => {
  let vt = null, base = 0, dBase = 0, id = 1e7;
  const rN = performance.now.bind(performance), rD = Date.now;
  const rST = setTimeout.bind(window), rCT = clearTimeout.bind(window), rSI = setInterval.bind(window), rCI = clearInterval.bind(window);
  const rRAF = requestAnimationFrame.bind(window), rCAF = cancelAnimationFrame.bind(window);
  const timers = new Map(), rafs = new Map();
  performance.now = () => vt === null ? rN() : vt;
  Date.now = () => vt === null ? rD() : dBase + (vt - base);
  window.setTimeout = (fn, ms = 0, ...a) => { if (vt === null) return rST(fn, ms, ...a); const i = ++id; timers.set(i, {t: vt + Math.max(0, +ms || 0), fn, a}); return i; };
  window.clearTimeout = i => { timers.delete(i); rCT(i); };
  window.setInterval = (fn, ms = 0, ...a) => { if (vt === null) return rSI(fn, ms, ...a); const i = ++id; timers.set(i, {t: vt + Math.max(1, +ms || 0), fn, a, every: Math.max(1, +ms || 0)}); return i; };
  window.clearInterval = i => { timers.delete(i); rCI(i); };
  window.requestAnimationFrame = fn => { if (vt === null) return rRAF(fn); const i = ++id; rafs.set(i, fn); return i; };
  window.cancelAnimationFrame = i => { rafs.delete(i); rCAF(i); };
  window.__vtStart = () => { base = rN(); dBase = rD(); vt = base; };
  window.__vtStep = ms => {
    const end = vt + ms;
    for (let guard = 0; guard < 500; guard++) {
      let nx = null;
      for (const e of timers) if (e[1].t <= end && (!nx || e[1].t < nx[1].t)) nx = e;
      if (!nx) break;
      const [i, t] = nx; vt = Math.max(vt, t.t);
      if (t.every) t.t += t.every; else timers.delete(i);
      try { typeof t.fn === 'function' ? t.fn(...t.a) : (0, eval)(t.fn); } catch (e) { console.error(e); }
    }
    vt = end;
    const cbs = [...rafs.values()]; rafs.clear();
    for (const f of cbs) { try { f(vt); } catch (e) { console.error(e); } }
    return cbs.length;
  };
})();
