'use client';

/**
 * Court Cam — the live 3D sim (public/court-cam/, three.js, CC BY player model
 * re-dressed for basketball) runs in an iframe and animates every possession
 * of the real play log as the viewer reaches it. The log stays the source of
 * truth: each possession is sent with the real shooter, spot, result, lineups
 * and score (see liveSim3d.ts) and the sim replies when it's over, which
 * releases the viewer to advance. Premium-only (gated by the viewer).
 *
 * The iframe is created once when the mode is on (≈14 MB: model + three.js)
 * and stays mounted so later possessions start instantly.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimPossession, SimTeamSpec } from '@/lib/live/liveSim3d';

const SIM_BUILD = 'h2a';   // bump with public/court-cam/index.html so browsers never serve a cached sim
const SIM_URL = `/court-cam/index.html?embed=1&v=${SIM_BUILD}`;
const STORAGE_KEY = 'bsbb.sim3d';
const VIEW_KEY = 'bsbb.sim3d.view';

export type SimCam = 'broadcast' | 'chase' | 'high';
const CAM_LABELS: [SimCam, string][] = [['chase', 'Chase'], ['broadcast', 'Broadcast'], ['high', 'High']];

function useSimView(): [{ cam: SimCam; auto: boolean }, (v: Partial<{ cam: SimCam; auto: boolean }>) => void] {
  const [view, setViewState] = useState<{ cam: SimCam; auto: boolean }>({ cam: 'chase', auto: false });
  useEffect(() => {
    let saved: { cam?: SimCam; auto?: boolean } | null = null;
    try { saved = JSON.parse(window.localStorage.getItem(VIEW_KEY) || 'null'); } catch { /* storage blocked */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser state on mount
    if (saved) setViewState(v => ({ cam: saved?.cam ?? v.cam, auto: saved?.auto ?? v.auto }));
  }, []);
  const setView = useCallback((patch: Partial<{ cam: SimCam; auto: boolean }>) => {
    setViewState(v => { const next = { ...v, ...patch }; try { window.localStorage.setItem(VIEW_KEY, JSON.stringify(next)); } catch { /* storage blocked */ } return next; });
  }, []);
  return [view, setView];
}

/** The browser's saved 3D choice (or the ?sim3d= override). Client only. */
export function readSim3DPref(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search).get('sim3d');
  if (q !== null) return q === '1' || q === 'on';
  try { return window.localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export function useSim3DMode(): [boolean, (on: boolean) => void] {
  const [on, setOnState] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser state on mount
    setOnState(readSim3DPref());
  }, []);
  const setOn = useCallback((v: boolean) => {
    setOnState(v);
    try { window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch { /* storage blocked */ }
  }, []);
  return [on, setOn];
}

/** Playback rate for the sim per viewer speed (1x viewer ≈ real-time broadcast pace). */
export const SIM_RATE: Record<string, number> = { 1: 1.3, 2: 1.75, 5: 2.8, max: 14 };

