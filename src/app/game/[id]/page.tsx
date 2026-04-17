'use client';

import { use, useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore, flushToStorage, flushToStorageSync } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { simulatePlayByPlay, liveGameToGameResult, type LiveGamePlan } from '@/lib/engine/playByPlay';
import { createLiveCoachEngine, type LiveCoachEngine } from '@/lib/engine/liveCoachEngine';
import { Confetti } from '@/components/ui/Confetti';
import { AnimatedField } from '@/components/game/AnimatedField';
import { ScoreBug } from '@/components/game/ScoreBug';
import { GamePlanModal } from '@/components/game/GamePlanModal';
import { PlayCallMenu, type PlayCallType } from '@/components/game/PlayCallMenu';
import type { PlayEvent, LiveGameResult } from '@/lib/engine/playByPlay';
import type { Player, Position, GameResult } from '@/types';

// ---------------------------------------------------------------------------
// Speed settings
// ---------------------------------------------------------------------------

type Speed = '1x' | '2x' | '5x' | 'max';

const SPEED_MS: Record<Speed, number> = {
  '1x': 8000,
  '2x': 3500,
  '5x': 800,
  'max': 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function isSeparator(type: PlayEvent['type']): boolean {
  return ['quarter_end', 'halftime', 'two_minute_warning', 'overtime', 'final', 'timeout'].includes(type);
}

function downLabel(down: number, yardsToGo: number): string {
  if (down < 1 || down > 4) return '';
  const ordinals = ['1st', '2nd', '3rd', '4th'];
  return `${ordinals[down - 1]} & ${yardsToGo <= 0 ? 'Goal' : yardsToGo}`;
}





// ---------------------------------------------------------------------------
// Quarter-by-quarter scoring table
// ---------------------------------------------------------------------------

function QuarterScoreTable({
  events,
  homeAbbr, awayAbbr,
  homeColor, awayColor,
  homeTotal, awayTotal,
}: {
  events: PlayEvent[];
  homeAbbr: string;
  awayAbbr: string;
  homeColor: string;
  awayColor: string;
  homeTotal: number;
  awayTotal: number;
}) {
  // Calculate points per quarter
  const quarters = [1, 2, 3, 4];
  const homeByQ: number[] = [];
  const awayByQ: number[] = [];

  for (const q of quarters) {
    const qEvents = events.filter(e => e.quarter === q);
    if (qEvents.length === 0) {
      homeByQ.push(0);
      awayByQ.push(0);
    } else {
      const prevQ = events.filter(e => e.quarter < q);
      const prevHome = prevQ.length > 0 ? prevQ[prevQ.length - 1].homeScore : 0;
      const prevAway = prevQ.length > 0 ? prevQ[prevQ.length - 1].awayScore : 0;
      const endHome = qEvents[qEvents.length - 1].homeScore;
      const endAway = qEvents[qEvents.length - 1].awayScore;
      homeByQ.push(endHome - prevHome);
      awayByQ.push(endAway - prevAway);
    }
  }

  // Check for OT
  const hasOT = events.some(e => e.quarter > 4);
  if (hasOT) {
    const otEvents = events.filter(e => e.quarter > 4);
    const prevHome = events.filter(e => e.quarter <= 4).slice(-1)[0]?.homeScore ?? 0;
    const prevAway = events.filter(e => e.quarter <= 4).slice(-1)[0]?.awayScore ?? 0;
    homeByQ.push((otEvents.slice(-1)[0]?.homeScore ?? prevHome) - prevHome);
    awayByQ.push((otEvents.slice(-1)[0]?.awayScore ?? prevAway) - prevAway);
  }

  const cols = [...quarters.map(q => `${q}`), ...(hasOT ? ['OT'] : []), 'T'];

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[var(--text-sec)]">
          <th className="text-left py-1 w-16" />
          {cols.map(c => (
            <th key={c} className="py-1 text-center font-semibold w-8">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="py-1 font-bold" style={{ color: awayColor }}>{awayAbbr}</td>
          {awayByQ.map((pts, i) => (
            <td key={i} className="py-1 text-center text-[var(--text)]">{pts}</td>
          ))}
          <td className="py-1 text-center font-black text-[var(--text)]">{awayTotal}</td>
        </tr>
        <tr>
          <td className="py-1 font-bold" style={{ color: homeColor }}>{homeAbbr}</td>
          {homeByQ.map((pts, i) => (
            <td key={i} className="py-1 text-center text-[var(--text)]">{pts}</td>
          ))}
          <td className="py-1 text-center font-black text-[var(--text)]">{homeTotal}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Drive parsing + chart
// ---------------------------------------------------------------------------

type DriveResult = 'td' | 'fg' | 'punt' | 'turnover' | 'downs' | 'end';

interface Drive {
  possession: 'home' | 'away';
  startFieldPos: number;
  endFieldPos: number;
  plays: number;
  yards: number;
  result: DriveResult;
}

function parseDrives(events: PlayEvent[]): Drive[] {
  const drives: Drive[] = [];
  let current: {
    possession: 'home' | 'away';
    startFieldPos: number;
    lastFieldPos: number;
    playCount: number;
  } | null = null;

  function finishDrive(result: DriveResult) {
    if (!current) return;
    drives.push({
      possession: current.possession,
      startFieldPos: current.startFieldPos,
      endFieldPos: current.lastFieldPos,
      plays: current.playCount,
      yards: current.lastFieldPos - current.startFieldPos,
      result,
    });
    current = null;
  }

  for (const ev of events) {
    if (isSeparator(ev.type) || ev.type === 'extra_point') continue;
    if (ev.type === 'kickoff') {
      if (current) finishDrive('end');
      continue;
    }
    if (!current || current.possession !== ev.possession) {
      if (current) finishDrive('end');
      current = {
        possession: ev.possession,
        startFieldPos: ev.fieldPos,
        lastFieldPos: ev.fieldPos,
        playCount: 0,
      };
    }
    current.lastFieldPos = ev.fieldPos + (ev.yardsGained > 0 ? ev.yardsGained : 0);
    current.playCount++;
    if (ev.type === 'touchdown') { current.lastFieldPos = 100; finishDrive('td'); }
    else if (ev.type === 'field_goal_good') finishDrive('fg');
    else if (ev.type === 'field_goal_miss') finishDrive('downs');
    else if (ev.type === 'punt') finishDrive('punt');
    else if (ev.type === 'interception' || ev.type === 'fumble') finishDrive('turnover');
  }
  if (current) finishDrive('end');
  return drives;
}

const RESULT_COLORS: Record<DriveResult, string> = {
  td: '#22c55e', fg: '#eab308', turnover: '#ef4444', punt: '#9ca3af', downs: '#9ca3af', end: '#6b7280',
};
const RESULT_LABELS: Record<DriveResult, string> = {
  td: 'TD', fg: 'FG', turnover: 'TO', punt: 'Punt', downs: 'Downs', end: '—',
};

function DriveChart({ drives, homeColor, awayColor, homeAbbr, awayAbbr }: {
  drives: Drive[];
  homeColor: string;
  awayColor: string;
  homeAbbr: string;
  awayAbbr: string;
}) {
  if (drives.length === 0) return (
    <div className="text-sm text-[var(--text-sec)] text-center py-8 italic">No drives yet</div>
  );

  return (
    <div className="space-y-1">
      {drives.map((drive, idx) => {
        const teamColor = drive.possession === 'home' ? homeColor : awayColor;
        const teamAbbr = drive.possession === 'home' ? homeAbbr : awayAbbr;
        const startPct = clamp(drive.startFieldPos, 0, 100);
        const endPct = clamp(drive.endFieldPos, 0, 100);
        const barLeft = Math.min(startPct, endPct);
        const barWidth = Math.max(Math.abs(endPct - startPct), 2);

        return (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-[10px] font-bold w-8 text-right shrink-0" style={{ color: teamColor }}>
              {teamAbbr}
            </span>
            <div className="flex-1 relative h-5 bg-[var(--surface-2)] rounded overflow-hidden">
              {/* 20-yard markers */}
              {[20, 40, 50, 60, 80].map(yd => (
                <div key={yd} className="absolute top-0 bottom-0 w-px bg-[var(--border)] opacity-40"
                  style={{ left: `${yd}%` }} />
              ))}
              {/* Drive bar */}
              <div className="absolute top-1 bottom-1 rounded transition-all duration-300"
                style={{ left: `${barLeft}%`, width: `${barWidth}%`, backgroundColor: teamColor + 'cc' }} />
              {/* Result marker */}
              <div className="absolute top-0 bottom-0 w-1 rounded"
                style={{ left: `${clamp(endPct - 0.5, 0, 99.5)}%`, backgroundColor: RESULT_COLORS[drive.result] }} />
            </div>
            <span className="text-[10px] font-bold w-10 shrink-0" style={{ color: RESULT_COLORS[drive.result] }}>
              {RESULT_LABELS[drive.result]}
              {drive.result === 'td' || drive.result === 'fg' ? '' : ` ${drive.yards > 0 ? '+' : ''}${drive.yards}`}
            </span>
          </div>
        );
      })}
      {/* Legend */}
      <div className="flex gap-3 justify-center pt-2 flex-wrap">
        {(['td', 'fg', 'turnover', 'punt'] as DriveResult[]).map(r => (
          <div key={r} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: RESULT_COLORS[r] }} />
            <span className="text-[9px] text-[var(--text-sec)]">{RESULT_LABELS[r]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Play-by-play styling
// ---------------------------------------------------------------------------

function playBg(type: PlayEvent['type']): string {
  switch (type) {
    case 'touchdown': return 'bg-green-50 border-l-3 border-green-500';
    case 'field_goal_good': return 'bg-green-50/60 border-l-3 border-green-400';
    case 'interception': case 'fumble': return 'bg-red-100 border-l-4 border-red-600';
    case 'sack': return 'bg-red-50/60 border-l-3 border-red-300';
    case 'penalty': return 'bg-amber-50 border-l-3 border-amber-400';
    case 'halftime': case 'quarter_end': case 'two_minute_warning': case 'overtime': case 'final':
      return 'bg-[var(--surface-2)] border-l-3 border-[var(--border)]';
    case 'timeout': return 'bg-blue-50 border-l-3 border-blue-400';
    case 'extra_point': return 'bg-green-50/30';
    default: return 'hover:bg-[var(--surface-2)]/50';
  }
}

function isTurnover(type: PlayEvent['type']): boolean {
  return type === 'interception' || type === 'fumble';
}

function playTextColor(type: PlayEvent['type']): string {
  switch (type) {
    case 'touchdown': return 'text-green-700 font-bold';
    case 'field_goal_good': return 'text-green-600 font-semibold';
    case 'interception': case 'fumble': return 'text-red-700 font-bold';
    case 'sack': return 'text-red-600';
    case 'penalty': return 'text-amber-700';
    case 'halftime': case 'quarter_end': case 'two_minute_warning': case 'overtime': case 'final':
      return 'text-[var(--text-sec)] italic font-semibold';
    case 'timeout': return 'text-blue-700 font-semibold';
    default: return 'text-[var(--text)]';
  }
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = 'gamecast' | 'play-by-play' | 'drives' | 'stats';

// ---------------------------------------------------------------------------
// Win Probability Chart
// ---------------------------------------------------------------------------

function WinProbabilityChart({
  events,
  totalEvents,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
  userIsHome,
}: {
  events: PlayEvent[];
  totalEvents: number;
  homeColor: string;
  awayColor: string;
  homeAbbr: string;
  awayAbbr: string;
  userIsHome: boolean;
}) {
  if (events.length < 2) return null;

  // Orientation: user's team is always at the TOP of the Y-axis
  const topColor = userIsHome ? homeColor : awayColor;
  const botColor = userIsHome ? awayColor : homeColor;
  const topAbbr = userIsHome ? homeAbbr : awayAbbr;
  const botAbbr = userIsHome ? awayAbbr : homeAbbr;

  const W = 600;
  const H = 120;
  const PAD_X = 0;
  const PAD_Y = 8;
  const chartW = W - PAD_X * 2;
  const chartH = H - PAD_Y * 2;

  // Win probability for the "top" team (user's team) at each event
  // Higher k = more sensitive to score changes, more visual movement
  const probPoints: number[] = events.map(ev => {
    const diff = ev.homeScore - ev.awayScore;
    // Gentler curve: 13-pt lead in Q3 ≈ 87%, not 100%
    const quarterWeight = ev.quarter >= 4 ? 2.0 : ev.quarter >= 3 ? 1.3 : ev.quarter >= 2 ? 1.1 : 1;
    const k = 0.08 * quarterWeight; // 0.08 base: more realistic probabilities
    const homeProb = 1 / (1 + Math.exp(-k * diff));
    return userIsHome ? homeProb : 1 - homeProb;
  });

  const fullLen = Math.max(totalEvents, events.length, 1);
  const xStep = chartW / Math.max(1, fullLen - 1);
  const midY = PAD_Y + chartH / 2;
  const points = probPoints.map((p, i) => ({
    x: PAD_X + i * xStep,
    y: PAD_Y + (1 - p) * chartH, // top = user's team winning
  }));

  const lastPt = points[points.length - 1];
  const lastProb = probPoints[probPoints.length - 1];
  const topPct = Math.round(lastProb * 100);
  const botPct = 100 - topPct;
  const leadingColor = lastProb >= 0.5 ? topColor : botColor;

  const pathD = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${lastPt.x.toFixed(1)} ${midY} L ${PAD_X} ${midY} Z`;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-sec)]">Win Probability</span>
        <div className="flex items-center gap-3 text-xs font-bold">
          <span style={{ color: topColor }}>{topAbbr} {topPct}%</span>
          <span style={{ color: botColor }}>{botAbbr} {botPct}%</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }} preserveAspectRatio="none">
        <line x1={PAD_X} y1={midY} x2={W - PAD_X} y2={midY} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 3" />
        <defs>
          <clipPath id="clip-above-mid">
            <rect x={PAD_X} y={0} width={chartW} height={midY} />
          </clipPath>
          <clipPath id="clip-below-mid">
            <rect x={PAD_X} y={midY} width={chartW} height={chartH} />
          </clipPath>
        </defs>
        <path d={areaD} fill={topColor} opacity={0.15} clipPath="url(#clip-above-mid)" />
        <path d={areaD} fill={botColor} opacity={0.15} clipPath="url(#clip-below-mid)" />
        {/* Line segments colored by who's favored at each point */}
        {points.map((pt, i) => {
          if (i === 0) return null;
          const prev = points[i - 1];
          const segColor = probPoints[i] >= 0.5 ? topColor : botColor;
          return (
            <line
              key={i}
              x1={prev.x} y1={prev.y}
              x2={pt.x} y2={pt.y}
              stroke={segColor} strokeWidth="2" strokeLinejoin="round"
            />
          );
        })}
        {[0.25, 0.5, 0.75].map((frac, i) => {
          const x = PAD_X + frac * chartW;
          return (
            <g key={i}>
              <line x1={x} y1={PAD_Y} x2={x} y2={PAD_Y + chartH} stroke="var(--border)" strokeWidth="0.5" opacity={0.5} />
              <text x={x} y={H - 1} textAnchor="middle" fill="var(--text-sec)" fontSize="8" opacity={0.6}>
                Q{i + 2}
              </text>
            </g>
          );
        })}
        <circle cx={lastPt.x} cy={lastPt.y} r="3" fill={leadingColor} />
      </svg>
      <div className="flex justify-between text-[10px] mt-0.5">
        <div className="flex flex-col">
          <span style={{ color: topColor }} className="font-bold">{topAbbr}</span>
          <span style={{ color: botColor }} className="font-bold">{botAbbr}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const {
    schedule, teams, players, phase, userTeamId, commitLiveGame, playoffBracket, season,
  } = useGameStore();

  // Try schedule first, then check playoff bracket for unplayed matchups
  let game = schedule.find(g => g.id === id) ?? null;
  const playoffMatchup = playoffBracket?.find(m => m.id === id && !m.winnerId && m.homeTeamId && m.awayTeamId) ?? null;
  if (!game && playoffMatchup) {
    // Create a temporary GameResult from the matchup data for the live game engine
    game = {
      id: playoffMatchup.id, week: 99, season,
      homeTeamId: playoffMatchup.homeTeamId!, awayTeamId: playoffMatchup.awayTeamId!,
      homeScore: 0, awayScore: 0, played: false, playerStats: {},
    };
  }
  const isPlayoffGame = !!playoffMatchup || !!playoffBracket?.find(m => m.id === id);
  const homeTeam = game ? teams.find(t => t.id === game.homeTeamId) ?? null : null;
  const awayTeam = game ? teams.find(t => t.id === game.awayTeamId) ?? null : null;
  const homePlayers = useMemo(() => {
    if (!game) return [];
    const roster = players.filter(p => p.teamId === game.homeTeamId);
    const dc = homeTeam?.depthChart;
    if (!dc) return roster.sort((a, b) => b.ratings.overall - a.ratings.overall);
    return [...roster].sort((a, b) => {
      const ai = dc[a.position as Position]?.indexOf(a.id) ?? -1;
      const bi = dc[b.position as Position]?.indexOf(b.id) ?? -1;
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
  }, [game, players, homeTeam]);
  const awayPlayers = useMemo(() => {
    if (!game) return [];
    const roster = players.filter(p => p.teamId === game.awayTeamId);
    const dc = awayTeam?.depthChart;
    if (!dc) return roster.sort((a, b) => b.ratings.overall - a.ratings.overall);
    return [...roster].sort((a, b) => {
      const ai = dc[a.position as Position]?.indexOf(a.id) ?? -1;
      const bi = dc[b.position as Position]?.indexOf(b.id) ?? -1;
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
  }, [game, players, awayTeam]);

  // Determine if user is in this game and needs to set a game plan first
  const userInGame = !!game && (game.homeTeamId === userTeamId || game.awayTeamId === userTeamId);
  const userTeamSide: 'home' | 'away' | null = !game ? null
    : game.homeTeamId === userTeamId ? 'home'
    : game.awayTeamId === userTeamId ? 'away'
    : null;

  // Game plan modal state — only relevant when the user is in this game
  const [gamePlanReady, setGamePlanReady] = useState(!userInGame);
  const [livePlan, setLivePlan] = useState<LiveGamePlan | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  // Mid-game game-plan adjustment modal (shown via the "Game Plan" button when paused)
  const [showMidGamePlan, setShowMidGamePlan] = useState(false);

  const simRef = useRef<LiveGameResult | null>(null);
  if (simRef.current === null && homeTeam && awayTeam && game && !game.played && gamePlanReady && !simError) {
    try {
      const mcafeeMode = useGameStore.getState().leagueSettings?.mcafeeMode ?? false;
      simRef.current = simulatePlayByPlay(
        homeTeam, awayTeam, homePlayers, awayPlayers, isPlayoffGame, mcafeeMode,
        livePlan ?? undefined,
      );
    } catch (err) {
      console.error('[Watch Live] simulatePlayByPlay error:', err);
      setSimError(err instanceof Error ? err.message : 'Failed to start simulation');
    }
  }
  const liveResult = simRef.current;

  // Animation state
  const [revealedCount, setRevealedCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>('1x');
  const [committed, setCommitted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('gamecast');
  // Live Coach mode — when on, the playback pauses before each user offensive
  // snap and shows the play call menu. Toggleable at any time during the game.
  const [liveCoachOn, setLiveCoachOn] = useState(false);
  const [liveCoachPaused, setLiveCoachPaused] = useState(false);
  // Live Coach engine — generates events one-at-a-time after takeover
  const liveEngineRef = useRef<LiveCoachEngine | null>(null);
  const [liveExtraEvents, setLiveExtraEvents] = useState<PlayEvent[]>([]);
  const [liveEnginePivotIdx, setLiveEnginePivotIdx] = useState<number | null>(null);
  // Guard: prevents the auto-run effect from generating multiple events
  // before the current one has finished animating + pause.
  const pendingAutoPlayRef = useRef(false);
  // Post-play outcome chip — shows result briefly above the field
  const [outcomeChip, setOutcomeChip] = useState<{ text: string; color: string } | null>(null);
  const outcomeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Two-phase reveal: animationComplete tracks whether the current play's
  // field animation has finished. ScoreBug shows previous event's numbers
  // until this becomes true.
  const [animationComplete, setAnimationComplete] = useState(true);

  // Combined event stream — use pre-computed events up to the pivot,
  // then engine-generated events after Live Coach took over.
  const allEvents: PlayEvent[] = useMemo(() => {
    const pre = liveResult?.events ?? [];
    if (liveEnginePivotIdx === null) return pre;
    return [...pre.slice(0, liveEnginePivotIdx), ...liveExtraEvents];
  }, [liveResult, liveEnginePivotIdx, liveExtraEvents]);

  const totalEvents = allEvents.length;
  // The game is "finished" when there are no more events AND the engine (if used) reports done
  const engineDone = liveEngineRef.current?.isFinished() ?? false;
  const isFinished = revealedCount >= totalEvents && (liveEnginePivotIdx === null || engineDone);

  const currentEvent = allEvents[revealedCount - 1] ?? null;
  const previousEvent = revealedCount >= 2 ? (allEvents[revealedCount - 2] ?? null) : null;
  const revealedEvents = allEvents.slice(0, revealedCount);
  const displayEvents = useMemo(() => [...revealedEvents].reverse(), [revealedEvents]);
  const drives = useMemo(() => parseDrives(revealedEvents), [revealedEvents]);

  // Compute current drive stats
  const currentDrive = useMemo(() => {
    if (drives.length === 0) return { plays: 0, yards: 0 };
    const last = drives[drives.length - 1];
    // If last drive ended, no active drive
    if (last.result !== 'end') return { plays: 0, yards: 0 };
    return { plays: last.plays, yards: last.yards };
  }, [drives]);

  // Two-phase play reveal: animation-gated sequential advance
  // Pattern: reveal event → animation plays → onAnimationComplete fires →
  // short pause → reveal next event. No setInterval overlap.
  const nextPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNextPlayTimer = useCallback(() => {
    if (nextPlayTimerRef.current !== null) {
      clearTimeout(nextPlayTimerRef.current);
      nextPlayTimerRef.current = null;
    }
  }, []);

  // Called by AnimatedField when the play animation finishes
  const handleAnimationComplete = useCallback(() => {
    setAnimationComplete(true);
  }, []);

  // Tick counter — incremented after each auto-run delay completes to
  // re-trigger the auto-run effect (since revealedCount/totalEvents both
  // change by +1, netting zero change in the "are we caught up?" check).
  const [autoRunTick, setAutoRunTick] = useState(0);

  // ── Live Coach: when engine is active, auto-run AI plays as needed ──
  // Fires when we run out of events to reveal AND the engine is still going.
  useEffect(() => {
    if (liveEngineRef.current === null) return;
    if (liveEngineRef.current.isFinished()) return;
    if (liveCoachPaused) return;
    if (revealedCount < totalEvents) return; // still events to reveal

    // Check if next play is user offensive OR awaiting XP/2PT choice
    const engineState = liveEngineRef.current.getState();
    const isUserOffenseNow = !!userTeamSide && engineState.possession === userTeamSide && !engineState.isGameOver;
    const needsUserInput = isUserOffenseNow || engineState.awaitingXpChoice || engineState.awaitingKickoffChoice;
    if (liveCoachOn && needsUserInput) {
      setLiveCoachPaused(true);
      setIsPlaying(false);
      return;
    }

    // Guard: don't generate a new event if one is still animating/pausing
    if (pendingAutoPlayRef.current) return;

    // Auto-run AI play — generate ONE event and schedule reveal with delay.
    // The delay gives time for the animation to play and the user to read.
    const newEvents = liveEngineRef.current.runOnePlay();
    if (newEvents.length > 0) {
      pendingAutoPlayRef.current = true;
      setLiveExtraEvents(prev => [...prev, ...newEvents]);

      // Compute delay: animation + pause time based on speed
      const animMs = SPEED_MS[speed] * 0.35;
      const pauseMs = speed === '1x' ? 3500 : speed === '2x' ? 1200 : speed === '5x' ? 150 : 0;
      // Big moments (turnovers, scores, FGs) get extra dwell time
      const lastEvent = newEvents[newEvents.length - 1];
      const isBigMoment = lastEvent && (
        lastEvent.type === 'interception' || lastEvent.type === 'fumble' ||
        lastEvent.type === 'touchdown' || lastEvent.isScoring ||
        lastEvent.type === 'field_goal_good' || lastEvent.type === 'field_goal_miss' ||
        lastEvent.type === 'punt'
      );
      const bigExtra = isBigMoment
        ? (speed === '1x' ? 5000 : speed === '2x' ? 3500 : speed === '5x' ? 2000 : 0)
        : 0;
      const delay = Math.max(300, animMs + pauseMs + bigExtra);

      // Reveal the event immediately (so animation starts)
      setRevealedCount(prev => prev + 1);
      setIsPlaying(true);
      setAnimationComplete(false);

      // After delay, clear the guard and bump tick to re-trigger this effect
      setTimeout(() => {
        pendingAutoPlayRef.current = false;
        setAutoRunTick(t => t + 1);
      }, delay);
    }
  }, [revealedCount, totalEvents, liveCoachPaused, liveCoachOn, userTeamSide, isPlaying, speed, autoRunTick]);

  // ── Live Coach: detect if the NEXT event is a user offensive play snap ──
  // We check after an event reveals and before scheduling the next one.
  // A "user offensive snap" is the start of a new play (run/pass/sack) on the
  // user team's possession. We don't pause for kickoffs, FG/punt result events,
  // quarter ends, or defensive plays.
  const PLAY_TYPES_THAT_TRIGGER_PAUSE = new Set([
    'run', 'pass_complete', 'pass_incomplete', 'sack', 'fumble', 'interception', 'penalty',
  ]);
  const nextEvent = allEvents[revealedCount] ?? null;
  const nextEventIsUserSnap =
    !!nextEvent && userTeamSide !== null &&
    nextEvent.possession === userTeamSide &&
    PLAY_TYPES_THAT_TRIGGER_PAUSE.has(nextEvent.type);
  // Only pause via this path when the engine is NOT active. Once the engine
  // has taken over, the auto-run effect manages pausing via engine state.
  const shouldPauseForLiveCoach = liveCoachOn && nextEventIsUserSnap && !liveCoachPaused && liveEngineRef.current === null;

  // When animation completes and we're playing, schedule the next play reveal
  useEffect(() => {
    clearNextPlayTimer();
    if (!animationComplete || !isPlaying || isFinished || speed === 'max') return;
    // Live Coach pause: stop here, surface the play call menu instead of advancing
    if (shouldPauseForLiveCoach) {
      setLiveCoachPaused(true);
      return;
    }
    // Post-animation pause — gives time to read the play description before advancing
    const PAUSE_MS: Record<Speed, number> = { '1x': 3500, '2x': 1200, '5x': 150, 'max': 0 };
    // Big-moment extended pause — turnovers and scoring plays deserve extra
    // dwell time so the user actually sees what happened before possession flips.
    const TURNOVER_EXTRA: Record<Speed, number> = { '1x': 4500, '2x': 3000, '5x': 2000, 'max': 0 };
    const isBigMoment =
      currentEvent?.type === 'interception' ||
      currentEvent?.type === 'fumble' ||
      currentEvent?.type === 'touchdown' ||
      currentEvent?.type === 'field_goal_miss' ||
      currentEvent?.type === 'field_goal_good' ||
      currentEvent?.type === 'punt' ||
      currentEvent?.isScoring === true;
    const pause = PAUSE_MS[speed] + (isBigMoment ? TURNOVER_EXTRA[speed] : 0);
    nextPlayTimerRef.current = setTimeout(() => {
      setRevealedCount(prev => {
        if (prev >= totalEvents) {
          // Only stop playback if the live engine isn't active —
          // when the engine is running, the auto-run effect will
          // generate the next event and keep things moving.
          if (!liveEngineRef.current || liveEngineRef.current.isFinished()) {
            setIsPlaying(false);
          }
          return prev;
        }
        return prev + 1;
      });
      setAnimationComplete(false);
    }, pause);
    return clearNextPlayTimer;
  }, [animationComplete, isPlaying, isFinished, speed, totalEvents, clearNextPlayTimer, shouldPauseForLiveCoach, currentEvent]);

  const skipToEnd = useCallback(() => {
    clearNextPlayTimer();
    // If the live engine is active, run it to completion first
    if (liveEngineRef.current && !liveEngineRef.current.isFinished()) {
      const allRest: PlayEvent[] = [];
      let safety = 0;
      while (!liveEngineRef.current.isFinished() && safety < 500) {
        const evs = liveEngineRef.current.runOnePlay();
        allRest.push(...evs);
        safety++;
      }
      if (allRest.length > 0) {
        setLiveExtraEvents(prev => {
          const updated = [...prev, ...allRest];
          // Set revealedCount to the new total after all events are added
          const newTotal = (liveEnginePivotIdx ?? 0) + updated.length;
          setRevealedCount(newTotal);
          return updated;
        });
      }
      setLiveCoachOn(false);
      setLiveCoachPaused(false);
    } else {
      setRevealedCount(totalEvents);
    }
    setAnimationComplete(true);
    setIsPlaying(false);
  }, [totalEvents, clearNextPlayTimer, liveEnginePivotIdx]);

  useEffect(() => {
    if (speed === 'max' && isPlaying && !isFinished) {
      clearNextPlayTimer();
      setRevealedCount(totalEvents);
      setAnimationComplete(true);
      setIsPlaying(false);
    }
  }, [speed, isPlaying, isFinished, totalEvents, clearNextPlayTimer]);

  // Add play-type icon to event descriptions that don't already have one
  // (Live Coach events already have icons; this covers CPU/pre-computed events)
  function addPlayTypeIcon(evt: PlayEvent): string {
    const desc = evt.description;
    // Already has an icon from the Live Coach formatter
    if (/^[🏃🎯🚀⚡🛡🥾🏹]/.test(desc)) return desc;
    // Add icon based on event type
    const ICONS: Partial<Record<string, string>> = {
      run: '🏃',
      pass_complete: '🎯',
      pass_incomplete: '🎯',
      sack: '💥',
      interception: '🔄',
      fumble: '🔄',
      punt: '🥾',
      field_goal_good: '🏹',
      field_goal_miss: '🏹',
      touchdown: '🏆',
    };
    const icon = ICONS[evt.type];
    return icon ? `${icon} ${desc}` : desc;
  }

  // Post-play outcome chip — fire whenever a new play event is revealed
  useEffect(() => {
    if (!currentEvent || !currentEvent.type) return;
    const PLAY_TYPES = new Set(['run', 'pass_complete', 'pass_incomplete', 'sack', 'interception', 'fumble', 'touchdown', 'field_goal_good', 'field_goal_miss', 'punt']);
    if (!PLAY_TYPES.has(currentEvent.type)) return;

    let text = '';
    let color = 'bg-gray-700';
    const yds = currentEvent.yardsGained;

    if (currentEvent.type === 'field_goal_good') {
      text = '✅ FIELD GOAL GOOD'; color = 'bg-green-600';
    } else if (currentEvent.type === 'field_goal_miss') {
      text = '❌ NO GOOD'; color = 'bg-red-600';
    } else if (currentEvent.type === 'touchdown' || currentEvent.isScoring) {
      text = '🏆 TOUCHDOWN'; color = 'bg-green-600';
    } else if (currentEvent.type === 'interception') {
      text = '🔄 INTERCEPTED'; color = 'bg-orange-600';
    } else if (currentEvent.type === 'fumble') {
      text = '🔄 FUMBLE'; color = 'bg-orange-600';
    } else if (currentEvent.type === 'punt') {
      text = `🥾 PUNT ${yds > 0 ? `(${yds} yds)` : ''}`; color = 'bg-gray-600';
    } else if (currentEvent.type === 'pass_incomplete') {
      text = 'INCOMPLETE'; color = 'bg-gray-600';
    } else if (yds > 0) {
      // Check if first down was achieved
      const isFirstDown = currentEvent.down >= 1 && yds >= currentEvent.yardsToGo;
      if (isFirstDown) {
        text = `📍 1ST DOWN (+${yds})`; color = 'bg-yellow-500';
      } else {
        text = `+${yds} GAIN`; color = 'bg-blue-600';
      }
    } else if (yds < 0) {
      text = `${yds} LOSS`; color = 'bg-red-600';
    } else if (yds === 0 && currentEvent.type === 'run') {
      text = 'NO GAIN'; color = 'bg-gray-600';
    }

    if (!text) return;

    // Big plays persist longer so the user doesn't miss them — especially
    // turnovers and scores, which now get extra pause time on the play-advance
    // loop so the chip is still visible when possession flips.
    const isTurnover = ['🔄'].some(icon => text.includes(icon));
    const isBigPlay = ['🏆', '✅', '❌', '🔄'].some(icon => text.includes(icon));
    const chipDuration = isTurnover ? 7000 : isBigPlay ? 5500 : 1500;

    if (outcomeTimerRef.current) clearTimeout(outcomeTimerRef.current);
    setOutcomeChip({ text, color });
    outcomeTimerRef.current = setTimeout(() => setOutcomeChip(null), chipDuration);
  }, [revealedCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start: reveal first play when game starts
  useEffect(() => {
    if (liveResult && totalEvents > 0 && revealedCount === 0) {
      setIsPlaying(true);
      setRevealedCount(1);
      setAnimationComplete(false);
    }
  }, [liveResult, totalEvents, revealedCount]);

  // Build the game result from whichever source has the final score:
  // the live engine if it was active, otherwise the pre-computed sim.
  function buildFinalGameResult(): GameResult | null {
    if (!game) return null;
    if (liveEngineRef.current) {
      // Live engine was active — use ITS final state for the score
      const es = liveEngineRef.current.getState();
      return {
        ...game,
        homeScore: es.homeScore,
        awayScore: es.awayScore,
        played: true,
        playerStats: liveResult?.playerStats ?? {},
      };
    }
    if (liveResult) {
      return liveGameToGameResult(liveResult, game);
    }
    return null;
  }

  const handleCommit = useCallback(async () => {
    if (!game || committed) return;
    const gameResult = buildFinalGameResult();
    if (!gameResult) return;
    commitLiveGame(gameResult, isPlayoffGame ? id : undefined);
    setCommitted(true);
    await flushToStorage();
    router.push(isPlayoffGame ? '/playoffs' : '/');
  }, [game, committed, commitLiveGame, router, isPlayoffGame, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-commit when game finishes — no manual "Save & Continue" needed
  useEffect(() => {
    if (isFinished && game && !committed) {
      const gameResult = buildFinalGameResult();
      if (!gameResult) return;
      // Safety: if the live engine is active and scores are tied, OT should
      // have happened. Don't commit a tie if the engine hasn't truly finished.
      if (liveEngineRef.current && !liveEngineRef.current.isFinished()) return;
      commitLiveGame(gameResult, isPlayoffGame ? id : undefined);
      setCommitted(true);
      // Fire-and-forget flush — Zustand's in-memory state is already updated
      // so subsequent navigation will see the new bracket. The flush is only
      // for durability against tab close; we don't block on it.
      flushToStorage().catch(err => console.error('[auto-commit] flushToStorage failed:', err));
      console.log('[auto-commit] committed game', { id, homeScore: gameResult.homeScore, awayScore: gameResult.awayScore, isPlayoffGame });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinished, committed]);

  // Safety net: write recovery snapshot if tab closes during/after game
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushToStorageSync();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Guard conditions
  if (phase !== 'regular' && phase !== 'playoffs') {
    return (
      <GameShell>
        <div className="max-w-2xl mx-auto mt-16 text-center">
          <p className="text-[var(--text-sec)] text-lg">Live games are only available during the regular season and playoffs.</p>
        </div>
      </GameShell>
    );
  }
  if (!game) {
    return (
      <GameShell>
        <div className="max-w-2xl mx-auto mt-16 text-center">
          <p className="text-[var(--text-sec)] text-lg">Game not found.</p>
        </div>
      </GameShell>
    );
  }
  if (game.played && !simRef.current) {
    // Show post-game summary for already-played games
    const scoringPlays = game.scoringPlays ?? [];
    const pStats = game.playerStats ?? {};
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto space-y-4 py-4">
          {/* Score header */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 text-center">
            <div className="text-xs text-[var(--text-sec)] uppercase tracking-wider mb-2">Final</div>
            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <div className="text-3xl font-black">{game.awayScore}</div>
                <div className="text-sm font-bold text-[var(--text-sec)]">{awayTeam?.abbreviation ?? '??'}</div>
              </div>
              <div className="text-xl text-[var(--text-sec)]">—</div>
              <div className="text-center">
                <div className="text-3xl font-black">{game.homeScore}</div>
                <div className="text-sm font-bold text-[var(--text-sec)]">{homeTeam?.abbreviation ?? '??'}</div>
              </div>
            </div>
          </div>

          {/* Scoring Summary */}
          {scoringPlays.length > 0 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-sec)] mb-3">Scoring Summary</h3>
              <div className="space-y-2">
                {scoringPlays.map((play, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm border-b border-[var(--border)] last:border-0 pb-2 last:pb-0">
                    <span className="text-xs font-bold text-[var(--text-sec)] w-8">{play.quarter ? `Q${play.quarter}` : ''}</span>
                    <span className="font-medium">{play.teamId === game.homeTeamId ? homeTeam?.abbreviation : awayTeam?.abbreviation}</span>
                    <span className="flex-1 text-[var(--text-sec)]">{play.description}</span>
                    <span className="font-mono font-bold text-xs">{play.score[0]}-{play.score[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Player Stats */}
          {Object.keys(pStats).length > 0 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-sec)] mb-3">Key Performers</h3>
              <div className="grid grid-cols-2 gap-4">
                {[{ teamId: game.homeTeamId, team: homeTeam }, { teamId: game.awayTeamId, team: awayTeam }].map(({ teamId, team }) => {
                  const teamPlayerStats = Object.entries(pStats)
                    .filter(([pid]) => players.find(p => p.id === pid)?.teamId === teamId)
                    .map(([pid, stats]) => ({ player: players.find(p => p.id === pid), stats }))
                    .filter(x => x.player)
                    .sort((a, b) => {
                      const aVal = (a.stats.passYards ?? 0) + (a.stats.rushYards ?? 0) + (a.stats.receivingYards ?? 0) + (a.stats.tackles ?? 0) * 3;
                      const bVal = (b.stats.passYards ?? 0) + (b.stats.rushYards ?? 0) + (b.stats.receivingYards ?? 0) + (b.stats.tackles ?? 0) * 3;
                      return bVal - aVal;
                    })
                    .slice(0, 5);
                  return (
                    <div key={teamId}>
                      <div className="text-xs font-bold text-[var(--text-sec)] mb-2">{team?.abbreviation ?? '??'}</div>
                      <div className="space-y-1.5">
                        {teamPlayerStats.map(({ player: p, stats: s }) => {
                          if (!p) return null;
                          let statLine = '';
                          if ((s.passYards ?? 0) > 0) statLine = `${s.passYards} YDS, ${s.passTDs ?? 0} TD, ${s.interceptions ?? 0} INT`;
                          else if ((s.rushYards ?? 0) > 0) statLine = `${s.rushYards} YDS, ${s.rushTDs ?? 0} TD`;
                          else if ((s.receivingYards ?? 0) > 0) statLine = `${s.receptions ?? 0} REC, ${s.receivingYards} YDS`;
                          else if ((s.tackles ?? 0) > 0) statLine = `${s.tackles} TKL${(s.sacks ?? 0) > 0 ? `, ${s.sacks} SCK` : ''}`;
                          if (!statLine) return null;
                          return (
                            <div key={p.id} className="text-xs">
                              <span className="font-medium">{p.firstName[0]}. {p.lastName}</span>
                              <span className="text-[var(--text-sec)] ml-1">{p.position}</span>
                              <span className="text-[var(--text-sec)] ml-2">{statLine}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="text-center">
            <Button onClick={() => router.push('/')}>Back to Dashboard</Button>
          </div>
        </div>
      </GameShell>
    );
  }
  // Show the Game Plan modal if user is in this game and hasn't set one yet.
  // Must run BEFORE the !liveResult guard, because gamePlanReady=false intentionally
  // blocks sim creation until the user submits a plan.
  if (userInGame && !gamePlanReady) {
    const opponentTeam = userTeamSide === 'home' ? awayTeam : homeTeam;
    const opponentName = opponentTeam ? `${opponentTeam.city} ${opponentTeam.name}` : 'Opponent';
    return (
      <GameShell>
        <GamePlanModal
          opponentName={opponentName}
          onConfirm={(plan) => {
            if (userTeamSide) {
              setLivePlan({ ...plan, userTeamSide });
            }
            setGamePlanReady(true);
          }}
          onCancel={() => {
            // Skip the plan — sim with default behavior
            setLivePlan(null);
            setGamePlanReady(true);
          }}
        />
      </GameShell>
    );
  }

  if (!liveResult) {
    const reason = simError
      ? simError
      : !homeTeam || !awayTeam
        ? 'Team data not loaded.'
        : game?.played
          ? 'This game has already been played.'
          : 'Preparing simulation…';
    return (
      <GameShell>
        <div className="max-w-2xl mx-auto mt-16 text-center space-y-4">
          {simError ? (
            <>
              <div className="text-4xl">⚠️</div>
              <h2 className="text-lg font-bold">Simulation failed to start</h2>
              <p className="text-sm text-[var(--text-sec)]">{reason}</p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => { setSimError(null); simRef.current = null; }}>Retry</Button>
                <Button variant="ghost" onClick={() => router.push('/')}>Back to Dashboard</Button>
              </div>
            </>
          ) : game?.played ? (
            <>
              <div className="text-4xl">✅</div>
              <h2 className="text-lg font-bold">Game already played</h2>
              <p className="text-sm text-[var(--text-sec)]">This game has been simulated. View the box score from the dashboard or news.</p>
              <Button onClick={() => router.push('/')}>Back to Dashboard</Button>
            </>
          ) : (
            <>
              <p className="text-[var(--text-sec)]">{reason}</p>
              <Button variant="ghost" size="sm" onClick={() => router.push('/')}>Cancel</Button>
            </>
          )}
        </div>
      </GameShell>
    );
  }

  const isUserGame = game.homeTeamId === userTeamId || game.awayTeamId === userTeamId;
  const homeColor = homeTeam?.primaryColor ?? '#3b82f6';
  const awayColor = awayTeam?.primaryColor ?? '#ef4444';
  const homeAbbr = homeTeam?.abbreviation ?? 'HME';
  const awayAbbr = awayTeam?.abbreviation ?? 'AWY';
  const homeRecord = homeTeam?.record;
  const awayRecord = awayTeam?.record;

  // When Live Coach is paused for user input, show the ENGINE state on the
  // field/scorebug (which is ahead of the last revealed pre-computed event).
  const engineSnapshot = liveCoachPaused && liveEngineRef.current ? liveEngineRef.current.getState() : null;
  const liveHomeScore = engineSnapshot?.homeScore ?? currentEvent?.homeScore ?? 0;
  const liveAwayScore = engineSnapshot?.awayScore ?? currentEvent?.awayScore ?? 0;
  // Derive effective quarter — if the engine is in overtime but its quarter
  // field wasn't updated (pre-fix engines set overtime=true but left quarter=4),
  // bump the displayed quarter to 5 so the scoreboard shows "OT".
  const rawEngineQuarter = engineSnapshot?.quarter ?? currentEvent?.quarter ?? 1;
  const liveQuarter = (engineSnapshot?.overtime && rawEngineQuarter < 5) ? 5 : rawEngineQuarter;
  const liveTime = engineSnapshot
    ? `${Math.floor(engineSnapshot.timeSecs / 60)}:${String(engineSnapshot.timeSecs % 60).padStart(2, '0')}`
    : currentEvent?.timeStr ?? '15:00';
  const livePoss = engineSnapshot?.possession ?? currentEvent?.possession ?? 'home';
  const liveFieldPos = engineSnapshot?.fieldPos ?? currentEvent?.fieldPos ?? 25;
  const liveDown = engineSnapshot?.down ?? currentEvent?.down ?? 1;
  const liveYtg = engineSnapshot?.yardsToGo ?? currentEvent?.yardsToGo ?? 10;
  const liveHomeTimeouts = engineSnapshot?.homeTimeouts ?? currentEvent?.homeTimeouts ?? 3;
  const liveAwayTimeouts = engineSnapshot?.awayTimeouts ?? currentEvent?.awayTimeouts ?? 3;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'gamecast', label: 'Gamecast' },
    { id: 'play-by-play', label: 'Play-by-Play' },
    { id: 'drives', label: 'Drives' },
    { id: 'stats', label: 'Stats' },
  ];

  return (
    <GameShell>
      {/* Mid-game game plan adjustment modal */}
      {showMidGamePlan && userTeamSide && (() => {
        const opp = userTeamSide === 'home' ? awayTeam : homeTeam;
        const oppName = opp ? `${opp.city} ${opp.name}` : 'Opponent';
        return (
          <GamePlanModal
            opponentName={oppName}
            onConfirm={(plan) => {
              const newPlan: LiveGamePlan = { ...plan, userTeamSide };
              setLivePlan(newPlan);
              // Persist for the next game too
              useGameStore.getState().setNextGamePlan(plan);
              // Persist for the next game too
              useGameStore.getState().setNextGamePlan(plan);
              setShowMidGamePlan(false);
            }}
            onCancel={() => setShowMidGamePlan(false)}
          />
        );
      })()}

      {/* Live Coach play call menu is now rendered inline in the sidebar */}

      <div className="max-w-6xl mx-auto flex items-start gap-4">
      {/* Main game content */}
      <div className="flex-1 min-w-0 space-y-3">

        {/* ================================================================
            GAME OVER BANNER — pinned to top when finished
        ================================================================ */}
        {isFinished && liveResult && (() => {
          // Use live engine scores (from events) — NOT the pre-computed sim scores.
          // liveHomeScore/liveAwayScore track the actual played game score.
          const finalHome = liveHomeScore;
          const finalAway = liveAwayScore;
          const userIsHome = game.homeTeamId === userTeamId;
          const userScore = userIsHome ? finalHome : finalAway;
          const oppScore = userIsHome ? finalAway : finalHome;
          const won = isUserGame && userScore > oppScore;
          const tied = userScore === oppScore;
          return (
            <>
              {won && <Confetti duration={5000} />}
              <div className="bg-[var(--surface)] border-2 border-green-300 rounded-xl p-6 text-center space-y-4">
                <div className="text-sm font-bold uppercase tracking-wider text-green-600">Game Over</div>
                <div className="flex items-center justify-center gap-6">
                  <div className="text-center">
                    <div className="text-xs text-[var(--text-sec)]">{awayAbbr}</div>
                    <div className="text-3xl font-black" style={{ color: awayColor }}>{finalAway}</div>
                  </div>
                  <div className="text-[var(--text-sec)] text-xl">–</div>
                  <div className="text-center">
                    <div className="text-xs text-[var(--text-sec)]">{homeAbbr}</div>
                    <div className="text-3xl font-black" style={{ color: homeColor }}>{finalHome}</div>
                  </div>
                </div>
                {isUserGame && (
                  <Badge variant={won ? 'green' : tied ? 'default' : 'red'} size="md">
                    {won ? 'Victory!' : tied ? 'Tie' : 'Defeat'}
                  </Badge>
                )}
                <div>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={async () => { await flushToStorage(); router.push(isPlayoffGame ? '/playoffs' : '/'); }}
                  >
                    Continue →
                  </Button>
                  <p className="text-[10px] text-green-600 mt-2">
                    Game result saved automatically.
                  </p>
                </div>
              </div>
            </>
          );
        })()}

        {/* ================================================================
            SCORE BUG + ANIMATED FIELD
        ================================================================ */}
        <ScoreBug
          homeAbbr={homeAbbr}
          awayAbbr={awayAbbr}
          homeColor={homeColor}
          awayColor={awayColor}
          homeScore={liveHomeScore}
          awayScore={liveAwayScore}
          quarter={liveQuarter}
          timeStr={liveTime}
          possession={livePoss}
          down={liveDown}
          yardsToGo={liveYtg}
          fieldPos={liveFieldPos}
          isFinished={isFinished}
          isPlaying={isPlaying}
          drivePlays={currentDrive.plays}
          driveYards={currentDrive.yards}
          homeTimeouts={liveHomeTimeouts}
          awayTimeouts={liveAwayTimeouts}
          lastPlayDescription={(() => {
            // Show the most recent non-separator play description.
            // Check currentEvent first, then fall back to the last engine event.
            if (currentEvent && !isSeparator(currentEvent.type)) return addPlayTypeIcon(currentEvent);
            // When paused for Live Coach, currentEvent might be a separator/old event.
            // Search backwards through revealed events for the most recent play.
            for (let i = revealedCount - 1; i >= 0; i--) {
              const ev = allEvents[i];
              if (ev && !isSeparator(ev.type)) return addPlayTypeIcon(ev);
            }
            return null;
          })()}
        />

        {/* Big-play alert banner — turnovers, TDs, missed FGs shown prominently above the field */}
        {outcomeChip && (() => {
          const isTurnover = outcomeChip.text.includes('INTERCEPTED') || outcomeChip.text.includes('FUMBLE');
          const isTD = outcomeChip.text.includes('TOUCHDOWN');
          const isBig = isTurnover || isTD || outcomeChip.text.includes('NO GOOD') || outcomeChip.text.includes('FIELD GOAL');
          return (
            <div className={`${outcomeChip.color} text-white font-black text-center rounded-lg shadow-lg ${
              isTurnover ? 'py-5 px-6 text-xl border-2 border-white/30' :
              isBig ? 'py-4 px-5 text-lg' :
              'py-2 px-4 text-sm'
            }`}>
              <div>{outcomeChip.text}</div>
              {isTurnover && <div className="text-xs font-semibold opacity-80 mt-1">Possession change</div>}
            </div>
          );
        })()}

        {/* Animated field + outcome chip overlay */}
        <div className="relative">
          <AnimatedField
            event={engineSnapshot ? {
              id: -1,
              type: 'run' as const,
              description: '',
              quarter: engineSnapshot.quarter,
              timeStr: liveTime,
              possession: engineSnapshot.possession,
              fieldPos: engineSnapshot.fieldPos,
              down: engineSnapshot.down,
              yardsToGo: engineSnapshot.yardsToGo,
              yardsGained: 0,
              homeScore: engineSnapshot.homeScore,
              awayScore: engineSnapshot.awayScore,
              isScoring: false,
            } : currentEvent}
            prevEvent={previousEvent}
            homeColor={homeColor}
            awayColor={awayColor}
            homeAbbr={homeAbbr}
            awayAbbr={awayAbbr}
            isPlaying={isPlaying}
            animationSpeed={SPEED_MS[speed]}
            onAnimationComplete={handleAnimationComplete}
            driveYards={currentDrive.yards}
            drivePossession={engineSnapshot?.possession ?? currentEvent?.possession}
            userSide={userTeamSide ?? 'home'}
          />

          {/* Post-play outcome chip */}
          {outcomeChip && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 animate-bounce-in">
              <div className={`${outcomeChip.color} text-white font-black text-sm px-4 py-1.5 rounded-full shadow-lg`}>
                {outcomeChip.text}
              </div>
            </div>
          )}
        </div>

        {/* Drive summary ribbon — uses the same live* vars as the scorebug
            so it always matches (including engine state during Live Coach) */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-1.5 text-xs text-[var(--text-sec)] flex items-center justify-between">
          <span>
            <span className="font-bold text-[var(--text)]">Drive:</span>{' '}
            {currentDrive.plays} play{currentDrive.plays !== 1 ? 's' : ''}, {currentDrive.yards >= 0 ? '+' : ''}{currentDrive.yards} yds
          </span>
          <span className="tabular-nums">
            {liveDown >= 1 && liveDown <= 4 && (
              <span className="font-medium text-[var(--text)]">
                {['1st', '2nd', '3rd', '4th'][liveDown - 1]} & {liveYtg <= 0 ? 'Goal' : liveYtg}
              </span>
            )}
            {' '}at{' '}
            {(() => {
              // Use team abbreviations for the ribbon (not OWN/OPP)
              const possAbbr = livePoss === 'home' ? homeAbbr : awayAbbr;
              const oppAbbr2 = livePoss === 'home' ? awayAbbr : homeAbbr;
              return liveFieldPos <= 50 ? `${possAbbr} ${liveFieldPos}` : `${oppAbbr2} ${100 - liveFieldPos}`;
            })()}
          </span>
        </div>

        {/* Quarter score table */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-6 py-2">
          <QuarterScoreTable
            events={revealedEvents}
            homeAbbr={homeAbbr}
            awayAbbr={awayAbbr}
            homeColor={homeColor}
            awayColor={awayColor}
            homeTotal={liveHomeScore}
            awayTotal={liveAwayScore}
          />
        </div>

        {/* ================================================================
            CONTROLS BAR (speed + play/pause)
        ================================================================ */}
        <div className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5">
          {/* Speed */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-[var(--text-sec)] uppercase mr-1">Speed</span>
            {(['1x', '2x', '5x', 'max'] as Speed[]).map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  speed === s
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-[var(--border)]" />

          {/* Play/Pause */}
          <button
            onClick={() => { if (!isFinished) setIsPlaying(p => !p); }}
            disabled={isFinished}
            className="px-4 py-1 rounded-md text-xs font-semibold bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)] disabled:opacity-40 transition-all"
          >
            {isFinished ? '● Complete' : isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          {/* Game Plan — only when user is in this game and game isn't done */}
          {userInGame && !isFinished && (
            <button
              onClick={() => { setIsPlaying(false); setShowMidGamePlan(true); }}
              className="px-3 py-1 rounded-md text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-all"
              title="Adjust your game plan (pauses the game)"
            >
              📋 Game Plan
            </button>
          )}
          {/* Live Coach toggle — only when user is in this game */}
          {userInGame && !isFinished && (
            <button
              onClick={() => {
                const turningOn = !liveCoachOn;
                setLiveCoachOn(turningOn);
                setLiveCoachPaused(false);
                // First-time activation: seed the live engine from the current state
                if (turningOn && liveEngineRef.current === null && homeTeam && awayTeam) {
                  // Use the LAST revealed event as the starting state, or default kickoff state
                  const seedEvent = allEvents[revealedCount - 1] ?? allEvents[0];
                  if (seedEvent) {
                    liveEngineRef.current = createLiveCoachEngine(
                      homeTeam, awayTeam, homePlayers, awayPlayers,
                      {
                        quarter: seedEvent.quarter,
                        timeSecs: parseInt(seedEvent.timeStr.split(':')[0], 10) * 60 + parseInt(seedEvent.timeStr.split(':')[1] ?? '0', 10),
                        possession: seedEvent.possession,
                        fieldPos: seedEvent.fieldPos,
                        down: Math.max(1, seedEvent.down),
                        yardsToGo: Math.max(1, seedEvent.yardsToGo),
                        homeScore: seedEvent.homeScore,
                        awayScore: seedEvent.awayScore,
                        isGameOver: false,
                        twoMinWarningQ2Fired: seedEvent.quarter > 2 || (seedEvent.quarter === 2 && seedEvent.timeStr <= '2:00'),
                        twoMinWarningQ4Fired: seedEvent.quarter > 4 || (seedEvent.quarter === 4 && seedEvent.timeStr <= '2:00'),
                        overtime: seedEvent.quarter > 4,
                        awaitingXpChoice: false,
                        awaitingKickoffChoice: false,
                        homeTimeouts: 3,
                        awayTimeouts: 3,
                      },
                      userTeamSide ?? 'home',
                    );
                    setLiveEnginePivotIdx(revealedCount);
                    setLiveExtraEvents([]);
                  }
                }
              }}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                liveCoachOn
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
              title="Take control of every user offensive snap"
            >
              🎯 Live Coach {liveCoachOn ? 'ON' : 'OFF'}
            </button>
          )}
          <button
            onClick={skipToEnd}
            disabled={isFinished}
            className="px-3 py-1 rounded-md text-xs font-semibold bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)] disabled:opacity-40 transition-all"
          >
            End Game ⏭
          </button>

          {/* Progress bar */}
          <div className="flex-1 flex items-center gap-2 ml-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-150"
                style={{ width: `${totalEvents > 0 ? (revealedCount / totalEvents) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[10px] text-[var(--text-sec)] tabular-nums whitespace-nowrap">
              {revealedCount}/{totalEvents}
            </span>
          </div>
        </div>

        {/* ================================================================
            WIN PROBABILITY
        ================================================================ */}
        <WinProbabilityChart
          events={revealedEvents}
          totalEvents={totalEvents}
          homeColor={homeColor}
          awayColor={awayColor}
          homeAbbr={homeAbbr}
          awayAbbr={awayAbbr}
          userIsHome={game?.homeTeamId === userTeamId}
        />

        {/* ================================================================
            TABS
        ================================================================ */}
        <div className="flex gap-0 border-b border-[var(--border)]">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-semibold transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ================================================================
            TAB CONTENT
        ================================================================ */}
        <div className="min-h-[400px]">

          {/* GAMECAST TAB */}
          {activeTab === 'gamecast' && (
            <div className="space-y-3">

              {/* Turnover alert banner */}
              {currentEvent && isTurnover(currentEvent.type) && (
                <div className="bg-red-600 text-white rounded-lg px-5 py-3 flex items-center gap-3 animate-pulse shadow-lg shadow-red-200">
                  <span className="text-2xl">🚨</span>
                  <div className="flex-1">
                    <div className="text-xs font-bold uppercase tracking-wider opacity-80">
                      {currentEvent.type === 'interception' ? 'Interception' : 'Fumble'} — Turnover!
                    </div>
                    <p className="text-sm font-semibold mt-0.5">{currentEvent.description}</p>
                  </div>
                  <span className="text-2xl">🚨</span>
                </div>
              )}

              {/* All plays — scrollable */}
              {displayEvents.length > 0 && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
                  <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text-sec)] uppercase tracking-wider">All Plays</span>
                    <span className="text-[10px] text-[var(--text-sec)]">{displayEvents.length} plays</span>
                  </div>
                  <div className="divide-y divide-[var(--border)] max-h-[320px] overflow-y-auto">
                    {displayEvents.map(ev => (
                      <div
                        key={ev.id}
                        className={`px-4 py-2 ${playBg(ev.type)} ${isSeparator(ev.type) ? 'text-center' : ''} ${isTurnover(ev.type) ? 'py-3' : ''}`}
                      >
                        {isSeparator(ev.type) ? (
                          <p className={`text-xs ${playTextColor(ev.type)}`}>{ev.description}</p>
                        ) : isTurnover(ev.type) ? (
                          /* Big turnover row */
                          <div className="flex items-center gap-3">
                            <span className="text-lg">🚨</span>
                            <span className="text-[10px] text-[var(--text-sec)] font-mono w-14 shrink-0">
                              Q{ev.quarter} {ev.timeStr}
                            </span>
                            <div className="flex-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 block mb-0.5">
                                {ev.type === 'interception' ? 'INTERCEPTION' : 'FUMBLE'}
                              </span>
                              <p className="text-xs leading-snug text-red-700 font-bold">{ev.description}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-[var(--text-sec)] font-mono w-14 shrink-0">
                              Q{ev.quarter} {ev.timeStr}
                            </span>
                            <p className={`text-xs leading-snug flex-1 ${playTextColor(ev.type)}`}>
                              {ev.description}
                            </p>
                            {ev.yardsGained !== 0 && ev.type !== 'punt' && !isSeparator(ev.type) && (
                              <span className={`text-[10px] shrink-0 font-semibold ${ev.yardsGained > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {ev.yardsGained > 0 ? `+${ev.yardsGained}` : ev.yardsGained}
                              </span>
                            )}
                            {ev.isScoring && (
                              <span className="text-[10px] font-mono font-bold shrink-0">
                                <span style={{ color: awayColor }}>{ev.awayScore}</span>
                                <span className="text-[var(--text-sec)] mx-0.5">-</span>
                                <span style={{ color: homeColor }}>{ev.homeScore}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PLAY-BY-PLAY TAB */}
          {activeTab === 'play-by-play' && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
              {displayEvents.length === 0 ? (
                <div className="text-[var(--text-sec)] text-sm italic py-12 text-center">
                  Waiting for plays...
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)] max-h-[500px] overflow-y-auto">
                  {displayEvents.map(ev => (
                    <div
                      key={ev.id}
                      className={`px-4 py-2.5 ${playBg(ev.type)} ${isSeparator(ev.type) ? 'text-center bg-[var(--surface-2)]' : ''} ${isTurnover(ev.type) ? 'py-4' : ''}`}
                    >
                      {isSeparator(ev.type) ? (
                        <p className={`text-sm ${playTextColor(ev.type)}`}>{ev.description}</p>
                      ) : isTurnover(ev.type) ? (
                        <div className="flex items-start gap-3">
                          <span className="text-xl mt-0.5">🚨</span>
                          <div className="w-14 shrink-0">
                            <div className="text-[10px] text-[var(--text-sec)] font-mono">Q{ev.quarter}</div>
                            <div className="text-xs text-[var(--text-sec)] font-mono">{ev.timeStr}</div>
                          </div>
                          <div className="flex-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 block mb-1">
                              {ev.type === 'interception' ? 'INTERCEPTION' : 'FUMBLE'} — TURNOVER
                            </span>
                            <p className="text-sm leading-snug text-red-700 font-bold">{ev.description}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <div className="w-14 shrink-0">
                            <div className="text-[10px] text-[var(--text-sec)] font-mono">Q{ev.quarter}</div>
                            <div className="text-xs text-[var(--text-sec)] font-mono">{ev.timeStr}</div>
                          </div>
                          {ev.down >= 1 && ev.down <= 4 && (
                            <Badge
                              variant={ev.down === 4 ? 'red' : ev.down === 3 ? 'amber' : 'default'}
                              size="sm"
                            >
                              {downLabel(ev.down, ev.yardsToGo)}
                            </Badge>
                          )}
                          <div className="flex-1">
                            <p className={`text-sm leading-snug ${playTextColor(ev.type)}`}>
                              {ev.description}
                            </p>
                            {ev.yardsGained !== 0 && ev.type !== 'punt' && (
                              <span className={`text-[10px] ${ev.yardsGained > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {ev.yardsGained > 0 ? `+${ev.yardsGained}` : ev.yardsGained} yds
                              </span>
                            )}
                          </div>
                          {ev.isScoring && (
                            <div className="shrink-0 text-right">
                              <div className="text-xs font-mono font-bold">
                                <span style={{ color: awayColor }}>{ev.awayScore}</span>
                                <span className="text-[var(--text-sec)] mx-1">–</span>
                                <span style={{ color: homeColor }}>{ev.homeScore}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DRIVES TAB */}
          {activeTab === 'drives' && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <DriveChart
                drives={drives}
                homeColor={homeColor}
                awayColor={awayColor}
                homeAbbr={homeAbbr}
                awayAbbr={awayAbbr}
              />
            </div>
          )}

          {/* STATS TAB */}
          {activeTab === 'stats' && (() => {
            const stats = liveResult.playerStats;
            if (!stats || Object.keys(stats).length === 0) {
              return (
                <div className="text-center py-12 text-[var(--text-sec)]">
                  <p className="font-semibold">Stats will appear as the game progresses.</p>
                </div>
              );
            }

            // Build stat leaders for each category
            const buildLeaders = (teamPlayers: Player[], teamAbbr: string, teamColor: string) => {
              const getS = (id: string) => stats[id] ?? {};

              // Find key players
              const qb = teamPlayers.find(p => p.position === 'QB' && (getS(p.id).passAttempts ?? 0) > 0);
              const rushers = teamPlayers
                .filter(p => (getS(p.id).rushAttempts ?? 0) > 0)
                .sort((a, b) => (getS(b.id).rushYards ?? 0) - (getS(a.id).rushYards ?? 0));
              const receivers = teamPlayers
                .filter(p => (getS(p.id).receptions ?? 0) > 0)
                .sort((a, b) => (getS(b.id).receivingYards ?? 0) - (getS(a.id).receivingYards ?? 0));
              const defenders = teamPlayers
                .filter(p => (getS(p.id).tackles ?? 0) > 0)
                .sort((a, b) => (getS(b.id).tackles ?? 0) - (getS(a.id).tackles ?? 0));
              const kicker = teamPlayers.find(p => p.position === 'K' && (getS(p.id).fieldGoalAttempts ?? 0) > 0);

              return (
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border)]">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: teamColor }} />
                    <span className="font-bold text-sm">{teamAbbr}</span>
                  </div>

                  {/* Passing */}
                  {qb && (() => {
                    const s = getS(qb.id);
                    return (
                      <div className="mb-3">
                        <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase mb-1">Passing</div>
                        <div className="text-sm font-medium">{qb.firstName[0]}. {qb.lastName}</div>
                        <div className="text-xs text-[var(--text-sec)]">
                          {s.passCompletions}/{s.passAttempts}, {s.passYards} YDS, {s.passTDs} TD, {s.interceptions} INT
                        </div>
                      </div>
                    );
                  })()}

                  {/* Rushing */}
                  {rushers.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase mb-1">Rushing</div>
                      {rushers.slice(0, 2).map(p => {
                        const s = getS(p.id);
                        return (
                          <div key={p.id} className="mb-1">
                            <div className="text-sm font-medium">{p.firstName[0]}. {p.lastName}</div>
                            <div className="text-xs text-[var(--text-sec)]">
                              {s.rushAttempts} CAR, {s.rushYards} YDS, {s.rushTDs} TD
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Receiving */}
                  {receivers.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase mb-1">Receiving</div>
                      {receivers.slice(0, 3).map(p => {
                        const s = getS(p.id);
                        return (
                          <div key={p.id} className="mb-1">
                            <div className="text-sm font-medium">{p.firstName[0]}. {p.lastName}</div>
                            <div className="text-xs text-[var(--text-sec)]">
                              {s.receptions} REC, {s.receivingYards} YDS, {s.receivingTDs} TD
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Defense */}
                  {defenders.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase mb-1">Defense</div>
                      {defenders.slice(0, 3).map(p => {
                        const s = getS(p.id);
                        return (
                          <div key={p.id} className="mb-1">
                            <div className="text-sm font-medium">{p.firstName[0]}. {p.lastName}</div>
                            <div className="text-xs text-[var(--text-sec)]">
                              {s.tackles} TKL{(s.sacks ?? 0) > 0 ? `, ${s.sacks} SCK` : ''}{(s.defensiveINTs ?? 0) > 0 ? `, ${s.defensiveINTs} INT` : ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Kicking */}
                  {kicker && (() => {
                    const s = getS(kicker.id);
                    return (
                      <div className="mb-3">
                        <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase mb-1">Kicking</div>
                        <div className="text-sm font-medium">{kicker.firstName[0]}. {kicker.lastName}</div>
                        <div className="text-xs text-[var(--text-sec)]">
                          {s.fieldGoalsMade}/{s.fieldGoalAttempts} FG, {s.extraPointsMade}/{s.extraPointAttempts} XP
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            };

            return (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                <div className="flex gap-6">
                  {buildLeaders(awayPlayers, awayAbbr, awayColor)}
                  <div className="w-px bg-[var(--border)]" />
                  {buildLeaders(homePlayers, homeAbbr, homeColor)}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ================================================================
            FINAL RESULT + COMMIT
        ================================================================ */}
        {/* Game Over banner is now pinned to the top of this column */}
      </div>

      {/* Right sidebar — play call menu (sticky at top) + around the league. */}
      <div className="w-72 hidden lg:block shrink-0 space-y-2">
        <div className="sticky top-20 space-y-3">
          {/* Inline Live Coach play call. Reserving min-height so the
              conditional buttons (Kick FG, Kneel, Go For It) don't change
              the box's height play-to-play. The flex container already uses
              items-start so the big-play alert in the left column can't
              stretch this column and nudge the sticky container. */}
          {liveEngineRef.current && (() => {
            const es = liveEngineRef.current!.getState();
            const homeAbbr2 = homeTeam?.abbreviation ?? 'HOME';
            const awayAbbr2 = awayTeam?.abbreviation ?? 'AWAY';
            const fp = es.fieldPos;
            const fieldDescription = fp === 50 ? '50' : fp < 50 ? `OWN ${fp}` : `OPP ${100 - fp}`;
            return (
              <div className={`min-h-[22rem] ${liveCoachPaused ? '' : 'invisible pointer-events-none'}`}>
              <PlayCallMenu
                state={{
                  quarter: es.overtime && es.quarter < 5 ? 5 : es.quarter,
                  timeStr: `${Math.floor(es.timeSecs / 60)}:${String(es.timeSecs % 60).padStart(2, '0')}`,
                  homeScore: es.homeScore,
                  awayScore: es.awayScore,
                  homeAbbr: homeAbbr2,
                  awayAbbr: awayAbbr2,
                  down: es.down,
                  yardsToGo: es.yardsToGo,
                  fieldPos: es.fieldPos,
                  fieldDescription,
                }}
                isFourthDown={es.down === 4}
                awaitingXpChoice={es.awaitingXpChoice}
                awaitingKickoffChoice={es.awaitingKickoffChoice}
                timeoutsRemaining={userTeamSide === 'home' ? es.homeTimeouts : es.awayTimeouts}
                onPlayCall={(playCall) => {
                  setOutcomeChip(null);
                  if (liveEngineRef.current) {
                    const newEvents = liveEngineRef.current.runOnePlay(playCall);
                    if (newEvents.length > 0) {
                      setLiveExtraEvents(prev => [...prev, ...newEvents]);
                      setRevealedCount(prev => prev + 1);
                      setAnimationComplete(false);
                      const lastEv = newEvents[newEvents.length - 1];
                      const isBig = lastEv && (
                        lastEv.type === 'interception' || lastEv.type === 'fumble' ||
                        lastEv.type === 'punt' || lastEv.type === 'touchdown' ||
                        lastEv.isScoring || lastEv.type === 'field_goal_good' ||
                        lastEv.type === 'field_goal_miss'
                      );
                      if (isBig) {
                        pendingAutoPlayRef.current = true;
                        const extraMs = speed === '1x' ? 6000 : speed === '2x' ? 4000 : speed === '5x' ? 2500 : 1000;
                        setTimeout(() => {
                          pendingAutoPlayRef.current = false;
                          setAutoRunTick(t => t + 1);
                        }, extraMs);
                      }
                    }
                  }
                  setLiveCoachPaused(false);
                  setIsPlaying(true);
                }}
                onAutoSimRest={() => {
                  if (liveEngineRef.current) {
                    const allRest: PlayEvent[] = [];
                    let safety = 0;
                    while (!liveEngineRef.current.isFinished() && safety < 500) {
                      const evs = liveEngineRef.current.runOnePlay();
                      allRest.push(...evs);
                      safety++;
                    }
                    if (allRest.length > 0) {
                      setLiveExtraEvents(prev => [...prev, ...allRest]);
                    }
                  }
                  setLiveCoachOn(false);
                  setLiveCoachPaused(false);
                }}
                onToggleOff={() => {
                  setLiveCoachOn(false);
                  setLiveCoachPaused(false);
                }}
              />
              </div>
            );
          })()}
          {/* Live play-by-play feed — visible alongside the field */}
          {displayEvents.length > 0 && (
            <div className="mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] mb-2">Live Feed</h3>
              <div className="space-y-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                {displayEvents.slice(0, 15).map(ev => (
                  !isSeparator(ev.type) ? (
                    <div key={ev.id} className={`px-2.5 py-1.5 text-[10px] border-b border-[var(--border)] last:border-0 ${ev.isScoring ? 'bg-amber-50' : isTurnover(ev.type) ? 'bg-red-50' : ''}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--text-sec)] font-mono shrink-0">Q{ev.quarter}</span>
                        <span className="flex-1 leading-snug truncate">{ev.description}</span>
                        {ev.yardsGained !== 0 && !isSeparator(ev.type) && ev.type !== 'punt' && (
                          <span className={`shrink-0 font-bold ${ev.yardsGained > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {ev.yardsGained > 0 ? `+${ev.yardsGained}` : ev.yardsGained}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div key={ev.id} className="px-2.5 py-1 text-[9px] text-center text-[var(--text-sec)] bg-[var(--surface-2)] border-b border-[var(--border)]">
                      {ev.description}
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] mb-2">Around the League</h3>
          <div className="space-y-1.5 max-h-[calc(100vh-6rem)] overflow-y-auto">
            {schedule
              .filter(g => g.week === game.week && g.id !== game.id)
              .map(g => {
                const ht = teams.find(t => t.id === g.homeTeamId);
                const at = teams.find(t => t.id === g.awayTeamId);
                if (!ht || !at) return null;
                const isDiv = ht.conference === teams.find(t => t.id === userTeamId)?.conference
                  && ht.division === teams.find(t => t.id === userTeamId)?.division
                  || at.conference === teams.find(t => t.id === userTeamId)?.conference
                  && at.division === teams.find(t => t.id === userTeamId)?.division;
                return (
                  <div key={g.id} className={`rounded-lg border px-3 py-2 text-xs ${
                    isDiv ? 'border-blue-300 bg-blue-50/50' : 'border-[var(--border)] bg-[var(--surface)]'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: at.primaryColor }} />
                        <span className="font-medium">{at.abbreviation}</span>
                      </div>
                      <span className="font-mono font-bold">{g.played ? g.awayScore : ''}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: ht.primaryColor }} />
                        <span className="font-medium">{ht.abbreviation}</span>
                      </div>
                      <span className="font-mono font-bold">{g.played ? g.homeScore : ''}</span>
                    </div>
                    {g.played && (
                      <div className="text-[10px] text-[var(--text-sec)] mt-0.5 text-center">FINAL</div>
                    )}
                    {!g.played && (
                      <div className="text-[10px] text-[var(--text-sec)] mt-0.5 text-center">
                        {g.bettingLine ? `${g.bettingLine.spread > 0 ? at.abbreviation : ht.abbreviation} ${Math.abs(g.bettingLine.spread).toFixed(1)}` : '—'}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
      </div>
    </GameShell>
  );
}
