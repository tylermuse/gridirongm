'use client';

/**
 * TeamRosterModal — roster table in a popover (football parity).
 *
 * Header: team + record · avg OVR · cap space. Body: a PG–C position filter and
 * a sortable roster (OVR chip, POT, contract with the expiring flag, GP and
 * per-game line), so standings (and elsewhere) can peek at a roster without
 * leaving the page.
 *
 * Props: teamId (null = closed), onClose, optional onPlayerClick (otherwise a
 * name opens the shared player card).
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { PlayerName } from './PlayerModalProvider';
import {
  NAME_CLS, OvrChip, PotValue, PotHeader, ContractText, TwoWayChip,
  SortTh, useRosterSort, contractInfo, injuryStatus,
} from '@/components/roster/RosterCells';
import { teamCap, fmtMoney } from '@/lib/dashboard/summary';
import { getInjuries } from '@/lib/injuries';
import { regularSeasonStatsByPlayer, statsForPlayer } from '@/lib/stats/seasonStats';
import { Modal } from './Modal';
import type { BasketballPlayer, BasketballPosition, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

interface TeamRosterModalProps {
  teamId: string | null;
  onClose: () => void;
  /** Optional: open a player from a roster row. */
  onPlayerClick?: (playerId: string) => void;
}

type SortKey = 'name' | 'pos' | 'age' | 'ovr' | 'pot' | 'contract' | 'gp' | 'ppg';
type PosFilter = 'ALL' | BasketballPosition;

const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const POS_FILTERS: { value: PosFilter; label: string }[] = [
  { value: 'ALL', label: 'ALL' },
  ...POSITIONS.map(pos => ({ value: pos, label: pos })),
];

function perGame(s: BasketballStats, key: 'points' | 'totalRebounds' | 'assists'): number {
  return s.gamesPlayed > 0 ? s[key] / s.gamesPlayed : 0;
}

