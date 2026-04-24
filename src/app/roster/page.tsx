'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore, computeAllLeagueTeams } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import { calculateSchemeFit, schemeFitDot, schemeFitColor, OFFENSIVE_SCHEME_LABELS, DEFENSIVE_SCHEME_LABELS } from '@/lib/engine/coaching';
import { calculateDeadCap, calculateCapSavings, getCapHit, getUnamortizedBonus, materializeContractYears } from '@/types';
import { getSubPosition, deriveSubPosition } from '@/types';
import type { Player, Position, SubPosition, ContractYear } from '@/types';
import { POSITIONS, ROSTER_LIMITS, PRACTICE_SQUAD_LIMIT, isPracticeSquadEligible } from '@/types';
import { TeamQuickNav } from '@/components/game/TeamQuickNav';
import { PositionLink } from '@/components/ui/PositionLink';
import { LEAGUE_MINIMUM_SALARY, estimateSalary, capInflationFactor } from '@/lib/engine/store';

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

/** Get mood explanation for a player */
function getMoodReason(p: Player, team: { record: { wins: number; losses: number; streak: number }; salaryCap: number } | undefined, depthIdx: number): string {
  const reasons: string[] = [];
  const mood = p.mood ?? 70;

  if (team) {
    const gp = team.record.wins + team.record.losses;
    const wp = gp > 0 ? team.record.wins / gp : 0.5;
    if (wp >= 0.6) reasons.push('Team is winning');
    else if (wp <= 0.35) reasons.push('Frustrated with losing record');
    if (team.record.streak >= 3) reasons.push(`${team.record.streak}-game win streak`);
    else if (team.record.streak <= -3) reasons.push(`${Math.abs(team.record.streak)}-game losing streak`);
  }

  if (depthIdx === 0) reasons.push('Starting role');
  else if (depthIdx <= 1) reasons.push('Getting playing time');
  else if (depthIdx > 2) reasons.push('Wants more playing time');

  // Contract satisfaction
  const marketEst = p.ratings.overall * 0.3; // rough market estimate
  if (p.contract.salary < marketEst * 0.6) reasons.push('Underpaid for his talent');
  else if (p.contract.salary >= marketEst * 1.2) reasons.push('Happy with his contract');

  if (p.contract.yearsLeft <= 1 && p.ratings.overall >= 70) reasons.push('Wants a new deal');
  if (p.holdout) reasons.push('Holding out for a new contract');
  if (p.injury && p.injury.weeksLeft > 0) reasons.push('Dealing with injury');

  if (reasons.length === 0) {
    if (mood >= 75) reasons.push('No complaints');
    else if (mood >= 50) reasons.push('Nothing specific');
    else reasons.push('Generally unhappy with situation');
  }

  return reasons.join(' · ');
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
    case 'P': return `${s.puntAttempts ?? 0} punts · ${s.puntYards ?? 0} yds${(s.puntAttempts ?? 0) > 0 ? ` · ${(Math.round((s.puntYards ?? 0) / (s.puntAttempts ?? 1) * 10) / 10)} avg` : ''}`;
    default: return '—';
  }
}

