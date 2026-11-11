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
    post({ type: 'bsgm:view', cam: 'broadcast', lighting: 'day' });
  }, [ready, setup, post]);

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
    post(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rosters / skins only label the play: a change must not restart it
  }, [ready, failed, event, round, post]);

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
      {children}
    </div>
  );
}
