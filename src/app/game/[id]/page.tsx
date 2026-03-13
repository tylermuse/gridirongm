'use client';

import { use, useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { simulatePlayByPlay, liveGameToGameResult } from '@/lib/engine/playByPlay';
import { Confetti } from '@/components/ui/Confetti';
import type { PlayEvent, LiveGameResult } from '@/lib/engine/playByPlay';

// ---------------------------------------------------------------------------
// Speed settings
// ---------------------------------------------------------------------------

type Speed = '1x' | '2x' | '5x' | 'max';

const SPEED_MS: Record<Speed, number> = {
  '1x': 4800,
  '2x': 1200,
  '5x': 400,
  'max': 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function isSeparator(type: PlayEvent['type']): boolean {
  return ['quarter_end', 'halftime', 'two_minute_warning', 'overtime', 'final'].includes(type);
}

function downLabel(down: number, yardsToGo: number): string {
  if (down < 1 || down > 4) return '';
  const ordinals = ['1st', '2nd', '3rd', '4th'];
  return `${ordinals[down - 1]} & ${yardsToGo <= 0 ? 'Goal' : yardsToGo}`;
}

/** Convert field position (yards from own endzone) to a yard-line label like "OPP 25" */
function fieldPosLabel(
  fieldPos: number,
  possession: 'home' | 'away',
  homeAbbr: string,
  awayAbbr: string,
): string {
  const possAbbr = possession === 'home' ? homeAbbr : awayAbbr;
  const oppAbbr = possession === 'home' ? awayAbbr : homeAbbr;
  if (fieldPos === 50) return '50';
  if (fieldPos < 50) return `${possAbbr} ${fieldPos}`;
  return `${oppAbbr} ${100 - fieldPos}`;
}

// ---------------------------------------------------------------------------
// ESPN-style Football Field Visualization
// ---------------------------------------------------------------------------

function FootballField({
  fieldPos,
  possession,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
  firstDownMarker,
  lastYardsGained,
  lastPlayType,
}: {
  fieldPos: number;
  possession: 'home' | 'away';
  homeColor: string;
  awayColor: string;
  homeAbbr: string;
  awayAbbr: string;
  firstDownMarker: number;
  lastYardsGained: number;
  lastPlayType: string;
}) {
  const prevPctRef = useRef<number | null>(null);

  // fieldPos = yards from possessing team's own end zone (1-99)
  const absPct = possession === 'home'
    ? ((10 + fieldPos) / 120) * 100
    : ((10 + (100 - fieldPos)) / 120) * 100;

  const firstDownPos = clamp(fieldPos + firstDownMarker, 1, 100);
  const absFirstDown = possession === 'home'
    ? ((10 + firstDownPos) / 120) * 100
    : ((10 + (100 - firstDownPos)) / 120) * 100;

  // Track previous position for trail animation
  const prevPct = prevPctRef.current ?? absPct;
  useEffect(() => {
    prevPctRef.current = absPct;
  }, [absPct]);

  // Trail: show where ball came from → where it is now
  const trailLeft = Math.min(prevPct, absPct);
  const trailWidth = Math.abs(absPct - prevPct);
  const movedForward = lastYardsGained > 0;
  const isTurnoverPlay = lastPlayType === 'interception' || lastPlayType === 'fumble';

  // Trail color: green for gains, red for losses/turnovers, yellow for neutral
  let trailColor = 'rgba(251,191,36,0.4)'; // yellow/neutral
  if (isTurnoverPlay) trailColor = 'rgba(239,68,68,0.6)'; // bright red
  else if (movedForward) trailColor = 'rgba(34,197,94,0.45)'; // green
  else if (lastYardsGained < 0) trailColor = 'rgba(239,68,68,0.35)'; // red

  const yardLines = [10, 20, 30, 40, 50, 60, 70, 80, 90];

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ height: 130 }}>
      {/* Field background */}
      <div className="absolute inset-0 bg-[#2d8a4e]" />

      {/* Field stripes */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0"
          style={{
            left: `${(i / 12) * 100}%`,
            width: `${100 / 12}%`,
            backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
          }}
        />
      ))}

      {/* Away end zone (left) */}
      <div
        className="absolute top-0 bottom-0 left-0 flex items-center justify-center"
        style={{
          width: `${(10 / 120) * 100}%`,
          backgroundColor: awayColor,
          opacity: 0.85,
        }}
      >
        <span className="text-white/80 text-[10px] font-black tracking-widest"
          style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
        >
          {awayAbbr}
        </span>
      </div>

      {/* Home end zone (right) */}
      <div
        className="absolute top-0 bottom-0 right-0 flex items-center justify-center"
        style={{
          width: `${(10 / 120) * 100}%`,
          backgroundColor: homeColor,
          opacity: 0.85,
        }}
      >
        <span className="text-white/80 text-[10px] font-black tracking-widest"
          style={{ writingMode: 'vertical-lr' }}
        >
          {homeAbbr}
        </span>
      </div>

      {/* Yard lines and numbers */}
      {yardLines.map(yd => {
        const pct = ((10 + yd) / 120) * 100;
        const label = yd <= 50 ? yd : 100 - yd;
        return (
          <div key={yd}>
            <div className="absolute top-0 bottom-0 w-px"
              style={{ left: `${pct}%`, backgroundColor: 'rgba(255,255,255,0.25)' }} />
            <div className="absolute text-[10px] font-bold text-white/40 select-none"
              style={{ left: `${pct}%`, transform: 'translateX(-50%)', bottom: 4 }}>
              {label}
            </div>
          </div>
        );
      })}

      {/* Ball movement trail */}
      {trailWidth > 0.5 && (
        <div
          className="absolute transition-all duration-300"
          style={{
            left: `${trailLeft}%`,
            width: `${trailWidth}%`,
            top: '38%',
            height: '24%',
            backgroundColor: trailColor,
            borderRadius: 4,
          }}
        />
      )}

      {/* First down line (yellow) */}
      <div
        className="absolute top-0 bottom-0 w-0.5 transition-all duration-300"
        style={{
          left: `${absFirstDown}%`,
          backgroundColor: '#fbbf24',
          boxShadow: '0 0 6px rgba(251, 191, 36, 0.6)',
        }}
      />

      {/* Scrimmage line (blue) */}
      <div
        className="absolute top-0 bottom-0 w-0.5 transition-all duration-300"
        style={{
          left: `${absPct}%`,
          backgroundColor: '#60a5fa',
          opacity: 0.7,
        }}
      />

      {/* Ball position marker */}
      <div
        className="absolute transition-all duration-300 flex flex-col items-center z-10"
        style={{
          left: `${absPct}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg border-2 ${
            isTurnoverPlay ? 'border-red-400 animate-bounce' : 'border-white/60'
          }`}
          style={{
            backgroundColor: possession === 'home' ? homeColor : awayColor,
            boxShadow: isTurnoverPlay
              ? '0 0 20px rgba(239,68,68,0.7)'
              : `0 0 12px ${possession === 'home' ? homeColor : awayColor}88`,
          }}
        >
          <span className="text-white text-[10px] font-black">
            {possession === 'home' ? homeAbbr : awayAbbr}
          </span>
        </div>

        {/* Yards gained indicator below ball */}
        {lastYardsGained !== 0 && !isSeparator(lastPlayType as PlayEvent['type']) && (
          <div
            className={`mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
              isTurnoverPlay ? 'bg-red-600 text-white' :
              lastYardsGained > 0 ? 'bg-green-600/90 text-white' : 'bg-red-500/90 text-white'
            }`}
          >
            {lastYardsGained > 0 ? `+${lastYardsGained}` : lastYardsGained} yds
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info Bar (Down & Distance, Ball On, Drive)
// ---------------------------------------------------------------------------

function InfoBar({
  down, yardsToGo, fieldPos, possession,
  homeAbbr, awayAbbr,
  drivePlays, driveYards,
}: {
  down: number;
  yardsToGo: number;
  fieldPos: number;
  possession: 'home' | 'away';
  homeAbbr: string;
  awayAbbr: string;
  drivePlays: number;
  driveYards: number;
}) {
  return (
    <div className="flex items-stretch divide-x divide-[var(--border)] bg-[var(--surface-2)] rounded-lg overflow-hidden text-center">
      <div className="flex-1 py-2.5 px-3">
        <div className="text-[10px] font-semibold text-[var(--text-sec)] uppercase tracking-wider">Down</div>
        <div className="text-sm font-black text-[var(--text)] mt-0.5">
          {down >= 1 && down <= 4 ? downLabel(down, yardsToGo) : '—'}
        </div>
      </div>
      <div className="flex-1 py-2.5 px-3">
        <div className="text-[10px] font-semibold text-[var(--text-sec)] uppercase tracking-wider">Ball On</div>
        <div className="text-sm font-black text-[var(--text)] mt-0.5">
          {fieldPosLabel(fieldPos, possession, homeAbbr, awayAbbr)}
        </div>
      </div>
      <div className="flex-1 py-2.5 px-3">
        <div className="text-[10px] font-semibold text-[var(--text-sec)] uppercase tracking-wider">Drive</div>
        <div className="text-sm font-black text-[var(--text)] mt-0.5">
          {drivePlays > 0 ? `${drivePlays} play${drivePlays !== 1 ? 's' : ''}, ${driveYards >= 0 ? '+' : ''}${driveYards} yds` : '—'}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Last Play display
// ---------------------------------------------------------------------------

function LastPlay({ event, homeAbbr, awayAbbr }: {
  event: PlayEvent | null;
  homeAbbr: string;
  awayAbbr: string;
}) {
  if (!event || isSeparator(event.type)) return null;

  const possAbbr = event.possession === 'home' ? homeAbbr : awayAbbr;
  const downStr = event.down >= 1 && event.down <= 4
    ? downLabel(event.down, event.yardsToGo)
    : '';
  const posLabel = fieldPosLabel(event.fieldPos, event.possession, homeAbbr, awayAbbr);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3">
      <div className="text-[10px] font-semibold text-[var(--text-sec)] uppercase tracking-wider mb-1">
        Last Play: {downStr && `${downStr} at ${posLabel}`}
      </div>
      <p className="text-sm text-[var(--text)] leading-relaxed">
        {event.description}
      </p>
    </div>
  );
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
    default: return 'text-[var(--text)]';
  }
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = 'gamecast' | 'play-by-play' | 'drives';

// ---------------------------------------------------------------------------
// Win Probability Chart
// ---------------------------------------------------------------------------

function WinProbabilityChart({
  events,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
}: {
  events: PlayEvent[];
  homeColor: string;
  awayColor: string;
  homeAbbr: string;
  awayAbbr: string;
}) {
  if (events.length < 2) return null;

  const W = 600;
  const H = 120;
  const PAD_X = 0;
  const PAD_Y = 8;
  const chartW = W - PAD_X * 2;
  const chartH = H - PAD_Y * 2;

  // Calculate win probability at each event point
  // Simple model: based on score differential, quarter, and time remaining
  const probPoints: number[] = events.map(ev => {
    const diff = ev.homeScore - ev.awayScore; // positive = home leading
    const quarterWeight = ev.quarter >= 4 ? 3 : ev.quarter >= 3 ? 2 : 1;
    // Sigmoid-like conversion: diff → probability
    const k = 0.12 * quarterWeight;
    return 1 / (1 + Math.exp(-k * diff));
  });

  // Build SVG path
  const xStep = chartW / Math.max(1, probPoints.length - 1);
  const points = probPoints.map((p, i) => ({
    x: PAD_X + i * xStep,
    y: PAD_Y + (1 - p) * chartH,
  }));

  const pathD = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
  const midY = PAD_Y + chartH / 2;

  // Fill area above/below 50% line
  const homeAreaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${midY} L ${PAD_X} ${midY} Z`;

  const lastProb = probPoints[probPoints.length - 1];
  const homePct = Math.round(lastProb * 100);
  const awayPct = 100 - homePct;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-sec)]">Win Probability</span>
        <div className="flex items-center gap-3 text-xs font-bold">
          <span style={{ color: awayColor }}>{awayAbbr} {awayPct}%</span>
          <span style={{ color: homeColor }}>{homeAbbr} {homePct}%</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }} preserveAspectRatio="none">
        {/* 50% line */}
        <line x1={PAD_X} y1={midY} x2={W - PAD_X} y2={midY} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 3" />
        {/* Home fill */}
        <path d={homeAreaD} fill={homeColor} opacity={0.12} />
        {/* Probability line */}
        <path d={pathD} fill="none" stroke={homeColor} strokeWidth="2" strokeLinejoin="round" />
        {/* Quarter markers */}
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
        {/* End dot */}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill={homeColor} />
      </svg>
      <div className="flex justify-between text-[10px] text-[var(--text-sec)] mt-0.5">
        <span>{awayAbbr}</span>
        <span>{homeAbbr}</span>
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
  const homePlayers = game ? players.filter(p => p.teamId === game.homeTeamId) : [];
  const awayPlayers = game ? players.filter(p => p.teamId === game.awayTeamId) : [];

  const simRef = useRef<LiveGameResult | null>(null);
  if (simRef.current === null && homeTeam && awayTeam && game && !game.played) {
    simRef.current = simulatePlayByPlay(homeTeam, awayTeam, homePlayers, awayPlayers);
  }
  const liveResult = simRef.current;

  // Animation state
  const [revealedCount, setRevealedCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>('1x');
  const [committed, setCommitted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('gamecast');

  const totalEvents = liveResult?.events.length ?? 0;
  const isFinished = revealedCount >= totalEvents;

  const currentEvent = liveResult?.events[revealedCount - 1] ?? null;
  const revealedEvents = liveResult?.events.slice(0, revealedCount) ?? [];
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

  // Interval-based play reveal
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearIntervalRef = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const skipToEnd = useCallback(() => {
    setRevealedCount(totalEvents);
    setIsPlaying(false);
    clearIntervalRef();
  }, [totalEvents, clearIntervalRef]);

  useEffect(() => {
    clearIntervalRef();
    if (!isPlaying || isFinished || speed === 'max') return;
    const ms = SPEED_MS[speed];
    intervalRef.current = setInterval(() => {
      setRevealedCount(prev => {
        if (prev >= totalEvents) {
          clearIntervalRef();
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, ms);
    return clearIntervalRef;
  }, [isPlaying, speed, totalEvents, isFinished, clearIntervalRef]);

  useEffect(() => {
    if (speed === 'max' && isPlaying && !isFinished) {
      setRevealedCount(totalEvents);
      setIsPlaying(false);
    }
  }, [speed, isPlaying, isFinished, totalEvents]);

  useEffect(() => {
    if (liveResult && totalEvents > 0 && revealedCount === 0) setIsPlaying(true);
  }, [liveResult, totalEvents, revealedCount]);

  const handleCommit = useCallback(() => {
    if (!liveResult || !game || committed) return;
    const gameResult = liveGameToGameResult(liveResult, game);
    commitLiveGame(gameResult, isPlayoffGame ? id : undefined);
    setCommitted(true);
    router.push(isPlayoffGame ? '/playoffs' : '/');
  }, [liveResult, game, committed, commitLiveGame, router, isPlayoffGame, id]);

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
  if (game.played) {
    return (
      <GameShell>
        <div className="max-w-2xl mx-auto mt-16 text-center space-y-4">
          <h2 className="text-2xl font-black">Game Already Played</h2>
          <p className="text-[var(--text-sec)]">
            {homeTeam?.abbreviation ?? '??'} {game.homeScore} — {game.awayScore} {awayTeam?.abbreviation ?? '??'}
          </p>
          <Button onClick={() => router.push('/')}>Back to Dashboard</Button>
        </div>
      </GameShell>
    );
  }
  if (!liveResult) {
    return (
      <GameShell>
        <div className="max-w-2xl mx-auto mt-16 text-center">
          <p className="text-[var(--text-sec)]">Simulating game...</p>
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

  const liveHomeScore = currentEvent?.homeScore ?? 0;
  const liveAwayScore = currentEvent?.awayScore ?? 0;
  const liveQuarter = currentEvent?.quarter ?? 1;
  const liveTime = currentEvent?.timeStr ?? '15:00';
  const livePoss = currentEvent?.possession ?? 'home';
  const liveFieldPos = currentEvent?.fieldPos ?? 25;
  const liveDown = currentEvent?.down ?? 1;
  const liveYtg = currentEvent?.yardsToGo ?? 10;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'gamecast', label: 'Gamecast' },
    { id: 'play-by-play', label: 'Play-by-Play' },
    { id: 'drives', label: 'Drives' },
  ];

  return (
    <GameShell>
      <div className="max-w-6xl mx-auto flex gap-4">
      {/* Main game content */}
      <div className="flex-1 min-w-0 space-y-3">

        {/* ================================================================
            SCOREBOARD
        ================================================================ */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          {/* Top bar: Away SCORE - clock - SCORE Home */}
          <div className="flex items-center justify-between px-6 py-4">
            {/* Away team */}
            <div className="flex items-center gap-4 flex-1">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-black shadow-md"
                style={{ backgroundColor: awayColor }}
              >
                {awayAbbr}
              </div>
              <div>
                <div className="font-bold text-[var(--text)]">{awayTeam?.city} {awayTeam?.name}</div>
                <div className="text-xs text-[var(--text-sec)]">
                  {awayRecord ? `${awayRecord.wins}-${awayRecord.losses}` : ''}
                </div>
              </div>
            </div>

            {/* Score + clock center */}
            <div className="text-center px-6">
              <div className="flex items-center gap-4">
                <span
                  className="text-4xl font-black tabular-nums"
                  style={{ color: awayColor }}
                >
                  {liveAwayScore}
                </span>
                <div className="flex flex-col items-center">
                  {isFinished ? (
                    <span className="text-xs font-bold text-[var(--text-sec)] uppercase">Final</span>
                  ) : (
                    <>
                      <span className="text-xs font-bold text-[var(--text-sec)]">
                        Q{liveQuarter}
                      </span>
                      <span className="text-lg font-mono font-bold text-[var(--text)]">
                        {liveTime}
                      </span>
                    </>
                  )}
                  {/* Live indicator */}
                  {!isFinished && isPlaying && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      LIVE
                    </span>
                  )}
                </div>
                <span
                  className="text-4xl font-black tabular-nums"
                  style={{ color: homeColor }}
                >
                  {liveHomeScore}
                </span>
              </div>
            </div>

            {/* Home team */}
            <div className="flex items-center gap-4 flex-1 justify-end">
              <div className="text-right">
                <div className="font-bold text-[var(--text)]">{homeTeam?.city} {homeTeam?.name}</div>
                <div className="text-xs text-[var(--text-sec)]">
                  {homeRecord ? `${homeRecord.wins}-${homeRecord.losses}` : ''}
                </div>
              </div>
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-black shadow-md"
                style={{ backgroundColor: homeColor }}
              >
                {homeAbbr}
              </div>
            </div>
          </div>

          {/* Quarter score table */}
          <div className="border-t border-[var(--border)] px-6 py-2">
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
          homeColor={homeColor}
          awayColor={awayColor}
          homeAbbr={homeAbbr}
          awayAbbr={awayAbbr}
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

              {/* Football field */}
              <FootballField
                fieldPos={liveFieldPos}
                possession={livePoss}
                homeColor={homeColor}
                awayColor={awayColor}
                homeAbbr={homeAbbr}
                awayAbbr={awayAbbr}
                firstDownMarker={liveYtg}
                lastYardsGained={currentEvent?.yardsGained ?? 0}
                lastPlayType={currentEvent?.type ?? 'run'}
              />

              {/* Info bar */}
              <InfoBar
                down={liveDown}
                yardsToGo={liveYtg}
                fieldPos={liveFieldPos}
                possession={livePoss}
                homeAbbr={homeAbbr}
                awayAbbr={awayAbbr}
                drivePlays={currentDrive.plays}
                driveYards={currentDrive.yards}
              />

              {/* Last play */}
              <LastPlay
                event={currentEvent}
                homeAbbr={homeAbbr}
                awayAbbr={awayAbbr}
              />

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
        </div>

        {/* ================================================================
            FINAL RESULT + COMMIT
        ================================================================ */}
        {isFinished && (() => {
          const userIsHome = game.homeTeamId === userTeamId;
          const userScore = userIsHome ? liveResult.homeScore : liveResult.awayScore;
          const oppScore = userIsHome ? liveResult.awayScore : liveResult.homeScore;
          const won = isUserGame && userScore > oppScore;
          return (
          <>
          {won && <Confetti duration={5000} />}
          <div className="bg-[var(--surface)] border-2 border-green-300 rounded-xl p-6 text-center space-y-4">
            <div className="text-sm font-bold uppercase tracking-wider text-green-600">Game Over</div>
            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <div className="text-xs text-[var(--text-sec)]">{awayAbbr}</div>
                <div className="text-3xl font-black" style={{ color: awayColor }}>{liveResult.awayScore}</div>
              </div>
              <div className="text-[var(--text-sec)] text-xl">–</div>
              <div className="text-center">
                <div className="text-xs text-[var(--text-sec)]">{homeAbbr}</div>
                <div className="text-3xl font-black" style={{ color: homeColor }}>{liveResult.homeScore}</div>
              </div>
            </div>
            {isUserGame && (
              <Badge variant={won ? 'green' : 'red'} size="md">
                {won ? 'Victory!' : 'Defeat'}
              </Badge>
            )}
            <div>
              <Button
                variant="primary"
                size="md"
                onClick={handleCommit}
                disabled={committed}
              >
                {committed ? 'Saving...' : 'Save & Continue →'}
              </Button>
              <p className="text-[10px] text-[var(--text-sec)] mt-2">
                Saves result and simulates all other Week {game.week} games.
              </p>
            </div>
          </div>
          </>
          );
        })()}
      </div>

      {/* Around the League sidebar */}
      <div className="w-72 hidden lg:block shrink-0 space-y-2">
        <div className="sticky top-20">
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
