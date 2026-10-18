'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { synthesizePlayByPlay, type LiveEvent, type LiveEventKind, type LiveShot } from '@/lib/live/playByPlay';
import { eventsFromPlayLog, hasPlayLog } from '@/lib/live/fromPlayLog';
import { computeEventBeats } from '@/lib/live/beats';
import { computeMoments, type MomentTone } from '@/lib/live/moments';
import { winProbability, secondsLeftInGame } from '@/lib/live/winProbability';
import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type GameResult = BaseGameResult<BasketballStats>;
type Speed = 1 | 2 | 5 | 'max';
type Tab = 'pbp' | 'box' | 'flow' | 'quarters';
type Players = Record<string, BasketballPlayer>;

const EVENT_ICON: Record<LiveEventKind, string> = {
  make3: '🎯', make2: '●', ft: '○', block: '🚫', steal: '🖐', turnover: '🔄', rebound: '⬆',
  miss: '·', sub: '⇄', period: '⏱',
};

const TONE: Record<MomentTone, string> = {
  gold: '#d97706', red: '#dc2626', blue: '#2563eb', accent: 'var(--accent)',
};

/** Live stat line accumulated from revealed events (real-log mode). */
interface LiveLine { pts: number; reb: number; ast: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; stl: number; blk: number; to: number; pf: number }
const EMPTY_LINE: LiveLine = { pts: 0, reb: 0, ast: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, stl: 0, blk: 0, to: 0, pf: 0 };
const CODE_TO_LINE: Record<string, keyof LiveLine | undefined> = {
  pts: 'pts', reb: 'reb', ast: 'ast', fgm: 'fgm', fga: 'fga', '3pm': 'tpm', '3pa': 'tpa',
  ftm: 'ftm', fta: 'fta', stl: 'stl', blk: 'blk', to: 'to', pf: 'pf',
};

/**
 * Live game viewer. When the game carries the engine's real possession log
 * (every user game since the play-log change) it replays the ACTUAL game —
 * real misses, boards, assists, fouls, subs and clock — with an exact live box
 * score, win probability + game-flow chart, shot chart, big-play banners and a
 * halftime break. Older saves fall back to the box-score reconstruction.
 */
