'use client';

import {
  DEFENSIVE_LOOKS, LOOK_INFO, LOOK_CALL_INFO, SET_INFO,
  type DefensiveLook, type OffensiveSet,
} from '@/lib/engine/defensiveLooks';

interface DefenseCallMenuProps {
  state: {
    quarter: number;
    timeStr: string;
    homeScore: number;
    awayScore: number;
    homeAbbr: string;
    awayAbbr: string;
    down: number;
    yardsToGo: number;
    /** Yards from the OFFENSE's own end zone (the CPU has the ball) */
    fieldPos: number;
    /** The team with the ball */
    offenseAbbr: string;
  };
  /** The set the offense is lined up in for this snap (the read) */
  offSet: OffensiveSet;
  /** How the user's previous defensive call fared, from the user's side (+1 it had the play covered) */
  lastRead?: { call: DefensiveLook; edge: -1 | 0 | 1 } | null;
  /** Timeouts remaining for the user's team */
  timeoutsRemaining: number;
  /** Seconds of runoff a timeout would save; 0 means the clock is already stopped */
  pendingRunoff: number;
  onCall: (look: DefensiveLook) => void;
  onTimeout: () => void;
  /** Stop calling the defense (offensive play calling stays on) */
  onStopCalling: () => void;
  onAutoSimRest: () => void;
}

const LOOK_COLORS: Record<DefensiveLook, string> = {
  blitz: 'bg-red-600 hover:bg-red-700',
  stacked_box: 'bg-orange-600 hover:bg-orange-700',
  two_high: 'bg-blue-600 hover:bg-blue-700',
  man_press: 'bg-purple-600 hover:bg-purple-700',
  soft_zone: 'bg-teal-600 hover:bg-teal-700',
};

/**
 * The Live Coach menu for a CPU snap when the user is calling the defense: the offense's set is the read, and the
 * five looks are the calls (defensiveLooks.ts, "Calling the defense"). Sits in the same slot as PlayCallMenu.
 */
export function DefenseCallMenu({ state, offSet, lastRead, timeoutsRemaining, pendingRunoff, onCall, onTimeout, onStopCalling, onAutoSimRest }: DefenseCallMenuProps) {
  const ordinals = ['1st', '2nd', '3rd', '4th'];
  const downLabel = state.down >= 1 && state.down <= 4
    ? `${ordinals[state.down - 1]} & ${state.yardsToGo <= 0 || state.fieldPos + state.yardsToGo >= 100 ? 'Goal' : state.yardsToGo}`
    : '';
  const fp = state.fieldPos;
  const spot = fp === 50 ? 'midfield' : fp < 50 ? `their own ${fp}` : `your ${100 - fp}`;
  const canSaveTime = pendingRunoff > 0;

  return (
    <div className="w-full min-w-0" data-track-area="defense-call-menu">
      <div className="w-full max-w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--border)] bg-slate-700 text-white">
          <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1">
            <div className="text-sm font-black">Call the Defense</div>
            <div className="text-right text-[10px] opacity-90 min-w-0">
              <span>{state.quarter >= 5 ? 'OT' : `Q${state.quarter}`} · {state.timeStr}</span>
              <span className="ml-2 font-bold">{state.awayAbbr} {state.awayScore} – {state.homeScore} {state.homeAbbr}</span>
            </div>
          </div>
        </div>

        <div className="px-3 py-2 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <div className="text-lg font-black tabular-nums leading-tight">{downLabel}</div>
            <div className="text-[10px] text-[var(--text-sec)]">{state.offenseAbbr} ball at {spot}</div>
          </div>
          {fp >= 80 && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-bold uppercase">
              🚨 Red Zone
            </span>
          )}
        </div>

        {/* What the offense is lined up in: it leans toward the play they are about to run */}
        <div className="px-3 py-2 border-b border-[var(--border)]" data-track-area="offensive-set">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-sec)]">Offense shows</span>
            <span className="text-sm font-black leading-tight">{SET_INFO[offSet].icon} {SET_INFO[offSet].label}</span>
          </div>
          <div className="text-[11px] leading-snug text-[var(--text-sec)]">{SET_INFO[offSet].read}</div>
          {lastRead && lastRead.edge !== 0 && (
            <div className={`mt-1 text-[10px] font-bold ${lastRead.edge > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {lastRead.edge > 0
                ? `✓ Good call: your ${LOOK_INFO[lastRead.call].label} had that play covered.`
                : `✗ They beat your ${LOOK_INFO[lastRead.call].label} on that one.`}
            </div>
          )}
        </div>

        <div className="px-3 py-3 space-y-1.5">
          {DEFENSIVE_LOOKS.map(look => (
            <button
              key={look}
              onClick={() => onCall(look)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-white text-left transition-colors ${LOOK_COLORS[look]}`}
            >
              <span className="text-base leading-none">{LOOK_INFO[look].icon}</span>
              <span className="min-w-0">
                <span className="block font-bold text-xs leading-tight">{LOOK_INFO[look].label}</span>
                <span className="block text-[10px] leading-tight opacity-90">
                  {LOOK_CALL_INFO[look].stops}; {LOOK_CALL_INFO[look].risk}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--surface-2)]/30 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <button
              onClick={onStopCalling}
              className="text-[10px] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
              title="Let the defense play on its own again. You keep calling the offense."
            >
              Stop calling defense
            </button>
            {timeoutsRemaining > 0 && (
              <button
                onClick={onTimeout}
                disabled={!canSaveTime}
                className={`text-[10px] font-bold transition-colors ${
                  canSaveTime ? 'text-amber-600 hover:text-amber-800' : 'text-[var(--text-sec)]/50 cursor-not-allowed'
                }`}
                title={canSaveTime
                  ? `Stops the clock and saves ~${pendingRunoff}s that would otherwise tick off before the snap.`
                  : 'Clock already stopped — timeout would have no effect.'}
              >
                ⏱️ Timeout ({timeoutsRemaining})
                {canSaveTime
                  ? <span className="ml-1 text-green-600">· saves ~{pendingRunoff}s</span>
                  : <span className="ml-1 text-[var(--text-sec)]/70">· clock stopped</span>}
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
