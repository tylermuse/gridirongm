'use client';

/**
 * TeamRosterModal — roster table in a popover.
 *
 * Same sortable roster data as the team page, rendered inline so standings
 * (and elsewhere) can peek at a roster without leaving the page.
 *
 * Props: teamId (null = closed), onClose.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Modal } from './Modal';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

interface TeamRosterModalProps {
  teamId: string | null;
  onClose: () => void;
  /** Optional: open a player from a roster row. */
  onPlayerClick?: (playerId: string) => void;
}

type SortKey = 'overall' | 'age' | 'position' | 'name';

const SORTABLE: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'name',     label: 'Name' },
  { key: 'position', label: 'Pos' },
  { key: 'age',      label: 'Age', align: 'right' },
  { key: 'overall',  label: 'OVR', align: 'right' },
];

export function TeamRosterModal({ teamId, onClose, onPlayerClick }: TeamRosterModalProps) {
  const league = useLeagueStore(s => s.league);
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [sortDesc, setSortDesc] = useState(true);

  const team: BasketballTeam | null =
    teamId && league
      ? ((league.teams.find(t => t.id === teamId) as BasketballTeam | undefined) ?? null)
      : null;

  const roster: BasketballPlayer[] =
    team && league
      ? team.playerIds
          .map(pid => (league.players as Record<string, BasketballPlayer>)[pid])
          .filter((p): p is BasketballPlayer => !!p)
      : [];

  const sorted = [...roster].sort((a, b) => {
    let diff = 0;
    switch (sortKey) {
      case 'overall':  diff = a.ratings.overall - b.ratings.overall; break;
      case 'age':      diff = a.age - b.age; break;
      case 'position': diff = a.sportData.position.localeCompare(b.sportData.position); break;
      case 'name':     diff = `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`); break;
    }
    return sortDesc ? -diff : diff;
  });

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc(d => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  return (
    <Modal
      open={!!teamId}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      title={
        team ? (
          <span className="flex items-center gap-2">
            <TeamLogo
              abbreviation={team.abbreviation}
              primaryColor={team.primaryColor}
              secondaryColor={team.secondaryColor}
              size="sm"
            />
            {team.city} {team.name}
          </span>
        ) : (
          'Roster'
        )
      }
    >
      {!team ? (
        <p className="text-[var(--text-sec)] py-8 text-center">Team not found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[var(--text-sec)]">
              <tr>
                {SORTABLE.map(col => (
                  <th
                    key={col.key}
                    className={`px-3 py-2 cursor-pointer select-none ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    {sortKey === col.key && <span className="ml-1 opacity-60">{sortDesc ? '▼' : '▲'}</span>}
                  </th>
                ))}
                <th className="px-3 py-2 text-right opacity-60">3PT</th>
                <th className="px-3 py-2 text-right opacity-60">REB</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <tr key={p.id} className="border-t hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-3 py-2">
                    {onPlayerClick ? (
                      <button
                        onClick={() => onPlayerClick(p.id)}
                        className="font-semibold hover:underline text-left"
                        style={{ color: 'var(--accent)' }}
                      >
                        {p.firstName} {p.lastName}
                      </button>
                    ) : (
                      <Link
                        href={`/player/${p.id}`}
                        onClick={onClose}
                        className="font-semibold hover:underline"
                        style={{ color: 'var(--accent)' }}
                      >
                        {p.firstName} {p.lastName}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2">{p.sportData.position}</td>
                  <td className="px-3 py-2 text-right">{p.age}</td>
                  <td className="px-3 py-2 text-right font-bold">{p.ratings.overall}</td>
                  <td className="px-3 py-2 text-right opacity-70">{p.ratings.threePoint}</td>
                  <td className="px-3 py-2 text-right opacity-70">{p.ratings.rebounding}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 text-center">
            <Link
              href={`/team/${team.id}`}
              onClick={onClose}
              className="text-sm font-semibold hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              Open full team page →
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
