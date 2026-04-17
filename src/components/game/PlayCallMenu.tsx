'use client';

import { useState } from 'react';

interface PlayCallMenuProps {
  state: {
    quarter: number;
    timeStr: string;
    homeScore: number;
    awayScore: number;
    homeAbbr: string;
    awayAbbr: string;
    down: number;
    yardsToGo: number;
    fieldPos: number;
    fieldDescription: string;
  };
  isFourthDown: boolean;
  /** True when the engine is waiting for XP/2PT choice after a user TD */
  awaitingXpChoice?: boolean;
  /** True when the engine is waiting for kickoff choice (regular vs onside) */
  awaitingKickoffChoice?: boolean;
  /** Timeouts remaining for the user's team */
  timeoutsRemaining?: number;
  onPlayCall: (type: PlayCallType) => void;
  onAutoSimRest: () => void;
  onToggleOff: () => void;
}

export type PlayCallType =
  | 'run'
  | 'pass_short'
  | 'pass_deep'
  | 'qb_run'
  | 'screen'
  | 'punt'
  | 'extra_point'
  | 'two_point'
  | 'timeout'
  | 'field_goal'
  | 'go_for_it'
  | 'kneel'
  | 'onside_kick'
  | 'regular_kick';

const PLAY_BUTTONS: { type: PlayCallType; label: string; icon: string; color: string }[] = [
  { type: 'run', label: 'Run', icon: '🏃', color: 'bg-orange-600 hover:bg-orange-700' },
  { type: 'pass_short', label: 'Short Pass', icon: '🎯', color: 'bg-blue-600 hover:bg-blue-700' },
  { type: 'pass_deep', label: 'Deep Shot', icon: '🚀', color: 'bg-purple-600 hover:bg-purple-700' },
  { type: 'qb_run', label: 'QB Scramble', icon: '⚡', color: 'bg-yellow-600 hover:bg-yellow-700' },
  { type: 'screen', label: 'Screen', icon: '🛡️', color: 'bg-teal-600 hover:bg-teal-700' },
];

