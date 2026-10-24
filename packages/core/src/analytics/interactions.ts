/**
 * @bs/core/analytics/interactions — automatic click / hover / change capture.
 *
 * One set of document-level listeners records what people actually touch, so
 * no button needs its own trackEvent() call. Everything goes through the
 * batched queue in ./track.ts, so a burst of clicks is still one request.
 *
 * Events (all carry path, feature, area, target, el):
 *   ui_click        any click on something clickable
 *   ui_rage_click   3+ clicks on the same element within 1s (fired once)
 *   ui_dead_click   click on a button/link that changed nothing for 1s
 *   ui_hover        mouse rested 600ms+ on a clickable element (once per element per page view)
 *   ui_change       select / checkbox / radio / range / text field changed
 *   page_engagement visible + active time on a page, sent on route change and tab hide
 *
 * Labels come from, in order: data-track, aria-label, title, the control's
 * <label>, its visible text. Digits become '#' so "Sim Week 5" and "Sim Week 6"
 * count as one element. Text typed into inputs is never recorded.
 *
 * Markup hooks:
 *   data-track="Sim to playoffs"   explicit label for an element
 *   data-track-feature="trade-block" feature override for everything inside
 *   data-track-area="depth-chart"  area override (default: nav/header/aside/footer/dialog/main)
 *   data-track-ignore              skip this element and its children
 */

import { trackEvent, flushEvents } from './track';

const CLICKABLE =
  'a[href],button,[role="button"],[role="tab"],[role="menuitem"],[role="option"],[role="switch"],' +
  '[role="checkbox"],[role="radio"],[role="link"],input,select,textarea,summary,label,[data-track]';
/** Dead-click detection would misfire on these (native pickers don't mutate the DOM). */
const NO_DEAD_CHECK = 'input,select,textarea,label,[contenteditable]';
/** Double/triple-clicking to select text in a field is normal, not rage. */
const NO_RAGE_CHECK = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea,[contenteditable]';
/** Routes whose second segment is an id — collapsed so /player/abc and /player/xyz aggregate. */
const ID_ROUTES = new Set(['player', 'game', 'coach', 'team', 'gm']);

const HOVER_MIN_MS = 600;
const RAGE_WINDOW_MS = 1000;
const RAGE_CLICKS = 3;
const DEAD_CLICK_MS = 1000;
const ENGAGEMENT_TICK_MS = 5000;
/** No input for this long and the visitor counts as idle (still visible, not active). */
const IDLE_MS = 60_000;
const LABEL_MAX = 60;

/** Collapse ids so per-page aggregates group: /player/p_123 -> /player/:id */
export function normalizePath(path: string): string {
  const segs = path.split('/').filter(Boolean);
  if (segs.length >= 2 && ID_ROUTES.has(segs[0])) segs[1] = ':id';
  return '/' + segs
    .map(s => (/^\d+$/.test(s) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(s) ? ':id' : s))
    .join('/');
}

/** Feature = data-track-feature on an ancestor, else the first path segment. */
function featureOf(el: Element | null, path: string): string {
  const override = el?.closest('[data-track-feature]')?.getAttribute('data-track-feature');
  if (override) return override;
  return path.split('/').filter(Boolean)[0] ?? 'home';
}

function areaOf(el: Element): string {
  const c = el.closest('[data-track-area],[role="dialog"],dialog,nav,aside,header,footer');
  if (!c) return 'main';
  return c.getAttribute('data-track-area')
    ?? (c.matches('[role="dialog"],dialog') ? 'dialog' : c.tagName.toLowerCase());
}

function clean(s: string, digits = true): string {
  // Nav items carry emoji icons ("🏆 Playoffs"); keep just the words.
  const t = s.replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s+/g, ' ').trim();
  return (digits ? t.replace(/\d+(?:[.,]\d+)*/g, '#') : t).slice(0, LABEL_MAX);
}

