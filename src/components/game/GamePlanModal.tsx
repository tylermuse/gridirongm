'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

type Aggressiveness = 'conservative' | 'balanced' | 'aggressive';

interface GamePlanModalProps {
  opponentName: string;
  onConfirm: (plan: { passRate: number; aggressiveness: Aggressiveness }) => void;
  onCancel: () => void;
}

export function GamePlanModal({ opponentName, onConfirm, onCancel }: GamePlanModalProps) {
  const [passRate, setPassRate] = useState(57); // default ~NFL avg
  const [aggressiveness, setAggressiveness] = useState<Aggressiveness>('balanced');

  function handleConfirm() {
    onConfirm({ passRate, aggressiveness });
  }

  function getPassRateLabel(rate: number): string {
    if (rate <= 35) return 'Run Heavy';
    if (rate <= 45) return 'Run Lean';
    if (rate <= 55) return 'Balanced';
    if (rate <= 65) return 'Pass Lean';
    return 'Pass Heavy';
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-black">Game Plan</h2>
          <p className="text-xs text-[var(--text-sec)] mt-0.5">vs {opponentName}</p>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5">
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
              <span>Run</span>
              <span className="tabular-nums">{passRate}% pass</span>
              <span>Pass</span>
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
