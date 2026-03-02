'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import { POSITIONS, ROSTER_LIMITS } from '@/types';
import type { Player, Position, Team } from '@/types';

const SCOUTING_LEVEL_LABELS = ['Budget ($2M)', 'Standard ($4M)', 'Enhanced ($6M)', 'Elite ($8M)', 'Maximum ($10M)'];

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-400';
  if (val >= 65) return 'text-blue-400';
  if (val >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function expectedOvrForPick(overallPick: number, totalPicks: number): number {
  const progress = (overallPick - 1) / Math.max(1, totalPicks - 1);
  return Math.round(84 - progress * 26);
}

function pickGrade(overallPick: number, totalPicks: number, playerOvr: number): string {
  const delta = playerOvr - expectedOvrForPick(overallPick, totalPicks);
  if (delta >= 7) return 'A';
  if (delta >= 3) return 'B+';
  if (delta >= 0) return 'B';
  if (delta >= -3) return 'C+';
  if (delta >= -6) return 'C';
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
              <Button onClick={simToEndDraft} size="sm" variant="secondary" disabled={!canSimulate}>
                Sim All
              </Button>
              {draftComplete && (
                <Button onClick={advanceToFreeAgency} size="sm">
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
      // K/P are least valuable — push them way down the draft board
      const aOvr = (a.position === 'K' || a.position === 'P') ? a.ratings.overall * 0.5 : a.ratings.overall;
      const bOvr = (b.position === 'K' || b.position === 'P') ? b.ratings.overall * 0.5 : b.ratings.overall;
      return bOvr - aOvr;
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
                            <Button size="sm" variant="ghost" onClick={() => deepScoutPlayer(player.id)}>
                              Scout
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
                      {row.player ? (
                        <Badge variant="blue">{pickGrade(row.overallPick, totalPicks, row.player.ratings.overall)}</Badge>
                      ) : (
                        '--'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

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
                  <Badge variant="blue">
                    {player ? pickGrade(pick.overallPick, totalPicks, player.ratings.overall) : '--'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </GameShell>
  );
}
