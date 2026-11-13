'use client';

import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { careerRecords, singleSeasonRecords, type RecordEntry } from '@/lib/engine/records';
import type { Player, Team } from '@/types';

type Span = 'career' | 'season';
type Scope = 'league' | 'team';

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: string }[];
  onChange: (key: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1 w-fit">
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
            value === o.key ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function formatValue(v: number) {
  return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** "2026–29" for a run of seasons, "2028" for one. */
function seasonSpan(first?: number, last?: number) {
  if (first === undefined || last === undefined) return '';
  if (first === last) return String(first);
  const lastText = String(last);
  return `${first}–${String(first).slice(0, 2) === lastText.slice(0, 2) ? lastText.slice(2) : lastText}`;
}

export function RecordsView({
  players,
  teams,
  userTeamId,
  season,
  onSelectPlayer,
}: {
  players: Player[];
  teams: Team[];
  userTeamId: string;
  season: number;
  onSelectPlayer: (id: string) => void;
}) {
  const [span, setSpan] = useState<Span>('career');
  const [scope, setScope] = useState<Scope>('league');

  const userTeam = teams.find(t => t.id === userTeamId);
  // A spectator league has no team to filter to.
  const activeScope: Scope = userTeam ? scope : 'league';
  const teamId = activeScope === 'team' ? userTeamId : undefined;

  const boards = useMemo(() => {
    const options = { currentSeason: season, teamId };
    return span === 'career' ? careerRecords(players, options) : singleSeasonRecords(players, options);
  }, [players, season, span, teamId]);

  const abbrById = useMemo(() => new Map(teams.map(t => [t.id, t.abbreviation])), [teams]);
  const teamLabel = userTeam ? `${userTeam.city} ${userTeam.name}` : '';

  const blurb = activeScope === 'league'
    ? span === 'career'
      ? 'Career totals for every player in league history, wherever they played.'
      : 'The best single seasons in league history.'
    : span === 'career'
      ? `Totals from seasons played for the ${teamLabel}. What a player did elsewhere is not counted.`
      : `The best single seasons by a ${teamLabel} player.`;

  function detail(e: RecordEntry) {
    if (span === 'season') {
      const team = activeScope === 'league' && e.teamId ? ` · ${abbrById.get(e.teamId) ?? '???'}` : '';
      return `${e.season}${team}`;
    }
    if (activeScope === 'team') return seasonSpan(e.firstSeason, e.lastSeason);
    if (e.teamId) return abbrById.get(e.teamId) ?? '???';
    return e.retired ? 'Ret.' : 'FA';
  }

  const showsInProgress = span === 'season' && boards.some(b => b.entries.some(e => e.inProgress));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Segmented
          label="Record type"
          value={span}
          onChange={setSpan}
          options={[{ key: 'career', label: 'Career' }, { key: 'season', label: 'Single Season' }]}
        />
        {userTeam && (
          <Segmented
            label="Record scope"
            value={activeScope}
            onChange={setScope}
            options={[{ key: 'league', label: 'League' }, { key: 'team', label: userTeam.abbreviation }]}
          />
        )}
      </div>
      <p className="text-[var(--text-sec)] text-xs mb-4">
        {blurb}
        {showsInProgress && (
          <>
            {' '}
            <span className="whitespace-nowrap">
              <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 align-middle mr-1" />
              Season in progress.
            </span>
          </>
        )}
      </p>

      {boards.length === 0 ? (
        <EmptyState
          icon="🏅"
          title="No Records Yet"
          description={
            activeScope === 'team'
              ? `No ${teamLabel} seasons on record yet. Records fill in as games are played.`
              : 'Records fill in as games are played.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map(board => (
            <Card key={board.key}>
              <CardHeader><CardTitle>{board.label}</CardTitle></CardHeader>
              <div className="space-y-1">
                {board.entries.map((e, i) => {
                  const mine = activeScope === 'league' && !!e.teamId && e.teamId === userTeamId;
                  return (
                    <div
                      key={`${e.playerId}-${e.season ?? 'career'}`}
                      className="flex items-center gap-2 text-sm border-t border-[var(--border)] pt-1.5 first:border-t-0 first:pt-0"
                    >
                      <span className="text-[var(--text-sec)] w-5 shrink-0 font-mono text-xs">{i + 1}</span>
                      <span className="text-[var(--text-sec)] w-7 shrink-0 font-mono text-[10px]">{e.position}</span>
                      <button
                        onClick={() => onSelectPlayer(e.playerId)}
                        className="min-w-0 truncate text-left text-blue-600 hover:text-blue-400 transition-colors"
                      >
                        {e.name}
                      </button>
                      <span className={`shrink-0 whitespace-nowrap text-xs ${mine ? 'text-blue-600 font-semibold' : 'text-[var(--text-sec)]'}`}>
                        {detail(e)}
                        {e.inProgress && (
                          <span title="Season in progress" className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 align-middle ml-1">
                            <span className="sr-only">(season in progress)</span>
                          </span>
                        )}
                      </span>
                      <span className="ml-auto shrink-0 font-bold tabular-nums">{formatValue(e.value)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
