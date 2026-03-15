'use client';

import { useState } from 'react';
import { useGameStore, computeAllLeagueTeams } from '@/lib/engine/store';
import { Modal } from '@/components/ui/Modal';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import { POSITIONS } from '@/types';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { Player, Position } from '@/types';

interface TeamRosterModalProps {
  teamId: string | null;
  onClose: () => void;
  onPlayerClick?: (playerId: string) => void;
}

function ratingColor(val: number): string {
  if (val >= 85) return 'text-green-600';
  if (val >= 70) return 'text-blue-600';
  if (val >= 55) return 'text-amber-600';
  return 'text-red-600';
}

function ratingBg(val: number): string {
  if (val >= 85) return 'bg-green-100';
  if (val >= 70) return 'bg-blue-100';
  if (val >= 55) return 'bg-amber-50';
  return 'bg-red-50';
}

const DEPTH_LABELS = ['Starter', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

function getGenericStat(p: Player): string {
  const s = p.stats;
  if (s.gamesPlayed === 0) return '—';
  switch (p.position) {
    case 'QB': return `${s.passCompletions}/${s.passAttempts} · ${s.passYards} yd · ${s.passTDs} TD · ${s.interceptions} INT`;
    case 'RB': return `${s.rushAttempts} att · ${s.rushYards} yd · ${s.rushTDs} TD`;
    case 'WR':
    case 'TE': return `${s.receptions} rec · ${s.receivingYards} yd · ${s.receivingTDs} TD`;
    case 'DL':
    case 'LB': return `${s.tackles} tkl · ${s.tacklesForLoss ?? 0} TFL · ${s.sacks} sck`;
    case 'CB':
    case 'S': return `${s.tackles} tkl · ${s.passDeflections ?? 0} PD · ${s.defensiveINTs} INT`;
    case 'K': return `${s.fieldGoalsMade}/${s.fieldGoalAttempts} FG${s.fieldGoalAttempts > 0 ? ` (${Math.round(s.fieldGoalsMade / s.fieldGoalAttempts * 100)}%)` : ''}`;
    case 'OL': return `${s.gamesPlayed} GP · ${s.sacksAllowed ?? 0} SA · ${(s.passBlocks ?? 0) > 0 ? ((s.sacksAllowed ?? 0) / s.passBlocks * 100).toFixed(1) : '0.0'}%`;
    case 'P': return `${s.gamesPlayed} GP`;
    default: return '—';
  }
}

function getStatColumns(pos: Position): [string, string] {
  switch (pos) {
    case 'QB': return ['CMP/ATT · Yds', 'TD / INT'];
    case 'RB': return ['ATT · Yds', 'TD / FUM'];
    case 'WR': return ['REC/TGT · Yds', 'TD'];
    case 'TE': return ['REC/TGT · Yds', 'TD'];
    case 'OL': return ['SA / Blks', 'SA%'];
    case 'DL': return ['TKL / TFL', 'SCK'];
    case 'LB': return ['TKL / TFL', 'SCK / FF'];
    case 'CB': return ['TKL / PD', 'INT'];
    case 'S': return ['TKL / PD', 'INT'];
    case 'K': return ['FG', 'XP'];
    case 'P': return ['GP', ''];
    default: return ['', ''];
  }
}

function getStatValues(p: Player): [string, string] {
  const s = p.stats;
  switch (p.position) {
    case 'QB': return [`${s.passCompletions}/${s.passAttempts} · ${s.passYards}`, `${s.passTDs} / ${s.interceptions}`];
    case 'RB': return [`${s.rushAttempts} · ${s.rushYards}`, `${s.rushTDs} / ${s.fumbles}`];
    case 'WR': return [`${s.receptions}/${s.targets} · ${s.receivingYards}`, String(s.receivingTDs)];
    case 'TE': return [`${s.receptions}/${s.targets} · ${s.receivingYards}`, String(s.receivingTDs)];
    case 'OL': return [`${s.sacksAllowed ?? 0} / ${s.passBlocks ?? 0}`, `${(s.passBlocks ?? 0) > 0 ? ((s.sacksAllowed ?? 0) / s.passBlocks * 100).toFixed(1) : '0.0'}%`];
    case 'DL': return [`${s.tackles} / ${s.tacklesForLoss ?? 0}`, String(s.sacks)];
    case 'LB': return [`${s.tackles} / ${s.tacklesForLoss ?? 0}`, `${s.sacks} / ${s.forcedFumbles}`];
    case 'CB': return [`${s.tackles} / ${s.passDeflections ?? 0}`, String(s.defensiveINTs)];
    case 'S': return [`${s.tackles} / ${s.passDeflections ?? 0}`, String(s.defensiveINTs)];
    case 'K': return [`${s.fieldGoalsMade}/${s.fieldGoalAttempts}${s.fieldGoalAttempts > 0 ? ` (${Math.round(s.fieldGoalsMade / s.fieldGoalAttempts * 100)}%)` : ''}`, `${s.extraPointsMade}/${s.extraPointAttempts}`];
    case 'P': return [String(s.gamesPlayed), ''];
    default: return ['', ''];
  }
}

type SortKey = 'name' | 'pos' | 'age' | 'ovr' | 'pot' | 'contract' | 'gp';

export function TeamRosterModal({ teamId, onClose, onPlayerClick }: TeamRosterModalProps) {
  const { teams, players, season, seasonHistory, champions, phase } = useGameStore();
  const [filterPos, setFilterPos] = useState<Position | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('pos');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const currentChamp = champions?.find(c => c.season === season);

  if (!teamId) return null;

  const team = teams.find(t => t.id === teamId);
  if (!team) return null;

  const isChampTeam = currentChamp?.teamId === teamId;
  const teamRoster = players.filter(p => p.teamId === teamId && !p.retired);

  const avgOvr = teamRoster.length > 0
    ? Math.round(teamRoster.reduce((s, p) => s + p.ratings.overall, 0) / teamRoster.length)
    : 0;

  const capSpace = Math.round((team.salaryCap - team.totalPayroll) * 10) / 10;

  // All-Pro stars: only after regular season ends, persist through offseason, gone at new season
  const allProPlayerIds = new Set<string>();
  const offseasonPhases = ['playoffs', 'resigning', 'draft', 'freeAgency'];
  if (offseasonPhases.includes(phase)) {
    if (phase === 'playoffs') {
      const currentAllLeague = computeAllLeagueTeams(useGameStore.getState() as never);
      for (const entry of currentAllLeague.first) allProPlayerIds.add(entry.playerId);
      for (const entry of currentAllLeague.second) allProPlayerIds.add(entry.playerId);
    } else {
      const lastSeason = seasonHistory.length > 0 ? seasonHistory[seasonHistory.length - 1] : null;
      if (lastSeason) {
        for (const entry of (lastSeason.allLeagueFirst ?? [])) allProPlayerIds.add(entry.playerId);
        for (const entry of (lastSeason.allLeagueSecond ?? [])) allProPlayerIds.add(entry.playerId);
      }
    }
  }

  // Depth position for each player
  function getDepthLabel(player: Player): string {
    const dc = team!.depthChart[player.position];
    if (!dc) return '';
    const idx = dc.indexOf(player.id);
    return idx >= 0 ? (DEPTH_LABELS[idx] ?? `${idx + 1}th`) : '';
  }

  function getDepthIndex(player: Player): number {
    const dc = team!.depthChart[player.position];
    if (!dc) return 999;
    const idx = dc.indexOf(player.id);
    return idx >= 0 ? idx : 999;
  }

  // Sort
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  }

  const sortedRoster = [...teamRoster]
    .filter(p => filterPos === 'ALL' || p.position === filterPos)
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name': return dir * a.lastName.localeCompare(b.lastName);
        case 'pos': {
          const pi = POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position);
          if (pi !== 0) return dir * pi;
          return b.ratings.overall - a.ratings.overall;
        }
        case 'age': return dir * (a.age - b.age);
        case 'ovr': return dir * (a.ratings.overall - b.ratings.overall);
        case 'pot': return dir * (a.potential - b.potential);
        case 'contract': return dir * (a.contract.salary - b.contract.salary);
        case 'gp': return dir * (a.stats.gamesPlayed - b.stats.gamesPlayed);
        default: return dir * (a.ratings.overall - b.ratings.overall);
      }
    });

  const SortHeader = ({ k, children, className = '' }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th
      className={`py-2 px-2 text-xs font-bold uppercase tracking-wider cursor-pointer select-none hover:text-[var(--text)] transition-colors ${sortKey === k ? 'text-blue-600' : 'text-[var(--text-sec)]'} ${className}`}
      onClick={() => handleSort(k)}
    >
      {children}
      {sortKey === k && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );

  return (
    <Modal isOpen={true} onClose={onClose} maxWidth="xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)] sticky top-0 bg-[var(--surface)] z-10 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} logoUrl={team.logoUrl} size="lg" />
          <div>
            <h3 className="text-lg font-black">{team.city} {team.name}</h3>
            <div className="flex items-center gap-3 text-xs text-[var(--text-sec)]">
              <span>{team.record.wins}-{team.record.losses}</span>
              <span>OVR {avgOvr}</span>
              <span>{teamRoster.length} players</span>
              <span className={capSpace > 10 ? 'text-green-600' : capSpace > 0 ? 'text-amber-600' : 'text-red-600'}>
                ${capSpace}M cap space
              </span>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-[var(--text-sec)] hover:text-[var(--text)] text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)]">✕</button>
      </div>

      <div className="p-4">
        {/* Position filter */}
        <div className="flex gap-1 bg-[var(--surface-2)] rounded-lg p-1 mb-4 flex-wrap w-fit">
          <button
            onClick={() => setFilterPos('ALL')}
            className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${filterPos === 'ALL' ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'}`}
          >
            ALL
          </button>
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => setFilterPos(pos)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${filterPos === pos ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'}`}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Roster table */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <SortHeader k="name" className="text-left pl-3 w-44">Name</SortHeader>
                <SortHeader k="pos" className="text-center w-12">Pos</SortHeader>
                <SortHeader k="age" className="text-center w-10">Age</SortHeader>
                <SortHeader k="ovr" className="text-center w-12">Ovr</SortHeader>
                <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center w-14">Pot</th>
                <SortHeader k="contract" className="text-right w-28">Contract</SortHeader>
                <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center w-14">Role</th>
                <SortHeader k="gp" className="text-center w-10">GP</SortHeader>
                <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-left">
                  {filterPos !== 'ALL' ? getStatColumns(filterPos)[0] : 'Stats'}
                </th>
                {filterPos !== 'ALL' && getStatColumns(filterPos)[1] && (
                  <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center">
                    {getStatColumns(filterPos)[1]}
                  </th>
                )}
                <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center w-10">Mood</th>
              </tr>
            </thead>
            <tbody>
              {sortedRoster.map((p, idx) => {
                const isStarter = getDepthIndex(p) === 0;
                const depthLabel = getDepthLabel(p);
                const [stat1, stat2] = filterPos !== 'ALL' ? getStatValues(p) : [getGenericStat(p), ''];
                const prevPlayer = idx > 0 ? sortedRoster[idx - 1] : null;
                const showPosSeparator = sortKey === 'pos' && filterPos === 'ALL' && prevPlayer && prevPlayer.position !== p.position;

                return (
                  <tr
                    key={p.id}
                    className={`transition-colors hover:bg-[var(--surface-2)] ${
                      isStarter ? '' : 'opacity-80'
                    } ${showPosSeparator ? 'border-t-2 border-[var(--accent)]/30' : 'border-t border-[var(--border)]'}`}
                  >
                    {/* Name */}
                    <td className="py-2 px-2 pl-3">
                      <div className="flex items-center gap-1.5">
                        {allProPlayerIds.has(p.id) && <span className="text-amber-600 text-xs">★</span>}
                        {onPlayerClick ? (
                          <button
                            onClick={() => { onClose(); onPlayerClick(p.id); }}
                            className="font-semibold hover:text-blue-600 transition-colors truncate"
                          >
                            {p.firstName} {p.lastName}
                            {isChampTeam && <span className="ml-0.5 text-xs" title="Championship Ring">💍</span>}
                          </button>
                        ) : (
                          <span className="font-semibold truncate">
                            {p.firstName} {p.lastName}
                            {isChampTeam && <span className="ml-0.5 text-xs" title="Championship Ring">💍</span>}
                          </span>
                        )}
                      </div>
                      {p.injury && (
                        <span className="text-[10px] text-red-600 block">
                          {p.injury.type} ({p.injury.weeksLeft}w)
                        </span>
                      )}
                    </td>

                    {/* Position */}
                    <td className="py-2 px-2 text-center">
                      <span className="text-xs font-bold text-[var(--text-sec)]">{p.position}</span>
                    </td>

                    {/* Age */}
                    <td className="py-2 px-2 text-center tabular-nums">{p.age}</td>

                    {/* OVR */}
                    <td className="py-2 px-2 text-center">
                      <span className={`font-black text-sm ${ratingColor(p.ratings.overall)} ${ratingBg(p.ratings.overall)} px-1.5 py-0.5 rounded`}>
                        {p.ratings.overall}
                      </span>
                    </td>

                    {/* Potential */}
                    <td className={`py-2 px-2 text-center text-xs font-medium ${potentialColor(p.potential, p.experience)}`}>
                      {potentialLabel(p.potential, p.experience)}
                    </td>

                    {/* Contract */}
                    <td className="py-2 px-2 text-right font-mono text-xs tabular-nums">
                      <span className="font-semibold">${p.contract.salary}M</span>
                      <span className={`ml-1 ${p.contract.yearsLeft <= 1 ? 'font-bold text-amber-600' : 'text-[var(--text-sec)]'}`}>
                        {p.contract.yearsLeft <= 1 ? 'expiring ⚠' : `${p.contract.yearsLeft}yr left`}
                      </span>
                    </td>

                    {/* Depth role */}
                    <td className="py-2 px-2 text-center">
                      <span className={`text-[10px] font-bold uppercase ${
                        isStarter ? 'text-green-600' : 'text-[var(--text-sec)]'
                      }`}>
                        {depthLabel}
                      </span>
                    </td>

                    {/* GP */}
                    <td className="py-2 px-2 text-center tabular-nums text-xs">
                      {p.stats.gamesPlayed}
                    </td>

                    {/* Stat 1 */}
                    <td className="py-2 px-2 text-left font-mono text-xs tabular-nums">
                      {stat1}
                    </td>

                    {/* Stat 2 (only in position-filtered view) */}
                    {filterPos !== 'ALL' && getStatColumns(filterPos)[1] && (
                      <td className="py-2 px-2 text-center font-mono text-xs tabular-nums">
                        {stat2}
                      </td>
                    )}

                    {/* Mood */}
                    <td className="py-2 px-2 text-center">
                      <span className={`text-xs ${
                        (p.mood ?? 70) >= 75 ? 'text-green-600' :
                        (p.mood ?? 70) >= 50 ? 'text-amber-600' :
                        'text-red-600'
                      }`}>
                        {(p.mood ?? 70) >= 75 ? '😊' : (p.mood ?? 70) >= 50 ? '😐' : '😠'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {sortedRoster.length === 0 && (
            <div className="text-center py-8 text-[var(--text-sec)] text-sm">
              No players at this position.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
