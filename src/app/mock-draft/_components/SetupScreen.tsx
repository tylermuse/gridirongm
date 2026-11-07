'use client';

import { useMemo, useState } from 'react';
import {
  ROUND_OPTIONS,
  recordLabel,
  slotsForRounds,
  type MockDraftData,
  type MockRounds,
} from '@/lib/mockDraft/engine';
import { Button } from '@/components/ui/Button';
import { TeamLogo } from '@/components/ui/TeamLogo';

export type Speed = 'instant' | 'fast' | 'slow';

const SPEEDS: { id: Speed; label: string }[] = [
  { id: 'instant', label: 'Instant' },
  { id: 'fast', label: 'Fast' },
  { id: 'slow', label: 'Slow' },
];

const MAX_PICKS_SHOWN = 3;

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <div className="text-xs font-semibold text-[var(--text-sec)] mb-1">{label}</div>
      <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={option.id === value}
            onClick={() => onChange(option.id)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              option.id === value ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:bg-[var(--surface-2)]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SetupScreen({
  data,
  notice,
  initialRounds,
  initialUserTids,
  initialSpeed,
  onStart,
}: {
  data: MockDraftData;
  notice: string | null;
  initialRounds: MockRounds;
  initialUserTids: number[];
  initialSpeed: Speed;
  onStart: (settings: { rounds: MockRounds; userTids: number[]; speed: Speed }) => void;
}) {
  const allTids = useMemo(() => data.teams.map((t) => t.tid), [data]);
  const startedWithAll = initialUserTids.length === allTids.length;

  const [rounds, setRounds] = useState<MockRounds>(initialRounds);
  const [speed, setSpeed] = useState<Speed>(initialSpeed);
  const [allTeams, setAllTeams] = useState(startedWithAll);
  const [selected, setSelected] = useState<number[]>(startedWithAll ? [] : initialUserTids);

  /** Each team's picks in the chosen rounds. A team can have none: its pick may have been traded. */
  const picksByTeam = useMemo(() => {
    const map = new Map<number, number[]>(allTids.map((tid) => [tid, []]));
    for (const slot of slotsForRounds(data, rounds)) map.get(slot.tid)?.push(slot.pick);
    return map;
  }, [data, rounds, allTids]);

  const teamsInOrder = useMemo(() => {
    const firstPick = (tid: number) => picksByTeam.get(tid)?.[0] ?? Infinity;
    return [...data.teams].sort((a, b) => firstPick(a.tid) - firstPick(b.tid));
  }, [data, picksByTeam]);

  // Dropping to fewer rounds can leave a selected team with nothing to draft.
  const eligibleSelected = selected.filter((tid) => (picksByTeam.get(tid)?.length ?? 0) > 0);
  const canStart = allTeams || eligibleSelected.length > 0;

  function toggleTeam(tid: number) {
    setAllTeams(false);
    setSelected((current) => (current.includes(tid) ? current.filter((t) => t !== tid) : [...current, tid]));
  }

  return (
    <div className="space-y-5">
      {notice && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Segmented
          label="Rounds"
          options={ROUND_OPTIONS.map((r) => ({ id: r, label: String(r) }))}
          value={rounds}
          onChange={setRounds}
        />
        <Segmented label="Speed" options={SPEEDS} value={speed} onChange={setSpeed} />
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-lg font-bold text-gray-900">Pick your team</h2>
          <button
            type="button"
            aria-pressed={allTeams}
            onClick={() => {
              setAllTeams((on) => !on);
              setSelected([]);
            }}
            className={`px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
              allTeams
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:border-blue-500'
            }`}
          >
            All 32
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {teamsInOrder.map((team) => {
            const picks = picksByTeam.get(team.tid) ?? [];
            const hasPick = picks.length > 0;
            const isSelected = allTeams ? hasPick : eligibleSelected.includes(team.tid);
            const shown = picks.slice(0, MAX_PICKS_SHOWN).map((p) => `#${p}`).join(', ');
            const extra = picks.length - MAX_PICKS_SHOWN;
            return (
              <button
                key={team.tid}
                type="button"
                aria-pressed={isSelected}
                disabled={!hasPick}
                onClick={() => toggleTeam(team.tid)}
                className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500 bg-blue-50'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:border-blue-400'
                } ${hasPick ? '' : 'opacity-50 cursor-not-allowed'}`}
              >
                <TeamLogo abbreviation={team.abbrev} primaryColor={team.colors[0]} secondaryColor={team.colors[1]} logoUrl={team.imgURL || undefined} logoOnWhite size="md" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[var(--text)] truncate">
                    {team.abbrev} <span className="font-normal text-[var(--text-sec)]">{recordLabel(team)}</span>
                  </span>
                  <span className="block text-xs text-[var(--text-sec)] truncate">
                    {hasPick ? `${shown}${extra > 0 ? ` +${extra}` : ''}` : rounds === 1 ? 'No 1st-round pick' : 'No pick'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          disabled={!canStart}
          onClick={() => onStart({ rounds, speed, userTids: allTeams ? allTids : eligibleSelected })}
        >
          Start draft
        </Button>
        <Button variant="ghost" onClick={() => onStart({ rounds, speed, userTids: [] })}>
          Or watch the AI draft
        </Button>
      </div>
    </div>
  );
}
