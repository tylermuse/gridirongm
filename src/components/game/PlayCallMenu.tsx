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
    <div className="fixed top-0 right-0 bottom-0 z-50 flex items-start justify-end p-4 pt-20 pointer-events-none" style={{ width: '340px' }}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-full overflow-hidden pointer-events-auto">
        {/* Header — situational data */}
        <div className="px-3 py-2 border-b border-[var(--border)] bg-purple-600 text-white">
          <div className="flex items-center justify-between">
            <div className="text-sm font-black">Call the Play</div>
            <div className="text-right text-[10px] opacity-90">
              <span>Q{state.quarter} · {state.timeStr}</span>
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
          {!isFourthDown ? (
            <div className="grid grid-cols-2 gap-1.5">
              {PLAY_BUTTONS.map(btn => (
                <button
                  key={btn.type}
                  onClick={() => onPlayCall(btn.type)}
                  className={`flex items-center gap-1.5 px-2.5 py-2.5 rounded-lg text-white font-bold text-xs transition-colors ${btn.color}`}
                >
                  <span>{btn.icon}</span>
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => onPlayCall('field_goal')}
                className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-white font-bold text-xs bg-green-600 hover:bg-green-700 transition-colors"
              >
                <span>🥅</span> <span>FG</span>
              </button>
              <button
                onClick={() => onPlayCall('punt')}
                className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-white font-bold text-xs bg-gray-600 hover:bg-gray-700 transition-colors"
              >
                <span>🦶</span> <span>Punt</span>
              </button>
              <button
                onClick={() => onPlayCall('go_for_it')}
                className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-white font-bold text-xs bg-red-600 hover:bg-red-700 transition-colors"
              >
                <span>💪</span> <span>Go For It</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer — escape hatches */}
        <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--surface-2)]/30 flex items-center justify-between gap-2">
          <button
            onClick={onToggleOff}
            className="text-[10px] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
          >
            Turn off
          </button>
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
