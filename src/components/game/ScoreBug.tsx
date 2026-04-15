'use client';

import type { PlayEvent } from '@/lib/engine/playByPlay';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function downLabel(down: number, yardsToGo: number): string {
  if (down < 1 || down > 4) return '';
  const ordinals = ['1st', '2nd', '3rd', '4th'];
  return `${ordinals[down - 1]} & ${yardsToGo <= 0 ? 'Goal' : yardsToGo}`;
}

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
// Props
// ---------------------------------------------------------------------------

interface ScoreBugProps {
  homeAbbr: string;
  awayAbbr: string;
  homeColor: string;
  awayColor: string;
  homeScore: number;
  awayScore: number;
  quarter: number;
  timeStr: string;
  possession: 'home' | 'away';
  down: number;
  yardsToGo: number;
  fieldPos: number;
  isFinished: boolean;
  isPlaying: boolean;
  drivePlays: number;
  driveYards: number;
  lastPlayDescription: string | null;
  homeTimeouts?: number;
  awayTimeouts?: number;
}

// ---------------------------------------------------------------------------
// ScoreBug component
// ---------------------------------------------------------------------------

export function ScoreBug({
  homeAbbr,
  awayAbbr,
  homeColor,
  awayColor,
  homeScore,
  awayScore,
  quarter,
  timeStr,
  possession,
  down,
  yardsToGo,
  fieldPos,
  isFinished,
  isPlaying,
  drivePlays,
  driveYards,
  lastPlayDescription,
  homeTimeouts,
  awayTimeouts,
}: ScoreBugProps) {
  const posLabel = fieldPosLabel(fieldPos, possession, homeAbbr, awayAbbr);

  return (
    <div className="space-y-0">
      {/* Main score bug */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-t-xl overflow-hidden">
        <div className="flex items-stretch">
          {/* Away team */}
          <div className="flex items-center gap-2.5 px-4 py-2.5 flex-1 min-w-0">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center text-white text-[11px] font-black shrink-0"
              style={{ backgroundColor: awayColor }}
            >
              {awayAbbr}
            </div>
            <span
              className="text-2xl font-black tabular-nums"
              style={{ color: awayColor }}
            >
              {awayScore}
            </span>
            {/* Possession indicator */}
            {possession === 'away' && !isFinished && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: awayColor }}
              />
            )}
            {/* Timeouts — 3 small dots, unlit as used */}
            {!isFinished && awayTimeouts !== undefined && (
              <div className="flex items-center gap-0.5 shrink-0" title={`${awayAbbr} timeouts: ${awayTimeouts} remaining`}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-sm"
                    style={{ backgroundColor: i < awayTimeouts ? awayColor : 'var(--border)', opacity: i < awayTimeouts ? 1 : 0.4 }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Center: quarter + clock */}
          <div className="flex flex-col items-center justify-center px-4 border-x border-[var(--border)] min-w-[90px]">
            {isFinished ? (
              <span className="text-xs font-bold text-[var(--text-sec)] uppercase">Final</span>
            ) : (
              <>
                <span className="text-[10px] font-bold text-[var(--text-sec)] uppercase">
                  Q{quarter}
                </span>
                <span className="text-sm font-mono font-bold text-[var(--text)] tabular-nums">
                  {timeStr}
                </span>
              </>
            )}
            {!isFinished && isPlaying && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-red-500">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </span>
            )}
          </div>

          {/* Home team */}
          <div className="flex items-center gap-2.5 px-4 py-2.5 flex-1 min-w-0 justify-end">
            {/* Timeouts (left of home side) */}
            {!isFinished && homeTimeouts !== undefined && (
              <div className="flex items-center gap-0.5 shrink-0" title={`${homeAbbr} timeouts: ${homeTimeouts} remaining`}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-sm"
                    style={{ backgroundColor: i < homeTimeouts ? homeColor : 'var(--border)', opacity: i < homeTimeouts ? 1 : 0.4 }}
                  />
                ))}
              </div>
            )}
            {possession === 'home' && !isFinished && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: homeColor }}
              />
            )}
            <span
              className="text-2xl font-black tabular-nums"
              style={{ color: homeColor }}
            >
              {homeScore}
            </span>
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center text-white text-[11px] font-black shrink-0"
              style={{ backgroundColor: homeColor }}
            >
              {homeAbbr}
            </div>
          </div>
        </div>
      </div>

      {/* Down & distance bar */}
      {!isFinished && down >= 1 && down <= 4 && (
        <div className="bg-[var(--surface-2)] border-x border-[var(--border)] px-4 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs">
            <span className="font-bold text-[var(--text)]">
              {downLabel(down, yardsToGo)}
            </span>
            <span className="text-[var(--text-sec)]">at</span>
            <span className="font-semibold text-[var(--text)]">{posLabel}</span>

            {/* Mini field position indicator */}
            <div className="hidden sm:flex items-center gap-1 ml-2">
              <div className="w-24 h-1.5 rounded-full bg-[var(--border)] relative overflow-hidden">
                {/* Ball position */}
                <div
                  className="absolute top-0 h-full w-1.5 rounded-full"
                  style={{
                    left: `${(possession === 'home' ? fieldPos : 100 - fieldPos)}%`,
                    backgroundColor: possession === 'home' ? homeColor : awayColor,
                    transform: 'translateX(-50%)',
                  }}
                />
                {/* Midfield marker */}
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--text-sec)] opacity-30" />
              </div>
            </div>
          </div>

          {/* Drive summary */}
          {drivePlays > 0 && (
            <span className="text-[10px] text-[var(--text-sec)]">
              Drive: {drivePlays} play{drivePlays !== 1 ? 's' : ''}, {driveYards >= 0 ? '+' : ''}{driveYards} yds
            </span>
          )}
        </div>
      )}

      {/* Last play text */}
      {lastPlayDescription && (
        <div className="bg-[var(--surface)] border border-t-0 border-[var(--border)] rounded-b-xl px-4 py-2">
          <p className="text-xs text-[var(--text-sec)] leading-relaxed truncate">
            {lastPlayDescription}
          </p>
        </div>
      )}
    </div>
  );
}
