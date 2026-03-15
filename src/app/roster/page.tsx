'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore, computeAllLeagueTeams } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import { calculateSchemeFit, schemeFitDot, schemeFitColor, OFFENSIVE_SCHEME_LABELS, DEFENSIVE_SCHEME_LABELS } from '@/lib/engine/coaching';
import { calculateDeadCap, calculateCapSavings, getCapHit, getUnamortizedBonus, materializeContractYears } from '@/types';
import type { Player, Position, ContractYear } from '@/types';
import { POSITIONS, ROSTER_LIMITS } from '@/types';
import { TeamQuickNav } from '@/components/game/TeamQuickNav';
import { LEAGUE_MINIMUM_SALARY } from '@/lib/engine/store';

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

type SortKey = 'name' | 'pos' | 'age' | 'ovr' | 'pot' | 'contract' | 'gp' | 'stat1' | 'stat2';

/** Returns the label columns for a specific position group */
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

/** Returns stat values for a player */
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

/** Get generic stat columns for the "ALL" view */
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

export default function RosterPage() {
  const router = useRouter();
  const {
    players, teams, userTeamId, season, champions,
    releasePlayer, placeOnIR, activateFromIR,
    reorderDepthChart, restructureContract,
    solicitTradingBlockProposals,
    phase, week, seasonHistory, leagueSettings,
  } = useGameStore();

  const [filterPos, setFilterPos] = useState<Position | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('pos');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'roster' | 'depth' | 'injuries'>('roster');
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [restructurePlayer, setRestructurePlayer] = useState<string | null>(null);
  const [restructureAmount, setRestructureAmount] = useState(1);
  const [restructureVoidYears, setRestructureVoidYears] = useState(0);

  // Whether we're in an offseason phase where restructuring makes sense
  const isOffseason = phase !== 'regular';

  // Current season champion team (for ring indicators)
  const currentChamp = champions?.find(c => c.season === season);
  const champTeamId = currentChamp?.teamId ?? null;

  // Whether trades are currently allowed
  const tradeDeadlineWeek = leagueSettings?.tradeDeadlineWeek ?? 12;
  const isTradeOpen = phase !== 'playoffs' && !(phase === 'regular' && week > tradeDeadlineWeek + 1);

  // Action menu state — uses fixed positioning to escape table overflow:hidden
  const [actionMenu, setActionMenu] = useState<{ id: string; x: number; y: number; deadCap: number; capSav: number } | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  // Close action menu on outside click or scroll
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setActionMenu(null);
      }
    }
    function handleScroll() { setActionMenu(null); }
    if (actionMenu) {
      document.addEventListener('mousedown', handleClick);
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [actionMenu]);


  // Drag state for depth chart
  const [dragPosition, setDragPosition] = useState<Position | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const userTeam = teams.find(t => t.id === userTeamId);
  const roster = players
    .filter(p => p.teamId === userTeamId && !p.retired);

  // Depth position for each player
  function getDepthLabel(player: Player): string {
    const dc = userTeam?.depthChart[player.position];
    if (!dc) return '';
    const idx = dc.indexOf(player.id);
    return idx >= 0 ? (DEPTH_LABELS[idx] ?? `${idx + 1}th`) : '';
  }

  function getDepthIndex(player: Player): number {
    const dc = userTeam?.depthChart[player.position];
    if (!dc) return 999;
    const idx = dc.indexOf(player.id);
    return idx >= 0 ? idx : 999;
  }

  // Sort helpers
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  }

  const sortedRoster = [...roster]
    .filter(p => filterPos === 'ALL' || p.position === filterPos)
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name': return dir * a.lastName.localeCompare(b.lastName);
        case 'pos': {
          const pi = POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position);
          if (pi !== 0) return dir * pi;
          // Within same position, sort by OVR (best first)
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

  // All-Pro stars: only show AFTER the regular season ends.
  // Stars appear during playoffs and persist through the offseason (re-signing, draft, FA).
  // They disappear when the new regular season starts (clean slate).
  const allProPlayerIds = new Set<string>();
  const offseasonPhases = ['playoffs', 'resigning', 'draft', 'freeAgency'];
  if (offseasonPhases.includes(phase)) {
    // During playoffs: compute live from current season stats
    if (phase === 'playoffs') {
      const currentAllLeague = computeAllLeagueTeams(useGameStore.getState() as never);
      for (const entry of currentAllLeague.first) allProPlayerIds.add(entry.playerId);
      for (const entry of currentAllLeague.second) allProPlayerIds.add(entry.playerId);
    } else {
      // During offseason: use last completed season's saved data
      const lastSeason = seasonHistory.length > 0 ? seasonHistory[seasonHistory.length - 1] : null;
      if (lastSeason) {
        for (const entry of (lastSeason.allLeagueFirst ?? [])) allProPlayerIds.add(entry.playerId);
        for (const entry of (lastSeason.allLeagueSecond ?? [])) allProPlayerIds.add(entry.playerId);
      }
    }
  }
  // During regular season: no stars (clean slate)

  const injuredPlayers = roster.filter(p => p.injury && p.injury.weeksLeft > 0);
  const capSpace = userTeam ? Math.round((userTeam.salaryCap - userTeam.totalPayroll) * 10) / 10 : 0;
  const deadCapTotal = (userTeam?.deadCap ?? []).reduce((sum, dc) => sum + dc.amount, 0);

  // Depth chart helpers
  function getDepthGroup(position: Position): Player[] {
    const depthOrder = userTeam?.depthChart[position];
    const posPlayers = roster.filter(p => p.position === position);
    if (depthOrder && depthOrder.length > 0) {
      const ordered: Player[] = [];
      for (const pid of depthOrder) {
        const p = posPlayers.find(pl => pl.id === pid);
        if (p) ordered.push(p);
      }
      for (const p of posPlayers) {
        if (!ordered.includes(p)) ordered.push(p);
      }
      return ordered;
    }
    return posPlayers.sort((a, b) => b.ratings.overall - a.ratings.overall);
  }

  function handleDragStart(position: Position, index: number) {
    setDragPosition(position);
    setDragIndex(index);
  }
  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }
  function handleDragEnd() {
    if (dragPosition !== null && dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const group = getDepthGroup(dragPosition);
      const ids = group.map(p => p.id);
      const [movedId] = ids.splice(dragIndex, 1);
      ids.splice(dragOverIndex, 0, movedId);
      reorderDepthChart(dragPosition, ids);
    }
    setDragPosition(null);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  const positionGroups: Array<{ label: string; positions: Position[] }> = [
    { label: 'Offense', positions: ['QB', 'RB', 'WR', 'TE', 'OL'] },
    { label: 'Defense', positions: ['DL', 'LB', 'CB', 'S'] },
    { label: 'Special Teams', positions: ['K', 'P'] },
  ];

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
    <GameShell>
      <div className="max-w-7xl mx-auto">
        {/* Header bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <TeamQuickNav currentPage="roster" />
            <h2 className="text-2xl font-black">{userTeam?.city} {userTeam?.name} Roster</h2>
            <div className="flex items-center gap-4 text-sm text-[var(--text-sec)] mt-1">
              <span>{roster.length} players</span>
              <span className={capSpace > 10 ? 'text-green-600' : capSpace > 0 ? 'text-amber-600' : 'text-red-600'}>
                ${capSpace}M cap space
              </span>
              {deadCapTotal > 0 && (
                <span className="text-red-600">${Math.round(deadCapTotal * 10) / 10}M dead cap</span>
              )}
              {injuredPlayers.length > 0 && (
                <span className="text-red-600">{injuredPlayers.length} injured</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1">
              {(['roster', 'depth', 'injuries'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 text-xs rounded font-medium transition-colors capitalize ${viewMode === mode ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'}`}
                >
                  {mode === 'injuries'
                    ? `Injuries${injuredPlayers.length > 0 ? ` (${injuredPlayers.length})` : ''}`
                    : mode === 'depth' ? 'Depth Chart' : 'Roster'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── ROSTER TABLE VIEW (BBGM-style) ── */}
        {viewMode === 'roster' && (
          <>
            {/* Roster Composition */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4">
              <div className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider mb-3">Roster Composition</div>
              <div className="grid grid-cols-11 gap-2">
                {POSITIONS.map(pos => {
                  const count = roster.filter(p => p.position === pos).length;
                  const limits = ROSTER_LIMITS[pos];
                  const isBelowMin = count < limits.min;
                  const isAtMax = count >= limits.max;
                  return (
                    <div key={pos} className="text-center">
                      <div className={`text-sm font-black ${
                        isBelowMin ? 'text-red-600' : isAtMax ? 'text-amber-600' : 'text-green-600'
                      }`}>
                        {count}
                      </div>
                      <div className="text-[10px] text-[var(--text-sec)]">{pos}</div>
                      <div className="text-[10px] text-[var(--text-sec)]">{limits.min}-{limits.max}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Position filter */}
            <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1 mb-4 flex-wrap w-fit">
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

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[700px] sticky-col">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <SortHeader k="name" className="text-left pl-3 w-48">Name</SortHeader>
                    <SortHeader k="pos" className="text-center w-12">Pos</SortHeader>
                    <SortHeader k="age" className="text-center w-10">Age</SortHeader>
                    <SortHeader k="ovr" className="text-center w-12">Ovr</SortHeader>
                    <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center w-14 cursor-help" title="Potential — a player's ceiling. Young players show as Elite/High/Average/Low until 3+ seasons played. A declining player's POT may be lower than their OVR.">Pot <span className="inline-block w-3 h-3 text-[10px] rounded-full bg-[var(--surface-2)]">?</span></th>

                    <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center w-10 cursor-help" title="Scheme Fit — how well the player fits the coaching staff's scheme.">Fit</th>
                    <SortHeader k="contract" className="text-right w-32">Contract</SortHeader>
                    <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center w-16">Role</th>
                    <SortHeader k="gp" className="text-center w-10">GP</SortHeader>
                    <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-left">
                      {filterPos !== 'ALL' ? getStatColumns(filterPos)[0] : 'Stats'}
                    </th>
                    {filterPos !== 'ALL' && getStatColumns(filterPos)[1] && (
                      <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center">
                        {getStatColumns(filterPos)[1]}
                      </th>
                    )}
                    <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-left w-28">Acquired</th>
                    <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center w-16">Mood</th>
                    <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-right pr-3 w-28">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRoster.map((p, idx) => {
                    const isStarter = getDepthIndex(p) === 0;
                    const depthLabel = getDepthLabel(p);
                    const [stat1, stat2] = filterPos !== 'ALL' ? getStatValues(p) : [getGenericStat(p), ''];
                    const deadCap = calculateDeadCap(p.contract);
                    const capSav = calculateCapSavings(p.contract);
                    // Position group separator when sorted by position
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
                            <button
                              onClick={() => setSelectedPlayerId(p.id)}
                              className="font-semibold hover:text-blue-600 transition-colors truncate"
                            >
                              {p.firstName} {p.lastName}
                              {champTeamId === userTeamId && <span className="ml-0.5 text-xs" title="Championship Ring">💍</span>}
                            </button>
                            {p.contract.contractYears?.some(y => y.proratedBonus > 0) && (
                              <span className="ml-1 text-[9px] font-bold bg-amber-100 text-amber-700 px-1 rounded" title="Contract restructured">R</span>
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
                          {(() => {
                            const lastEntry = p.ratingHistory.length > 0 ? p.ratingHistory[p.ratingHistory.length - 1] : null;
                            if (!lastEntry) return null;
                            const diff = p.ratings.overall - lastEntry.overall;
                            if (diff === 0) return null;
                            return (
                              <span className={`text-[10px] font-bold ml-0.5 ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Potential */}
                        <td className={`py-2 px-2 text-center text-xs font-medium ${potentialColor(p.potential, p.experience)}`}>
                          {potentialLabel(p.potential, p.experience)}
                        </td>

                        {/* Scheme Fit */}
                        {(() => {
                          const fit = userTeam ? calculateSchemeFit(p, userTeam) : 'neutral';
                          const isOff = ['QB', 'RB', 'WR', 'TE', 'OL'].includes(p.position);
                          const coaches = userTeam?.coaches ?? [];
                          const oc = coaches.find(c => c.role === 'OC');
                          const dc = coaches.find(c => c.role === 'DC');
                          const hc = coaches.find(c => c.role === 'HC');
                          const schemeName = isOff
                            ? OFFENSIVE_SCHEME_LABELS[(oc?.offensiveScheme ?? hc?.offensiveScheme) as keyof typeof OFFENSIVE_SCHEME_LABELS] ?? ''
                            : DEFENSIVE_SCHEME_LABELS[(dc?.defensiveScheme ?? hc?.defensiveScheme) as keyof typeof DEFENSIVE_SCHEME_LABELS] ?? '';
                          const tooltip = fit === 'great'
                            ? `Great Fit: +2 OVR in games (${schemeName})`
                            : fit === 'poor'
                            ? `Poor Fit: -1 OVR in games (${schemeName})`
                            : 'Neutral: No scheme bonus or penalty';
                          return (
                            <td className={`py-2 px-2 text-center text-xs ${schemeFitColor(fit)}`} title={tooltip}>
                              {schemeFitDot(fit)}
                            </td>
                          );
                        })()}

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

                        {/* Acquired */}
                        <td className="py-2 px-2 text-xs text-[var(--text-sec)]">
                          {p.draftYear && p.draftPick
                            ? <span>Draft <span className="font-medium text-[var(--text)]">#{p.draftPick}</span> ({p.draftYear})</span>
                            : <span>Free Agent{p.draftYear ? ` (${p.draftYear})` : ''}</span>
                          }
                        </td>

                        {/* Mood */}
                        <td className="py-2 px-2 text-center">
                          {(() => {
                            const mood = p.mood ?? 70;
                            const label = mood >= 85 ? 'Thrilled' : mood >= 75 ? 'Happy' : mood >= 60 ? 'Content' : mood >= 45 ? 'Unhappy' : 'Angry';
                            const color = mood >= 75 ? 'text-green-600 bg-green-50' : mood >= 50 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
                            return (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`}>
                                {label}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Actions */}
                        <td className="py-2 px-2 text-right pr-3 relative">
                          {/* Confirm Cut state */}
                          {confirmRelease === p.id ? (
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => { releasePlayer(p.id); setConfirmRelease(null); }}
                              >
                                {deadCap > 0
                                  ? `Cut (save $${Math.max(0, capSav)}M, $${deadCap}M dead)`
                                  : `Cut (save $${p.contract.salary}M)`}
                              </Button>
                              <button onClick={() => setConfirmRelease(null)} className="text-xs text-[var(--text-sec)] hover:text-[var(--text)] px-1">✕</button>
                            </div>
                          ) : (
                            /* Action dropdown trigger */
                            <button
                              className="px-3 py-1.5 text-xs rounded font-medium hover:bg-[var(--surface-2)] text-[var(--text-sec)] transition-colors"
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActionMenu(actionMenu?.id === p.id ? null : { id: p.id, x: rect.right, y: rect.top, deadCap, capSav });
                              }}
                            >
                              Actions ▾
                            </button>
                          )}
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
          </>
        )}

        {/* ── DEPTH CHART VIEW ── */}
        {viewMode === 'depth' && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-sec)]">
              Drag players to reorder the depth chart. ★ = All-League selection.
            </p>
            {positionGroups.map(group => (
              <Card key={group.label}>
                <CardHeader><CardTitle>{group.label}</CardTitle></CardHeader>
                <div className="space-y-0">
                  {group.positions.map(pos => {
                    const depthGroup = getDepthGroup(pos);
                    return (
                      <div key={pos} className="border-t border-[var(--border)] first:border-t-0">
                        <div className="flex items-center gap-2 py-2 px-2">
                          <div className="w-8 text-xs font-bold text-[var(--text-sec)]">{pos}</div>
                          <div className="flex-1 grid grid-cols-4 gap-2">
                            {Array.from({ length: Math.max(4, depthGroup.length) }).map((_, idx) => {
                              const player = depthGroup[idx];
                              if (!player) {
                                return <div key={idx} className="text-xs text-[var(--text-sec)] py-1 px-2">—</div>;
                              }
                              const isAllPro = allProPlayerIds.has(player.id);
                              const isDragging = dragPosition === pos && dragIndex === idx;
                              const isDragOver = dragPosition === pos && dragOverIndex === idx;
                              return (
                                <div
                                  key={player.id}
                                  draggable
                                  onDragStart={() => handleDragStart(pos, idx)}
                                  onDragOver={(e) => handleDragOver(e, idx)}
                                  onDragEnd={handleDragEnd}
                                  className={`bg-[var(--surface-2)] rounded-lg p-2 cursor-grab active:cursor-grabbing transition-all ${
                                    isDragging ? 'opacity-40 scale-95' : ''
                                  } ${isDragOver ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[var(--bg)]' : ''}`}
                                >
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-[10px] text-[var(--text-sec)]">
                                      {DEPTH_LABELS[idx] ?? `${idx + 1}th`}
                                    </span>
                                    <span className={`text-xs font-bold ${ratingColor(player.ratings.overall)}`}>
                                      {player.ratings.overall}
                                    </span>
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedPlayerId(player.id); }}
                                    className="text-xs font-semibold truncate block hover:text-blue-600 transition-colors"
                                  >
                                    {isAllPro && <span className="text-amber-600 mr-0.5">★</span>}
                                    {player.firstName[0]}. {player.lastName}
                                  </button>
                                  <div className="text-[10px] text-[var(--text-sec)] mt-0.5 truncate">
                                    {getGenericStat(player)}
                                  </div>
                                  {player.injury && (
                                    <div className="text-[10px] text-red-600">{player.injury.type} ({player.injury.weeksLeft}w)</div>
                                  )}
                                  {player.onIR && <div className="text-[10px] text-amber-600">IR</div>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── INJURIES VIEW ── */}
        {viewMode === 'injuries' && (
          <div className="space-y-4">
            {injuredPlayers.length === 0 ? (
              <Card>
                <div className="text-center py-12 text-[var(--text-sec)]">
                  <div className="text-4xl mb-3">💪</div>
                  <p>No players currently injured. Keep it up!</p>
                </div>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Injury Report ({injuredPlayers.length})</CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[500px] sticky-col">
                  <thead>
                    <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                      <th className="text-left pb-3 pl-2">Player</th>
                      <th className="text-center pb-3">Pos</th>
                      <th className="text-center pb-3">OVR</th>
                      <th className="text-center pb-3">Injury</th>
                      <th className="text-center pb-3">Status</th>
                      <th className="text-right pb-3 pr-2">{phase === 'regular' ? 'IR Action' : ''}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {injuredPlayers.map(p => (
                      <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                        <td className="py-2.5 pl-2">
                          <button onClick={() => setSelectedPlayerId(p.id)} className="font-semibold hover:text-blue-600 transition-colors">
                            {allProPlayerIds.has(p.id) && <span className="text-amber-600 mr-1">★</span>}
                            {p.firstName} {p.lastName}
                          </button>
                        </td>
                        <td className="py-2.5 text-center text-xs font-bold text-[var(--text-sec)]">{p.position}</td>
                        <td className={`py-2.5 text-center font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</td>
                        <td className="py-2.5 text-center">{p.injury?.type}</td>
                        <td className="py-2.5 text-center">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            p.onIR ? 'bg-amber-50 text-amber-600' :
                            p.injury && p.injury.weeksLeft >= 4 ? 'bg-red-50 text-red-600' :
                            p.injury && p.injury.weeksLeft >= 2 ? 'bg-amber-50 text-amber-600' :
                            'bg-green-50 text-green-600'
                          }`}>
                            {p.onIR ? 'IR' : `${p.injury?.weeksLeft}w`}
                          </span>
                        </td>
                        <td className="py-2.5 text-right pr-2">
                          {p.onIR ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => activateFromIR(p.id)}
                              disabled={!!(p.injury && p.injury.weeksLeft > 2)}
                            >
                              Activate
                            </Button>
                          ) : p.injury && p.injury.weeksLeft >= 4 ? (
                            <Button size="sm" variant="secondary" onClick={() => placeOnIR(p.id)}>
                              Place on IR
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />

      {/* Fixed-position action menu (rendered outside table to avoid overflow:hidden clipping) */}
      {actionMenu && (() => {
        const p = roster.find(pl => pl.id === actionMenu.id);
        if (!p) return null;
        return (
          <div
            ref={actionMenuRef}
            className="fixed z-[9999] rounded-lg py-1.5 min-w-[220px]"
            style={{
              top: actionMenu.y - 8,
              left: actionMenu.x - 220,
              transform: 'translateY(-100%)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)',
            }}
          >
            <button
              onClick={() => { setConfirmRelease(p.id); setActionMenu(null); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-black/5 transition-colors text-red-600 font-medium"
            >
              Cut Player
              <span className="block text-[11px] text-[var(--text-sec)] font-normal mt-0.5">
                Save ${Math.max(0, actionMenu.capSav)}M{actionMenu.deadCap > 0 ? ` · $${actionMenu.deadCap}M dead cap` : ''}
              </span>
            </button>
            {p.contract.yearsLeft >= 2 && p.lastRestructuredSeason !== season && (
              <>
                <div className="border-t border-[var(--border)] mx-3 my-0.5" />
                <button
                  onClick={() => {
                    const baseSalary = p.contract.contractYears ? p.contract.contractYears[0].baseSalary : p.contract.salary;
                    setRestructureAmount(Math.min(Math.floor(baseSalary / 2), Math.max(1, Math.floor(baseSalary - LEAGUE_MINIMUM_SALARY))));
                    setRestructureVoidYears(0);
                    setRestructurePlayer(p.id);
                    setActionMenu(null);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-black/5 transition-colors text-amber-600 font-medium"
                >
                  Restructure Contract
                  <span className="block text-[11px] text-[var(--text-sec)] font-normal mt-0.5">
                    Convert salary to signing bonus
                  </span>
                </button>
              </>
            )}
            {isTradeOpen && (
              <>
                <div className="border-t border-[var(--border)] mx-3 my-0.5" />
                <button
                  onClick={() => {
                    setActionMenu(null);
                    router.push(`/trades?block=${p.id}`);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-black/5 transition-colors text-blue-600 font-medium"
                >
                  Add to Trade Block
                  <span className="block text-[11px] text-[var(--text-sec)] font-normal mt-0.5">
                    Solicit offers from other teams
                  </span>
                </button>
              </>
            )}
          </div>
        );
      })()}
      {/* Restructure Contract Modal */}
      {restructurePlayer && (() => {
        const p = roster.find(pl => pl.id === restructurePlayer);
        if (!p) return null;

        const currentYears: ContractYear[] = p.contract.contractYears
          ? p.contract.contractYears.map(y => ({ ...y }))
          : materializeContractYears(p.contract);

        const currentBase = currentYears[0].baseSalary;
        const leagueMin = leagueSettings?.leagueMinSalary ?? LEAGUE_MINIMUM_SALARY;
        const maxConversion = Math.max(0, Math.floor((currentBase - leagueMin) * 10) / 10);
        const existingVoidYears = p.contract.voidYears ?? 0;
        const maxVoidYearsAllowed = 3 - existingVoidYears;

        // Preview calculation
        const previewYears = currentYears.map(y => ({ ...y }));
        // Add void years
        for (let i = 0; i < restructureVoidYears; i++) {
          previewYears.push({ baseSalary: 0, proratedBonus: 0, isVoidYear: true });
        }
        const totalYearsForProration = previewYears.length;
        const clampedAmount = Math.min(restructureAmount, maxConversion);
        const proratedPerYear = totalYearsForProration > 0 ? Math.round((clampedAmount / totalYearsForProration) * 100) / 100 : 0;

        // Apply preview
        const afterYears = previewYears.map((y, i) => {
          const newBase = i === 0 ? y.baseSalary - clampedAmount : y.baseSalary;
          return {
            ...y,
            baseSalary: newBase,
            proratedBonus: y.proratedBonus + proratedPerYear,
          };
        });

        const beforeCapHit = Math.round((currentYears[0].baseSalary + currentYears[0].proratedBonus) * 100) / 100;
        const afterCapHit = Math.round((afterYears[0].baseSalary + afterYears[0].proratedBonus) * 100) / 100;
        const capSaved = Math.round((beforeCapHit - afterCapHit) * 100) / 100;
        const totalUnamortized = afterYears.reduce((sum, y) => sum + y.proratedBonus, 0);

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setRestructurePlayer(null)}>
            <div className="bg-[var(--surface)] rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-[var(--border)]">
                <h2 className="text-lg font-bold">Restructure Contract</h2>
                <p className="text-sm text-[var(--text-sec)] mt-0.5">{p.firstName} {p.lastName} · {p.position} · {p.ratings.overall} OVR</p>
              </div>

              <div className="p-5 space-y-4">
                {/* Current info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-[var(--surface-2)] rounded-lg p-3">
                    <div className="text-[var(--text-sec)] text-xs">Current Year Base</div>
                    <div className="font-bold text-lg">${currentBase.toFixed(1)}M</div>
                  </div>
                  <div className="bg-[var(--surface-2)] rounded-lg p-3">
                    <div className="text-[var(--text-sec)] text-xs">Years Remaining</div>
                    <div className="font-bold text-lg">{p.contract.yearsLeft}</div>
                  </div>
                </div>

                {/* Conversion amount */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Amount to Convert to Signing Bonus</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={Math.max(1, maxConversion)}
                      step={0.5}
                      value={clampedAmount}
                      onChange={e => setRestructureAmount(Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-sm font-bold w-16 text-right">${clampedAmount.toFixed(1)}M</span>
                  </div>
                  <div className="text-xs text-[var(--text-sec)] mt-0.5">Max: ${maxConversion.toFixed(1)}M (base - league minimum)</div>
                </div>

                {/* Void years */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Add Void Years</label>
                  <select
                    value={restructureVoidYears}
                    onChange={e => setRestructureVoidYears(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm"
                  >
                    <option value={0}>0 — No void years</option>
                    {maxVoidYearsAllowed >= 1 && <option value={1}>1 void year</option>}
                    {maxVoidYearsAllowed >= 2 && <option value={2}>2 void years</option>}
                    {maxVoidYearsAllowed >= 3 && <option value={3}>3 void years</option>}
                  </select>
                  <div className="text-xs text-[var(--text-sec)] mt-0.5">Spreads bonus across more years but creates future dead money</div>
                </div>

                {/* Preview table */}
                <div>
                  <div className="text-sm font-medium mb-1.5">Preview</div>
                  <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[var(--surface-2)] text-[var(--text-sec)] text-xs">
                          <th className="text-left px-3 py-1.5">Year</th>
                          <th className="text-right px-3 py-1.5">Before</th>
                          <th className="text-right px-3 py-1.5">After</th>
                          <th className="text-right px-3 py-1.5">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {afterYears.map((yr, i) => {
                          const beforeHit = i < currentYears.length
                            ? Math.round((currentYears[i].baseSalary + currentYears[i].proratedBonus) * 10) / 10
                            : 0;
                          const afterHitVal = Math.round((yr.baseSalary + yr.proratedBonus) * 10) / 10;
                          const delta = Math.round((afterHitVal - beforeHit) * 10) / 10;
                          const isCurrentYear = i === 0;
                          return (
                            <tr
                              key={i}
                              className={`border-t border-[var(--border)] ${
                                yr.isVoidYear ? 'bg-gray-50 text-gray-400' :
                                isCurrentYear ? 'bg-green-50' : delta > 0 ? 'bg-amber-50/50' : ''
                              }`}
                            >
                              <td className="px-3 py-1.5 font-medium">
                                {yr.isVoidYear ? `Void ${i + 1}` : `Year ${i + 1}`}
                              </td>
                              <td className="px-3 py-1.5 text-right">{beforeHit > 0 ? `$${beforeHit}M` : '—'}</td>
                              <td className="px-3 py-1.5 text-right font-medium">${afterHitVal.toFixed(1)}M</td>
                              <td className={`px-3 py-1.5 text-right font-medium ${
                                delta < 0 ? 'text-green-600' : delta > 0 ? 'text-red-500' : ''
                              }`}>
                                {delta !== 0 ? `${delta > 0 ? '+' : ''}$${delta.toFixed(1)}M` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <div className="font-medium text-green-800">Saves ${capSaved.toFixed(1)}M this year</div>
                </div>

                {totalUnamortized > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <div className="font-medium text-amber-800">
                      Dead money if cut after restructure: ${Math.round(totalUnamortized * 10) / 10}M
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-5 border-t border-[var(--border)] flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setRestructurePlayer(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={clampedAmount < 1 || maxConversion < 1}
                  onClick={() => {
                    restructureContract(p.id, clampedAmount, restructureVoidYears);
                    setRestructurePlayer(null);
                  }}
                >
                  Confirm Restructure
                </Button>
              </div>
            </div>
          </div>
        );
      })()}
    </GameShell>
  );
}
