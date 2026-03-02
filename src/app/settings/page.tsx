'use client';

import { useState, useEffect } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DEFAULT_LEAGUE_SETTINGS, type LeagueSettings } from '@/types';

interface SettingRowProps {
  label: string;
  description: string;
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  formatValue?: (val: number) => string;
}

function SettingRow({ label, description, value, onChange, min, max, step, unit, formatValue }: SettingRowProps) {
  const display = formatValue ? formatValue(value) : `${value}${unit ?? ''}`;
  return (
    <div className="flex items-center gap-4 py-3 border-t border-[var(--border)] first:border-t-0">
      <div className="flex-1">
        <div className="font-semibold text-sm">{label}</div>
        <div className="text-xs text-[var(--text-sec)]">{description}</div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="w-32 accent-blue-500"
        />
        <span className="text-sm font-mono w-20 text-right">{display}</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { leagueSettings, updateLeagueSettings, teams, userTeamId } = useGameStore();
  const settings = leagueSettings ?? DEFAULT_LEAGUE_SETTINGS;

  const [draft, setDraft] = useState<LeagueSettings>({ ...settings });
  const [saved, setSaved] = useState(false);

  // Sync when store changes externally
  useEffect(() => {
    setDraft({ ...settings });
  }, [settings]);

  function handleSave() {
    updateLeagueSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    setDraft({ ...DEFAULT_LEAGUE_SETTINGS });
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const userTeam = teams.find(t => t.id === userTeamId);

  return (
    <GameShell>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black">League Settings</h2>
            <p className="text-sm text-[var(--text-sec)]">
              Customize game mechanics. Changes take effect immediately.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleReset} disabled={!isDirty && JSON.stringify(draft) === JSON.stringify(DEFAULT_LEAGUE_SETTINGS)}>
              Reset Defaults
            </Button>
            <Button onClick={handleSave} disabled={!isDirty}>
              {saved ? '✓ Saved' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {/* Finance Settings */}
        <Card className="mb-4">
          <CardHeader><CardTitle>Finances</CardTitle></CardHeader>
          <div>
            <SettingRow
              label="Salary Cap"
              description="Starting salary cap for all teams"
              value={draft.salaryCap}
              onChange={v => setDraft(d => ({ ...d, salaryCap: v }))}
              min={150}
              max={500}
              step={5}
              formatValue={v => `$${v}M`}
            />
            <SettingRow
              label="Cap Growth Rate"
              description="Annual % increase to the salary cap each new season"
              value={draft.capGrowthRate}
              onChange={v => setDraft(d => ({ ...d, capGrowthRate: v }))}
              min={0}
              max={15}
              step={0.5}
              unit="%"
            />
            <SettingRow
              label="Luxury Tax Rate"
              description="Penalty multiplier for each $1M over the cap"
              value={draft.luxuryTaxRate}
              onChange={v => setDraft(d => ({ ...d, luxuryTaxRate: v }))}
              min={0}
              max={5}
              step={0.25}
              formatValue={v => `${v}x`}
            />
            <SettingRow
              label="League Minimum Salary"
              description="Minimum player salary — can sign at this even when over the cap"
              value={draft.leagueMinSalary}
              onChange={v => setDraft(d => ({ ...d, leagueMinSalary: v }))}
              min={0.25}
              max={3}
              step={0.25}
              formatValue={v => `$${v}M`}
            />
          </div>
        </Card>

        {/* Trade Settings */}
        <Card className="mb-4">
          <CardHeader><CardTitle>Trades</CardTitle></CardHeader>
          <div>
            <SettingRow
              label="Trade Deadline"
              description="Week number after which no trades can be made"
              value={draft.tradeDeadlineWeek}
              onChange={v => setDraft(d => ({ ...d, tradeDeadlineWeek: v }))}
              min={6}
              max={17}
              step={1}
              formatValue={v => `Week ${v}`}
            />
          </div>
        </Card>

        {/* Player Development */}
        <Card className="mb-4">
          <CardHeader><CardTitle>Player Development</CardTitle></CardHeader>
          <div>
            <SettingRow
              label="Progression Rate"
              description="How quickly young players develop. 100 = normal"
              value={draft.progressionRate}
              onChange={v => setDraft(d => ({ ...d, progressionRate: v }))}
              min={0}
              max={200}
              step={10}
              formatValue={v => `${v}%`}
            />
            <SettingRow
              label="Regression Rate"
              description="How quickly aging players decline. 100 = normal"
              value={draft.regressionRate}
              onChange={v => setDraft(d => ({ ...d, regressionRate: v }))}
              min={0}
              max={200}
              step={10}
              formatValue={v => `${v}%`}
            />
            <SettingRow
              label="Injury Frequency"
              description="How often injuries occur. 100 = normal, 0 = no injuries"
              value={draft.injuryRate}
              onChange={v => setDraft(d => ({ ...d, injuryRate: v }))}
              min={0}
              max={200}
              step={10}
              formatValue={v => `${v}%`}
            />
            <SettingRow
              label="Retirement Age"
              description="Minimum age before players consider retiring"
              value={draft.retirementAge}
              onChange={v => setDraft(d => ({ ...d, retirementAge: v }))}
              min={28}
              max={42}
              step={1}
              formatValue={v => `${v} yrs`}
            />
          </div>
        </Card>

        {/* Current league info */}
        <Card>
          <CardHeader><CardTitle>Current League Status</CardTitle></CardHeader>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[var(--text-sec)]">Current Cap:</span>{' '}
              <span className="font-mono font-bold">${userTeam?.salaryCap}M</span>
            </div>
            <div>
              <span className="text-[var(--text-sec)]">Your Payroll:</span>{' '}
              <span className="font-mono font-bold">${userTeam?.totalPayroll.toFixed(1)}M</span>
            </div>
            <div>
              <span className="text-[var(--text-sec)]">Cap Space:</span>{' '}
              <span className={`font-mono font-bold ${(userTeam?.salaryCap ?? 0) - (userTeam?.totalPayroll ?? 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${((userTeam?.salaryCap ?? 0) - (userTeam?.totalPayroll ?? 0)).toFixed(1)}M
              </span>
            </div>
            <div>
              <span className="text-[var(--text-sec)]">Next Season Cap:</span>{' '}
              <span className="font-mono font-bold">
                ~${((userTeam?.salaryCap ?? draft.salaryCap) * (1 + draft.capGrowthRate / 100)).toFixed(0)}M
              </span>
            </div>
          </div>
        </Card>
      </div>
    </GameShell>
  );
}