function labelOf(el: Element): string {
  const attr = el.getAttribute('data-track') || el.getAttribute('aria-label') || el.getAttribute('title');
  if (attr) return clean(attr);
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const lbl = el.labels?.[0]?.innerText;
    const fallback = el instanceof HTMLSelectElement ? el.name : (el.name || el.placeholder || el.type);
    return clean(lbl || fallback || el.tagName.toLowerCase());
  }
  const text = el instanceof HTMLElement ? el.innerText : el.textContent;
  if (text?.trim()) return clean(text);
  const img = el.querySelector('img[alt],[aria-label]');
  const alt = img?.getAttribute('alt') || img?.getAttribute('aria-label');
  return alt ? clean(alt) : `<${el.tagName.toLowerCase()}>`;
}

/**
 * Nearest clickable ancestor. React onClick on a plain <div> leaves no role or
 * attribute behind, but those divs almost always set cursor:pointer, so check
 * computed style a few levels up as a fallback.
 */
function clickableOf(start: EventTarget | null, checkCursor: boolean): Element | null {
  if (!(start instanceof Element)) return null;
  if (start.closest('[data-track-ignore]')) return null;
  const hit = start.closest(CLICKABLE);
  if (hit) return hit;
  if (!checkCursor) return null;
  let node: Element | null = start;
  for (let i = 0; node && node !== document.body && i < 4; i++, node = node.parentElement) {
    if (getComputedStyle(node).cursor === 'pointer') return node;
  }
  return null;
}

function describe(el: Element) {
  const path = normalizePath(location.pathname);
  const role = el.getAttribute('role');
  const props: Record<string, unknown> = {
    path,
    feature: featureOf(el, path),
    area: areaOf(el),
    target: labelOf(el),
    el: el.tagName.toLowerCase() + (role ? `[${role}]` : ''),
  };
  if (el instanceof HTMLAnchorElement && el.origin === location.origin) {
    props.href = normalizePath(el.pathname);
  }
  return props;
}

const ignored = () => location.pathname.startsWith('/admin');

// ── engagement (time on page) ───────────────────────────────────────────────

let page: string | null = null;
let visibleMs = 0;
let activeMs = 0;
let lastInput = Date.now();

function emitEngagement() {
  if (page && visibleMs > 0 && !page.startsWith('/admin')) {
    trackEvent('page_engagement', { path: page, feature: featureOf(null, page), visibleMs, activeMs });
  }
  visibleMs = 0;
  activeMs = 0;
}

/** Tell the tracker the route changed. Closes out time on the previous page. */
export function setInteractionPage(pathname: string) {
  const next = normalizePath(pathname);
  if (next === page) return;
  emitEngagement();
  page = next;
  hovered.clear();
}

// ── listeners ───────────────────────────────────────────────────────────────

const hovered = new Set<string>();
let hoverEl: Element | null = null;
let hoverStart = 0;
let rage: { el: Element; n: number; first: number } | null = null;
let deadWatch = false;
let lastLabel: HTMLLabelElement | null = null;

function endHover() {
  const el = hoverEl;
  hoverEl = null;
  if (!el || !el.isConnected || Date.now() - hoverStart < HOVER_MIN_MS || ignored()) return;
  const props = describe(el);
  const key = `${props.feature}|${props.target}`;
  if (hovered.has(key)) return;
  hovered.add(key);
  trackEvent('ui_hover', { ...props, ms: Date.now() - hoverStart });
}

function watchDeadClick(props: Record<string, unknown>) {
  if (deadWatch) return;
  deadWatch = true;
  const before = location.href;
  let changed = false;
  const mo = new MutationObserver(() => { changed = true; mo.disconnect(); });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
  // Scroll-to-section buttons and file pickers respond without touching the DOM.
  const responded = () => { changed = true; };
  window.addEventListener('scroll', responded, { capture: true, passive: true });
  window.addEventListener('blur', responded);
  setTimeout(() => {
    mo.disconnect();
    window.removeEventListener('scroll', responded, { capture: true });
    window.removeEventListener('blur', responded);
    deadWatch = false;
    if (!changed && location.href === before) trackEvent('ui_dead_click', props);
  }, DEAD_CLICK_MS);
}

