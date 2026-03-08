'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import { ScoutingReportModal } from '@/components/draft/ScoutingReportModal';
// playerGen import removed — POSITION_WEIGHTS no longer needed
import { POSITIONS, ROSTER_LIMITS } from '@/types';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { Player, Position, Team } from '@/types';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { SCOUTING_LEVELS, maxDeepScouts } from '@/lib/subscription';
import { expectedOvrForPick, pickGrade, gradeValue, gradeColor, teamDraftGrade } from '@/lib/engine/draftGrades';

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-600';
  if (val >= 65) return 'text-blue-600';
  if (val >= 50) return 'text-amber-600';
  return 'text-red-600';
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
  ovrDisplay,
  subtitle,
  onDraft,
  onPlayerClick,
}: {
  label: string;
  player: Player | null | undefined;
  posRank: number;
  ovrRank: number;
  teamColor: string;
  ovrDisplay?: string;
  subtitle?: string;
  onDraft?: (playerId: string) => void;
  onPlayerClick?: (playerId: string) => void;
}) {
  if (!player) return null;
  return (
    <div className="flex-1 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="px-4 pt-3 pb-1">
        <div className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider">
          {label}
        </div>
        {subtitle && (
          <div className="text-[10px] text-[var(--text-sec)]/70 mt-0.5">{subtitle}</div>
        )}
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
            <button
              className="font-bold text-base truncate hover:text-blue-600 transition-colors text-left"
              onClick={() => onPlayerClick?.(player.id)}
            >
              {player.firstName} {player.lastName}
            </button>
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
            <div className={`text-lg font-black ${ovrDisplay ? 'text-indigo-600' : ratingColor(player.ratings.overall)}`}>
              {ovrDisplay ?? player.ratings.overall}
            </div>
            <div className="text-[10px] text-[var(--text-sec)] uppercase">{ovrDisplay ? 'Range' : 'OVR'}</div>
          </div>
        </div>
        {onDraft && (
          <button
            onClick={() => onDraft(player.id)}
            className="mt-3 w-full py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Draft Now
          </button>
        )}
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
  scoutsPick,
  scoutingLevel,
  draftScoutingData,
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
  onSimAll,
  onDraft,
  onPlayerClick,
}: {
  currentTeam: Team | undefined;
  currentRound: number;
  currentPickInRound: number;
  currentOverallPick: number;
  bestAvailable: Player | undefined;
  bestFit: Player | null | undefined;
  scoutsPick: Player | null | undefined;
  scoutingLevel: number;
  draftScoutingData: Record<string, { scoutedOvr: number; error: number; deepScouted: boolean }>;
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
  onSimAll?: () => void;
  onDraft?: (playerId: string) => void;
  onPlayerClick?: (playerId: string) => void;
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Team badge */}
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-xs sm:text-sm font-black text-white shrink-0"
              style={{ backgroundColor: teamColor }}
            >
              {currentTeam?.abbreviation ?? '--'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base sm:text-lg">On The Clock</span>
                {isUserPick && (
                  <Badge variant="green" size="sm">Your Pick</Badge>
                )}
              </div>
              <div className="text-xs sm:text-sm text-[var(--text-sec)]">
                {currentTeam ? `${currentTeam.city} ${currentTeam.name}` : 'Draft Complete'}
              </div>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs sm:text-sm font-bold mb-1 hidden sm:block">
              Round {currentRound}, Pick {currentPickInRound}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold sm:hidden">Rd {currentRound}, Pick {currentPickInRound}</span>
              <Button onClick={simDraftPick} size="sm" variant="secondary" disabled={!canSimulate}>
                Sim Pick
              </Button>
              <Button onClick={simToUserDraftPick} size="sm" variant="secondary" disabled={!canSimulate}>
                To My Pick
              </Button>
              <Button onClick={() => { onSimAll?.(); simToEndDraft(); }} size="sm" variant="secondary" disabled={!canSimulate}>
                Sim All
              </Button>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bestAvailable && (
              <ProspectCard
                label="Best Available"
                player={bestAvailable}
                posRank={getPositionRank(bestAvailable)}
                ovrRank={getOverallRank(bestAvailable)}
                teamColor="#6b7280"
                onDraft={isUserPick ? onDraft : undefined}
                onPlayerClick={onPlayerClick}
              />
            )}
            {bestFit && (
              <ProspectCard
                label={bestFit.id === bestAvailable?.id ? "Best Fit (Same)" : "Best Fit"}
                player={bestFit}
                posRank={getPositionRank(bestFit)}
                ovrRank={getOverallRank(bestFit)}
                teamColor={teamColor}
                onDraft={isUserPick ? onDraft : undefined}
                onPlayerClick={onPlayerClick}
              />
            )}
            {/* Your Scouts Say — scouting-influenced recommendation */}
            {scoutingLevel === 0 ? (
              <div className="flex-1 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] overflow-hidden opacity-60">
                <div className="px-4 pt-3 pb-1">
                  <div className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider">Your Scouts Say</div>
                  <div className="text-[10px] text-[var(--text-sec)]/70 mt-0.5">Entry Scouting</div>
                </div>
                <div className="px-4 pb-3 text-center py-4">
                  <div className="text-3xl mb-1">?</div>
                  <div className="text-xs text-[var(--text-sec)]">Upgrade scouting for better intel</div>
                </div>
              </div>
            ) : scoutsPick ? (
              <ProspectCard
                label={scoutsPick.id === bestFit?.id ? "Your Scouts Say (Same)" : "Your Scouts Say"}
                player={scoutsPick}
                posRank={getPositionRank(scoutsPick)}
                ovrRank={getOverallRank(scoutsPick)}
                teamColor="#6366f1"
                ovrDisplay={(() => {
                  const scout = draftScoutingData[scoutsPick.id];
                  if (!scout) return String(scoutsPick.ratings.overall);
                  const lo = Math.max(20, scout.scoutedOvr - scout.error);
                  const hi = Math.min(99, scout.scoutedOvr + scout.error);
                  return `${lo}–${hi}`;
                })()}
                subtitle={SCOUTING_LEVELS[scoutingLevel]?.name + ' Scouting'}
                onDraft={isUserPick ? onDraft : undefined}
                onPlayerClick={onPlayerClick}
              />
            ) : null}
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
              <TeamLogo abbreviation={nextPickTeam.abbreviation} primaryColor={nextPickTeam.primaryColor ?? '#374151'} secondaryColor={nextPickTeam.secondaryColor ?? '#fff'} size="sm" />
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
          <div className="text-center flex flex-wrap items-center justify-center gap-3">
            <span className="font-bold text-green-600">Draft Complete!</span>
            <Link href="/draft-recap" className="text-sm font-medium text-blue-600 hover:underline">
              View Draft Recap →
            </Link>
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
    setScoutingLevel,
    deepScoutPlayer,
  } = useGameStore();

  const { maxScoutingLevel: maxLevel, tier } = useSubscription();
  const deepScoutedCount = Object.values(draftScoutingData).filter(d => d.deepScouted).length;
  const deepScoutLimit = maxDeepScouts(tier);

  // Auto-redirect to free agency when draft completes and phase advances
  // (unless Sim All was clicked — that redirects to draft-recap instead)
  useEffect(() => {
    if (phase === 'freeAgency' && !(window as any).__simAllToRecap) {
      router.push('/free-agency');
    }
  }, [phase, router]);

  const [selectedRound, setSelectedRound] = useState(1);
  const [draftResultsTeamFilter, setDraftResultsTeamFilter] = useState<string>('ALL');
  const [positionFilter, setPositionFilter] = useState<Position | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  // scoutPlayerId removed — all scouting uses selectedProspectId + ScoutingReportModal
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);

  if (phase !== 'draft') {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <h2 className="text-2xl font-black mb-3">Draft</h2>
          <p className="text-[var(--text-sec)] mb-6">
            {phase === 'regular' ? 'The draft begins after the playoffs. Sim the season and compete for a title first.' :
             phase === 'playoffs' ? 'The draft begins after the playoffs conclude. Keep simulating!' :
             "The draft hasn't started yet."}
          </p>
          <div className="flex gap-3 justify-center">
            <a href="/" className="text-sm text-blue-600 hover:underline">Go to Dashboard</a>
            <a href="/standings" className="text-sm text-blue-600 hover:underline">View Schedule</a>
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
  const prospectCount = freeAgents.filter(id => {
    const p = players.find(pl => pl.id === id);
    return p && p.experience === 0;
  }).length;
  const draftComplete = draftOrder.length === 0 || prospectCount === 0;
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
      const starter = depth[0];
      const starterOvr = starter?.ratings.overall ?? 0;
      const starterName = starter ? `${starter.firstName} ${starter.lastName}` : '';
      const target = Math.ceil((limits.min + limits.max) / 2);
      const minGap = Math.max(0, limits.min - count);
      const depthGap = Math.max(0, target - count);
      const qualityGap = Math.max(0, 72 - starterOvr);
      const needScore = minGap * 30 + depthGap * 8 + qualityGap;
      return { position, limits, count, starterOvr, starterName, needScore };
    }).sort((a, b) => b.needScore - a.needScore);
  }

  const allProspects = freeAgents
    .map((id) => players.find((player) => player.id === id))
    .filter((player): player is Player => Boolean(player))
    .filter((player) => player.experience === 0)
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
    .slice(0, 50);

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
        // Use scouted OVR (what the user sees) so bestFit matches the prospect list
        const aScout = draftScoutingData[a.id];
        const bScout = draftScoutingData[b.id];
        const aOvr = aScout ? aScout.scoutedOvr : a.ratings.overall;
        const bOvr = bScout ? bScout.scoutedOvr : b.ratings.overall;
        let aScore = aOvr + a.potential * 0.4 + aNeed * 0.2;
        let bScore = bOvr + b.potential * 0.4 + bNeed * 0.2;
        // K/P are least valuable — heavily penalize in draft rankings
        if (a.position === 'K' || a.position === 'P') aScore *= 0.5;
        if (b.position === 'K' || b.position === 'P') bScore *= 0.5;
        return bScore - aScore;
      })[0];

  // "Your Scouts Say" — uses only scouted data (noisy OVR + noisy potential estimate)
  // At low scouting levels this will diverge from bestFit; at high levels they converge
  const scoutsPick = !currentPickTeamId
    ? null
    : [...allProspects].sort((a, b) => {
        const needs = getTeamNeeds(currentPickTeamId);
        const aNeed = needs.find((n) => n.position === a.position)?.needScore ?? 0;
        const bNeed = needs.find((n) => n.position === b.position)?.needScore ?? 0;
        const aScout = draftScoutingData[a.id];
        const bScout = draftScoutingData[b.id];
        const aOvr = aScout ? aScout.scoutedOvr : a.ratings.overall;
        const bOvr = bScout ? bScout.scoutedOvr : b.ratings.overall;
        // Noisy potential: estimate from scouted OVR + small random offset based on error
        const aError = aScout?.error ?? 12;
        const bError = bScout?.error ?? 12;
        const aPot = aOvr + Math.min(15, aError * 0.8);
        const bPot = bOvr + Math.min(15, bError * 0.8);
        let aScore = aOvr + aPot * 0.4 + aNeed * 0.25;
        let bScore = bOvr + bPot * 0.4 + bNeed * 0.25;
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
        <h2 className="text-2xl font-black">Draft</h2>

        {/* On The Clock */}
        <OnTheClockSection
          currentTeam={currentTeam}
          currentRound={currentRound}
          currentPickInRound={currentPickInRound}
          currentOverallPick={currentOverallPick}
          bestAvailable={bestAvailable}
          bestFit={bestFit}
          scoutsPick={scoutsPick}
          scoutingLevel={scoutingLevel}
          draftScoutingData={draftScoutingData}
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
          onSimAll={() => {
            (window as any).__simAllToRecap = true;
            // Navigate after simToEndDraft completes (called right after in OnTheClockSection)
            setTimeout(() => {
              router.push('/draft-recap');
              // Clear flag after navigation starts
              setTimeout(() => { (window as any).__simAllToRecap = false; }, 500);
            }, 0);
          }}
          onDraft={(playerId) => draftPlayer(playerId)}
          onPlayerClick={(playerId) => setSelectedProspectId(playerId)}
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
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[var(--text-sec)]">Scouting Level:</span>
              <select
                value={scoutingLevel}
                onChange={e => {
                  const val = Number(e.target.value) as 0|1|2;
                  if (val <= maxLevel) setScoutingLevel(val);
                }}
                className="h-7 px-2 text-xs rounded border border-[var(--border)] bg-[var(--surface-2)]"
                title={SCOUTING_LEVELS[scoutingLevel]?.tooltip}
              >
                {SCOUTING_LEVELS.map((level, i) => {
                  const locked = i > maxLevel;
                  return (
                    <option key={i} value={i} disabled={locked}>
                      {locked ? '🔒 ' : ''}{level.name}{locked ? ` (${level.tier === 'pro' ? 'Pro' : 'Elite'})` : ''}
                    </option>
                  );
                })}
              </select>
              <span className="text-xs text-[var(--text-sec)]">
                Deep scouts: {deepScoutedCount}/{deepScoutLimit === 999 ? '∞' : deepScoutLimit}
              </span>
              {maxLevel < 4 && (
                <a href="/pricing" className="text-[10px] text-blue-600 hover:underline ml-1">
                  Upgrade →
                </a>
              )}
            </div>
            <div className="overflow-x-auto">
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
                    <tr key={player.id} className={`border-t border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer ${scout?.deepScouted ? 'bg-blue-500/5' : ''}`} onClick={() => setSelectedProspectId(player.id)}>
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
                        {scout?.deepScouted && <span className="ml-1 text-[10px] text-blue-600">🔍</span>}
                      </td>
                      <td className={`py-2 text-center text-xs ${potentialColor(player.potential, player.experience)}`}>{potentialLabel(player.potential, player.experience)}</td>
                      <td className="py-2 pr-2 text-right">
                        <div className="flex gap-1 justify-end">
                          {isUserPick && scout && !scout.deepScouted && deepScoutedCount < deepScoutLimit && (
                            <span onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="ghost" onClick={() => { deepScoutPlayer(player.id); setSelectedProspectId(player.id); }}>
                                Scout
                              </Button>
                            </span>
                          )}
                          {scout?.deepScouted && (
                            <span onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="ghost" onClick={() => setSelectedProspectId(player.id)}>
                                🔍
                              </Button>
                            </span>
                          )}
                          {isUserPick ? (
                            <span onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" onClick={() => draftPlayer(player.id)}>
                                Draft
                              </Button>
                            </span>
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
            </div>
          </Card>

          {/* Draft Results */}
          <Card className="col-span-12 lg:col-span-6">
            <CardHeader>
              <CardTitle>Draft Results</CardTitle>
              <div className="flex items-center gap-2">
                <select
                  value={draftResultsTeamFilter}
                  onChange={e => setDraftResultsTeamFilter(e.target.value)}
                  className="h-7 px-2 text-xs rounded border border-[var(--border)] bg-[var(--surface-2)]"
                >
                  <option value="ALL">All Teams</option>
                  {/* User's team first */}
                  {teams.filter(t => t.id === userTeamId).map(t => (
                    <option key={t.id} value={t.id}>{t.city} {t.name} (You)</option>
                  ))}
                  {teams.filter(t => t.id !== userTeamId).sort((a, b) => a.city.localeCompare(b.city)).map(t => (
                    <option key={t.id} value={t.id}>{t.city} {t.name}</option>
                  ))}
                </select>
                {draftResultsTeamFilter === 'ALL' && (
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
                )}
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                  <th className="text-left pb-2 pl-2">Pick</th>
                  <th className="text-left pb-2">Team</th>
                  <th className="text-left pb-2">Player</th>
                  <th className="text-center pb-2">Pos</th>
                  <th className="text-center pb-2">OVR</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // When filtering by team, show all that team's picks across all rounds
                  const rows = draftResultsTeamFilter !== 'ALL'
                    ? draftResults
                        .filter(r => r.teamId === draftResultsTeamFilter)
                        .sort((a, b) => a.overallPick - b.overallPick)
                        .map(r => ({
                          overallPick: r.overallPick,
                          pickInRound: r.pickInRound,
                          team: teams.find(t => t.id === r.teamId),
                          player: players.find(p => p.id === r.playerId) ?? null,
                        }))
                    : roundRows;

                  return rows.map((row) => (
                    <tr key={row.overallPick} className={`border-t border-[var(--border)] ${row.team?.id === userTeamId ? 'bg-blue-500/5' : ''}`}>
                      <td className="py-2 pl-2 text-[var(--text-sec)]">
                        {draftResultsTeamFilter !== 'ALL'
                          ? `R${Math.ceil(row.overallPick / picksPerRound)}, #${row.overallPick}`
                          : `${row.pickInRound} (${row.overallPick})`
                        }
                      </td>
                      <td className="py-2 font-semibold">{row.team?.abbreviation ?? '--'}</td>
                      <td className="py-2">{row.player ? `${row.player.firstName} ${row.player.lastName}` : '--'}</td>
                      <td className="py-2 text-center">{row.player ? <Badge>{row.player.position}</Badge> : '--'}</td>
                      <td className="py-2 text-center">
                        {row.player ? (
                          <span className={`font-bold text-xs ${ratingColor(row.player.ratings.overall)}`}>{row.player.ratings.overall}</span>
                        ) : (
                          '--'
                        )}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
            </div>
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
              <div className="overflow-x-auto">
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
                          <TeamLogo abbreviation={tg.team.abbreviation} primaryColor={tg.team.primaryColor} secondaryColor={tg.team.secondaryColor} size="sm" />
                          <span className={`font-medium ${tg.team.id === userTeamId ? 'text-blue-600' : ''}`}>{tg.team.city} {tg.team.name}</span>
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
              </div>
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
                      <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />
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
      {selectedProspectId && (() => {
        const prospect = players.find(p => p.id === selectedProspectId);
        const scout = draftScoutingData[selectedProspectId];
        if (!prospect || !scout) return null;
        const canDeepScout = isUserPick && !scout.deepScouted && deepScoutedCount < deepScoutLimit;
        return (
          <ScoutingReportModal
            player={prospect}
            scoutingLevel={scoutingLevel}
            deepScouted={scout.deepScouted}
            scoutedOvr={scout.scoutedOvr}
            error={scout.error}
            onClose={() => setSelectedProspectId(null)}
            onDeepScout={canDeepScout ? () => deepScoutPlayer(selectedProspectId) : undefined}
            onDraft={isUserPick ? () => { draftPlayer(selectedProspectId); setSelectedProspectId(null); } : undefined}
            onScoutingLevelChange={setScoutingLevel}
            deepScoutCount={deepScoutedCount}
            deepScoutLimit={deepScoutLimit}
            isUserPick={isUserPick}
            teamNeeds={getTeamNeeds(userTeamId)}
            userTeamAbbr={teams.find(t => t.id === userTeamId)?.abbreviation}
          />
        );
      })()}
    </GameShell>
  );
}
