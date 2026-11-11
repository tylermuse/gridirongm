'use client';

/**
 * Team Spotlight video show — the cut to the highlight.
 *
 * While the hosts talk through one of the game's scores, the show cuts from
 * the game-flow chart to that play, re-enacted by the 3D sim the live games
 * use (public/chase-cam/, in an iframe, driven over postMessage — see
 * LiveSim3D). The play is rebuilt from the scoring log (showClip.ts) and
 * replays for as long as the line is on it.
 *
 * The layer sits over the chart and fades in only once the sim is running
 * the right play: a sim that is still loading, that failed, or a score it
 * has no picture for all leave the chart on screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Player, Position, Team } from '@/types';
import type { GameFlow } from '@/lib/spotlight/showGame';
import { clipEventOf } from '@/lib/spotlight/showClip';
import { toSimPlay, toSimTeam } from '@/lib/engine/liveSim3d';
import { SIM_URL, usePhotoSkins } from './LiveSim3D';

/**
 * A replay has to be the same play every time it runs, and it shouldn't read
 * as a loop. Both are arranged from here, through the sim's own globals (the
 * frame is same-origin), so the sim file itself is untouched:
 *
 *  - Same play: the sim draws its choreography (routes, blocks, the touchdown
 *    celebration) from Math.random. It gets a seeded generator instead, reset
 *    the moment each play starts — the sim sets `__curPlayId` right before it
 *    plans one — to a seed that depends only on which score it is.
 *  - Not a loop: each run is shot from the next angle in ANGLES. 'front' is
 *    added to the sim's camera table here: the reverse of its chase camera,
 *    downfield of the ball and looking back at the play.
 *
 * If the frame can't be reached, nothing here applies and the replays simply
 * vary, as they did before.
 */
const ANGLES = ['broadcast', 'front', 'wide'] as const;
// Close enough to the ball that a goal-line play still has it inside the end zone.
const FRONT_CAM = { xf: 0.5, h: 4.6, back: -9, lxf: 0.7, ly: 1.1, ahead: -1, hLong: 5.5, backLong: -6, aheadLong: -1 };

function installReplayHooks(w: Window, seedFor: (id: number) => number): void {
  try {
    const sim = w as unknown as { CAMS?: Record<string, unknown>; Math: { random: () => number } };
    if (sim.CAMS && !sim.CAMS.front) sim.CAMS.front = FRONT_CAM;
    let state = 1;
    // mulberry32
    sim.Math.random = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let current: unknown;
    Object.defineProperty(w, '__curPlayId', {
      configurable: true,
      get: () => current,
      set: (id: unknown) => { current = id; state = seedFor(Number(id)) | 0; },
    });
  } catch { /* frame not reachable: replays vary */ }
}

/** FNV-1a: small, stable string hash. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A team's roster in depth-chart order, so the starters' numbers go on the 3D players. */
function inDepthOrder(team: Team | undefined, players: Player[]): Player[] {
  if (!team) return [];
  const roster = players.filter(p => p.teamId === team.id);
  const dc = team.depthChart;
  if (!dc) return roster.sort((a, b) => b.ratings.overall - a.ratings.overall);
  const rank = (p: Player) => { const i = dc[p.position as Position]?.indexOf(p.id) ?? -1; return i < 0 ? 999 : i; };
  return roster.sort((a, b) => rank(a) - rank(b));
}