function onClick(e: MouseEvent) {
  if (ignored()) return;
  const el = clickableOf(e.target, true);
  if (!el) return;
  // Clicking a <label> makes the browser fire a second, synthetic click on its
  // input. Count the one the person made.
  const label = el.closest('label');
  if (el instanceof HTMLInputElement && lastLabel && (el.labels ? Array.from(el.labels).includes(lastLabel) : false)) {
    lastLabel = null;
    return;
  }
  lastLabel = label;
  const props = describe(el);
  trackEvent('ui_click', props);

  const now = Date.now();
  if (el.matches(NO_RAGE_CHECK)) {
    rage = null;
  } else if (rage && rage.el === el && now - rage.first < RAGE_WINDOW_MS) {
    if (++rage.n === RAGE_CLICKS) trackEvent('ui_rage_click', props);
  } else {
    rage = { el, n: 1, first: now };
  }

  const external = el instanceof HTMLAnchorElement && (el.target === '_blank' || el.origin !== location.origin || el.hasAttribute('download'));
  if (!external && !el.matches(NO_DEAD_CHECK)) watchDeadClick(props);
}

function onChange(e: Event) {
  if (ignored()) return;
  const el = e.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return;
  if (el.closest('[data-track-ignore]')) return;
  if (el instanceof HTMLInputElement && (el.type === 'password' || el.type === 'email' || el.type === 'hidden')) return;
  const props = describe(el);
  // Record the choice for pickers/toggles; never record what someone typed.
  if (el instanceof HTMLSelectElement) props.value = clean(el.selectedOptions[0]?.text ?? el.value, false);
  else if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) props.value = el.checked ? 'on' : 'off';
  else if (el instanceof HTMLInputElement && el.type === 'range') props.value = el.value;
  trackEvent('ui_change', props);
}

function onPointerOver(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return;
  const el = clickableOf(e.target, true);
  if (el === hoverEl) return;
  endHover();
  if (el) { hoverEl = el; hoverStart = Date.now(); }
}

function onPointerOut(e: PointerEvent) {
  if (!hoverEl) return;
  const to = e.relatedTarget;
  if (to instanceof Node && hoverEl.contains(to)) return;
  endHover();
}

const onInput = () => { lastInput = Date.now(); };

function onVisibility() {
  if (document.visibilityState !== 'hidden') return;
  endHover();
  emitEngagement();
  flushEvents(true);
}

let started = false;

/** Attach the listeners. Idempotent; returns a cleanup for tests / HMR. */
export function startInteractionTracking(): () => void {
  if (started || typeof window === 'undefined') return () => {};
  started = true;
  const opts = { capture: true, passive: true } as const;
  document.addEventListener('click', onClick, opts);
  document.addEventListener('change', onChange, opts);
  document.addEventListener('pointerover', onPointerOver, opts);
  document.addEventListener('pointerout', onPointerOut, opts);
  for (const t of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const) {
    document.addEventListener(t, onInput, opts);
  }
  window.addEventListener('scroll', onInput, opts);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onVisibility);

  const tick = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    visibleMs += ENGAGEMENT_TICK_MS;
    if (Date.now() - lastInput < IDLE_MS) activeMs += ENGAGEMENT_TICK_MS;
  }, ENGAGEMENT_TICK_MS);

  return () => {
    started = false;
    clearInterval(tick);
    document.removeEventListener('click', onClick, opts);
    document.removeEventListener('change', onChange, opts);
    document.removeEventListener('pointerover', onPointerOver, opts);
    document.removeEventListener('pointerout', onPointerOut, opts);
    for (const t of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const) {
      document.removeEventListener(t, onInput, opts);
    }
    window.removeEventListener('scroll', onInput, opts);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onVisibility);
  };
}