export default function RosterPage() {
  const router = useRouter();
  const {
    players, teams, userTeamId, season, champions,
    releasePlayer, placeOnIR, activateFromIR,
    togglePlayingThroughInjury,
    setBaseFormation,
    reorderDepthChart, restructureContract, extendPlayer,
    solicitTradingBlockProposals, createPlayer,
    autoCutToRosterLimit,
    demoteToPracticeSquad, promoteFromPracticeSquad,
    phase, week, seasonHistory, leagueSettings, resigningPlayers,
  } = useGameStore();
  const godMode = leagueSettings?.godMode ?? false;
  const [showCreatePlayer, setShowCreatePlayer] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ firstName: '', lastName: '', position: 'QB' as Position, age: 22, overall: 65, potential: 75 });

  const [filterPos, setFilterPos] = useState<Position | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('pos');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'roster' | 'depth' | 'injuries' | 'practice'>('roster');
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [restructurePlayer, setRestructurePlayer] = useState<string | null>(null);
  const [restructureAmount, setRestructureAmount] = useState(1);
  const [restructureVoidYears, setRestructureVoidYears] = useState(0);
  const [extendPlayerId, setExtendPlayer] = useState<string | null>(null);
  const [extendSalary, setExtendSalary] = useState(10);
  const [extendYears, setExtendYears] = useState(3);
  const [viewingTeamId, setViewingTeamId] = useState<string | null>(null);

  // Sort state for the Practice Squad view. Separate from the main roster
  // sort so navigating between tabs keeps each view's sort intact.
  type PsSortKey = 'name' | 'pos' | 'ovr' | 'age' | 'yrs' | 'salary';
  const [psSortKey, setPsSortKey] = useState<PsSortKey>('ovr');
  const [psSortDir, setPsSortDir] = useState<'asc' | 'desc'>('desc');
  const handlePsSort = (key: PsSortKey) => {
    if (psSortKey === key) {
      setPsSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setPsSortKey(key);
      // Numeric columns default to desc (show best first); text defaults to asc.
      setPsSortDir(key === 'name' || key === 'pos' ? 'asc' : 'desc');
    }
  };

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

  const activeTeamId = viewingTeamId ?? userTeamId;
  const isViewingOwnTeam = activeTeamId === userTeamId;
  const userTeam = teams.find(t => t.id === userTeamId);
  const viewingTeam = teams.find(t => t.id === activeTeamId);
  // During re-signing phase, hide players pending re-signing (expiring contracts not yet re-signed)
  // so the user can evaluate the roster without them
  const pendingResignIds = phase === 'resigning' && isViewingOwnTeam
    ? new Set((resigningPlayers ?? []).map(r => r.playerId))
    : new Set<string>();
  // `roster` is the active 53 — PS players are explicitly excluded so they
  // don't leak into depth charts, composition counts, or cap calculations.
  const activePsIds = new Set(viewingTeam?.practiceSquad ?? []);
  const roster = players
    .filter(p => p.teamId === activeTeamId && !p.retired && !pendingResignIds.has(p.id) && !activePsIds.has(p.id));

  // Depth position for each player
  function getDepthLabel(player: Player): string {
    const dc = viewingTeam?.depthChart[player.position];
    if (!dc) return '';
    const idx = dc.indexOf(player.id);
    return idx >= 0 ? (DEPTH_LABELS[idx] ?? `${idx + 1}th`) : '';
  }

  function getDepthIndex(player: Player): number {
    const dc = viewingTeam?.depthChart[player.position];
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

  // All-Pro stars: show AFTER the regular season ends through the entire offseason.
  // Compute live from current stats (they persist until startNewSeason clears them).
  // Disappear when the new regular season starts (clean slate).
  const allProPlayerIds = new Set<string>();
  const offseasonPhases = ['playoffs', 'resigning', 'draft', 'freeAgency'];
  if (offseasonPhases.includes(phase)) {
    const currentAllLeague = computeAllLeagueTeams(useGameStore.getState() as never);
    for (const entry of currentAllLeague.first) allProPlayerIds.add(entry.playerId);
    for (const entry of currentAllLeague.second) allProPlayerIds.add(entry.playerId);
  }

  // Include both active-injured players AND anyone parked on IR (who lives
  // on team.injuredReserve, outside the active `roster` array now). The
  // injuries view surfaces both so the user can manage activations.
  const irPlayers: Player[] = (viewingTeam?.injuredReserve ?? [])
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => !!p);
  const injuredPlayers = [
    ...roster.filter(p => p.injury && p.injury.weeksLeft > 0),
    ...irPlayers.filter(p => !roster.includes(p)),
  ];
  const capSpace = viewingTeam ? Math.round((viewingTeam.salaryCap - viewingTeam.totalPayroll) * 10) / 10 : 0;
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
      // OL: enforce line order (LT → LG → C → RG → RT) for the first 5
      // slots so the depth chart reads left-to-right like an actual O-line.
      // Backups beyond slot 5 keep the user's manual ordering.
      if (position === 'OL') {
        const slotOrder: Array<'LT' | 'LG' | 'C' | 'RG' | 'RT'> = ['LT', 'LG', 'C', 'RG', 'RT'];
        const starters: Player[] = [];
        for (const slot of slotOrder) {
          const p = ordered.find(pl => pl.olSlot === slot);
          if (p) starters.push(p);
        }
        const backups = ordered.filter(p => !starters.includes(p));
        return [...starters, ...backups];
      }
      return ordered;
    }
    if (position === 'OL') {
      // No saved depth — slot by olSlot first, then OVR for backups
      const slotOrder: Array<'LT' | 'LG' | 'C' | 'RG' | 'RT'> = ['LT', 'LG', 'C', 'RG', 'RT'];
      const starters: Player[] = [];
      for (const slot of slotOrder) {
        const p = posPlayers.find(pl => pl.olSlot === slot);
        if (p) starters.push(p);
      }
      const backups = posPlayers
        .filter(p => !starters.includes(p))
        .sort((a, b) => b.ratings.overall - a.ratings.overall);
      return [...starters, ...backups];
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

  function handleMovePlayer(position: Position, fromIdx: number, toIdx: number) {
    const group = getDepthGroup(position);
    if (toIdx < 0 || toIdx >= group.length) return;
    const ids = group.map(p => p.id);
    const [movedId] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, movedId);
    reorderDepthChart(position, ids);
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
            <div className="flex items-center gap-3">
              <h2 className="text-lg sm:text-2xl font-black font-display uppercase tracking-tight leading-tight">{viewingTeam?.city} {viewingTeam?.name} Roster</h2>
              <select
                value={activeTeamId}
                onChange={e => setViewingTeamId(e.target.value === userTeamId ? null : e.target.value)}
                className="h-8 px-2 text-xs rounded border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]"
              >
                {teams
                  .sort((a, b) => a.city.localeCompare(b.city))
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {t.abbreviation} — {t.city} {t.name}{t.id === userTeamId ? ' (You)' : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex items-center gap-4 text-sm text-[var(--text-sec)] mt-1 flex-wrap">
              <span className={roster.length > 53 ? 'text-red-600 font-bold' : ''}>{roster.length} players</span>
              {activeTeamId === userTeamId && roster.length > 53 && (leagueSettings?.rosterLimitEnabled !== false) && (
                <button
                  onClick={() => {
                    if (window.confirm(`Auto-cut to 53? This will release the ${roster.length - 53} lowest-OVR players on your roster.`)) {
                      autoCutToRosterLimit(userTeamId);
                    }
                  }}
                  className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 px-2 py-0.5 rounded border border-red-300 bg-red-50"
                >
                  ✂️ Cut to 53
                </button>
              )}
              {godMode && activeTeamId === userTeamId && (
                <button
                  onClick={() => setShowCreatePlayer(true)}
                  className="text-xs font-bold text-yellow-600 hover:text-yellow-700 flex items-center gap-1"
                >
                  + Create Player
                </button>
              )}
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
              {(['roster', 'depth', 'injuries', 'practice'] as const).map(mode => {
                const psCount = (viewingTeam?.practiceSquad ?? []).length;
                return (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-3 py-1 text-xs rounded font-medium transition-colors capitalize ${viewMode === mode ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
                  >
                    {mode === 'injuries'
                      ? `Injuries${injuredPlayers.length > 0 ? ` (${injuredPlayers.length})` : ''}`
                      : mode === 'depth'
                      ? 'Depth Chart'
                      : mode === 'practice'
                      ? `Practice Squad${psCount > 0 ? ` (${psCount})` : ''}`
                      : 'Roster'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── ROSTER TABLE VIEW (BBGM-style) ── */}
        {viewMode === 'roster' && (
          <>
            {/* Roster Composition */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4">
              <div className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider mb-3">Roster Composition</div>
              <div className="grid grid-cols-6 sm:grid-cols-11 gap-2 gap-y-3">
                {POSITIONS.map(pos => {
                  const count = roster.filter(p => p.position === pos).length;
                  const limits = ROSTER_LIMITS[pos];
                  const isBelowMin = count < limits.min;
                  const isAtMin = count === limits.min;
                  const isAboveMax = count > limits.max;
                  return (
                    <div key={pos} className="text-center">
                      <div className={`text-sm font-black ${
                        isBelowMin ? 'text-red-600' : isAtMin ? 'text-amber-600' : isAboveMax ? 'text-blue-600' : 'text-green-600'
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
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${filterPos === 'ALL' ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
              >
                ALL
              </button>
              {POSITIONS.map(pos => (
                <button
                  key={pos}
                  onClick={() => setFilterPos(pos)}
                  className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${filterPos === pos ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
                >
                  {pos}
                </button>
              ))}
            </div>

            {/* Mobile card view */}
            <div className="hidden space-y-1.5">
              {sortedRoster.map((p, idx) => {
                const depthLabel = getDepthLabel(p);
                const prevPos = idx > 0 ? sortedRoster[idx - 1].position : null;
                const showSeparator = prevPos && prevPos !== p.position && sortKey === 'pos';
                const posGroupLabel: Record<string, string> = { QB: 'Offense', DL: 'Defense', K: 'Special Teams' };
                const groupHeader = showSeparator && posGroupLabel[p.position];
                return (
                  <React.Fragment key={p.id}>
                    {showSeparator && (
                      <div className={`${groupHeader ? 'pt-3 pb-1' : 'pt-1'}`}>
                        {groupHeader && <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-sec)]/50 px-1">{groupHeader}</div>}
                        {!groupHeader && <div className="border-t border-[var(--border)]" />}
                      </div>
                    )}
                    <div
                      className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 cursor-pointer hover:bg-[var(--surface-2)]"
                      onClick={() => setSelectedPlayerId(p.id)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-[var(--text-sec)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">{getSubPosition(p)}</span>
                          <span className="font-semibold text-sm">{p.firstName[0]}. {p.lastName}</span>
                          {allProPlayerIds.has(p.id) && <span className="text-amber-600 text-xs">★</span>}
                        </div>
                        <span className={`text-lg font-black ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-[var(--text-sec)]">
                        <span>Age {p.age}</span>
                        <span>${p.contract.salary}M/{p.contract.yearsLeft}yr</span>
                        {depthLabel && <span className="font-medium text-[var(--text)]">{depthLabel}</span>}
                        {p.injury && <span className="text-red-600">{p.injury.type} ({p.injury.weeksLeft}w)</span>}
                      </div>
                      {p.stats.gamesPlayed > 0 && (
                        <div className="text-[10px] text-[var(--text-sec)] mt-1">
                          {getGenericStat(p)}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Desktop table view */}
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
                    const showPosSeparator = sortKey === 'pos' && filterPos === 'ALL' && (!prevPlayer || prevPlayer.position !== p.position);

                    const posGroupName: Record<string, string> = { QB: 'Quarterbacks', RB: 'Running Backs', WR: 'Wide Receivers', TE: 'Tight Ends', OL: 'Offensive Line', DL: 'Defensive Line', LB: 'Linebackers', CB: 'Cornerbacks', S: 'Safeties', K: 'Kickers', P: 'Punters' };

                    return (
                      <React.Fragment key={p.id}>
                      {showPosSeparator && (
                        <tr>
                          <td colSpan={14} className="pt-3 pb-1 px-3 bg-[var(--surface-2)]/50">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-sec)]">
                              {posGroupName[p.position] ?? p.position}
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr
                        className={`transition-colors duration-150 hover:bg-[var(--surface-2)] ${
                          isStarter ? '' : 'opacity-80'
                        } border-t border-[var(--border)] ${
                          isStarter && p.contract.yearsLeft <= 1 ? 'bg-amber-50/50' : ''
                        }`}
                      >
                        {/* Name */}
                        <td className="py-2 px-2 pl-3">
                          <div className="flex items-center gap-1.5">
                            {allProPlayerIds.has(p.id) && <span className="text-amber-600 text-xs">★</span>}
                            <button
                              onClick={() => setSelectedPlayerId(p.id)}
                              className="font-semibold hover:text-blue-600 transition-colors truncate"
                            >
                              <span className="sm:hidden">{p.firstName[0]}. {p.lastName}</span>
                              <span className="hidden sm:inline">{p.firstName} {p.lastName}</span>
                              {champTeamId === userTeamId && <span className="ml-0.5 text-xs" title="Championship Ring">💍</span>}
                            </button>
                            {p.contract.contractYears?.some(y => y.proratedBonus > 0) && (
                              <span className="ml-1 text-[9px] font-bold bg-amber-100 text-amber-700 px-1 rounded" title="Contract restructured">R</span>
                            )}
                          </div>
                          {p.injury && (
                            <span className="text-[10px] text-red-600 block">
                              {p.injury.type} ({p.injury.weeksLeft}w)
                              {p.playingThroughInjury && (
                                <span className="ml-1 text-amber-700 font-bold">· ⚠ Playing through</span>
                              )}
                            </span>
                          )}
                          {p.injury && p.injury.weeksLeft > 0 && p.injury.weeksLeft <= 3 && !p.onIR && (() => {
                            const penalty = p.injury.weeksLeft >= 3 ? 20 : p.injury.weeksLeft === 2 ? 12 : 5;
                            const reinjPct = p.injury.weeksLeft >= 3 ? 25 : p.injury.weeksLeft === 2 ? 15 : 8;
                            const on = !!p.playingThroughInjury;
                            return (
                              <button
                                onClick={() => {
                                  if (on) {
                                    togglePlayingThroughInjury(p.id);
                                    return;
                                  }
                                  const ok = window.confirm(
                                    `Start ${p.firstName} ${p.lastName} at ${p.injury!.weeksLeft} week${p.injury!.weeksLeft === 1 ? '' : 's'} remaining?\n\n` +
                                    `• Plays at ~${Math.max(30, p.ratings.overall - penalty)} OVR (-${penalty})\n` +
                                    `• ${reinjPct}% chance of re-injury per game (worse & longer)`
                                  );
                                  if (ok) togglePlayingThroughInjury(p.id);
                                }}
                                className={`mt-1 inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-semibold transition-colors ${
                                  on
                                    ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                                    : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)] hover:border-amber-400 hover:text-amber-700'
                                }`}
                                title={on ? 'Click to disable' : `Start despite injury (-${penalty} OVR, ${reinjPct}% re-injury risk)`}
                              >
                                {on ? '✓ Playing through' : 'Play through ➜'}
                              </button>
                            );
                          })()}
                        </td>

                        {/* Position */}
                        <td className="py-2 px-2 text-center">
                          <span className="text-xs font-bold text-[var(--text-sec)]">{getSubPosition(p)}</span>
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
                            <td className={`py-2 px-2 text-center text-xs ${schemeFitColor(fit)}`}>
                              <div className="group relative inline-flex justify-center">
                                {schemeFitDot(fit)}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                                  <div className="bg-[var(--text)] text-white text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg text-center">
                                    <div className="font-bold">{fit === 'great' ? 'Great Fit' : fit === 'poor' ? 'Poor Fit' : 'Neutral'}</div>
                                    <div className="opacity-70">{schemeName}</div>
                                    <div className={fit === 'great' ? 'text-green-300' : fit === 'poor' ? 'text-red-300' : 'opacity-70'}>
                                      {fit === 'great' ? '+2 OVR in games' : fit === 'poor' ? '-1 OVR in games' : 'No bonus or penalty'}
                                    </div>
                                  </div>
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-[var(--text)] rotate-45" />
                                </div>
                              </div>
                            </td>
                          );
                        })()}

                        {/* Contract */}
                        <td className="py-2 px-2 text-right font-mono text-xs tabular-nums">
                          <span className="font-semibold">${p.contract.salary}M</span>
                          <span className={`ml-1 ${p.contract.yearsLeft <= 1 ? 'font-bold text-amber-600' : 'text-[var(--text-sec)]'}`}>
                            {p.contract.yearsLeft <= 1 ? (isStarter ? '⚠️ expiring' : 'expiring') : `${p.contract.yearsLeft}yr left`}
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
                          {(() => {
                            const via = p.acquiredVia;
                            if (via === 'draft') return <span>Draft <span className="font-medium text-[var(--text)]">#{p.draftPick}</span> ({p.draftYear})</span>;
                            if (via === 'free-agency') return <span>Free Agent{p.acquiredSeason ? ` (${p.acquiredSeason})` : ''}</span>;
                            if (via === 'trade') return <span>Trade{p.acquiredSeason ? ` (${p.acquiredSeason})` : ''}</span>;
                            // Fallback: check draftYear/draftPick even if acquiredVia wasn't set
                            if (p.draftYear && p.draftPick) return <span>Draft <span className="font-medium text-[var(--text)]">#{p.draftPick}</span> ({p.draftYear})</span>;
                            return <span>Original Roster</span>;
                          })()}
                        </td>

                        {/* Mood — click to open player modal with mood breakdown */}
                        <td className="py-2 px-2 text-center">
                          {(() => {
                            const mood = p.mood ?? 70;
                            const label = mood >= 85 ? 'Thrilled' : mood >= 75 ? 'Happy' : mood >= 60 ? 'Content' : mood >= 45 ? 'Unhappy' : 'Angry';
                            const color = mood >= 85 ? 'text-green-600 bg-green-50' : mood >= 75 ? 'text-blue-600 bg-blue-50' : mood >= 60 ? 'text-gray-600 bg-gray-100' : mood >= 45 ? 'text-orange-600 bg-orange-50' : 'text-red-600 bg-red-50';
                            const depthIdx = getDepthIndex(p);
                            const reason = getMoodReason(p, viewingTeam, depthIdx);
                            return (
                              <button
                                onClick={() => setSelectedPlayerId(p.id)}
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer hover:ring-1 hover:ring-current transition-all ${color}`}
                                title={reason}
                              >
                                {label}
                              </button>
                            );
                          })()}
                        </td>

                        {/* Actions */}
                        <td className="py-2 px-2 text-right pr-3 relative">
                          {isViewingOwnTeam && (confirmRelease === p.id ? (
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
                          ))}
                        </td>
                      </tr>
                      </React.Fragment>
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
            {/* Base formation picker + starting lineup */}
            {isViewingOwnTeam && (
              <Card>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)]">Starting Lineup</div>
                      <div className="text-[11px] text-[var(--text-sec)] mt-0.5">Your base formation determines which slots fill from the depth chart below.</div>
                    </div>
                    <select
                      value={userTeam?.baseFormation ?? '4-3'}
                      onChange={(e) => setBaseFormation(e.target.value as '3-4' | '4-3' | 'Nickel')}
                      className="text-xs font-bold bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                    >
                      <option value="4-3">Base: 4-3</option>
                      <option value="3-4">Base: 3-4</option>
                      <option value="Nickel">Base: Nickel</option>
                    </select>
                  </div>
                  {(() => {
                    const formation = userTeam?.baseFormation ?? '4-3';
                    // Offense: same across formations.
                    const offenseSlots: { label: string; pos: Position; idx: number }[] = [
                      { label: 'QB', pos: 'QB', idx: 0 },
                      { label: 'RB', pos: 'RB', idx: 0 },
                      { label: 'WR1', pos: 'WR', idx: 0 },
                      { label: 'WR2', pos: 'WR', idx: 1 },
                      { label: 'TE', pos: 'TE', idx: 0 },
                      { label: 'LT', pos: 'OL', idx: 0 },
                      { label: 'LG', pos: 'OL', idx: 1 },
                      { label: 'C',  pos: 'OL', idx: 2 },
                      { label: 'RG', pos: 'OL', idx: 3 },
                      { label: 'RT', pos: 'OL', idx: 4 },
                    ];
                    // Defense: formation-specific slot counts plus a preferred
                    // sub-position per slot. renderSlot uses the sub-pos to
                    // route the RIGHT player to each slot (e.g. an OLB into
                    // LOLB even if his raw OVR is lower than a stacked MLB).
                    type DefSlot = { label: string; pos: Position; idx: number; subPos?: SubPosition };
                    const defenseSlots: DefSlot[] =
                      formation === '3-4' ? [
                        { label: 'LDE', pos: 'DL', idx: 0, subPos: 'EDGE' },
                        { label: 'NT',  pos: 'DL', idx: 0, subPos: 'DT' },
                        { label: 'RDE', pos: 'DL', idx: 1, subPos: 'EDGE' },
                        { label: 'LOLB', pos: 'LB', idx: 0, subPos: 'OLB' },
                        { label: 'LILB', pos: 'LB', idx: 0, subPos: 'MLB' },
                        { label: 'RILB', pos: 'LB', idx: 1, subPos: 'MLB' },
                        { label: 'ROLB', pos: 'LB', idx: 1, subPos: 'OLB' },
                        { label: 'LCB', pos: 'CB', idx: 0, subPos: 'CB' },
                        { label: 'RCB', pos: 'CB', idx: 1, subPos: 'CB' },
                        { label: 'FS',  pos: 'S',  idx: 0, subPos: 'FS' },
                        { label: 'SS',  pos: 'S',  idx: 0, subPos: 'SS' },
                      ] : formation === 'Nickel' ? [
                        { label: 'LDE', pos: 'DL', idx: 0, subPos: 'EDGE' },
                        { label: 'LDT', pos: 'DL', idx: 0, subPos: 'DT' },
                        { label: 'RDT', pos: 'DL', idx: 1, subPos: 'DT' },
                        { label: 'RDE', pos: 'DL', idx: 1, subPos: 'EDGE' },
                        { label: 'WLB', pos: 'LB', idx: 0, subPos: 'OLB' },
                        { label: 'MLB', pos: 'LB', idx: 0, subPos: 'MLB' },
                        { label: 'LCB', pos: 'CB', idx: 0, subPos: 'CB' },
                        { label: 'RCB', pos: 'CB', idx: 1, subPos: 'CB' },
                        { label: 'NCB', pos: 'CB', idx: 2, subPos: 'CB' },
                        { label: 'FS',  pos: 'S',  idx: 0, subPos: 'FS' },
                        { label: 'SS',  pos: 'S',  idx: 0, subPos: 'SS' },
                      ] : [
                        // 4-3 default
                        { label: 'LDE', pos: 'DL', idx: 0, subPos: 'EDGE' },
                        { label: 'LDT', pos: 'DL', idx: 0, subPos: 'DT' },
                        { label: 'RDT', pos: 'DL', idx: 1, subPos: 'DT' },
                        { label: 'RDE', pos: 'DL', idx: 1, subPos: 'EDGE' },
                        { label: 'WLB', pos: 'LB', idx: 0, subPos: 'OLB' },
                        { label: 'MLB', pos: 'LB', idx: 0, subPos: 'MLB' },
                        { label: 'SLB', pos: 'LB', idx: 1, subPos: 'OLB' },
                        { label: 'LCB', pos: 'CB', idx: 0, subPos: 'CB' },
                        { label: 'RCB', pos: 'CB', idx: 1, subPos: 'CB' },
                        { label: 'FS',  pos: 'S',  idx: 0, subPos: 'FS' },
                        { label: 'SS',  pos: 'S',  idx: 0, subPos: 'SS' },
                      ];

                    const renderSlot = (slot: { label: string; pos: Position; idx: number; subPos?: SubPosition }) => {
                      // When a sub-position is specified (defensive + OL
                      // slots), filter the depth list to players whose
                      // subPosition matches. Imported-league players (FBGM)
                      // and older saves that never went through migration
                      // v20 may have p.subPosition === undefined — derive
                      // from ratings on the fly so the slot still fills.
                      // This was tofftanaut's recurring "defensive depth
                      // chart empty" report.
                      const baseList = getDepthGroup(slot.pos);
                      const effectiveSubPos = (p: Player) => p.subPosition ?? deriveSubPosition(p);
                      const depthList = slot.subPos
                        ? baseList.filter(p => effectiveSubPos(p) === slot.subPos)
                        : baseList;
                      const player = depthList[slot.idx];
                      return (
                        <div key={slot.label} className="bg-[var(--surface-2)] rounded-md px-2 py-1.5 min-h-[2.5rem]">
                          <div className="text-[9px] uppercase tracking-wider text-[var(--text-sec)] font-bold">{slot.label}</div>
                          {player ? (
                            <div className="flex items-center justify-between gap-1 mt-0.5">
                              <button
                                onClick={() => setSelectedPlayerId(player.id)}
                                className="text-xs font-semibold hover:text-blue-600 truncate text-left"
                              >
                                {player.firstName[0]}. {player.lastName}
                              </button>
                              <span className={`text-[10px] font-bold ${ratingColor(player.ratings.overall)} shrink-0`}>
                                {player.ratings.overall}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-red-600 italic mt-0.5">empty</div>
                          )}
                        </div>
                      );
                    };

                    return (
                      <div className="space-y-3">
                        <div>
                          <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase mb-1.5">Offense</div>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                            {offenseSlots.map(renderSlot)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase mb-1.5">Defense ({formation})</div>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                            {defenseSlots.map(renderSlot)}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </Card>
            )}

            <p className="text-xs text-[var(--text-sec)] hidden sm:block">
              Drag players to reorder the depth chart. Use ▲▼ buttons on mobile. ★ = All-League selection.
            </p>
            <p className="text-xs text-[var(--text-sec)] sm:hidden">
              Use ▲▼ to reorder. ★ = All-League selection.
            </p>
            {positionGroups.map(group => (
              <Card key={group.label}>
                <CardHeader><CardTitle>{group.label}</CardTitle></CardHeader>
                <div className="space-y-0">
                  {group.positions.map(pos => {
                    const depthGroup = getDepthGroup(pos);
                    return (
                      <div key={pos} className="border-t border-[var(--border)] first:border-t-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 py-2 px-2">
                          <div className="w-8 text-xs font-bold text-[var(--text-sec)]">{pos}</div>
                          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
                            {Array.from({ length: Math.max(4, depthGroup.length) }).map((_, idx) => {
                              const player = depthGroup[idx];
                              if (!player) {
                                return <div key={idx} className="text-xs text-[var(--text-sec)] py-1 px-2">—</div>;
                              }
                              const isAllPro = allProPlayerIds.has(player.id);
                              const isDragging = dragPosition === pos && dragIndex === idx;
                              const isDragOver = dragPosition === pos && dragOverIndex === idx;
                              const canPlayThrough = isViewingOwnTeam && player.injury && player.injury.weeksLeft > 0 && player.injury.weeksLeft <= 3 && !player.onIR;
                              const playingThrough = !!player.playingThroughInjury;
                              const ptPenalty = player.injury && playingThrough ? (player.injury.weeksLeft >= 3 ? 20 : player.injury.weeksLeft === 2 ? 12 : 5) : 0;
                              return (
                                <div
                                  key={player.id}
                                  draggable
                                  onDragStart={() => handleDragStart(pos, idx)}
                                  onDragOver={(e) => handleDragOver(e, idx)}
                                  onDragEnd={handleDragEnd}
                                  className={`bg-[var(--surface-2)] rounded-lg p-2 cursor-grab active:cursor-grabbing transition-all ${
                                    isDragging ? 'opacity-40 scale-95' : ''
                                  } ${isDragOver ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[var(--bg)]' : ''} ${
                                    playingThrough ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-[var(--bg)]' : ''
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-0.5">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] text-[var(--text-sec)]">
                                        {pos === 'OL' && idx < 5 && player.olSlot
                                          ? player.olSlot
                                          : (DEPTH_LABELS[idx] ?? `${idx + 1}th`)}
                                      </span>
                                      {isViewingOwnTeam && depthGroup.length > 1 && (
                                        <div className="flex gap-0.5">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleMovePlayer(pos, idx, idx - 1); }}
                                            disabled={idx === 0}
                                            className="w-4 h-4 flex items-center justify-center rounded text-[8px] bg-[var(--surface)] text-[var(--text-sec)] hover:text-[var(--text)] disabled:opacity-20 border border-[var(--border)]"
                                            title="Move up"
                                          >
                                            ▲
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleMovePlayer(pos, idx, idx + 1); }}
                                            disabled={idx >= depthGroup.length - 1}
                                            className="w-4 h-4 flex items-center justify-center rounded text-[8px] bg-[var(--surface)] text-[var(--text-sec)] hover:text-[var(--text)] disabled:opacity-20 border border-[var(--border)]"
                                            title="Move down"
                                          >
                                            ▼
                                          </button>
                                        </div>
                                      )}
                                      {canPlayThrough && (() => {
                                        const w = player.injury!.weeksLeft;
                                        const penalty = w >= 3 ? 20 : w === 2 ? 12 : 5;
                                        const reinjPct = w >= 3 ? 25 : w === 2 ? 15 : 8;
                                        return (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (playingThrough) {
                                                togglePlayingThroughInjury(player.id);
                                                return;
                                              }
                                              const ok = window.confirm(
                                                `Start ${player.firstName} ${player.lastName} at ${w} week${w === 1 ? '' : 's'} remaining?\n\n` +
                                                `• Plays at ~${Math.max(30, player.ratings.overall - penalty)} OVR (-${penalty})\n` +
                                                `• ${reinjPct}% chance of re-injury per game (worse & longer)`
                                              );
                                              if (ok) togglePlayingThroughInjury(player.id);
                                            }}
                                            className={`w-4 h-4 flex items-center justify-center rounded text-[9px] border ${
                                              playingThrough
                                                ? 'bg-amber-100 text-amber-800 border-amber-400'
                                                : 'bg-[var(--surface)] text-[var(--text-sec)] hover:text-amber-700 hover:border-amber-400 border-[var(--border)]'
                                            }`}
                                            title={playingThrough ? 'Disable play through' : `Play through injury (-${penalty} OVR, ${reinjPct}% re-injury risk)`}
                                          >
                                            ✚
                                          </button>
                                        );
                                      })()}
                                    </div>
                                    <span className={`text-xs font-bold ${ratingColor(player.ratings.overall)}`}>
                                      {playingThrough ? (
                                        <>
                                          {Math.max(30, player.ratings.overall - ptPenalty)}
                                          <span className="ml-0.5 text-[9px] text-red-600">(-{ptPenalty})</span>
                                        </>
                                      ) : (
                                        player.ratings.overall
                                      )}
                                    </span>
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedPlayerId(player.id); }}
                                    className="text-xs font-semibold sm:truncate block hover:text-blue-600 transition-colors text-left"
                                  >
                                    {isAllPro && <span className="text-amber-600 mr-0.5">★</span>}
                                    {player.firstName[0]}. {player.lastName}
                                  </button>
                                  <div className="text-[10px] text-[var(--text-sec)] mt-0.5 sm:truncate">
                                    {getGenericStat(player)}
                                  </div>
                                  {player.injury && (
                                    <div className="text-[10px] text-red-600">
                                      {player.injury.type} ({player.injury.weeksLeft}w)
                                      {playingThrough && <span className="ml-1 text-amber-700 font-bold">· ⚠</span>}
                                    </div>
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
                      <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors duration-150">
                        <td className="py-2.5 pl-2">
                          <button onClick={() => setSelectedPlayerId(p.id)} className="font-semibold hover:text-blue-600 transition-colors">
                            {allProPlayerIds.has(p.id) && <span className="text-amber-600 mr-1">★</span>}
                            <span className="sm:hidden">{p.firstName[0]}. {p.lastName}</span>
                            <span className="hidden sm:inline">{p.firstName} {p.lastName}</span>
                          </button>
                        </td>
                        <td className="py-2.5 text-center text-xs font-bold text-[var(--text-sec)]">
                          <PositionLink position={p.position} subPosition={p.subPosition} />
                        </td>
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

        {/* ── PRACTICE SQUAD VIEW ── */}
        {viewMode === 'practice' && (() => {
          const psPlayersFull = (viewingTeam?.practiceSquad ?? [])
            .map(id => players.find(p => p.id === id))
            .filter((p): p is NonNullable<typeof p> => !!p);
          const PS_CAP = 16;
          const slotsLeft = PS_CAP - psPlayersFull.length;
          // `roster` already excludes PS members, so the eligibility filter
          // only has to gate on rating / experience / IR.
          const eligibleActive = roster.filter(p =>
            p.ratings.overall <= 80 && p.experience <= 2 && !p.onIR,
          );

          // Shared sort — same keys work for both tables, so headers behave
          // consistently between the PS and the eligible-to-demote list.
          const sortPsPlayers = (arr: typeof psPlayersFull) => {
            const dir = psSortDir === 'asc' ? 1 : -1;
            return [...arr].sort((a, b) => {
              switch (psSortKey) {
                case 'name': return dir * `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
                case 'pos': return dir * a.position.localeCompare(b.position);
                case 'ovr': return dir * (a.ratings.overall - b.ratings.overall);
                case 'age': return dir * (a.age - b.age);
                case 'yrs': return dir * (a.experience - b.experience);
                case 'salary': return dir * (a.contract.salary - b.contract.salary);
                default: return 0;
              }
            });
          };
          const sortedPs = sortPsPlayers(psPlayersFull);
          const sortedEligible = sortPsPlayers(eligibleActive).slice(0, 10);

          const SortHeader = ({ label, colKey, align = 'center', className = '' }: {
            label: string;
            colKey: PsSortKey;
            align?: 'left' | 'center';
            className?: string;
          }) => {
            const active = psSortKey === colKey;
            const arrow = !active ? '' : psSortDir === 'asc' ? ' ▲' : ' ▼';
            return (
              <th
                className={`py-2 ${align === 'left' ? 'pl-2 text-left' : 'text-center'} cursor-pointer select-none hover:text-[var(--text)] transition-colors ${active ? 'text-blue-600' : ''} ${className}`}
                onClick={() => handlePsSort(colKey)}
              >
                {label}{arrow}
              </th>
            );
          };

          return (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Practice Squad — {psPlayersFull.length} / {PS_CAP}</CardTitle>
                </CardHeader>
                <p className="text-xs text-[var(--text-sec)] mb-3">
                  Developmental tier below the active 53. PS contracts are a flat league-minimum
                  (${LEAGUE_MINIMUM_SALARY}M) and do not count against your main cap.
                  Eligible: players ≤80 OVR with 2 or fewer accrued seasons (plus up to 4 veteran slots).
                </p>
                {psPlayersFull.length === 0 ? (
                  <div className="text-sm text-[var(--text-sec)] italic">
                    Your practice squad is empty. Demote a young depth player below or sign one off the street.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-[var(--text-sec)] uppercase">
                          <SortHeader label="Player" colKey="name" align="left" />
                          <SortHeader label="Pos" colKey="pos" />
                          <SortHeader label="OVR" colKey="ovr" />
                          <SortHeader label="Age" colKey="age" />
                          <SortHeader label="Yrs" colKey="yrs" />
                          <th className="py-2 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPs.map(p => (
                          <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]">
                            <td className="py-2 pl-2">
                              <button onClick={() => setSelectedPlayerId(p.id)} className="font-semibold hover:text-blue-600">
                                {p.firstName} {p.lastName}
                              </button>
                            </td>
                            <td className="py-2 text-center text-xs font-bold text-[var(--text-sec)]">{p.position}</td>
                            <td className={`py-2 text-center font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</td>
                            <td className="py-2 text-center">{p.age}</td>
                            <td className="py-2 text-center">{p.experience}</td>
                            <td className="py-2 text-center">
                              {activeTeamId === userTeamId && (
                                <Button size="sm" variant="secondary" onClick={() => {
                                  const err = promoteFromPracticeSquad(p.id);
                                  if (err) alert(err);
                                }}>
                                  Promote
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {activeTeamId === userTeamId && slotsLeft > 0 && eligibleActive.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Eligible to Demote ({eligibleActive.length})</CardTitle>
                  </CardHeader>
                  <p className="text-xs text-[var(--text-sec)] mb-3">
                    Young players on your active roster eligible for the practice squad.
                    Demoting clears a 53 slot and removes their salary from your cap ledger.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-[var(--text-sec)] uppercase">
                          <SortHeader label="Player" colKey="name" align="left" />
                          <SortHeader label="Pos" colKey="pos" />
                          <SortHeader label="OVR" colKey="ovr" />
                          <SortHeader label="Age" colKey="age" />
                          <SortHeader label="Yrs" colKey="yrs" />
                          <SortHeader label="Salary" colKey="salary" />
                          <th className="py-2 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedEligible.map(p => (
                          <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]">
                            <td className="py-2 pl-2">
                              <button onClick={() => setSelectedPlayerId(p.id)} className="font-semibold hover:text-blue-600">
                                {p.firstName} {p.lastName}
                              </button>
                            </td>
                            <td className="py-2 text-center text-xs font-bold text-[var(--text-sec)]">{p.position}</td>
                            <td className={`py-2 text-center font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</td>
                            <td className="py-2 text-center">{p.age}</td>
                            <td className="py-2 text-center">{p.experience}</td>
                            <td className="py-2 text-center">${p.contract.salary}M</td>
                            <td className="py-2 text-center">
                              <Button size="sm" variant="secondary" onClick={() => {
                                const err = demoteToPracticeSquad(p.id);
                                if (err) alert(err);
                              }}>
                                Demote to PS
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          );
        })()}
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />

      {/* God Mode: Create Player Dialog */}
      {showCreatePlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreatePlayer(false)}>
          <div className="bg-[var(--surface)] rounded-xl border border-yellow-400/40 shadow-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-yellow-700 mb-3">Create Player</h3>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-[var(--text-sec)] uppercase">First Name</label>
                  <input className="w-full text-sm border rounded px-2 py-1" value={newPlayer.firstName} onChange={e => setNewPlayer(p => ({ ...p, firstName: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-sec)] uppercase">Last Name</label>
                  <input className="w-full text-sm border rounded px-2 py-1" value={newPlayer.lastName} onChange={e => setNewPlayer(p => ({ ...p, lastName: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-[var(--text-sec)] uppercase">Position</label>
                  <select className="w-full text-sm border rounded px-2 py-1" value={newPlayer.position} onChange={e => setNewPlayer(p => ({ ...p, position: e.target.value as Position }))}>
                    {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-sec)] uppercase">Age</label>
                  <input type="number" className="w-full text-sm border rounded px-2 py-1" value={newPlayer.age} min={18} max={45} onChange={e => setNewPlayer(p => ({ ...p, age: parseInt(e.target.value) || 22 }))} />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-sec)] uppercase">OVR</label>
                  <input type="number" className="w-full text-sm border rounded px-2 py-1" value={newPlayer.overall} min={30} max={99} onChange={e => setNewPlayer(p => ({ ...p, overall: parseInt(e.target.value) || 65 }))} />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-sec)] uppercase">Potential</label>
                <input type="number" className="w-full text-sm border rounded px-2 py-1 w-20" value={newPlayer.potential} min={30} max={99} onChange={e => setNewPlayer(p => ({ ...p, potential: parseInt(e.target.value) || 75 }))} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                className="px-4 py-2 text-sm font-bold bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg disabled:opacity-50"
                disabled={!newPlayer.firstName || !newPlayer.lastName}
                onClick={() => {
                  createPlayer(newPlayer);
                  setShowCreatePlayer(false);
                  setNewPlayer({ firstName: '', lastName: '', position: 'QB', age: 22, overall: 65, potential: 75 });
                }}
              >
                Create
              </button>
              <button className="px-4 py-2 text-sm text-[var(--text-sec)] hover:text-[var(--text)]" onClick={() => setShowCreatePlayer(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed-position action menu (rendered outside table to avoid overflow:hidden clipping) */}
      {actionMenu && (() => {
        const p = roster.find(pl => pl.id === actionMenu.id);
        if (!p) return null;
        return (
          <div
            ref={actionMenuRef}
            className="fixed z-[9999] rounded-lg py-1.5 min-w-[220px] max-h-[80vh] overflow-y-auto"
            style={{
              top: Math.max(8, actionMenu.y - 8),
              left: Math.max(8, actionMenu.x - 220),
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
            {p.contract.yearsLeft >= 1 && !p.holdout && !p.onIR && p.lastRestructuredSeason !== season && (
              <>
                <div className="border-t border-[var(--border)] mx-3 my-0.5" />
                <button
                  onClick={() => {
                    setExtendPlayer(p.id);
                    setExtendSalary(Math.round(estimateSalary(p.ratings.overall, p.position, p.age, p.potential) * 10) / 10);
                    setExtendYears(Math.min(5, Math.max(2, p.age >= 30 ? 2 : 4)));
                    setActionMenu(null);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-black/5 transition-colors text-green-600 font-medium"
                >
                  Extend Contract
                  <span className="block text-[11px] text-[var(--text-sec)] font-normal mt-0.5">
                    Lock in a new long-term deal
                  </span>
                </button>
              </>
            )}
            {(() => {
              // "Demote to PS" is hidden (not show-disabled) when the player
              // can't be demoted — keeps the menu short for vets and lets the
              // dropdown express the same eligibility rules the post-draft
              // cut flow uses. Reuses isPracticeSquadEligible so the two
              // surfaces never disagree.
              if (!isViewingOwnTeam) return null;
              if (p.onIR) return null;
              const ps = viewingTeam?.practiceSquad ?? [];
              if (ps.length >= PRACTICE_SQUAD_LIMIT) return null;
              const psPlayers = ps
                .map(id => players.find(pl => pl.id === id))
                .filter((pl): pl is Player => !!pl);
              const { eligible } = isPracticeSquadEligible(p, psPlayers);
              if (!eligible) return null;
              return (
                <>
                  <div className="border-t border-[var(--border)] mx-3 my-0.5" />
                  <button
                    onClick={() => {
                      const err = demoteToPracticeSquad(p.id);
                      if (err) alert(err);
                      setActionMenu(null);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-black/5 transition-colors text-indigo-600 font-medium"
                  >
                    Demote to Practice Squad
                    <span className="block text-[11px] text-[var(--text-sec)] font-normal mt-0.5">
                      Frees an active-53 slot · league-minimum contract
                    </span>
                  </button>
                </>
              );
            })()}
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
      {/* Extend Contract Modal */}
      {extendPlayerId && (() => {
        const p = roster.find(pl => pl.id === extendPlayerId);
        if (!p) return null;
        const userTeam = teams.find(t => t.id === userTeamId);
        const capSpace = userTeam ? userTeam.salaryCap - userTeam.totalPayroll : 0;
        const marketSalary = Math.round(estimateSalary(p.ratings.overall, p.position, p.age, p.potential) * 10) / 10;
        const totalCost = Math.round(extendSalary * extendYears * 10) / 10;
        const canAfford = extendSalary <= capSpace + p.contract.salary;

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setExtendPlayer(null)}>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-[var(--border)]">
                <h2 className="text-lg font-bold">Extend Contract</h2>
                <p className="text-xs text-[var(--text-sec)] mt-0.5">
                  {p.firstName} {p.lastName} · {p.position} · {p.ratings.overall} OVR
                </p>
              </div>
              <div className="px-5 py-5 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-sec)]">Current deal</span>
                  <span className="font-bold">${p.contract.salary}M/yr · {p.contract.yearsLeft}yr left</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-sec)]">Market value</span>
                  <span className="font-bold">${marketSalary}M/yr</span>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] block mb-1">
                    Annual Salary
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={Math.max(1, Math.round(marketSalary * 0.7))}
                      max={Math.round(marketSalary * 1.4)}
                      step={0.5}
                      value={extendSalary}
                      onChange={e => setExtendSalary(parseFloat(e.target.value))}
                      className="flex-1 accent-green-600"
                    />
                    <span className="text-sm font-bold tabular-nums w-16 text-right">${extendSalary}M</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] block mb-1">
                    Years
                  </label>
                  <div className="flex gap-2">
                    {[2, 3, 4, 5].map(yr => (
                      <button
                        key={yr}
                        onClick={() => setExtendYears(yr)}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                          extendYears === yr ? 'bg-green-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)]'
                        }`}
                      >
                        {yr}yr
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-sec)]">Total value</span>
                    <span className="font-bold">${totalCost}M</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-sec)]">Cap space</span>
                    <span className={canAfford ? 'text-green-600' : 'text-red-600'}>${Math.round(capSpace * 10) / 10}M</span>
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-[var(--border)] flex items-center justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setExtendPlayer(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!canAfford}
                  onClick={() => {
                    const ok = extendPlayer(extendPlayerId, extendSalary, extendYears);
                    if (ok) setExtendPlayer(null);
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Confirm Extension
                </Button>
              </div>
            </div>
          </div>
        );
      })()}
    </GameShell>
  );
}