export function SpotlightShowClip({ flow, play, teams, players, children }: {
  flow: GameFlow;
  /** The score to show (1-based), or null while the show is on something else. */
  play: number | null;
  teams: Team[];
  players: Player[];
  /** Drawn over the clip (the lower third). */
  children?: ReactNode;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // The play the sim is running for us, and one we cut away from that it is
  // still fast-forwarding through (the layer stays down until that's gone).
  const activeId = useRef<number | null>(null);
  const [flushing, setFlushing] = useState<number | null>(null);
  // Bumped when a play finishes: it runs again while the line is still on it.
  const [round, setRound] = useState(0);
  const seq = useRef(0);
  // Which score each message sent to the sim was (for its seed), and how many
  // times each score has been shown (for its next camera angle).
  const scoreOf = useRef(new Map<number, number>());
  const shown = useRef(new Map<number, number>());
  // Between two runs the sim clears the field and re-forms (its camera jumps
  // to the next spot): the picture dips out from the play's result until the
  // next run is under way, which also reads as the cut to another angle.
  const [dip, setDip] = useState(false);
  const dipTimer = useRef<number | null>(null);

  const post = useCallback((m: unknown) => {
    const w = frameRef.current?.contentWindow; if (!w) return;
    try { w.postMessage(m, window.location.origin); } catch { /* frame gone */ }
  }, []);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== frameRef.current?.contentWindow) return;
      const m = ev.data as { type?: string; id?: number } | null;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'bsgm:ready') setReady(true);
      else if (m.type === 'bsgm:error') setFailed(true);
      else if (m.type === 'bsgm:result') { if (m.id === activeId.current) setDip(true); }
      else if (m.type === 'bsgm:done') {
        setFlushing(f => (f === m.id ? null : f));
        if (m.id === activeId.current) { activeId.current = null; setRound(r => r + 1); }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // The sim's ready message can land before the listener above exists: ask until it answers.
  useEffect(() => {
    if (ready || failed) return;
    const iv = window.setInterval(() => post({ type: 'bsgm:hello' }), 1000);
    return () => window.clearInterval(iv);
  }, [ready, failed, post]);

  const usHome = flow.usHome !== false;
  const homeId = usHome ? flow.us.teamId : flow.them.teamId;
  const awayId = usHome ? flow.them.teamId : flow.us.teamId;
  const homeTeam = teams.find(t => t.id === homeId);
  const awayTeam = teams.find(t => t.id === awayId);
  const homePlayers = useMemo(() => inDepthOrder(homeTeam, players), [homeTeam, players]);
  const awayPlayers = useMemo(() => inDepthOrder(awayTeam, players), [awayTeam, players]);
  const photoSkins = usePhotoSkins(true, homePlayers, awayPlayers);

  // Uniforms, numbers and the broadcast angle, once the sim is up.
  const setup = useMemo(() => (homeTeam && awayTeam
    ? JSON.stringify({ type: 'bsgm:setup', home: toSimTeam(homeTeam, 'home', homePlayers, photoSkins), away: toSimTeam(awayTeam, 'away', awayPlayers, photoSkins) })
    : null), [homeTeam, awayTeam, homePlayers, awayPlayers, photoSkins]);
  useEffect(() => {
    if (!ready || !setup) return;
    post(JSON.parse(setup));
    post({ type: 'bsgm:view', cam: ANGLES[0], lighting: 'day' });
  }, [ready, setup, post]);

  // Same play on every run, by score (see installReplayHooks).
  const gameKey = `${flow.us.teamId}|${flow.them.teamId}|${flow.plays.length}`;
  useEffect(() => {
    const w = frameRef.current?.contentWindow;
    if (!ready || !w) return;
    installReplayHooks(w, id => hash(`${gameKey}|${scoreOf.current.get(id) ?? 0}`));
  }, [ready, gameKey]);

  const event = useMemo(() => (play != null ? clipEventOf(flow, play) : null), [flow, play]);

  // Run the play — again each time it ends — and stop it when the show moves on.
  useEffect(() => {
    if (!ready || failed) return;
    const running = activeId.current;
    const cut = () => {
      if (running == null) return;
      post({ type: 'bsgm:skip' });   // the sim fast-forwards to the whistle and reports done
      activeId.current = null;
      setFlushing(running);
    };
    if (!event) { cut(); return; }
    const msg = toSimPlay({ ...event, id: ++seq.current }, { home: homePlayers, away: awayPlayers, photoSkins });
    if (!msg) { cut(); return; }
    cut();
    activeId.current = msg.id;
    scoreOf.current.set(msg.id, play!);
    // Each run of a score from the next angle: behind the play, in front of it, wide.
    const runs = shown.current.get(play!) ?? 0;
    shown.current.set(play!, runs + 1);
    post({ type: 'bsgm:view', cam: ANGLES[runs % ANGLES.length] });
    post(msg);
    if (dipTimer.current != null) window.clearTimeout(dipTimer.current);
    dipTimer.current = window.setTimeout(() => setDip(false), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rosters / skins only label the play: a change must not restart it
  }, [ready, failed, event, round, post]);

  useEffect(() => () => { if (dipTimer.current != null) window.clearTimeout(dipTimer.current); }, []);

  // Leaving the page mid-play: nothing to tell the sim, it goes with the frame.
  const showing = ready && !failed && !!event && flushing == null;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black transition-opacity duration-300"
      style={{ opacity: showing ? 1 : 0 }}
      aria-hidden={!showing}
      data-show-clip={showing ? play : 'off'}
    >
      <iframe ref={frameRef} src={SIM_URL} title="Scoring play replay" tabIndex={-1} allow="autoplay" className="h-full w-full border-0" />
      <div className="absolute inset-0 bg-[#0f1f35] transition-opacity duration-200" style={{ opacity: dip ? 1 : 0 }} />
      {children}
    </div>
  );
}
