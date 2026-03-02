'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import { POSITION_WEIGHTS } from '@/lib/engine/playerGen';
import { POSITIONS, ROSTER_LIMITS } from '@/types';
import type { Player, Position, Team, PlayerRatings } from '@/types';

const SCOUTING_LEVEL_LABELS = ['Budget ($2M)', 'Standard ($4M)', 'Enhanced ($6M)', 'Elite ($8M)', 'Maximum ($10M)'];

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-400';
  if (val >= 65) return 'text-blue-400';
  if (val >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function expectedOvrForPick(overallPick: number, totalPicks: number): number {
  // Mirrors the talent curve in generateDraftClass: top picks ~78, late ~33
  const progress = (overallPick - 1) / Math.max(1, totalPicks - 1);
  return Math.round(78 - progress * 45);
}

function pickGrade(overallPick: number, totalPicks: number, playerOvr: number): string {
  const expected = expectedOvrForPick(overallPick, totalPicks);
  const delta = playerOvr - expected;
  if (delta >= 10) return 'A+';
  if (delta >= 6) return 'A';
  if (delta >= 3) return 'B+';
  if (delta >= 0) return 'B';
  if (delta >= -3) return 'B-';
  if (delta >= -6) return 'C+';
  if (delta >= -9) return 'C';
  if (delta >= -12) return 'C-';
  return 'D';
}

function gradeValue(grade: string): number {
  const map: Record<string, number> = { 'A+': 12, 'A': 11, 'B+': 10, 'B': 9, 'B-': 8, 'C+': 7, 'C': 6, 'C-': 5, 'D': 3 };
  return map[grade] ?? 5;
}

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'text-green-400';
  if (grade === 'B+' || grade === 'B') return 'text-blue-400';
  if (grade === 'B-' || grade === 'C+') return 'text-amber-400';
  return 'text-red-400';
}

function teamDraftGrade(avgVal: number): string {
  if (avgVal >= 10.5) return 'A+';
  if (avgVal >= 9.5) return 'A';
  if (avgVal >= 8.5) return 'B+';
  if (avgVal >= 7.5) return 'B';
  if (avgVal >= 6.5) return 'B-';
  if (avgVal >= 5.5) return 'C+';
  if (avgVal >= 4.5) return 'C';
  if (avgVal >= 3.5) return 'C-';
  return 'D';
}

// ---------------------------------------------------------------------------
// On The Clock card component
// ---------------------------------------------------------------------------