export function LiveViewer({
  userGameId, dayGameIds, onClose,
}: {
  userGameId: string;
  dayGameIds: string[];
  onClose: () => void;
}) {
  const { league } = useLeagueStore();
  const router = useRouter();
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState<Speed>(2);
  const [paused, setPaused] = useState(false);
  const [tab, setTab] = useState<Tab>('pbp');
  const [halftimeOpen, setHalftimeOpen] = useState(false);
  const halftimeShownRef = useRef(false);

  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  const game = league?.games.find(g => g.id === userGameId) as GameResult | undefined;
  const home = game ? teamById.get(game.homeTeamId) ?? null : null;
  const away = game ? teamById.get(game.awayTeamId) ?? null : null;
  const players = (league?.players ?? {}) as Players;

  const real = !!game && hasPlayLog(game.sportData);
  const events = useMemo(() => {
    if (!game || !home || !away || !league) return [];
    if (hasPlayLog(game.sportData)) return eventsFromPlayLog(game.sportData.playLog, players, home.abbreviation, away.abbreviation);
    return synthesizePlayByPlay(game, home, away, players);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, home, away, league]);

  const otherGames = useMemo(
    () => dayGameIds
      .filter(id => id !== userGameId)
      .map(id => league?.games.find(g => g.id === id) as GameResult | undefined)
      .filter((g): g is GameResult => !!g),
    [dayGameIds, userGameId, league],
  );

  const beats = useMemo(
    () => (home && away ? computeEventBeats(events, home.abbreviation, away.abbreviation) : []),
    [events, home, away],
  );
  const moments = useMemo(
    () => (home && away ? computeMoments(events, beats, home.abbreviation, away.abbreviation) : []),
    [events, beats, home, away],
  );

  const atEnd = cursor >= events.length;
  const last = cursor > 0 ? events[cursor - 1] : null;
  const crunch = !!(last && moments[cursor - 1]?.crunch) && !atEnd;

  // Playback: per-event delay — scoring plays and banners linger, crunch time
  // slows down, quiet events (rapid subs) flash by.
  useEffect(() => {
    if (paused || atEnd || speed === 'max' || halftimeOpen) return;
    const next = events[cursor];
    let ms = 1100 / speed;
    if (next?.quiet) ms *= 0.15;
    else if (next?.kind === 'rebound') ms *= 0.55;
    else if (next?.kind === 'period') ms *= 1.6;
    if (moments[cursor]?.chip) ms *= 1.5;
    if (moments[cursor]?.crunch) ms *= 1.7;
    const id = window.setTimeout(() => setCursor(c => Math.min(events.length, c + 1)), ms);
    return () => window.clearTimeout(id);
  }, [paused, atEnd, speed, halftimeOpen, cursor, events, moments]);

  // Halftime break — pause once at the half (not when skipping to the end).
  useEffect(() => {
    if (!real || halftimeShownRef.current || speed === 'max' || !last) return;
    if (last.kind === 'period' && last.quarter === 2) {
      halftimeShownRef.current = true;
      setHalftimeOpen(true);
    }
  }, [real, last, speed]);

  // Space toggles pause.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Space' && !(ev.target instanceof HTMLInputElement)) { ev.preventDefault(); setPaused(p => !p); }
      if (ev.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Exact live lines + who's on the floor, from the revealed events.
  const { lines, onFloor } = useMemo(() => {
    const lines = new Map<string, LiveLine>();
    const onFloor: { home: string[]; away: string[] } = { home: [], away: [] };
    for (let i = 0; i < cursor && i < events.length; i++) {
      const e = events[i];
      if (e.onFloor) onFloor[e.side] = e.onFloor;
      for (const [pid, code, d] of e.stats ?? []) {
        const k = CODE_TO_LINE[code];
        if (!k) continue;
        const l = lines.get(pid) ?? { ...EMPTY_LINE };
        l[k] += d;
        lines.set(pid, l);
      }
    }
    return { lines, onFloor };
  }, [events, cursor]);

  const toast = last ? moments[cursor - 1]?.chip ?? null : null;

  if (!game || !home || !away) return null;

  const score = last ? { home: last.home, away: last.away } : { home: 0, away: 0 };
  const progress = events.length ? cursor / events.length : 1;
  const qLabel = last ? quarterLabel(last.quarter) : '1st';
  const clock = last ? last.clock : '12:00';
  const feed = events.slice(0, cursor).map((e, i) => ({ e, i })).filter(x => !x.e.quiet).reverse();
  const wp = last ? winProbability(last.home - last.away, atEnd ? 0 : secondsLeftInGame(last.quarter, last.clock)) : winProbability(0, 2880);
  const wpLeader = wp >= 0.5 ? home : away;
  const wpPct = Math.round((wp >= 0.5 ? wp : 1 - wp) * 100);
  const shots = events.slice(0, cursor).filter(e => e.shot && e.quarter === (last?.quarter ?? 1));

  function setSpeedFn(s: Speed) {
    if (s === 'max') { setCursor(events.length); setHalftimeOpen(false); }
    setSpeed(s);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[var(--bg)] text-[var(--foreground)]">
      {/* Scoreboard */}
      <div className="shrink-0 px-4 sm:px-8 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          <ScoreSide team={away} score={score.away} align="left" leading={score.away > score.home} />
          <div className="text-center px-2 shrink-0">
            <div className="flex items-center justify-center gap-1.5 text-xs font-black tracking-wider" style={{ color: atEnd ? 'var(--text-sec)' : '#dc2626' }}>
              {!atEnd && <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />}
              {atEnd ? (last && last.quarter > 4 ? `FINAL/${last.quarter === 5 ? 'OT' : `${last.quarter - 4}OT`}` : 'FINAL') : 'LIVE'}
            </div>
            <div className="text-sm font-bold tabular-nums mt-0.5">{atEnd ? '' : `${qLabel} · ${clock}`}</div>
            {crunch && <div className="mt-1 text-[10px] font-black tracking-widest rounded px-1.5 py-0.5 text-white bg-red-600 animate-pulse">CRUNCH TIME</div>}
            {!crunch && real && !atEnd && (
              <div className="mt-1 text-[10px] font-bold text-[var(--text-sec)] tabular-nums" title="Win probability">
                <span style={{ color: wpLeader.primaryColor }}>{wpLeader.abbreviation}</span> {wpPct}% to win
              </div>
            )}
          </div>
          <ScoreSide team={home} score={score.home} align="right" leading={score.home > score.away} />
        </div>

        <div className="hidden md:block max-w-lg mx-auto mt-3 relative">
          <CourtCanvas home={home} away={away} last={last} cursor={cursor} shots={shots} />
          {toast && (
            <div key={cursor} className="absolute inset-x-0 -bottom-3 flex justify-center pointer-events-none">
              <span className="text-white font-black text-sm px-4 py-1 rounded-full shadow-lg animate-[bounce_0.6s_ease-out_1]" style={{ background: TONE[toast.tone] }}>{toast.text}</span>
            </div>
          )}
        </div>
        {toast && (
          <div key={`m-${cursor}`} className="md:hidden flex justify-center mt-2">
            <span className="text-white font-black text-xs px-3 py-1 rounded-full" style={{ background: TONE[toast.tone] }}>{toast.text}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 max-w-5xl w-full mx-auto px-4 sm:px-8 py-4 grid md:grid-cols-[1fr_15rem] gap-4">
        <div className="min-h-0 flex flex-col">
          <div className="inline-flex self-start rounded-lg overflow-hidden mb-2 text-xs font-bold border border-[var(--border)] bg-[var(--surface)]">
            {([['pbp', 'Play-by-Play', 'Plays'], ['box', 'Box Score', 'Box'], ['flow', 'Game Flow', 'Flow'], ['quarters', 'Quarters', 'Qtrs']] as [Tab, string, string][]).map(([t, label, short]) => (
              <button key={t} onClick={() => setTab(t)} className="px-3 py-1.5 whitespace-nowrap transition-colors" style={tab === t ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-sec)' }}>
                <span className="hidden sm:inline">{label}</span><span className="sm:hidden">{short}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pr-1">
            {tab === 'pbp' && (
              <div className="space-y-0.5">
                {feed.length === 0 && <div className="text-[var(--text-sec)] text-sm">Tip-off…</div>}
                {feed.map(({ e, i }, n) => {
                  if (e.kind === 'period') {
                    return (
                      <div key={i} className="my-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider text-center bg-[var(--muted)] text-[var(--text-sec)]">{e.text}</div>
                    );
                  }
                  const team = e.side === 'home' ? home : away;
                  const beat = beats[i];
                  const three = e.scoring && e.kind === 'make3';
                  const rail = three ? '#d97706' : team.primaryColor;
                  const dim = e.kind === 'sub' || e.kind === 'rebound' || e.kind === 'miss';
                  return (
                    <div key={i} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${n === 0 ? 'bg-[var(--surface)] shadow-sm' : ''}`} style={e.scoring ? { boxShadow: `inset 3px 0 0 ${rail}` } : undefined}>
                      <span className="text-[10px] tabular-nums text-[var(--text-sec)] w-14 shrink-0">{e.quarter <= 4 ? `Q${e.quarter}` : 'OT'} {e.clock}</span>
                      <span className="w-4 text-center shrink-0 text-xs" aria-hidden>{EVENT_ICON[e.kind]}</span>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: team.primaryColor }} />
                      <span className={`flex-1 ${e.scoring ? 'font-semibold' : dim ? 'text-[var(--text-sec)]' : ''}`}>
                        {e.text}{three ? ' (+3)' : ''}
                        {beat?.leadChange && <Beat label="Lead change" color="#d97706" />}
                        {beat?.tie && <Beat label="Tie game" color="#2563eb" />}
                        {beat?.runText && <Beat label={beat.runText} color="#dc2626" />}
                      </span>
                      {e.scoring && <span className="text-xs tabular-nums text-[var(--text-sec)] font-semibold">{e.away}–{e.home}</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {tab === 'box' && (real
              ? <LiveBoxScore home={home} away={away} players={players} lines={lines} onFloor={onFloor} />
              : <ApproxBoxScore game={game} home={home} away={away} players={players} progress={progress} />)}
            {tab === 'flow' && <GameFlow events={events} cursor={cursor} home={home} away={away} />}
            {tab === 'quarters' && <QuarterSplits game={game} home={home} away={away} uptoQuarter={last?.quarter ?? 1} atEnd={atEnd} />}
          </div>
        </div>

        {/* Around the league */}
        <div className="hidden md:flex flex-col min-h-0">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] font-bold mb-2">Around the league</div>
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1.5">
            {otherGames.length === 0 && <div className="text-[var(--text-sec)] text-xs">No other games today.</div>}
            {otherGames.map(g => (
              <AroundCard key={g.id} game={g} teamById={teamById} quarter={last?.quarter ?? 1} clock={last?.clock ?? '12:00'} done={atEnd} />
            ))}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 sm:px-8 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-2">
          {!atEnd && (
            <button onClick={() => setPaused(p => !p)} className="rounded-lg px-3 py-1.5 text-sm font-bold bg-[var(--surface-2)] hover:brightness-95" title="Space">
              {paused ? '▶ Play' : '⏸ Pause'}
            </button>
          )}
          {!atEnd && (
            <div className="flex items-center gap-1">
              {([1, 2, 5, 'max'] as Speed[]).map(s => (
                <button key={s} onClick={() => setSpeedFn(s)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold" style={speed === s ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--text-sec)' }}>
                  {s === 'max' ? 'Max' : `${s}×`}
                </button>
              ))}
            </div>
          )}
          {!atEnd && real && (
            <button onClick={() => { setCursor(jumpTarget(events, cursor)); setHalftimeOpen(false); }} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--text-sec)] hover:text-[var(--foreground)]">
              Next quarter ⏭
            </button>
          )}
          {!atEnd && (
            <button onClick={() => { setCursor(events.length); setHalftimeOpen(false); }} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--text-sec)] hover:text-[var(--foreground)]">
              Skip to final →
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {atEnd && (
              <button onClick={() => { onClose(); router.push(`/game/${userGameId}`); }} className="rounded-lg px-4 py-1.5 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
                Box Score →
              </button>
            )}
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--text-sec)] hover:text-[var(--foreground)]">
              {atEnd ? 'Close' : 'Exit'}
            </button>
          </div>
        </div>
      </div>

      {halftimeOpen && (
        <HalftimeCard home={home} away={away} score={score} lines={lines} players={players} onResume={() => setHalftimeOpen(false)} />
      )}
    </div>
  );
}

/** Index just past the next period break (for "Next quarter"). */
function jumpTarget(events: LiveEvent[], cursor: number): number {
  for (let i = cursor; i < events.length; i++) if (events[i].kind === 'period') return i + 1;
  return events.length;
}

// ===========================================================================
// Court + shot chart
// ===========================================================================

/**
 * Full-court canvas: both ends marked (paint, FT circle, 3-pt arc, rim),
 * each end tinted in the team that attacks it. Real-log games plot this
 * period's shots (filled = make, ring = miss); the latest shot pops.
 */
function CourtCanvas({ home, away, last, cursor, shots }: { home: BasketballTeam; away: BasketballTeam; last: LiveEvent | null; cursor: number; shots: LiveEvent[] }) {
  const made = !!last?.scoring && last.kind !== 'ft';
  const scoreColor = last ? (last.side === 'home' ? home.primaryColor : away.primaryColor) : 'var(--accent)';
  const awayPaint = `color-mix(in srgb, ${away.primaryColor} 16%, transparent)`;
  const homePaint = `color-mix(in srgb, ${home.primaryColor} 16%, transparent)`;
  const LINE = 'rgba(120,72,24,0.55)';
  const FAINT = 'rgba(120,72,24,0.35)';
  const possSide = last && last.kind !== 'period' ? last.side : null;
  return (
    <div className="relative rounded-lg overflow-hidden border border-[var(--border)]" style={{ background: 'linear-gradient(180deg,#f3dcb4,#e8c992)' }}>
      <svg viewBox="0 0 200 100" className="w-full block" preserveAspectRatio="xMidYMid meet" aria-label="Live court">
        <rect x="2" y="2" width="196" height="96" rx="2" fill="none" stroke={LINE} strokeWidth="1" />
        <line x1="100" y1="2" x2="100" y2="98" stroke={LINE} strokeWidth="1" />
        <circle cx="100" cy="50" r="11" fill="none" stroke={FAINT} strokeWidth="1" />

        {/* Left (away attacks) */}
        <rect x="2" y="34" width="28" height="32" fill={awayPaint} stroke={LINE} strokeWidth="1" />
        <circle cx="30" cy="50" r="8" fill="none" stroke={FAINT} strokeWidth="1" />
        <line x1="8" y1="44" x2="8" y2="56" stroke={LINE} strokeWidth="1.5" />
        <circle cx="11" cy="50" r="2" fill="none" stroke={away.primaryColor} strokeWidth="1.2" />
        <line x1="2" y1="20" x2="11" y2="20" stroke={FAINT} strokeWidth="1" />
        <line x1="2" y1="80" x2="11" y2="80" stroke={FAINT} strokeWidth="1" />
        <path d="M 11 20 A 30 30 0 0 1 11 80" fill="none" stroke={FAINT} strokeWidth="1" />

        {/* Right (home attacks) */}
        <rect x="170" y="34" width="28" height="32" fill={homePaint} stroke={LINE} strokeWidth="1" />
        <circle cx="170" cy="50" r="8" fill="none" stroke={FAINT} strokeWidth="1" />
        <line x1="192" y1="44" x2="192" y2="56" stroke={LINE} strokeWidth="1.5" />
        <circle cx="189" cy="50" r="2" fill="none" stroke={home.primaryColor} strokeWidth="1.2" />
        <line x1="198" y1="20" x2="189" y2="20" stroke={FAINT} strokeWidth="1" />
        <line x1="198" y1="80" x2="189" y2="80" stroke={FAINT} strokeWidth="1" />
        <path d="M 189 20 A 30 30 0 0 0 189 80" fill="none" stroke={FAINT} strokeWidth="1" />

        {/* Shot chart for the current period */}
        {shots.map((e, i) => <ShotDot key={i} shot={e.shot!} color={e.side === 'home' ? home.primaryColor : away.primaryColor} latest={i === shots.length - 1 && e === last} />)}

        {made && (
          <circle key={cursor} cx={last!.side === 'home' ? 189 : 11} cy="50" r="3" fill="none" stroke={scoreColor} strokeWidth="2.5">
            <animate attributeName="r" from="3" to="22" dur="0.7s" />
            <animate attributeName="opacity" from="1" to="0" dur="0.7s" />
          </circle>
        )}

        {possSide && !last?.shot && (
          <circle cx={possSide === 'home' ? 150 : 50} cy="50" r="3.5" fill="#ea580c" stroke="#7c2d12" strokeWidth="0.7" />
        )}
      </svg>
      <div className="absolute top-1 left-2 text-[10px] font-black tracking-wide" style={{ color: away.primaryColor }}>{away.abbreviation}</div>
      <div className="absolute top-1 right-2 text-[10px] font-black tracking-wide" style={{ color: home.primaryColor }}>{home.abbreviation}</div>
    </div>
  );
}

function ShotDot({ shot, color, latest }: { shot: LiveShot; color: string; latest: boolean }) {
  const r = latest ? 2.6 : 1.7;
  return shot.made
    ? <circle cx={shot.x} cy={shot.y} r={r} fill={color} stroke="#fff" strokeWidth="0.5" opacity={latest ? 1 : 0.85} />
    : <g opacity={latest ? 1 : 0.7}>
        <line x1={shot.x - r} y1={shot.y - r} x2={shot.x + r} y2={shot.y + r} stroke={color} strokeWidth="0.8" />
        <line x1={shot.x - r} y1={shot.y + r} x2={shot.x + r} y2={shot.y - r} stroke={color} strokeWidth="0.8" />
      </g>;
}

// ===========================================================================
// Game flow (margin + win probability)
// ===========================================================================

function GameFlow({ events, cursor, home, away }: { events: LiveEvent[]; cursor: number; home: BasketballTeam; away: BasketballTeam }) {
  const periods = Math.max(4, ...events.map(e => e.quarter));
  const total = 2880 + (periods - 4) * 300;
  const elapsedOf = (e: LiveEvent) => {
    const [mm, ss] = e.clock.split(':').map(Number);
    const secs = (mm || 0) * 60 + (ss || 0);
    return e.quarter <= 4 ? (e.quarter - 1) * 720 + (720 - secs) : 2880 + (e.quarter - 5) * 300 + (300 - secs);
  };
  const shown = events.slice(0, cursor).filter(e => e.kind !== 'sub');
  const finished = cursor >= events.length;
  const pts: { x: number; m: number; wp: number }[] = [{ x: 0, m: 0, wp: winProbability(0, 2880) }];
  shown.forEach((e, i) => {
    const x = Math.max(0, Math.min(total, elapsedOf(e)));
    const isLast = finished && i === shown.length - 1;
    pts.push({ x, m: e.home - e.away, wp: winProbability(e.home - e.away, isLast ? 0 : secondsLeftInGame(e.quarter, e.clock)) });
  });
  const maxM = Math.max(10, ...pts.map(p => Math.abs(p.m)));
  const W = 300, H = 120, mid = H / 2;
  const X = (x: number) => (x / total) * W;
  const Y = (m: number) => mid - (m / maxM) * (mid - 6);
  const step = pts.map((p, i) => (i === 0 ? `M ${X(p.x)} ${Y(p.m)}` : `H ${X(p.x)} V ${Y(p.m)}`)).join(' ');
  const lastX = X(pts[pts.length - 1].x);
  const area = `${step} H ${lastX} V ${mid} H 0 Z`;
  const wpLine = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${X(p.x)} ${H - p.wp * H}`).join(' ');
  const leads = { home: Math.max(0, ...pts.map(p => p.m)), away: Math.max(0, ...pts.map(p => -p.m)) };
  const changes = shown.reduce((n, e, i) => n + (i > 0 && Math.sign(e.home - e.away) !== 0 && Math.sign(e.home - e.away) !== Math.sign(shown[i - 1].home - shown[i - 1].away) && Math.sign(shown[i - 1].home - shown[i - 1].away) !== 0 ? 1 : 0), 0);
  const quarterLines = Array.from({ length: periods - 1 }, (_, i) => (i < 4 ? (i + 1) * 720 : 2880 + (i - 3) * 300)).filter(x => x < total);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between text-[11px] font-bold mb-1">
        <span style={{ color: home.primaryColor }}>▲ {home.abbreviation} lead</span>
        <span className="text-[var(--text-sec)] font-semibold">dashed = {home.abbreviation} win prob.</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44" preserveAspectRatio="none" aria-label="Game flow">
        <defs>
          <clipPath id="gf-top"><rect x="0" y="0" width={W} height={mid} /></clipPath>
          <clipPath id="gf-bot"><rect x="0" y={mid} width={W} height={mid} /></clipPath>
        </defs>
        {quarterLines.map(x => <line key={x} x1={X(x)} x2={X(x)} y1="0" y2={H} stroke="var(--border)" strokeWidth="0.6" />)}
        <line x1="0" x2={W} y1={mid} y2={mid} stroke="var(--text-sec)" strokeWidth="0.5" opacity="0.6" />
        <path d={area} fill={home.primaryColor} opacity="0.35" clipPath="url(#gf-top)" />
        <path d={area} fill={away.primaryColor} opacity="0.35" clipPath="url(#gf-bot)" />
        <path d={step} fill="none" stroke="var(--foreground)" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
        <path d={wpLine} fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex items-center justify-between text-[11px] font-bold mt-1">
        <span style={{ color: away.primaryColor }}>▼ {away.abbreviation} lead</span>
        <span className="text-[var(--text-sec)] font-semibold tabular-nums">
          Biggest leads: {home.abbreviation} +{leads.home} · {away.abbreviation} +{leads.away} · {changes} lead changes
        </span>
      </div>
    </div>
  );
}

// ===========================================================================
// Box scores
// ===========================================================================

function LiveBoxScore({ home, away, players, lines, onFloor }: { home: BasketballTeam; away: BasketballTeam; players: Players; lines: Map<string, LiveLine>; onFloor: { home: string[]; away: string[] } }) {
  const pct = (m: number, a: number) => (a ? `${Math.round((m / a) * 100)}%` : '—');
  return (
    <div className="space-y-3">
      {([[away, 'away'], [home, 'home']] as const).map(([team, side]) => {
        const rows = team.playerIds
          .map(id => ({ p: players[id], l: lines.get(id) }))
          .filter((x): x is { p: BasketballPlayer; l: LiveLine } => !!x.p && !!x.l)
          .sort((a, b) => b.l.pts - a.l.pts || b.l.reb - a.l.reb);
        const t = rows.reduce((s, r) => { (Object.keys(s) as (keyof LiveLine)[]).forEach(k => { s[k] += r.l[k]; }); return s; }, { ...EMPTY_LINE });
        return (
          <div key={team.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 bg-[var(--muted)]" style={{ color: team.primaryColor }}>
              <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />
              {team.city} {team.name}
              <span className="ml-auto font-semibold text-[var(--text-sec)]">FG {t.fgm}/{t.fga} {pct(t.fgm, t.fga)} · 3P {t.tpm}/{t.tpa} · FT {t.ftm}/{t.fta}</span>
            </div>
            <div className="grid grid-cols-[1fr_2.2rem_2.2rem_2.2rem_3.2rem_2.6rem_2rem] text-[10px] text-[var(--text-sec)] px-2.5 py-1 font-semibold">
              <span>Player</span><span className="text-right">PTS</span><span className="text-right">REB</span><span className="text-right">AST</span><span className="text-right">FG</span><span className="text-right">3P</span><span className="text-right">PF</span>
            </div>
            {rows.map(({ p, l }) => {
              const on = onFloor[side].includes(p.id);
              return (
                <div key={p.id} className="grid grid-cols-[1fr_2.2rem_2.2rem_2.2rem_3.2rem_2.6rem_2rem] text-xs px-2.5 py-0.5 border-t border-[var(--border)]">
                  <span className="truncate flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: on ? '#16a34a' : 'transparent' }} title={on ? 'On the floor' : undefined} />
                    {p.firstName[0]}. {p.lastName}
                  </span>
                  <span className="text-right tabular-nums font-bold">{l.pts}</span>
                  <span className="text-right tabular-nums">{l.reb}</span>
                  <span className="text-right tabular-nums">{l.ast}</span>
                  <span className="text-right tabular-nums text-[var(--text-sec)]">{l.fgm}-{l.fga}</span>
                  <span className="text-right tabular-nums text-[var(--text-sec)]">{l.tpm}-{l.tpa}</span>
                  <span className="text-right tabular-nums" style={l.pf >= 5 ? { color: '#dc2626', fontWeight: 700 } : { color: 'var(--text-sec)' }}>{l.pf}</span>
                </div>
              );
            })}
            {rows.length === 0 && <div className="px-2.5 py-2 text-xs text-[var(--text-sec)]">No stats yet.</div>}
          </div>
        );
      })}
      <div className="text-[10px] text-[var(--text-sec)] flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-600" /> on the floor</div>
    </div>
  );
}

/** Legacy (no play log): scale the final box score by replay progress. */
function ApproxBoxScore({ game, home, away, players, progress }: { game: GameResult; home: BasketballTeam; away: BasketballTeam; players: Players; progress: number }) {
  return (
    <div className="space-y-3">
      {[away, home].map(team => (
        <div key={team.id}>
          <div className="flex items-center gap-1.5 text-xs font-bold mb-1" style={{ color: team.primaryColor }}>
            <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />
            {team.city} {team.name}
          </div>
          <div className="grid grid-cols-[1fr_2.2rem_2.2rem_2.2rem] text-[11px] text-[var(--text-sec)] px-2">
            <span>Player</span><span className="text-right">PTS</span><span className="text-right">REB</span><span className="text-right">AST</span>
          </div>
          {team.playerIds
            .map(id => ({ p: players[id], s: game.boxScores[id] as Partial<BasketballStats> | undefined }))
            .filter(x => x.p && x.s && (x.s.minutes ?? 0) > 0)
            .sort((a, b) => (b.s!.points ?? 0) - (a.s!.points ?? 0))
            .slice(0, 8)
            .map(({ p, s }) => (
              <div key={p!.id} className="grid grid-cols-[1fr_2.2rem_2.2rem_2.2rem] text-xs px-2 py-0.5">
                <span className="truncate">{p!.firstName[0]}. {p!.lastName}</span>
                <span className="text-right tabular-nums font-semibold">{Math.round((s!.points ?? 0) * progress)}</span>
                <span className="text-right tabular-nums">{Math.round((s!.totalRebounds ?? 0) * progress)}</span>
                <span className="text-right tabular-nums">{Math.round((s!.assists ?? 0) * progress)}</span>
              </div>
            ))}
        </div>
      ))}
      <div className="text-[10px] text-[var(--text-sec)]">Estimated — this game was simulated before live play logs were recorded.</div>
    </div>
  );
}

// ===========================================================================
// Halftime
// ===========================================================================

function HalftimeCard({ home, away, score, lines, players, onResume }: { home: BasketballTeam; away: BasketballTeam; score: { home: number; away: number }; lines: Map<string, LiveLine>; players: Players; onResume: () => void }) {
  const teamLine = (team: BasketballTeam) => team.playerIds.reduce((s, id) => {
    const l = lines.get(id); if (!l) return s;
    return { fgm: s.fgm + l.fgm, fga: s.fga + l.fga, tpm: s.tpm + l.tpm, tpa: s.tpa + l.tpa, reb: s.reb + l.reb, to: s.to + l.to };
  }, { fgm: 0, fga: 0, tpm: 0, tpa: 0, reb: 0, to: 0 });
  const leader = (team: BasketballTeam) => {
    let best: { p: BasketballPlayer; l: LiveLine } | null = null;
    for (const id of team.playerIds) { const l = lines.get(id); const p = players[id]; if (l && p && (!best || l.pts > best.l.pts)) best = { p, l }; }
    return best;
  };
  const margin = score.home - score.away;
  const lead = margin === 0 ? 'All square at the break.' : `${margin > 0 ? home.abbreviation : away.abbreviation} leads by ${Math.abs(margin)}.`;
  const pct = (m: number, a: number) => (a ? `${Math.round((m / a) * 100)}%` : '—');
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4" onClick={onResume}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">Halftime</div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-2xl font-black tabular-nums"><span style={{ color: away.primaryColor }}>{away.abbreviation}</span> {score.away}</div>
          <div className="text-sm text-[var(--text-sec)]">{lead}</div>
          <div className="text-2xl font-black tabular-nums">{score.home} <span style={{ color: home.primaryColor }}>{home.abbreviation}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          {[away, home].map(team => {
            const t = teamLine(team);
            const l = leader(team);
            return (
              <div key={team.id} className="rounded-xl bg-[var(--surface-2)] p-3 text-xs space-y-1">
                <div className="font-bold" style={{ color: team.primaryColor }}>{team.city}</div>
                {l && <div><span className="font-bold">{l.p.firstName[0]}. {l.p.lastName}</span> — {l.l.pts} pts, {l.l.reb} reb, {l.l.ast} ast</div>}
                <div className="text-[var(--text-sec)]">FG {pct(t.fgm, t.fga)} · 3P {t.tpm}/{t.tpa}</div>
                <div className="text-[var(--text-sec)]">{t.reb} reb · {t.to} TO</div>
              </div>
            );
          })}
        </div>
        <button onClick={onResume} className="mt-4 w-full rounded-lg py-2 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>Start the 2nd half ▶</button>
      </div>
    </div>
  );
}

// ===========================================================================
// Quarters, scoreboard, around the league
// ===========================================================================

function QuarterSplits({ game, home, away, uptoQuarter, atEnd }: { game: GameResult; home: BasketballTeam; away: BasketballTeam; uptoQuarter: number; atEnd: boolean }) {
  const quarters = (game.sportData as { quarterScores?: { home: number; away: number }[] } | undefined)?.quarterScores ?? [];
  const shown = atEnd ? quarters.length : Math.min(quarters.length, uptoQuarter - 1);
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><table className="w-full text-sm">
      <thead className="text-[11px] text-[var(--text-sec)]">
        <tr>
          <th className="text-left py-1">Team</th>
          {quarters.map((_, i) => <th key={i} className="text-center w-9">{i < 4 ? `Q${i + 1}` : `OT${i - 3}`}</th>)}
        </tr>
      </thead>
      <tbody>
        {([away, home] as const).map((team, ti) => (
          <tr key={team.id} className="border-t border-[var(--border)]">
            <td className="py-1 font-semibold" style={{ color: team.primaryColor }}>{team.abbreviation}</td>
            {quarters.map((q, i) => (
              <td key={i} className="text-center tabular-nums">{i < shown ? (ti === 0 ? q.away : q.home) : '–'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    {!atEnd && <div className="text-[10px] text-[var(--text-sec)] mt-1">Completed periods only.</div>}
    </div>
  );
}

function ScoreSide({ team, score, align, leading }: { team: BasketballTeam | null; score: number; align: 'left' | 'right'; leading: boolean }) {
  if (!team) return <div />;
  return (
    <div className={`flex items-center gap-2 sm:gap-3 min-w-0 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="md" />
      <div className="min-w-0 hidden sm:block">
        <div className="font-black leading-tight" style={{ color: team.primaryColor }}>{team.abbreviation}</div>
        <div className="text-[var(--text-sec)] text-xs truncate">{team.city}</div>
      </div>
      <div className={`text-3xl sm:text-4xl font-black tabular-nums px-1 ${leading ? '' : 'opacity-70'}`}>{score}</div>
    </div>
  );
}

/** Other games advance in step with ours using their real quarter splits. */
function AroundCard({ game, teamById, quarter, clock, done }: { game: GameResult; teamById: Map<string, BasketballTeam>; quarter: number; clock: string; done: boolean }) {
  const home = teamById.get(game.homeTeamId);
  const away = teamById.get(game.awayTeamId);
  if (!home || !away || !game.finalScore) return null;
  const qs = (game.sportData as { quarterScores?: { home: number; away: number }[] } | undefined)?.quarterScores ?? [];
  const [m, s] = clock.split(':').map(Number);
  const periodLen = quarter >= 5 ? 300 : 720;
  const frac = 1 - ((m || 0) * 60 + (s || 0)) / periodLen;
  const upto = (side: 'home' | 'away') => {
    if (!qs.length) return Math.round(game.finalScore![side] * Math.min(1, (quarter - 1 + frac) / 4));
    let t = 0;
    for (let i = 0; i < qs.length; i++) {
      if (i + 1 < quarter) t += qs[i][side];
      else if (i + 1 === quarter) t += Math.round(qs[i][side] * frac);
    }
    return t;
  };
  const finished = done || quarter > qs.length || (quarter === qs.length && frac >= 1);
  const h = finished ? game.finalScore.home : upto('home');
  const a = finished ? game.finalScore.away : upto('away');
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
      {([[away, a], [home, h]] as const).map(([t, v]) => (
        <div key={t.id} className="flex items-center justify-between text-xs mt-0.5 first:mt-0">
          <span className="flex items-center gap-1.5">
            <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="xs" />
            <span className="font-semibold">{t.abbreviation}</span>
          </span>
          <span className="tabular-nums font-bold">{v}</span>
        </div>
      ))}
      <div className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest rounded px-1.5 py-0.5" style={{ background: finished ? 'var(--surface-2)' : 'rgba(220,38,38,0.12)', color: finished ? 'var(--text-sec)' : '#dc2626' }}>
        {!finished && <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />}{finished ? 'Final' : `Q${Math.min(quarter, 4)}`}
      </div>
    </div>
  );
}

function Beat({ label, color }: { label: string; color: string }) {
  return (
    <span className="ml-1.5 inline-block align-middle text-[9px] font-black uppercase tracking-wider rounded px-1 py-0.5" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {label}
    </span>
  );
}

function quarterLabel(q: number): string {
  if (q <= 4) return ['1st', '2nd', '3rd', '4th'][q - 1];
  return q === 5 ? 'OT' : `${q - 4}OT`;
}