export function PlayCallMenu({ state, isFourthDown, awaitingXpChoice, awaitingKickoffChoice, timeoutsRemaining, onPlayCall, onAutoSimRest, onToggleOff }: PlayCallMenuProps) {
  const [goingForIt, setGoingForIt] = useState(false);

  function downLabel(down: number, yardsToGo: number): string {
    const ordinals = ['1st', '2nd', '3rd', '4th'];
    if (down < 1 || down > 4) return '';
    return `${ordinals[down - 1]} & ${yardsToGo <= 0 ? 'Goal' : yardsToGo}`;
  }

  return (
    <div>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden">
        {/* Header — situational data */}
        <div className="px-3 py-2 border-b border-[var(--border)] bg-purple-600 text-white">
          <div className="flex items-center justify-between">
            <div className="text-sm font-black">Call the Play</div>
            <div className="text-right text-[10px] opacity-90">
              <span>{state.quarter >= 5 ? 'OT' : `Q${state.quarter}`} · {state.timeStr}</span>
              <span className="ml-2 font-bold">{state.awayAbbr} {state.awayScore} – {state.homeScore} {state.homeAbbr}</span>
            </div>
          </div>
        </div>

        {/* Down/distance + field */}
        <div className="px-3 py-2 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <div className="text-lg font-black tabular-nums leading-tight">{downLabel(state.down, state.yardsToGo)}</div>
            <div className="text-[10px] text-[var(--text-sec)]">at the {state.fieldDescription}</div>
          </div>
          {state.fieldPos >= 80 && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-bold uppercase">
              🔥 Red Zone
            </span>
          )}
        </div>

        {/* Play buttons */}
        <div className="px-3 py-3">
          {awaitingKickoffChoice ? (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">🏈 Kickoff — Choose:</div>
              <button
                onClick={() => onPlayCall('regular_kick')}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-lg text-white font-bold text-xs bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                🏈 Regular Kickoff
              </button>
              <button
                onClick={() => onPlayCall('onside_kick')}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-lg text-white font-bold text-xs bg-red-600 hover:bg-red-700 transition-colors"
              >
                🎲 Onside Kick (15% recovery)
              </button>
            </div>
          ) : awaitingXpChoice ? (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">🏆 Touchdown! Choose:</div>
              <button
                onClick={() => onPlayCall('extra_point')}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-lg text-white font-bold text-xs bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                🏈 Extra Point (94% success)
              </button>
              <button
                onClick={() => onPlayCall('two_point')}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-lg text-white font-bold text-xs bg-red-600 hover:bg-red-700 transition-colors"
              >
                💪 Go for 2 (48% success)
              </button>
            </div>
          ) : isFourthDown && !goingForIt ? (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => onPlayCall('field_goal')}
                  className="flex items-center gap-1.5 px-2.5 py-2.5 rounded-lg text-white font-bold text-xs bg-green-600 hover:bg-green-700 transition-colors"
                >
                  <span>🥅</span> <span>Field Goal</span>
                </button>
                <button
                  onClick={() => onPlayCall('punt')}
                  className="flex items-center gap-1.5 px-2.5 py-2.5 rounded-lg text-white font-bold text-xs bg-gray-600 hover:bg-gray-700 transition-colors"
                >
                  <span>🦶</span> <span>Punt</span>
                </button>
              </div>
              <button
                onClick={() => setGoingForIt(true)}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-lg text-white font-bold text-xs bg-red-600 hover:bg-red-700 transition-colors"
              >
                <span>💪</span> <span>Go For It →</span>
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                {PLAY_BUTTONS.map(btn => (
                  <button
                    key={btn.type}
                    onClick={() => { onPlayCall(btn.type); setGoingForIt(false); }}
                    className={`flex items-center gap-1.5 px-2.5 py-2.5 rounded-lg text-white font-bold text-xs transition-colors ${btn.color}`}
                  >
                    <span>{btn.icon}</span>
                  <span>{btn.label}</span>
                </button>
              ))}
              </div>
              {isFourthDown && (
                <button
                  onClick={() => setGoingForIt(false)}
                  className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-[var(--text-sec)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  ← Back to Punt / FG
                </button>
              )}
              {/* FG option on any down when in range (fieldPos >= 55 = ~62 yard attempt) */}
              {!isFourthDown && state.fieldPos >= 55 && (
                <button
                  onClick={() => onPlayCall('field_goal')}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-white font-bold text-xs bg-green-600 hover:bg-green-700 transition-colors"
                >
                  <span>🥅</span> <span>Kick Field Goal ({100 - state.fieldPos + 17} yds)</span>
                </button>
              )}
              {(() => {
                const [min] = state.timeStr.split(':').map(Number);
                const isLate = (state.quarter === 2 || state.quarter === 4 || state.quarter >= 5) && min < 2;
                return isLate ? (
                  <button
                    onClick={() => onPlayCall('kneel')}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-white font-bold text-xs bg-gray-700 hover:bg-gray-800 transition-colors"
                  >
                    <span>🧎</span> <span>Kneel (run clock)</span>
                  </button>
                ) : null;
              })()}
            </div>
          )}
        </div>

        {/* Footer — timeout + escape hatches */}
        <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--surface-2)]/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleOff}
              className="text-[10px] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
            >
              Turn off
            </button>
            {!awaitingXpChoice && timeoutsRemaining !== undefined && timeoutsRemaining > 0 && (
              <button
                onClick={() => onPlayCall('timeout')}
                className="text-[10px] font-bold text-amber-600 hover:text-amber-800 transition-colors"
              >
                ⏱️ Timeout ({timeoutsRemaining})
              </button>
            )}
          </div>
          <button
            onClick={onAutoSimRest}
            className="px-2 py-1 text-[10px] font-bold rounded-lg bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)] transition-colors"
          >
            Auto-sim to End ⏭
          </button>
        </div>
      </div>
    </div>
  );
}