export function LiveSim3D({
  enabled, possession, disabled, homeTeam, awayTeam, setup, clock, rate, onActiveChange,
}: {
  enabled: boolean;
  /** The possession to animate now (null between possessions); a new `id` starts it. */
  possession: SimPossession | null;
  /** Skip playback entirely (max speed / hidden): never hold the viewer */
  disabled?: boolean;
  homeTeam: SimTeamSpec | null;
  awayTeam: SimTeamSpec | null;
  /** Game state at mount / resync: period, clock, score, who has the ball */
  setup: { quarter: number; clock: number; homeScore: number; awayScore: number; possession: 'home' | 'away' } | null;
  /** The viewer's running clock (mirrored on the 3D scorebug between possessions) */
  clock?: { secs: number; quarter: number } | null;
  rate: number;
  onActiveChange: (active: boolean) => void;
}) {
  // A background tab stops requestAnimationFrame, so the sim can't finish and the viewer would sit waiting on it.
  const [tabHidden, setTabHidden] = useState(false);
  useEffect(() => {
    const on = () => setTabHidden(document.visibilityState === 'hidden');
    on(); document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const off = !!disabled || tabHidden;
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [view, setView] = useSimView();
  const activeIdRef = useRef<number | null>(null);
  const lastIdRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  const setActiveBoth = useCallback((v: boolean) => {
    if (activeRef.current === v) return;
    activeRef.current = v; setActive(v); onActiveChange(v);
  }, [onActiveChange]);

  const post = useCallback((m: unknown) => {
    const w = frameRef.current?.contentWindow; if (!w) return;
    try { w.postMessage(m, window.location.origin); } catch { /* frame gone */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== frameRef.current?.contentWindow) return;
      const m = ev.data as { type?: string; id?: number; message?: string } | null;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'bsh:ready') { setReady(true); setFailed(null); }
      else if (m.type === 'bsh:done') { if (m.id === activeIdRef.current) { activeIdRef.current = null; setActiveBoth(false); } }
      else if (m.type === 'bsh:error') { setFailed(m.message || 'failed to load'); setActiveBoth(false); }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [enabled, setActiveBoth]);

  // Until the sim says ready, ask it every second (its first ready can land before this listener exists).
  useEffect(() => {
    if (!enabled || ready) return;
    const iv = window.setInterval(() => post({ type: 'bsh:hello' }), 1000);
    return () => window.clearInterval(iv);
  }, [enabled, ready, post]);

  // Teams + game state → sim (once ready, and whenever the matchup changes)
  const homeKey = JSON.stringify(homeTeam), awayKey = JSON.stringify(awayTeam);
  const setupKey = JSON.stringify(setup);
  useEffect(() => {
    if (!enabled || !ready || !homeTeam || !awayTeam || !setup) return;
    post({ type: 'bsh:setup', home: homeTeam, away: awayTeam, ...setup });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the serialised teams / setup
  }, [enabled, ready, homeKey, awayKey, setupKey, post]);

  useEffect(() => {
    if (!enabled || !ready) return;
    post({ type: 'bsh:view', cam: view.cam, auto: view.auto });
  }, [enabled, ready, view.cam, view.auto, post]);

  useEffect(() => {
    if (!enabled || !ready) return;
    post({ type: 'bsh:speed', rate });
  }, [enabled, ready, rate, post]);

  const clockKey = clock ? `${clock.quarter}:${clock.secs}` : '';
  useEffect(() => {
    if (!enabled || !ready || !clock) return;
    post({ type: 'bsh:clock', clock: clock.secs, quarter: clock.quarter });
  }, [enabled, ready, clockKey, post]);   // eslint-disable-line react-hooks/exhaustive-deps -- keyed by clockKey

  // New possession → send it and hold the viewer until the sim reports done
  useEffect(() => {
    if (!enabled || !possession || !ready || failed) return;
    if (off) { lastIdRef.current = possession.id; return; }
    if (lastIdRef.current === possession.id) return;
    lastIdRef.current = possession.id;
    activeIdRef.current = possession.id;
    post({ type: 'bsh:poss', id: possession.id, p: possession });
    setActiveBoth(true);
  }, [enabled, possession, off, ready, failed, post, setActiveBoth]);

  useEffect(() => {
    if ((off || !enabled) && activeRef.current) { post({ type: 'bsh:skip' }); activeIdRef.current = null; setActiveBoth(false); }
  }, [off, enabled, post, setActiveBoth]);

  useEffect(() => () => { if (activeRef.current) onActiveChange(false); }, [onActiveChange]);

  if (!enabled) return null;
  return (
    <div ref={boxRef} className="relative w-full overflow-hidden rounded-xl bg-black aspect-[4/5] sm:aspect-video">
      <iframe ref={frameRef} src={SIM_URL} title="Court Cam — live 3D sim" allow="autoplay" className="h-full w-full border-0" />
      {!ready && !failed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 text-sm font-semibold text-white">Loading Court Cam…</div>
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-xs text-white">Court Cam unavailable ({failed})</div>
      )}
      {ready && !failed && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/55 p-0.5 text-[10px] font-bold text-white sm:hidden">
          <button type="button" onClick={() => { const i = CAM_LABELS.findIndex(([c]) => c === view.cam); setView({ cam: CAM_LABELS[(i + 1) % CAM_LABELS.length][0] }); }} className="rounded-full bg-white px-2 py-0.5 text-black">🎥 {(CAM_LABELS.find(([c]) => c === view.cam) ?? CAM_LABELS[0])[1]}</button>
        </div>
      )}
      {ready && !failed && (
        <div className="absolute bottom-3 left-3 hidden items-center gap-1 rounded-full bg-black/55 p-1 text-[11px] font-bold text-white sm:flex">
          {CAM_LABELS.map(([c, label]) => (
            <button key={c} type="button" onClick={() => setView({ cam: c })} aria-pressed={view.cam === c} className={`rounded-full px-2 py-0.5 ${view.cam === c ? 'bg-white text-black' : 'hover:bg-white/20'}`}>{label}</button>
          ))}
          <span className="mx-1 h-4 w-px bg-white/30" />
          <button type="button" onClick={() => setView({ auto: !view.auto })} title="Cut to the baseline camera on rim finishes" className={`rounded-full px-2 py-0.5 ${view.auto ? 'bg-white/25' : 'hover:bg-white/20'}`}>Auto cuts {view.auto ? 'on' : 'off'}</button>
        </div>
      )}
      {ready && !failed && (
        <button type="button" title="Full screen" onClick={() => { const el = boxRef.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); }}
          className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-bold text-white shadow hover:bg-black/75 sm:right-3 sm:top-3 sm:px-2.5 sm:py-1">⛶</button>
      )}
      {active && (
        <button type="button" onClick={() => { post({ type: 'bsh:skip' }); activeIdRef.current = null; setActiveBoth(false); }}
          className="absolute bottom-2 right-2 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-bold text-black shadow sm:bottom-3 sm:right-3 sm:px-3 sm:py-1 sm:text-xs">Skip ▸</button>
      )}
    </div>
  );
}
