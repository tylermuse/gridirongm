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
import { isRealPhoto, sampleSkinFromPhoto, toSimPlay, toSimTeam, type SimNamedPlayer, type SimPlayerLike, type SimStateMessage, type SimTeam } from '@/lib/engine/liveSim3d';

/** Skin tones measured from real headshots, per photo URL, for the whole session (null = couldn't read it). */
const photoSkinCache = new Map<string, string | null>();
const STARTERS: Record<string, number> = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1 };
function starterPhotos(players: SimPlayerLike[] | undefined): string[] {
  const seen: Record<string, number> = {}; const out: string[] = [];
  for (const p of players ?? []) {
    const k = STARTERS[p.position]; if (!k) continue;
    seen[p.position] = (seen[p.position] ?? 0) + 1;
    if (seen[p.position] <= k && isRealPhoto(p.photoUrl)) out.push(p.photoUrl);
  }
  return out;
}

const SIM_BUILD = 'b17i';   // bump with public/chase-cam/index.html so browsers never serve a cached sim
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
  nextEvent,
  disabled,
  homeTeam,
  awayTeam,
  homePlayers,
  awayPlayers,
  clock,
  state,
  onActiveChange,
  onPlayDead,
}: {
  enabled: boolean;
  event: PlayEvent | null;
  /** the event after this one, when the page already has it (a lost fumble is logged right after its run) */
  nextEvent?: PlayEvent | null;
  /** Current situation (spot, down, score, clock) for the pre-snap formation between plays — e.g. the two-point try at the 3 while the user picks a play */
  state: SimStateMessage['pre'] & { possession: 'home' | 'away'; form?: 'xp' | 'kickoff' } | null;
  /** e.g. speed === 'max' or the user skipped to the end: never hold the game */
  disabled?: boolean;
  homeTeam: TeamLike | null;
  awayTeam: TeamLike | null;
  /** Rosters in depth-chart order: starters' jersey numbers and skin tones go on the 3D players */
  homePlayers?: SimNamedPlayer[];
  awayPlayers?: SimNamedPlayer[];
  /** The clock the page's scorebug shows right now (it runs between plays) — mirrored on the 3D scorebug */
  clock?: { secs: number; quarter: number } | null;
  onActiveChange: (active: boolean) => void;
  /** the play is dead in 3D (whistle): the page can show its play-by-play line now, before the result callout */
  onPlayDead?: (eventId: number) => void;
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
      else if (m.type === 'bsgm:dead') { if (m.id != null && m.id === activeIdRef.current) onPlayDead?.(m.id); }
      else if (m.type === 'bsgm:done') { if (m.id === activeIdRef.current) { activeIdRef.current = null; setActiveBoth(false); } }
      else if (m.type === 'bsgm:error') { setFailed(m.message || 'failed to load'); setActiveBoth(false); }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [enabled, setActiveBoth, onPlayDead]);

  // Until the sim says ready, ask it every second: its ready message can land before this
  // listener exists (dev double-mount, a cached iframe), and a lost ready meant the sim ran the
  // whole game as its demo teams at the wrong spot.
  useEffect(() => {
    if (!enabled || ready) return;
    const iv = window.setInterval(() => post({ type: 'bsgm:hello' }), 1000);
    return () => window.clearInterval(iv);
  }, [enabled, ready, post]);

  // Team colours → sim (once ready, and whenever the matchup changes)
  // Real-roster players (imported photos): read each starter's skin tone off his headshot once, then re-send the lineup
  const [photoSkins, setPhotoSkins] = useState<Record<string, string>>({});
  const photoKey = [...starterPhotos(homePlayers), ...starterPhotos(awayPlayers)].join('|');
  useEffect(() => {
    if (!enabled || !photoKey) return;
    let live = true;
    const urls = photoKey.split('|').filter(u => !photoSkinCache.has(u));
    const known = () => Object.fromEntries([...photoSkinCache].filter((e): e is [string, string] => !!e[1]));
    if (!urls.length) { setPhotoSkins(known()); return; }
    Promise.all(urls.map(u => sampleSkinFromPhoto(u).then(s => { photoSkinCache.set(u, s); }))).then(() => { if (live) setPhotoSkins(known()); });
    return () => { live = false; };
  }, [enabled, photoKey]);
  const homeSim: SimTeam | null = homeTeam ? toSimTeam(homeTeam, 'home', homePlayers, photoSkins) : null;
  const awaySim: SimTeam | null = awayTeam ? toSimTeam(awayTeam, 'away', awayPlayers, photoSkins) : null;
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
    const { possession, form, ...pre } = state;
    post({ type: 'bsgm:state', possession, pre, ...(form ? { form } : {}) } satisfies SimStateMessage);
  }, [enabled, ready, stateKey, active, post]);   // eslint-disable-line react-hooks/exhaustive-deps -- state is keyed by stateKey

  // Game clock → 3D scorebug, always (the page's clock runs during the play; without this the 3D bug sat at the snap time)
  const clockKey = clock ? `${clock.quarter}:${clock.secs}` : '';
  useEffect(() => {
    if (!enabled || !ready || !clock) return;
    post({ type: 'bsgm:clock', clock: clock.secs, quarter: clock.quarter });
  }, [enabled, ready, clockKey, post]);   // eslint-disable-line react-hooks/exhaustive-deps -- clock is keyed by clockKey

  // New event → send it to the sim and hold the game until it reports done
  useEffect(() => {
    if (!enabled || !event || disabled || !ready || failed) return;
    if (lastIdRef.current === event.id) return;
    lastIdRef.current = event.id;
    const play = toSimPlay(event, { home: homePlayers ?? [], away: awayPlayers ?? [], photoSkins }, nextEvent);
    if (!play) return;   // nothing to picture (kickoff, fumble, XP, penalty…): the 2D field carries it
    activeIdRef.current = play.id;
    lastPlayPreRef.current = JSON.stringify({ possession: play.possession, ...play.pre });
    post(play);
    setActiveBoth(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rosters/skins only label the play; a change must not re-send it
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
        /* phones: one small chip that cycles the camera, plus the day/night icon — the full pill row covered a third of the frame */
        <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/55 p-0.5 text-[10px] font-bold text-white sm:hidden">
          <button type="button" onClick={() => { const i = CAM_LABELS.findIndex(([c]) => c === view.cam); setView({ cam: CAM_LABELS[(i + 1) % CAM_LABELS.length][0] }); }}
            className="rounded-full bg-white px-2 py-0.5 text-black">🎥 {(CAM_LABELS.find(([c]) => c === view.cam) ?? CAM_LABELS[0])[1]}</button>
          <button type="button" onClick={() => setView({ lighting: view.lighting === 'day' ? 'night' : 'day' })} title="Day / night"
            className="rounded-full px-1.5 py-0.5">{view.lighting === 'day' ? '☀️' : '🌙'}</button>
        </div>
      )}
      {ready && !failed && (
        <div className="absolute bottom-3 left-3 hidden items-center gap-1 rounded-full bg-black/55 p-1 text-[11px] font-bold text-white sm:flex">
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
          className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-bold text-white shadow hover:bg-black/75 sm:right-3 sm:top-3 sm:px-2.5 sm:py-1"
        >
          ⛶
        </button>
      )}
      {active && (
        <button
          type="button"
          onClick={() => { post({ type: 'bsgm:skip' }); activeIdRef.current = null; setActiveBoth(false); }}
          className="absolute bottom-2 right-2 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-bold text-black shadow sm:bottom-3 sm:right-3 sm:px-3 sm:py-1 sm:text-xs"
        >
          Skip ▸
        </button>
      )}
    </div>
  );
}