export function TeamRosterModal({ teamId, onClose, onPlayerClick }: TeamRosterModalProps) {
  const league = useLeagueStore(s => s.league);
  const [filterPos, setFilterPos] = useState<PosFilter>('ALL');
  const { sortKey, sortDir, onSort } = useRosterSort<SortKey>('ovr', 'desc', ['name', 'pos']);
  const statsMap = useMemo(() => (league ? regularSeasonStatsByPlayer(league) : new Map()), [league]);

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

  const season = league?.currentSeason ?? 0;
  const injuries = league ? getInjuries(league) : {};
  const today = league?.currentTick ?? 0;

  const rows = roster
    .filter(p => filterPos === 'ALL' || p.sportData.position === filterPos)
    .map(p => ({ p, s: statsForPlayer(statsMap, p.id) as BasketballStats }))
    .sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'name': diff = `${a.p.lastName} ${a.p.firstName}`.localeCompare(`${b.p.lastName} ${b.p.firstName}`); break;
        case 'pos':
          diff = POSITIONS.indexOf(a.p.sportData.position) - POSITIONS.indexOf(b.p.sportData.position);
          if (diff === 0) return b.p.ratings.overall - a.p.ratings.overall;
          break;
        case 'age': diff = a.p.age - b.p.age; break;
        case 'ovr': diff = a.p.ratings.overall - b.p.ratings.overall; break;
        case 'pot': diff = a.p.development.potential - b.p.development.potential; break;
        case 'contract': diff = (contractInfo(a.p, season)?.aav ?? 0) - (contractInfo(b.p, season)?.aav ?? 0); break;
        case 'gp': diff = a.s.gamesPlayed - b.s.gamesPlayed; break;
        case 'ppg': diff = perGame(a.s, 'points') - perGame(b.s, 'points'); break;
      }
      return sortDir === 'desc' ? -diff : diff;
    });

  const avgOvr = roster.length ? Math.round(roster.reduce((s, p) => s + p.ratings.overall, 0) / roster.length) : 0;
  const cap = team && league ? teamCap(league, team) : null;
  const capClass = !cap ? '' : cap.capRoom > 10_000_000 ? 'text-green-600' : cap.capRoom > 0 ? 'text-amber-600' : 'text-red-600';
  const sortProps = { sortKey, sortDir, onSort };

  return (
    <Modal
      open={!!teamId}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      title={
        team ? (
          <span className="flex items-center gap-3 min-w-0">
            <TeamLogo
              abbreviation={team.abbreviation}
              primaryColor={team.primaryColor}
              secondaryColor={team.secondaryColor}
              size="md"
            />
            <span className="min-w-0">
              <span className="block truncate font-black">{team.city} {team.name}</span>
              <span className="flex flex-wrap items-center gap-x-3 text-xs font-normal text-[var(--text-sec)]">
                <span className="tabular-nums">{team.record.wins}–{team.record.losses}</span>
                <span className="tabular-nums">OVR {avgOvr}</span>
                <span className="tabular-nums">{roster.length} players</span>
                {cap && (
                  <span className={`tabular-nums ${capClass}`}>
                    {cap.capRoom >= 0 ? `${fmtMoney(cap.capRoom)} cap space` : `${fmtMoney(-cap.capRoom)} over cap`}
                  </span>
                )}
              </span>
            </span>
          </span>
        ) : (
          'Roster'
        )
      }
    >
      {!team ? (
        <p className="text-[var(--text-sec)] py-8 text-center">Team not found.</p>
      ) : (
        <>
          <SegmentedControl<PosFilter>
            size="sm"
            className="mb-3"
            value={filterPos}
            onChange={setFilterPos}
            options={POS_FILTERS}
          />
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm min-w-[640px] sticky-col">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <SortTh k="name" {...sortProps} className="text-left pl-3">Name</SortTh>
                  <SortTh k="pos" {...sortProps} className="text-center">Pos</SortTh>
                  <SortTh k="age" {...sortProps} className="text-center">Age</SortTh>
                  <SortTh k="ovr" {...sortProps} className="text-center">Ovr</SortTh>
                  <SortTh k="pot" {...sortProps} className="text-right"><PotHeader /></SortTh>
                  <SortTh k="contract" {...sortProps} className="text-right">Contract</SortTh>
                  <SortTh k="gp" {...sortProps} className="text-center">GP</SortTh>
                  <SortTh k="ppg" {...sortProps} className="text-right pr-3">PPG/RPG/APG</SortTh>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, s }) => {
                  const gp = s.gamesPlayed;
                  const inj = injuryStatus(injuries[p.id], today);
                  return (
                    <tr key={p.id} className="border-t hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-2 px-2 pl-3">
                        <span className="flex items-center gap-1.5 min-w-0">
                          {onPlayerClick ? (
                            <button onClick={() => onPlayerClick(p.id)} className={`${NAME_CLS} text-left truncate`}>
                              {p.firstName} {p.lastName}
                            </button>
                          ) : (
                            <PlayerName playerId={p.id} firstName={p.firstName} lastName={p.lastName} className={`${NAME_CLS} truncate`} />
                          )}
                          <TwoWayChip player={p} />
                        </span>
                        {inj && (
                          <span className={`block text-[10px] ${inj.gtd ? 'text-amber-600' : 'text-red-600'}`}>
                            {inj.bodyPart} · {inj.text}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center text-xs font-bold text-[var(--text-sec)]">{p.sportData.position}</td>
                      <td className="py-2 px-2 text-center tabular-nums">{p.age}</td>
                      <td className="py-2 px-2 text-center"><OvrChip value={p.ratings.overall} /></td>
                      <td className="py-2 px-2 text-right"><PotValue pot={p.development.potential} /></td>
                      <td className="py-2 px-2 text-right text-xs"><ContractText player={p} season={season} /></td>
                      <td className="py-2 px-2 text-center tabular-nums text-xs">{gp || '—'}</td>
                      <td className="py-2 px-2 pr-3 text-right tabular-nums text-xs whitespace-nowrap">
                        {gp > 0
                          ? `${perGame(s, 'points').toFixed(1)} / ${perGame(s, 'totalRebounds').toFixed(1)} / ${perGame(s, 'assists').toFixed(1)}`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="text-center py-8 text-[var(--text-sec)] text-sm">No players at this position.</div>
            )}
          </div>
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
        </>
      )}
    </Modal>
  );
}
