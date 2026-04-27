'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

type Aggressiveness = 'conservative' | 'balanced' | 'aggressive';
type RedZoneStrategy = 'run' | 'balanced' | 'pass';
type Coverage = 'man' | 'zone' | 'balanced';
type Tempo = 'fast' | 'normal' | 'slow';

interface GamePlanModalProps {
  opponentName: string;
  onConfirm: (plan: {
    passRate: number;
    aggressiveness: Aggressiveness;
    redZoneStrategy: RedZoneStrategy;
    blitzRate: number;
    coverage: Coverage;
    tempo: Tempo;
  }) => void;
  onCancel: () => void;
}

export function GamePlanModal({ opponentName, onConfirm, onCancel }: GamePlanModalProps) {
  const [passRate, setPassRate] = useState(57); // default ~NFL avg
  const [aggressiveness, setAggressiveness] = useState<Aggressiveness>('balanced');
  const [redZoneStrategy, setRedZoneStrategy] = useState<RedZoneStrategy>('balanced');
  const [blitzRate, setBlitzRate] = useState(50);
  const [coverage, setCoverage] = useState<Coverage>('balanced');
  const [tempo, setTempo] = useState<Tempo>('normal');

  function handleConfirm() {
    onConfirm({ passRate, aggressiveness, redZoneStrategy, blitzRate, coverage, tempo });
  }

  function getPassRateLabel(rate: number): string {
    const runPct = 100 - rate;
    const tier =
      rate <= 35 ? 'Run Heavy' :
      rate <= 45 ? 'Run Lean' :
      rate <= 55 ? 'Balanced' :
      rate <= 65 ? 'Pass Lean' :
      'Pass Heavy';
    return `${runPct}R / ${rate}P · ${tier}`;
  }

  return (
    // Backdrop click closes; stopPropagation on the inner card. Lepromisedprince
    // (4/26) flagged "hard to open/close the gameplan screen on mobile" — there
    // was no way to dismiss except finding the Cancel button at the bottom.
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl max-w-md w-full max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — explicit close button at top-right for thumb reach */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">Game Plan</h2>
            <p className="text-xs text-[var(--text-sec)] mt-0.5">vs {opponentName}</p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close game plan"
            className="shrink-0 -mr-2 -mt-1 w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-sec)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>

        {/* Body — scrolls when content exceeds viewport so users see all options */}
        <div className="px-5 py-5 space-y-5 overflow-y-auto flex-1">
          {/* Run/Pass Ratio slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)]">Offensive Tendency</label>
              <span className="text-xs font-bold text-blue-600">{getPassRateLabel(passRate)}</span>
            </div>
            <input
              type="range"
              min="20"
              max="80"
              step="5"
              value={passRate}
              onChange={(e) => setPassRate(parseInt(e.target.value, 10))}
              className="w-full accent-blue-600"
            />
            <div className="flex items-center justify-between text-[10px] text-[var(--text-sec)] mt-1">
              <span className="tabular-nums font-semibold">{100 - passRate}% Run</span>
              <span className="text-[var(--text-sec)] italic">drag to adjust</span>
              <span className="tabular-nums font-semibold">{passRate}% Pass</span>
            </div>
          </div>

          {/* Aggressiveness */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] block mb-2">Risk Profile</label>
            <div className="grid grid-cols-3 gap-2">
              {(['conservative', 'balanced', 'aggressive'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setAggressiveness(opt)}
                  className={`px-2 py-2 rounded-lg text-xs font-bold capitalize transition-colors ${
                    aggressiveness === opt
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)]'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-sec)] mt-1.5 italic">
              {aggressiveness === 'aggressive' && 'More deep shots, more big plays — but more INTs.'}
              {aggressiveness === 'balanced' && 'Standard play calling — no situational bias.'}
              {aggressiveness === 'conservative' && 'Fewer deep shots, fewer big plays, fewer turnovers.'}
            </p>
          </div>

          {/* Red Zone Strategy */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] block mb-2">Red Zone Strategy</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'run', label: 'Pound It' },
                { key: 'balanced', label: 'Balanced' },
                { key: 'pass', label: 'Air It Out' },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setRedZoneStrategy(opt.key)}
                  className={`px-2 py-2 rounded-lg text-xs font-bold transition-colors ${
                    redZoneStrategy === opt.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-sec)] mt-1.5 italic">
              {redZoneStrategy === 'run' && 'Inside the 20: lean run-heavy. Power running, shorter throws.'}
              {redZoneStrategy === 'balanced' && 'Inside the 20: no override. Mix it up like the rest of the field.'}
              {redZoneStrategy === 'pass' && 'Inside the 20: throw it. Fade routes, slants, RPO.'}
            </p>
          </div>

          <div className="border-t border-[var(--border)] pt-4 -mx-5 px-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] mb-3">Defense</h3>

            {/* Blitz Rate */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-[var(--text)]">Blitz Rate</label>
                <span className="text-xs font-bold text-red-600">
                  {blitzRate <= 25 ? 'Rarely' : blitzRate <= 45 ? 'Light' : blitzRate <= 55 ? 'Standard' : blitzRate <= 75 ? 'Heavy' : 'Full-Out'} · {blitzRate}%
                </span>
              </div>
              <input
                type="range" min="0" max="100" step="5"
                value={blitzRate}
                onChange={(e) => setBlitzRate(parseInt(e.target.value, 10))}
                className="w-full accent-red-600"
              />
              <p className="text-[10px] text-[var(--text-sec)] mt-1 italic">Higher = more sacks AND more big plays surrendered.</p>
            </div>

            {/* Coverage */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-[var(--text)] block mb-2">Coverage</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'zone', label: 'Zone' },
                  { key: 'balanced', label: 'Balanced' },
                  { key: 'man', label: 'Man' },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setCoverage(opt.key)}
                    className={`px-2 py-2 rounded-lg text-xs font-bold transition-colors ${
                      coverage === opt.key
                        ? 'bg-red-600 text-white'
                        : 'bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[var(--text-sec)] mt-1.5 italic">
                {coverage === 'zone' && 'Fewer INTs, tighter vs big plays, more YAC allowed.'}
                {coverage === 'balanced' && 'Mix of man and zone concepts.'}
                {coverage === 'man' && 'More INTs, tighter vs short routes, more big plays allowed.'}
              </p>
            </div>

            {/* Tempo */}
            <div>
              <label className="text-xs font-semibold text-[var(--text)] block mb-2">Offensive Tempo</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'slow', label: 'Milk Clock' },
                  { key: 'normal', label: 'Normal' },
                  { key: 'fast', label: 'Up-Tempo' },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setTempo(opt.key)}
                    className={`px-2 py-2 rounded-lg text-xs font-bold transition-colors ${
                      tempo === opt.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[var(--text-sec)] mt-1.5 italic">
                {tempo === 'slow' && 'Long drives, shortened clock. Suits a strong defense.'}
                {tempo === 'normal' && 'League-average tempo.'}
                {tempo === 'fast' && 'More possessions per game. Suits a strong offense.'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--border)] flex items-center justify-end gap-2 bg-[var(--surface-2)]/30">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={handleConfirm}>Simulate Game →</Button>
        </div>
      </div>
    </div>
  );
}
