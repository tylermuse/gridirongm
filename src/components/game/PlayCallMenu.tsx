'use client';

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
  | 'field_goal'
  | 'go_for_it';

const PLAY_BUTTONS: { type: PlayCallType; label: string; icon: string; color: string }[] = [
  { type: 'run', label: 'Run', icon: '🏃', color: 'bg-orange-600 hover:bg-orange-700' },
  { type: 'pass_short', label: 'Short Pass', icon: '🎯', color: 'bg-blue-600 hover:bg-blue-700' },
  { type: 'pass_deep', label: 'Deep Shot', icon: '🚀', color: 'bg-purple-600 hover:bg-purple-700' },
  { type: 'qb_run', label: 'QB Scramble', icon: '⚡', color: 'bg-yellow-600 hover:bg-yellow-700' },
  { type: 'screen', label: 'Screen', icon: '🛡️', color: 'bg-teal-600 hover:bg-teal-700' },
];

export function PlayCallMenu({ state, isFourthDown, onPlayCall, onAutoSimRest, onToggleOff }: PlayCallMenuProps) {
  function downLabel(down: number, yardsToGo: number): string {
    const ordinals = ['1st', '2nd', '3rd', '4th'];
    if (down < 1 || down > 4) return '';
    return `${ordinals[down - 1]} & ${yardsToGo <= 0 ? 'Goal' : yardsToGo}`;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header — situational data */}
        <div className="px-5 py-3 border-b border-[var(--border)] bg-purple-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider opacity-80">Live Coach</div>
              <div className="text-lg font-black">Call the Play</div>
            </div>
            <div className="text-right text-xs opacity-90">
              <div>Q{state.quarter} · {state.timeStr}</div>
              <div className="font-bold">{state.awayAbbr} {state.awayScore} – {state.homeScore} {state.homeAbbr}</div>
            </div>
          </div>
        </div>

        {/* Down/distance + field */}
        <div className="px-5 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <div className="text-2xl font-black tabular-nums">{downLabel(state.down, state.yardsToGo)}</div>
            <div className="text-xs text-[var(--text-sec)] mt-0.5">at the {state.fieldDescription}</div>
          </div>
          {state.fieldPos >= 80 && (
            <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase">
              🔥 Red Zone
            </span>
          )}
        </div>

        {/* Play buttons */}
        <div className="px-5 py-4">
          {!isFourthDown ? (
            <div className="grid grid-cols-2 gap-2">
              {PLAY_BUTTONS.map(btn => (
                <button
                  key={btn.type}
                  onClick={() => onPlayCall(btn.type)}
                  className={`flex items-center gap-2 px-3 py-3 rounded-lg text-white font-bold text-sm transition-colors ${btn.color}`}
                >
                  <span className="text-lg">{btn.icon}</span>
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => onPlayCall('field_goal')}
                className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-white font-bold text-sm bg-green-600 hover:bg-green-700 transition-colors"
              >
                <span className="text-lg">🥅</span> Field Goal
              </button>
              <button
                onClick={() => onPlayCall('punt')}
                className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-white font-bold text-sm bg-gray-600 hover:bg-gray-700 transition-colors"
              >
                <span className="text-lg">🦶</span> Punt
              </button>
              <button
                onClick={() => onPlayCall('go_for_it')}
                className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-white font-bold text-sm bg-red-600 hover:bg-red-700 transition-colors"
              >
                <span className="text-lg">💪</span> Go For It
              </button>
            </div>
          )}
        </div>

        {/* Footer — escape hatches */}
        <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--surface-2)]/30 flex items-center justify-between gap-2">
          <button
            onClick={onToggleOff}
            className="text-xs text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
          >
            Turn off Live Coach
          </button>
          <button
            onClick={onAutoSimRest}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)] transition-colors"
          >
            Auto-sim to End ⏭
          </button>
        </div>
      </div>
    </div>
  );
}