function ProspectCard({
  label,
  player,
  posRank,
  ovrRank,
  teamColor,
}: {
  label: string;
  player: Player | null | undefined;
  posRank: number;
  ovrRank: number;
  teamColor: string;
}) {
  if (!player) return null;
  return (
    <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider px-4 pt-3 pb-1">
        {label}
      </div>
      <div className="px-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          {/* Player avatar placeholder */}
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-black text-white shrink-0"
            style={{ backgroundColor: teamColor }}
          >
            {player.firstName[0]}{player.lastName[0]}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-base truncate">
              {player.firstName} {player.lastName}
            </div>
            <div className="text-xs text-[var(--text-sec)]">
              Age {player.age} · Exp {player.experience}yr
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white"
            style={{ backgroundColor: teamColor }}
          >
            {player.position}
          </div>
          <div className="text-center">
            <div className="text-lg font-black">{posRank}</div>
            <div className="text-[10px] text-[var(--text-sec)] uppercase">Pos Rk</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-black">{ovrRank}</div>
            <div className="text-[10px] text-[var(--text-sec)] uppercase">Ovr Rk</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-black ${ratingColor(player.ratings.overall)}`}>
              {player.ratings.overall}
            </div>
            <div className="text-[10px] text-[var(--text-sec)] uppercase">Grade</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OnTheClockSection({
  currentTeam,
  currentRound,
  currentPickInRound,
  currentOverallPick,
  bestAvailable,
  bestFit,
  needs,
  nextPickTeam,
  nextPickOverall,
  nextPickNeeds,
  allProspects,
  draftComplete,
  isUserPick,
  simDraftPick,
  simToUserDraftPick,
  simToEndDraft,
  advanceToFreeAgency,
  onSimAll,
}: {
  currentTeam: Team | undefined;
  currentRound: number;
  currentPickInRound: number;
  currentOverallPick: number;
  bestAvailable: Player | undefined;
  bestFit: Player | null | undefined;
  needs: { position: Position; needScore: number; count: number; limits: { min: number; max: number } }[];
  nextPickTeam: Team | undefined;
  nextPickOverall: number;
  nextPickNeeds: { position: Position; needScore: number }[];
  allProspects: Player[];
  draftComplete: boolean;
  isUserPick: boolean;
  simDraftPick: () => void;
  simToUserDraftPick: () => void;
  simToEndDraft: () => void;
  advanceToFreeAgency: () => void;
  onSimAll?: () => void;
}) {
  const canSimulate = !draftComplete;

  // Compute ranks for best available and best fit
  function getPositionRank(player: Player): number {
    const samePosProspects = allProspects.filter(p => p.position === player.position);
    return samePosProspects.findIndex(p => p.id === player.id) + 1;
  }
  function getOverallRank(player: Player): number {
    return allProspects.findIndex(p => p.id === player.id) + 1;
  }

  const teamColor = currentTeam?.primaryColor ?? '#374151';
  const nextPickRound = Math.ceil(nextPickOverall / 32) || 1;
  const nextPickInRound = ((nextPickOverall - 1) % 32) + 1;

  return (
    <div className="space-y-0">
      {/* On The Clock Header */}
      <div
        className="rounded-t-xl border border-[var(--border)] px-5 py-4"
        style={{ borderLeft: `4px solid ${teamColor}` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Team badge */}
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0"
              style={{ backgroundColor: teamColor }}
            >
              {currentTeam?.abbreviation ?? '--'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg">On The Clock</span>
                {isUserPick && (
                  <Badge variant="green" size="sm">Your Pick</Badge>
                )}
              </div>
              <div className="text-sm text-[var(--text-sec)]">
                {currentTeam ? `${currentTeam.city} ${currentTeam.name}` : 'Draft Complete'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold">
              Round {currentRound}, Pick {currentPickInRound}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Button onClick={simDraftPick} size="sm" variant="secondary" disabled={!canSimulate}>
                Sim Pick
              </Button>
              <Button onClick={simToUserDraftPick} size="sm" variant="secondary" disabled={!canSimulate}>
                To My Pick
              </Button>
              <Button onClick={() => { simToEndDraft(); advanceToFreeAgency(); onSimAll?.(); }} size="sm" variant="secondary" disabled={!canSimulate}>
                Sim All
              </Button>
              {draftComplete && (
                <Button onClick={() => { advanceToFreeAgency(); onSimAll?.(); }} size="sm">
                  Free Agency →
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Needs Row */}
      <div className="border-x border-[var(--border)] px-5 py-3 bg-[var(--surface)]" style={{ borderLeft: `4px solid ${teamColor}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-[var(--text-sec)] uppercase">Needs</span>
            <div className="flex gap-1">
              {needs.map(need => (
                <Badge
                  key={need.position}
                  variant={need.needScore >= 40 ? 'red' : need.needScore >= 25 ? 'amber' : 'default'}
                  size="sm"
                >
                  {need.position}
                </Badge>
              ))}
            </div>
          </div>
          <div className="text-xs text-[var(--text-sec)]">
            {currentTeam
              ? `${currentTeam.record.wins}-${currentTeam.record.losses}, ${currentTeam.conference} ${currentTeam.division}`
              : '--'}
          </div>
        </div>
      </div>

      {/* Best Available + Best Fit */}
      {!draftComplete && (
        <div
          className="border-x border-[var(--border)] px-5 py-4 bg-[var(--surface-2)]"
          style={{ borderLeft: `4px solid ${teamColor}` }}
        >
          <div className="flex gap-4">
            {bestAvailable && (
              <ProspectCard
                label="Best Available"
                player={bestAvailable}
                posRank={getPositionRank(bestAvailable)}
                ovrRank={getOverallRank(bestAvailable)}
                teamColor="#6b7280"
              />
            )}
            {bestFit && (
              <ProspectCard
                label={bestFit.id === bestAvailable?.id ? "Best Fit (Same)" : "Best Fit"}
                player={bestFit}
                posRank={getPositionRank(bestFit)}
                ovrRank={getOverallRank(bestFit)}
                teamColor={teamColor}
              />
            )}
          </div>
        </div>
      )}

      {/* Next Pick Preview */}
      {nextPickTeam && !draftComplete && (
        <div
          className="rounded-b-xl border border-[var(--border)] px-5 py-3 bg-[var(--surface)]"
          style={{ borderLeft: `4px solid ${nextPickTeam.primaryColor ?? '#374151'}` }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-xs font-bold text-[var(--text-sec)] uppercase">Next Pick</div>
              <div
                className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-black text-white"
                style={{ backgroundColor: nextPickTeam.primaryColor ?? '#374151' }}
              >
                {nextPickTeam.abbreviation.slice(0, 2)}
              </div>
              <div>
                <span className="text-sm font-semibold">{nextPickTeam.city} {nextPickTeam.name}</span>
                <div className="text-xs text-[var(--text-sec)]">
                  Needs: {nextPickNeeds.slice(0, 3).map(n => n.position).join(', ')}
                </div>
              </div>
            </div>
            <div className="text-xs font-bold text-[var(--text-sec)]">
              Round {nextPickRound}, Pick {nextPickInRound}
            </div>
          </div>
        </div>
      )}

      {/* Draft complete state */}
      {draftComplete && (
        <div className="rounded-b-xl border border-[var(--border)] px-5 py-4 bg-[var(--surface)]">
          <div className="text-center">
            <span className="font-bold text-green-400">Draft Complete!</span>
            <span className="text-sm text-[var(--text-sec)] ml-2">Advance to Free Agency to continue.</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Draft Page
// ---------------------------------------------------------------------------

export default function DraftPage() {
  const router = useRouter();
  const {
    phase,
    players,
    freeAgents,
    draftOrder,
    draftResults,
    userTeamId,
    teams,
    draftScoutingData,
    scoutingLevel,
    draftPlayer,
    simDraftPick,
    simToUserDraftPick,
    simToEndDraft,
    advanceToFreeAgency,
    setScoutingLevel,
    deepScoutPlayer,
  } = useGameStore();

  const deepScoutedCount = Object.values(draftScoutingData).filter(d => d.deepScouted).length;

  const [selectedRound, setSelectedRound] = useState(1);
  const [positionFilter, setPositionFilter] = useState<Position | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [scoutPlayerId, setScoutPlayerId] = useState<string | null>(null);

  if (phase !== 'draft') {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <h2 className="text-2xl font-black mb-3">NFL Draft</h2>
          <p className="text-[var(--text-sec)] mb-6">
            {phase === 'regular' ? 'The draft begins after the playoffs. Sim the season and compete for a title first.' :
             phase === 'playoffs' ? 'The draft begins after the playoffs conclude. Keep simulating!' :
             "The draft hasn't started yet."}
          </p>
          <div className="flex gap-3 justify-center">
            <a href="/" className="text-sm text-blue-400 hover:underline">Go to Dashboard</a>
            <a href="/standings" className="text-sm text-blue-400 hover:underline">View Schedule</a>
          </div>
        </div>
      </GameShell>
    );
  }

  const totalRounds = 7;
  const picksPerRound = teams.length;
  const totalPicks = picksPerRound * totalRounds;
  const currentPickTeamId = draftOrder[0];
  const isUserPick = currentPickTeamId === userTeamId;
  const draftComplete = draftOrder.length === 0 || freeAgents.length === 0;
  const currentOverallPick = totalPicks - draftOrder.length + 1;
  const currentRound = Math.min(totalRounds, Math.max(1, Math.ceil(currentOverallPick / picksPerRound)));
  const currentPickInRound = ((currentOverallPick - 1) % picksPerRound) + 1;

  function getTeamNeeds(teamId: string) {
    const roster = players.filter((player) => player.teamId === teamId);
    return POSITIONS.map((position) => {
      const limits = ROSTER_LIMITS[position];
      const depth = roster
        .filter((player) => player.position === position)
        .sort((a, b) => b.ratings.overall - a.ratings.overall);
      const count = depth.length;
      const starterOvr = depth[0]?.ratings.overall ?? 0;
      const target = Math.ceil((limits.min + limits.max) / 2);
      const minGap = Math.max(0, limits.min - count);
      const depthGap = Math.max(0, target - count);
      const qualityGap = Math.max(0, 72 - starterOvr);
      const needScore = minGap * 30 + depthGap * 8 + qualityGap;
      return { position, limits, count, starterOvr, needScore };
    }).sort((a, b) => b.needScore - a.needScore);
  }

  const allProspects = freeAgents
    .map((id) => players.find((player) => player.id === id))
    .filter((player): player is Player => Boolean(player))
    .sort((a, b) => {
      // Sort by scouted OVR (what the user actually sees), not real OVR
      const aScout = draftScoutingData[a.id];
      const bScout = draftScoutingData[b.id];
      const aOvr = aScout ? aScout.scoutedOvr : a.ratings.overall;
      const bOvr = bScout ? bScout.scoutedOvr : b.ratings.overall;
      // K/P are least valuable — push them way down the draft board
      const aAdj = (a.position === 'K' || a.position === 'P') ? aOvr * 0.5 : aOvr;
      const bAdj = (b.position === 'K' || b.position === 'P') ? bOvr * 0.5 : bOvr;
      return bAdj - aAdj;
    });

  const prospects = allProspects
    .filter((player) => positionFilter === 'ALL' || player.position === positionFilter)
    .filter((player) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return `${player.firstName} ${player.lastName}`.toLowerCase().includes(query);
    })
    .slice(0, 30);

  const currentTeam = teams.find((team) => team.id === currentPickTeamId);
  const nextPickTeam = teams.find((team) => team.id === draftOrder[1]);
  const currentTeamNeeds = currentPickTeamId ? getTeamNeeds(currentPickTeamId) : [];
  const nextPickNeeds = draftOrder[1] ? getTeamNeeds(draftOrder[1]).slice(0, 3) : [];
  const myNeeds = getTeamNeeds(userTeamId).slice(0, 5);
  const bestAvailable = allProspects[0];
  const bestFit = !currentPickTeamId
    ? null
    : [...allProspects].sort((a, b) => {
        const needs = getTeamNeeds(currentPickTeamId);
        const aNeed = needs.find((n) => n.position === a.position)?.needScore ?? 0;
        const bNeed = needs.find((n) => n.position === b.position)?.needScore ?? 0;
        let aScore = a.ratings.overall + a.potential * 0.4 + aNeed * 0.2;
        let bScore = b.ratings.overall + b.potential * 0.4 + bNeed * 0.2;
        // K/P are least valuable — heavily penalize in draft rankings
        if (a.position === 'K' || a.position === 'P') aScore *= 0.5;
        if (b.position === 'K' || b.position === 'P') bScore *= 0.5;
        return bScore - aScore;
      })[0];

  const orderedTeamIds = [
    ...draftResults.sort((a, b) => a.overallPick - b.overallPick).map((result) => result.teamId),
    ...draftOrder,
  ];
  const roundStart = (selectedRound - 1) * picksPerRound;
  const roundRows = Array.from({ length: picksPerRound }, (_, index) => {
    const overallPick = roundStart + index + 1;
    const team = teams.find((item) => item.id === orderedTeamIds[overallPick - 1]);
    const result = draftResults.find((item) => item.overallPick === overallPick);
    const player = result ? players.find((item) => item.id === result.playerId) : null;
    return { overallPick, pickInRound: index + 1, team, player };
  });

  const recentPicks = [...draftResults]
    .sort((a, b) => b.overallPick - a.overallPick)
    .slice(0, 6)
    .map((pick) => {
      const player = players.find((p) => p.id === pick.playerId);
      const team = teams.find((t) => t.id === pick.teamId);
      return { pick, player, team };
    });

  return (
    <GameShell>
      <div className="max-w-7xl mx-auto space-y-4">
        <h2 className="text-2xl font-black">NFL Draft</h2>

        {/* On The Clock */}
        <OnTheClockSection
          currentTeam={currentTeam}
          currentRound={currentRound}
          currentPickInRound={currentPickInRound}
          currentOverallPick={currentOverallPick}
          bestAvailable={bestAvailable}
          bestFit={bestFit}
          needs={currentTeamNeeds.slice(0, 5)}
          nextPickTeam={nextPickTeam}
          nextPickOverall={currentOverallPick + 1}
          nextPickNeeds={nextPickNeeds}
          allProspects={allProspects}
          draftComplete={draftComplete}
          isUserPick={isUserPick}
          simDraftPick={simDraftPick}
          simToUserDraftPick={simToUserDraftPick}
          simToEndDraft={simToEndDraft}
          advanceToFreeAgency={advanceToFreeAgency}
          onSimAll={() => router.push('/free-agency')}
        />

        <div className="grid grid-cols-12 gap-4">
          {/* Top Prospects */}
          <Card className="col-span-12 lg:col-span-6">
            <CardHeader>
              <CardTitle>Top Prospects</CardTitle>
              <div className="flex items-center gap-2">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search player"
                  className="h-8 px-2 text-xs rounded border border-[var(--border)] bg-[var(--surface-2)]"
                />
                <select
                  value={positionFilter}
                  onChange={(event) => setPositionFilter(event.target.value as Position | 'ALL')}
                  className="h-8 px-2 text-xs rounded border border-[var(--border)] bg-[var(--surface-2)]"
                >
                  <option value="ALL">All</option>
                  {POSITIONS.map((position) => (
                    <option key={position} value={position}>
                      {position}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            {/* Scouting level selector */}
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-[var(--text-sec)]">Scouting Level:</span>
              <select
                value={scoutingLevel}
                onChange={e => setScoutingLevel(Number(e.target.value) as 0|1|2|3|4)}
                className="h-7 px-2 text-xs rounded border border-[var(--border)] bg-[var(--surface-2)]"
              >
                {SCOUTING_LEVEL_LABELS.map((label, i) => (
                  <option key={i} value={i}>{label}</option>
                ))}
              </select>
              <span className="text-xs text-[var(--text-sec)]">
                Deep scouts: {deepScoutedCount}/5
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                  <th className="text-left pb-2 pl-2">#</th>
                  <th className="text-left pb-2">Player</th>
                  <th className="text-center pb-2">Pos</th>
                  <th className="text-center pb-2">OVR Range</th>
                  <th className="text-center pb-2">Pot</th>
                  <th className="text-right pb-2 pr-2">Draft</th>
                </tr>
              </thead>
              <tbody>
                {prospects.map((player, index) => {
                  const scout = draftScoutingData[player.id];
                  const displayOvr = scout
                    ? `${Math.max(20, scout.scoutedOvr - scout.error)}–${Math.min(99, scout.scoutedOvr + scout.error)}`
                    : String(player.ratings.overall);
                  const ovrForColor = scout ? scout.scoutedOvr : player.ratings.overall;
                  return (
                    <tr key={player.id} className={`border-t border-[var(--border)] hover:bg-[var(--surface-2)] ${scout?.deepScouted ? 'bg-blue-500/5' : ''}`}>
                      <td className="py-2 pl-2 text-[var(--text-sec)]">{index + 1}</td>
                      <td className="py-2">
                        <div className="font-semibold">{player.firstName} {player.lastName}</div>
                        {player.scoutingLabel && (
                          <div className="text-[10px] text-[var(--text-sec)]">{player.scoutingLabel}</div>
                        )}
                      </td>
                      <td className="py-2 text-center"><Badge>{player.position}</Badge></td>
                      <td className={`py-2 text-center font-bold ${ratingColor(ovrForColor)}`}>
                        {displayOvr}
                        {scout?.deepScouted && <span className="ml-1 text-[10px] text-blue-400">🔍</span>}
                      </td>
                      <td className={`py-2 text-center text-xs ${potentialColor(player.potential, player.experience)}`}>{potentialLabel(player.potential, player.experience)}</td>
                      <td className="py-2 pr-2 text-right">
                        <div className="flex gap-1 justify-end">
                          {isUserPick && scout && !scout.deepScouted && deepScoutedCount < 5 && (
                            <Button size="sm" variant="ghost" onClick={() => { deepScoutPlayer(player.id); setScoutPlayerId(player.id); }}>
                              Scout
                            </Button>
                          )}
                          {scout?.deepScouted && (
                            <Button size="sm" variant="ghost" onClick={() => setScoutPlayerId(player.id)}>
                              🔍
                            </Button>
                          )}
                          {isUserPick ? (
                            <Button size="sm" onClick={() => draftPlayer(player.id)}>
                              Draft
                            </Button>
                          ) : (
                            <span className="text-xs text-[var(--text-sec)]">Waiting...</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Draft Results */}
          <Card className="col-span-12 lg:col-span-6">
            <CardHeader>
              <CardTitle>Draft Results</CardTitle>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalRounds }, (_, index) => {
                  const round = index + 1;
                  return (
                    <button
                      key={round}
                      onClick={() => setSelectedRound(round)}
                      className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                        selectedRound === round
                          ? 'bg-blue-600 text-white'
                          : 'bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)]'
                      }`}
                    >
                      {round}
                    </button>
                  );
                })}
              </div>
            </CardHeader>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                  <th className="text-left pb-2 pl-2">Pick</th>
                  <th className="text-left pb-2">Team</th>
                  <th className="text-left pb-2">Player</th>
                  <th className="text-center pb-2">Pos</th>
                  <th className="text-center pb-2">Grade</th>
                </tr>
              </thead>
              <tbody>
                {roundRows.map((row) => (
                  <tr key={row.overallPick} className="border-t border-[var(--border)]">
                    <td className="py-2 pl-2 text-[var(--text-sec)]">{row.pickInRound} ({row.overallPick})</td>
                    <td className="py-2 font-semibold">{row.team?.abbreviation ?? '--'}</td>
                    <td className="py-2">{row.player ? `${row.player.firstName} ${row.player.lastName}` : '--'}</td>
                    <td className="py-2 text-center">{row.player ? <Badge>{row.player.position}</Badge> : '--'}</td>
                    <td className="py-2 text-center">
                      {row.player ? (() => {
                        const g = pickGrade(row.overallPick, totalPicks, row.player.ratings.overall);
                        return <span className={`font-bold text-xs ${gradeColor(g)}`}>{g}</span>;
                      })() : (
                        '--'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* Draft Recap - Team Grades (shown when draft is complete) */}
        {draftComplete && draftResults.length > 0 && (() => {
          // Compute team grades
          const teamGrades = teams.map(t => {
            const teamPicks = draftResults.filter(r => r.teamId === t.id);
            if (teamPicks.length === 0) return { team: t, grade: 'N/A', avgVal: 0, picks: 0, bestPick: null as null | { player: Player | undefined; grade: string; overallPick: number } };
            const grades = teamPicks.map(p => {
              const pl = players.find(pp => pp.id === p.playerId);
              const g = pl ? pickGrade(p.overallPick, totalPicks, pl.ratings.overall) : 'C';
              return { grade: g, val: gradeValue(g), player: pl, overallPick: p.overallPick };
            });
            const avgVal = grades.reduce((s, g) => s + g.val, 0) / grades.length;
            const best = grades.sort((a, b) => b.val - a.val)[0];
            return {
              team: t,
              grade: teamDraftGrade(avgVal),
              avgVal,
              picks: teamPicks.length,
              bestPick: best ? { player: best.player, grade: best.grade, overallPick: best.overallPick } : null,
            };
          }).sort((a, b) => b.avgVal - a.avgVal);

          return (
            <Card className="col-span-12">
              <CardHeader>
                <CardTitle>Draft Recap — Team Grades</CardTitle>
              </CardHeader>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                    <th className="text-left pb-2 pl-3">#</th>
                    <th className="text-left pb-2">Team</th>
                    <th className="text-center pb-2">Grade</th>
                    <th className="text-center pb-2">Picks</th>
                    <th className="text-left pb-2">Best Pick</th>
                  </tr>
                </thead>
                <tbody>
                  {teamGrades.map((tg, idx) => (
                    <tr key={tg.team.id} className={`border-t border-[var(--border)] ${tg.team.id === userTeamId ? 'bg-blue-500/10' : ''}`}>
                      <td className="py-1.5 pl-3 text-[var(--text-sec)] text-xs">{idx + 1}</td>
                      <td className="py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-black text-white shrink-0" style={{ backgroundColor: tg.team.primaryColor }}>
                            {tg.team.abbreviation}
                          </div>
                          <span className={`font-medium ${tg.team.id === userTeamId ? 'text-blue-400' : ''}`}>{tg.team.city} {tg.team.name}</span>
                        </div>
                      </td>
                      <td className={`py-1.5 text-center font-black text-lg ${gradeColor(tg.grade)}`}>{tg.grade}</td>
                      <td className="py-1.5 text-center text-[var(--text-sec)]">{tg.picks}</td>
                      <td className="py-1.5 text-sm">
                        {tg.bestPick?.player ? (
                          <span>
                            #{tg.bestPick.overallPick} {tg.bestPick.player.firstName} {tg.bestPick.player.lastName} ({tg.bestPick.player.position}, {tg.bestPick.player.ratings.overall} OVR) — <span className={gradeColor(tg.bestPick.grade)}>{tg.bestPick.grade}</span>
                          </span>
                        ) : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })()}

        <div className="grid grid-cols-12 gap-4">
          {/* Your Needs */}
          <Card className="col-span-12 lg:col-span-6">
            <CardHeader>
              <CardTitle>Your Needs</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {myNeeds.map((need, index) => (
                <div key={need.position} className="flex items-center justify-between border border-[var(--border)] rounded-md px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-sec)]">#{index + 1}</span>
                    <Badge variant={need.needScore >= 40 ? 'red' : need.needScore >= 25 ? 'amber' : 'default'}>
                      {need.position}
                    </Badge>
                  </div>
                  <span className="text-[var(--text-sec)]">{need.count}/{need.limits.max}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Recent Picks */}
          <Card className="col-span-12 lg:col-span-6">
            <CardHeader>
              <CardTitle>Recent Picks</CardTitle>
            </CardHeader>
            <div className="space-y-2 text-sm">
              {recentPicks.length === 0 && <div className="text-[var(--text-sec)]">No picks yet.</div>}
              {recentPicks.map(({ pick, player, team }) => (
                <div key={pick.overallPick} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {team && (
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black text-white"
                        style={{ backgroundColor: team.primaryColor }}
                      >
                        {team.abbreviation.slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold">#{pick.overallPick} {team?.abbreviation ?? '--'} - {player?.lastName ?? '--'}</div>
                      <div className="text-xs text-[var(--text-sec)]">{player ? `${player.position} ${player.ratings.overall} · Pot: ${potentialLabel(player.potential, player.experience)}` : '--'}</div>
                    </div>
                  </div>
                  {player ? (() => {
                    const g = pickGrade(pick.overallPick, totalPicks, player.ratings.overall);
                    return <span className={`font-bold text-xs ${gradeColor(g)}`}>{g}</span>;
                  })() : <span className="text-[var(--text-sec)]">--</span>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Scouting Report Modal */}
      {scoutPlayerId && (() => {
        const sp = players.find(p => p.id === scoutPlayerId);
        const scout = draftScoutingData[scoutPlayerId];
        if (!sp || !scout) return null;

        const weights = POSITION_WEIGHTS[sp.position];
        const keyRatings = Object.entries(weights)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .map(([key, weight]) => ({
            key: key as keyof PlayerRatings,
            weight: weight as number,
            label: key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()),
          }));

        // After deep scout, show tighter OVR range
        const ovrLow = Math.max(20, scout.scoutedOvr - scout.error);
        const ovrHigh = Math.min(99, scout.scoutedOvr + scout.error);

        // Generate scouted rating ranges for key attributes (fuzzy based on error)
        const ratingRanges = keyRatings.map(r => {
          const real = sp.ratings[r.key] as number;
          const noise = Math.round((Math.random() - 0.5) * scout.error * 1.5);
          const scouted = Math.max(20, Math.min(99, real + noise));
          return {
            ...r,
            low: Math.max(20, scouted - scout.error),
            high: Math.min(99, scouted + scout.error),
            scouted,
          };
        });

        // Strengths & weaknesses
        const sorted = [...ratingRanges].sort((a, b) => b.scouted - a.scouted);
        const strengths = sorted.filter(r => r.weight >= 2).slice(0, 3);
        const weaknesses = sorted.filter(r => r.weight >= 1).slice(-2);

        // Comparison to team need
        const userNeed = getTeamNeeds(userTeamId).find(n => n.position === sp.position);
        const fitScore = userNeed ? Math.min(100, userNeed.needScore * 2) : 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setScoutPlayerId(null)}>
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
                <div>
                  <h3 className="text-xl font-black">{sp.firstName} {sp.lastName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge>{sp.position}</Badge>
                    <span className="text-sm text-[var(--text-sec)]">Age {sp.age}</span>
                    {sp.scoutingLabel && <span className="text-xs text-[var(--text-sec)] italic">{sp.scoutingLabel}</span>}
                  </div>
                </div>
                <button onClick={() => setScoutPlayerId(null)} className="text-[var(--text-sec)] hover:text-white text-xl">✕</button>
              </div>

              <div className="p-5 space-y-5">
                {/* Scout's Summary */}
                {(() => {
                  // Build a qualitative scouting report from prospect attributes
                  const ovr = scout.scoutedOvr;
                  const pot = sp.potential;
                  const age = sp.age;
                  const pos = sp.position;
                  const topRating = strengths[0];
                  const topWeakness = weaknesses[weaknesses.length - 1] ?? weaknesses[0];
                  const potLabel = potentialLabel(pot, sp.experience);

                  // Ceiling/floor assessment
                  const ceilingLines: Record<string, string[]> = {
                    'Elite': ['franchise cornerstone', 'perennial All-Pro candidate', 'generational talent at the position'],
                    'High': ['long-term starter with Pro Bowl upside', 'potential top-10 player at his position', 'high-ceiling starter who could anchor the position'],
                    'Average': ['solid starter who can hold down the position', 'dependable contributor with room to grow', 'starter-caliber player with a steady floor'],
                    'Low': ['rotational piece or situational contributor', 'depth player who may develop into a spot starter', 'limited ceiling but can fill a role immediately'],
                  };
                  const ceilingPool = ceilingLines[potLabel] ?? ceilingLines['Average'];
                  const ceiling = ceilingPool[Math.abs(sp.id.charCodeAt(0)) % ceilingPool.length];

                  // Playing style based on position + top strength
                  const styleMap: Record<string, Record<string, string>> = {
                    QB: { throwing: 'pure pocket passer with excellent arm talent', awareness: 'smart, cerebral quarterback who reads defenses well', speed: 'dual-threat quarterback who can extend plays with his legs', agility: 'elusive scrambler with good improvisational skills' },
                    RB: { carrying: 'between-the-tackles bruiser with reliable ball security', speed: 'explosive home-run hitter who can take it to the house', agility: 'shifty runner who makes defenders miss in space', strength: 'powerful downhill runner who breaks tackles' },
                    WR: { catching: 'reliable pass-catcher with soft hands and great body control', speed: 'deep threat with elite straight-line speed', agility: 'crisp route-runner who creates separation underneath' },
                    TE: { catching: 'receiving threat who can stretch the seam', blocking: 'strong in-line blocker who holds up at the point of attack', strength: 'physical mismatch who can both block and catch', speed: 'athletic move tight end who can split out wide' },
                    OL: { blocking: 'technically sound blocker with good fundamentals', strength: 'powerful run blocker who moves people at the point of attack', awareness: 'smart lineman who picks up blitzes and stunts well' },
                    DL: { passRush: 'disruptive pass rusher who can collapse the pocket', strength: 'stout run defender who commands double teams', speed: 'explosive first step that gives tackles fits', tackling: 'disciplined defender who holds his gap and finishes plays' },
                    LB: { tackling: 'sure tackler who flies to the ball', coverage: 'versatile coverage linebacker who can match up with backs', speed: 'sideline-to-sideline athlete with elite range', awareness: 'instinctive defender who diagnoses plays quickly' },
                    CB: { coverage: 'lockdown corner who can shadow top receivers', speed: 'blazing speed that recovers on deep routes', agility: 'fluid athlete who mirrors receivers in and out of breaks' },
                    S: { coverage: 'ball-hawking safety with great range in center field', tackling: 'physical enforcer who supports the run game', speed: 'elite range safety who covers ground sideline to sideline', awareness: 'smart safety who reads quarterback eyes and jumps routes' },
                    K: { kicking: 'strong-legged kicker with good accuracy from distance' },
                    P: { kicking: 'booming punter who can flip field position' },
                  };
                  const posStyles = styleMap[pos] ?? {};
                  const style = (topRating && posStyles[topRating.key]) ?? `solid prospect at the ${pos} position`;

                  // Concern based on scouting label + weakness
                  const concernMap: Record<string, string> = {
                    'Injury history': 'Medical staff flagged durability concerns that could affect his availability.',
                    'Character concerns': 'Some off-field question marks that teams will want to vet thoroughly.',
                    'Raw but explosive': 'Still raw and needs time to develop, but the physical tools are tantalizing.',
                    'High motor': 'Plays with relentless effort and energy — coaches love his motor.',
                    'Pro-ready': 'One of the more polished prospects in this class — could contribute from day one.',
                    'Combine standout': 'Put up elite testing numbers that had scouts buzzing.',
                  };
                  const labelNote = sp.scoutingLabel ? concernMap[sp.scoutingLabel] ?? '' : '';

                  // Weakness note
                  const weakNote = topWeakness
                    ? `Scouts want to see improvement in ${topWeakness.label.toLowerCase()} before projecting him as a full-time starter.`
                    : '';

                  // Projected round
                  const roundProj = ovr >= 75 ? 'first-round talent' : ovr >= 65 ? 'Day 1-2 pick' : ovr >= 55 ? 'Day 2-3 prospect' : 'late-round flier';

                  return (
                    <div className="bg-[var(--surface-2)] rounded-xl p-4 border-l-2 border-blue-500">
                      <div className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold mb-1.5">Scout&apos;s Report</div>
                      <p className="text-sm leading-relaxed text-[var(--text)]">
                        {sp.lastName} is a {roundProj} — a {style}. Our scouts see his ceiling as a {ceiling}.
                        {labelNote && ` ${labelNote}`}
                        {weakNote && ` ${weakNote}`}
                      </p>
                    </div>
                  );
                })()}

                {/* OVR & Potential */}
                <div className="flex gap-4">
                  <div className="flex-1 bg-[var(--surface-2)] rounded-xl p-4 text-center">
                    <div className="text-xs text-[var(--text-sec)] uppercase tracking-wider mb-1">Projected OVR</div>
                    <div className={`text-3xl font-black ${ratingColor(scout.scoutedOvr)}`}>{ovrLow}–{ovrHigh}</div>
                  </div>
                  <div className="flex-1 bg-[var(--surface-2)] rounded-xl p-4 text-center">
                    <div className="text-xs text-[var(--text-sec)] uppercase tracking-wider mb-1">Potential</div>
                    <div className={`text-3xl font-black ${potentialColor(sp.potential, sp.experience)}`}>
                      {potentialLabel(sp.potential, sp.experience)}
                    </div>
                  </div>
                  <div className="flex-1 bg-[var(--surface-2)] rounded-xl p-4 text-center">
                    <div className="text-xs text-[var(--text-sec)] uppercase tracking-wider mb-1">Team Fit</div>
                    <div className={`text-3xl font-black ${fitScore >= 60 ? 'text-green-400' : fitScore >= 30 ? 'text-amber-400' : 'text-[var(--text-sec)]'}`}>
                      {fitScore >= 60 ? '🔥' : fitScore >= 30 ? '👍' : '—'}
                    </div>
                  </div>
                </div>

                {/* Key Ratings */}
                <div>
                  <h4 className="text-xs text-[var(--text-sec)] uppercase tracking-wider mb-2 font-semibold">Scouted Ratings</h4>
                  <div className="space-y-2">
                    {ratingRanges.map(r => {
                      const pct = ((r.scouted - 20) / 79) * 100;
                      return (
                        <div key={r.key} className="flex items-center gap-3">
                          <span className="text-xs w-20 text-right text-[var(--text-sec)]">{r.label}</span>
                          <div className="flex-1 h-5 bg-[var(--surface-2)] rounded-full relative overflow-hidden">
                            <div
                              className={`h-full rounded-full ${r.scouted >= 75 ? 'bg-green-500' : r.scouted >= 60 ? 'bg-blue-500' : r.scouted >= 45 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow">
                              {r.low}–{r.high}
                            </span>
                          </div>
                          {r.weight >= 3 && <span className="text-[10px] text-amber-400">★★★</span>}
                          {r.weight === 2 && <span className="text-[10px] text-amber-400">★★</span>}
                          {r.weight === 1 && <span className="text-[10px] text-[var(--text-sec)]">★</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Strengths & Weaknesses */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs text-green-400 uppercase tracking-wider mb-1.5 font-semibold">Strengths</h4>
                    {strengths.map(s => (
                      <div key={s.key} className="text-sm flex justify-between py-0.5">
                        <span>{s.label}</span>
                        <span className="text-green-400 font-bold">{s.low}–{s.high}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h4 className="text-xs text-red-400 uppercase tracking-wider mb-1.5 font-semibold">Weaknesses</h4>
                    {weaknesses.map(w => (
                      <div key={w.key} className="text-sm flex justify-between py-0.5">
                        <span>{w.label}</span>
                        <span className="text-red-400 font-bold">{w.low}–{w.high}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Team Need Context */}
                {userNeed && (
                  <div className="bg-[var(--surface-2)] rounded-lg p-3">
                    <div className="text-xs text-[var(--text-sec)] uppercase tracking-wider mb-1">Team Need: {sp.position}</div>
                    <div className="text-sm">
                      Current depth: <span className="font-bold">{userNeed.count}/{userNeed.limits.max}</span>
                      {userNeed.starterOvr > 0 && <> · Best starter: <span className={`font-bold ${ratingColor(userNeed.starterOvr)}`}>{userNeed.starterOvr} OVR</span></>}
                      {userNeed.needScore >= 40 && <span className="ml-2 text-red-400 text-xs font-semibold">HIGH NEED</span>}
                      {userNeed.needScore >= 25 && userNeed.needScore < 40 && <span className="ml-2 text-amber-400 text-xs font-semibold">MODERATE NEED</span>}
                    </div>
                  </div>
                )}

                {/* Draft button */}
                {isUserPick && (
                  <Button className="w-full" onClick={() => { draftPlayer(scoutPlayerId); setScoutPlayerId(null); }}>
                    Draft {sp.firstName} {sp.lastName}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </GameShell>
  );
}
