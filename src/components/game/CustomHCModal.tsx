'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { OFFENSIVE_SCHEME_LABELS, DEFENSIVE_SCHEME_LABELS } from '@/lib/engine/coaching';
import type { OffensiveScheme, DefensiveScheme } from '@/types';

export interface CustomHCInput {
  firstName: string;
  lastName: string;
  age: number;
  offensiveScheme: OffensiveScheme;
  defensiveScheme: DefensiveScheme;
  ovr: number;
}

interface Props {
  /** When true, the modal is open. */
  open: boolean;
  /** Team label shown in the header (e.g. "Dallas Wranglers"). */
  teamLabel: string;
  /** Optional initial values to prefill when editing an existing HC. */
  initial?: Partial<CustomHCInput>;
  onConfirm: (hc: CustomHCInput) => void;
  onCancel: () => void;
}

const OFF_OPTIONS = Object.keys(OFFENSIVE_SCHEME_LABELS) as OffensiveScheme[];
const DEF_OPTIONS = Object.keys(DEFENSIVE_SCHEME_LABELS) as DefensiveScheme[];

export function CustomHCModal({ open, teamLabel, initial, onConfirm, onCancel }: Props) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? '');
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [age, setAge] = useState(initial?.age ?? 45);
  const [offensiveScheme, setOffensiveScheme] = useState<OffensiveScheme>(initial?.offensiveScheme ?? 'west_coast');
  const [defensiveScheme, setDefensiveScheme] = useState<DefensiveScheme>(initial?.defensiveScheme ?? 'cover_3');
  // Derive slider seeds from the initial ovr if provided so re-opening the
  // modal shows the coach's current quality distribution.
  const seedOvr = initial?.ovr ?? 70;
  const [passRun, setPassRun] = useState(Math.max(20, Math.min(99, seedOvr - 25)));
  const [aggression, setAggression] = useState(Math.max(20, Math.min(99, seedOvr - 25)));
  const [devBias, setDevBias] = useState(Math.max(20, Math.min(99, seedOvr - 25)));

  const total = passRun + aggression + devBias;
  const overBudget = total > 200;
  const canSubmit = !!firstName.trim() && !!lastName.trim() && !overBudget;

  function handleConfirm() {
    if (!canSubmit) return;
    // Map slider average → ovr (40-99 range). Higher slider total = more
    // capable HC since they spent more "points".
    const ovr = Math.max(50, Math.min(95, Math.round((passRun + aggression + devBias) / 3 + 25)));
    onConfirm({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      age,
      offensiveScheme,
      defensiveScheme,
      ovr,
    });
  }

  return (
    <Modal isOpen={open} onClose={onCancel} maxWidth="md">
      <div className="p-6 space-y-4">
        <div>
          <h2 className="text-xl font-black">{initial ? 'Edit Head Coach' : 'Create Head Coach'}</h2>
          <p className="text-sm text-[var(--text-sec)] mt-1">
            {initial ? `Update the HC for the ${teamLabel}.` : `Create a custom HC for the ${teamLabel}.`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase text-[var(--text-sec)]">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border rounded mt-0.5"
              placeholder="e.g. Andy"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-[var(--text-sec)]">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border rounded mt-0.5"
              placeholder="e.g. Reid"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase text-[var(--text-sec)]">Age ({age})</label>
          <input
            type="range"
            min={30}
            max={70}
            value={age}
            onChange={e => setAge(parseInt(e.target.value, 10))}
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase text-[var(--text-sec)]">Offensive Scheme</label>
            <select
              value={offensiveScheme}
              onChange={e => setOffensiveScheme(e.target.value as OffensiveScheme)}
              className="w-full px-2 py-1.5 text-sm border rounded mt-0.5"
            >
              {OFF_OPTIONS.map(s => (
                <option key={s} value={s}>{OFFENSIVE_SCHEME_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-[var(--text-sec)]">Defensive Scheme</label>
            <select
              value={defensiveScheme}
              onChange={e => setDefensiveScheme(e.target.value as DefensiveScheme)}
              className="w-full px-2 py-1.5 text-sm border rounded mt-0.5"
            >
              {DEF_OPTIONS.map(s => (
                <option key={s} value={s}>{DEFENSIVE_SCHEME_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold uppercase text-[var(--text-sec)]">Philosophy</span>
            <span className={`text-[10px] font-bold ${overBudget ? 'text-red-600' : 'text-[var(--text-sec)]'}`}>
              {total} / 200 pts
            </span>
          </div>
          <SliderRow label="Pass-Run Tendency" value={passRun} setValue={setPassRun} loLabel="Run" hiLabel="Pass" />
          <SliderRow label="Aggression" value={aggression} setValue={setAggression} loLabel="Conservative" hiLabel="Aggressive" />
          <SliderRow label="Development Bias" value={devBias} setValue={setDevBias} loLabel="Vets" hiLabel="Rookies" />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={handleConfirm} disabled={!canSubmit}>
            {initial ? 'Save Changes' : 'Create Coach'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SliderRow({ label, value, setValue, loLabel, hiLabel }: {
  label: string; value: number; setValue: (n: number) => void; loLabel: string; hiLabel: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-medium">{label}</span>
        <span className="text-[var(--text-sec)]">{value}</span>
      </div>
      <input
        type="range"
        min={20}
        max={99}
        value={value}
        onChange={e => setValue(parseInt(e.target.value, 10))}
        className="w-full"
      />
      <div className="flex justify-between text-[9px] text-[var(--text-sec)] uppercase tracking-wider">
        <span>{loLabel}</span>
        <span>{hiLabel}</span>
      </div>
    </div>
  );
}
