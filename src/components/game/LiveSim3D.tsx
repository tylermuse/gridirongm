'use client';

/**
 * Live 3D sim cutaway — the chase-cam sim (public/chase-cam/, three.js, CC BY
 * player model) runs in an iframe over the 2D field and animates every
 * scrimmage / special-teams play as it happens. The engines stay the source
 * of truth: each event is sent to the sim with the real spot, down and score
 * (see liveSim3d.ts) and the sim replies when the play (plus a short post-play
 * beat) is over, which releases the page to advance.
 *
 * Toggle lives in the game controls ("3D Sim"); the choice is remembered per
 * browser. `?sim3d=1|0` in the URL overrides it. The iframe is created once
 * when the mode is on (≈10 MB: model + three.js) and stays mounted so later
 * plays start instantly and stays on screen between plays (pre-snap formation at
 * the current spot) so the view never flips back and forth with the 2D field.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayEvent } from '@/lib/engine/playByPlay';
import { toSimPlay, toSimTeam, type SimStateMessage, type SimTeam } from '@/lib/engine/liveSim3d';

const SIM_BUILD = 'b16i';   // bump with public/chase-cam/index.html so browsers never serve a cached sim
const SIM_URL = `/chase-cam/index.html?embed=1&model=fp27&v=${SIM_BUILD}`;
const STORAGE_KEY = 'bsgm.sim3d';
const VIEW_KEY = 'bsgm.sim3d.view';

type SimCam = 'low' | 'wide' | 'broadcast' | 'high';
type SimLighting = 'day' | 'night';
const CAM_LABELS: [SimCam, string][] = [['low', 'Chase'], ['wide', 'Wide'], ['broadcast', 'Broadcast'], ['high', 'High']];

/** Camera angle + day/night for the sim, remembered per browser. */
function useSimView(): [{ cam: SimCam; lighting: SimLighting }, (v: Partial<{ cam: SimCam; lighting: SimLighting }>) => void] {
  const [view, setViewState] = useState<{ cam: SimCam; lighting: SimLighting }>({ cam: 'low', lighting: 'day' });
  useEffect(() => {
    let saved: { cam?: SimCam; lighting?: SimLighting } | null = null;
    try { saved = JSON.parse(window.localStorage.getItem(VIEW_KEY) || 'null'); } catch { /* storage blocked / bad json */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser state on mount
    if (saved) setViewState(v => ({ cam: saved?.cam ?? v.cam, lighting: saved?.lighting ?? v.lighting }));
  }, []);
  const setView = useCallback((patch: Partial<{ cam: SimCam; lighting: SimLighting }>) => {
    setViewState(v => { const next = { ...v, ...patch }; try { window.localStorage.setItem(VIEW_KEY, JSON.stringify(next)); } catch { /* storage blocked */ } return next; });
  }, []);
  return [view, setView];
}

export function useSim3DMode(): [boolean, (on: boolean) => void] {
  const [on, setOnState] = useState(false);
  useEffect(() => {
    // effect-gated read of URL / localStorage so SSR and the first client render agree (no hydration mismatch)
    const q = new URLSearchParams(window.location.search).get('sim3d');
    let v = false;
    if (q !== null) v = q === '1' || q === 'on';
    else { try { v = window.localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* storage blocked */ } }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser state on mount
    setOnState(v);
  }, []);
  const setOn = useCallback((v: boolean) => {
    setOnState(v);
    try { window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch { /* storage blocked */ }
  }, []);
  return [on, setOn];
}

type TeamLike = { abbreviation: string; name: string; primaryColor: string; secondaryColor: string };

export function LiveSim3D({
  enabled,
  event,
  disabled,
  homeTeam,
  awayTeam,
  state,
  onActiveChange,
}: {
  enabled: boolean;
  event: PlayEvent | null;
  /** Current situation (spot, down, score, clock) for the pre-snap formation between plays — e.g. the two-point try at the 3 while the user picks a play */
  state: SimStateMessage['pre'] & { possession: 'home' | 'away' } | null;
  /** e.g. speed === 'max' or the user skipped to the end: never hold the game */
  disabled?: boolean;
  homeTeam: TeamLike | null;
  awayTeam: TeamLike | null;
  onActiveChange: (active: boolean) => void;
}) {
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

  // Messages from the sim: ready / done / error
  useEffect(() => {
    if (!enabled) return;
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== frameRef.current?.contentWindow) return;
      const m = ev.data as { type?: string; id?: number; message?: string } | null;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'bsgm:ready') { setReady(true); setFailed(null); }
      else if (m.type === 'bsgm:done') { if (m.id === activeIdRef.current) { activeIdRef.current = null; setActiveBoth(false); } }
      else if (m.type === 'bsgm:error') { setFailed(m.message || 'failed to load'); setActiveBoth(false); }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [enabled, setActiveBoth]);

  // Team colours → sim (once ready, and whenever the matchup changes)
  const homeSim: SimTeam | null = homeTeam ? toSimTeam(homeTeam, 'home') : null;
  const awaySim: SimTeam | null = awayTeam ? toSimTeam(awayTeam, 'away') : null;
  const homeKey = JSON.stringify(homeSim), awayKey = JSON.stringify(awaySim);
  useEffect(() => {
    if (!enabled || !ready || !homeSim || !awaySim) return;
    post({ type: 'bsgm:setup', home: homeSim, away: awaySim });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ready, homeKey, awayKey, post]);

  // Camera angle / lighting → sim (on ready and whenever they change)
  useEffect(() => {
    if (!enabled || !ready) return;
    post({ type: 'bsgm:view', cam: view.cam, lighting: view.lighting });
  }, [enabled, ready, view.cam, view.lighting, post]);

  // Situation → sim while idle, so the formation between plays sits at the real spot (after a score, at the 3 for a two-point try…)
  const stateKey = state ? JSON.stringify(state) : '';
  const lastPlayPreRef = useRef('');
  useEffect(() => {
    if (!enabled || !ready || !state || active) return;
    if (stateKey === lastPlayPreRef.current) return;   // still the situation of the play just shown: the sim already moved on to its result
    const { possession, ...pre } = state;
    post({ type: 'bsgm:state', possession, pre } satisfies SimStateMessage);
  }, [enabled, ready, stateKey, active, post]);   // eslint-disable-line react-hooks/exhaustive-deps -- state is keyed by stateKey

  // New event → send it to the sim and hold the game until it reports done
  useEffect(() => {
    if (!enabled || !event || disabled || !ready || failed) return;
    if (lastIdRef.current === event.id) return;
    lastIdRef.current = event.id;
    const play = toSimPlay(event);
    if (!play) return;   // nothing to picture (kickoff, fumble, XP, penalty…): the 2D field carries it
    activeIdRef.current = play.id;
    lastPlayPreRef.current = JSON.stringify({ possession: play.possession, ...play.pre });
    post(play);
    setActiveBoth(true);
  }, [enabled, event, disabled, ready, failed, post, setActiveBoth]);

  // Bail out if playback gets disabled mid-play (skip to end / max speed) or the mode is switched off
  useEffect(() => {
    if ((disabled || !enabled) && activeRef.current) { post({ type: 'bsgm:skip' }); activeIdRef.current = null; setActiveBoth(false); }
  }, [disabled, enabled, post, setActiveBoth]);

  // Unmount → never leave the page held
  useEffect(() => () => { if (activeRef.current) onActiveChange(false); }, [onActiveChange]);

  if (!enabled) return null;
  return (
    <div ref={boxRef} className="absolute inset-0 z-30 overflow-hidden rounded-lg bg-black">
      <iframe
        ref={frameRef}
        src={SIM_URL}
        title="3D live sim"
        allow="autoplay"
        className="h-full w-full border-0"
      />
      {!ready && !failed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 text-sm font-semibold text-white">
          Loading 3D sim…
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-xs text-white">
          3D sim unavailable ({failed}) — showing the 2D field
        </div>
      )}
      {ready && !failed && (
        <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/55 p-1 text-[11px] font-bold text-white">
          {CAM_LABELS.map(([c, label]) => (
            <button key={c} type="button" onClick={() => setView({ cam: c })} aria-pressed={view.cam === c}
              className={`rounded-full px-2 py-0.5 ${view.cam === c ? 'bg-white text-black' : 'hover:bg-white/20'}`}>{label}</button>
          ))}
          <span className="mx-1 h-4 w-px bg-white/30" />
          <button type="button" onClick={() => setView({ lighting: view.lighting === 'day' ? 'night' : 'day' })} title="Day / night"
            className="rounded-full px-2 py-0.5 hover:bg-white/20">{view.lighting === 'day' ? '☀️ Day' : '🌙 Night'}</button>
        </div>
      )}
      {ready && !failed && (
        <button
          type="button"
          title="Full screen"
          onClick={() => { const el = boxRef.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); }}
          className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold text-white shadow hover:bg-black/75"
        >
          ⛶
        </button>
      )}
      {active && (
        <button
          type="button"
          onClick={() => { post({ type: 'bsgm:skip' }); activeIdRef.current = null; setActiveBoth(false); }}
          className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-black shadow"
        >
          Skip ▸
        </button>
      )}
    </div>
  );
}
