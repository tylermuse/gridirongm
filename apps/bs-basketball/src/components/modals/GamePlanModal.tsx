'use client';

import { useState } from 'react';
import { Modal } from '@/components/modals/Modal';
import { Button } from '@/components/ui/Button';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { DEFAULT_GAME_PLAN, type BasketballGamePlan, type BasketballTeam } from '@bs/sport-basketball';

/**
 * Pre-game Game Plan (P0.2). Six tactical levers that the sim reads per side and
 * biases the box score by — pace, offensive focus, shot risk, defensive scheme,
 * ball pressure, and rotation. Persisted on the team; applies to every game
 * until changed. Every lever is neutral at its middle option.
 */

type Key = keyof BasketballGamePlan;
const ROWS: { key: Key; label: string; opts: [string, string][]; desc: string }[] = [
  { key: 'pace', label: 'Pace', opts: [['slow', 'Slow'], ['balanced', 'Balanced'], ['fast', 'Up-tempo']], desc: 'Tempo — faster means more possessions, more scoring and variance.' },
  { key: 'offensiveFocus', label: 'Offense', opts: [['inside', 'Inside'], ['balanced', 'Balanced'], ['perimeter', 'Perimeter & 3']], desc: 'Shot location — perimeter jacks up more threes; inside attacks the paint.' },
  { key: 'shotRisk', label: 'Shot selection', opts: [['conservative', 'Safe'], ['balanced', 'Balanced'], ['hero', 'Hero-ball']], desc: 'Hero-ball forces tougher, higher-variance shots; safe takes the good look.' },
  { key: 'defensiveScheme', label: 'Defense', opts: [['man', 'Man'], ['zone', 'Zone'], ['switch', 'Switch']], desc: 'Coverage scheme. A set zone shaves a little off opponent FG%.' },
  { key: 'pressure', label: 'Pressure', opts: [['pack', 'Pack paint'], ['balanced', 'Balanced'], ['press', 'Full-court']], desc: 'Press forces more turnovers but gives up easier buckets when beaten.' },
  { key: 'rotation', label: 'Rotation', opts: [['starters', 'Ride starters'], ['balanced', 'Balanced'], ['bench', 'Develop bench']], desc: 'Minutes lean — ride your starters or spread the load to the bench.' },
];

export function GamePlanModal({ teamId, open, onClose }: { teamId: string | null; open: boolean; onClose: () => void }) {
  const { league, saveGamePlan, loading } = useLeagueStore();
  const team = teamId && league ? (league.teams.find(t => t.id === teamId) as BasketballTeam | undefined) ?? null : null;
  const current = (team?.sportData as { gamePlan?: BasketballGamePlan } | undefined)?.gamePlan ?? DEFAULT_GAME_PLAN;

  const [plan, setPlan] = useState<BasketballGamePlan>(current);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-seed from the team's saved plan whenever a different team opens.
  if (open && teamId && seededFor !== teamId) {
    setPlan(current);
    setSeededFor(teamId);
    setSaved(false);
  }

  function set<K extends Key>(key: K, value: BasketballGamePlan[K]) {
    setPlan(p => ({ ...p, [key]: value }));
    setSaved(false);
  }

  async function save() {
    if (!teamId) return;
    const ok = await saveGamePlan(teamId, plan);
    if (ok) setSaved(true);
  }

  return (
    <Modal open={open} onClose={onClose} title="📋 Game Plan" maxWidthClass="max-w-lg">
      <div className="space-y-3 p-1">
        <p className="text-xs text-[var(--text-sec)]">Applies to every game until you change it.</p>
        {ROWS.map(row => (
          <div key={row.key}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold">{row.label}</span>
            </div>
            <div className="flex gap-1 mt-1">
              {row.opts.map(([val, lbl]) => {
                const active = plan[row.key] === val;
                return (
                  <button
                    key={val}
                    onClick={() => set(row.key, val as BasketballGamePlan[Key])}
                    className="flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition active:scale-95"
                    style={active
                      ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }
                      : { borderColor: 'var(--border)', color: 'var(--text-sec)' }}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[var(--text-sec)] mt-1">{row.desc}</p>
          </div>
        ))}

        <div className="flex justify-end items-center gap-2 pt-1">
          {saved && <span className="text-sm" style={{ color: 'var(--accent)' }}>✓ Saved</span>}
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="primary" disabled={loading} onClick={() => void save()}>
            {loading ? 'Saving…' : 'Save Game Plan'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
