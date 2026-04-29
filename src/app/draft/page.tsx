'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGameStore, flushToStorage } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { SpectatorBanner } from '@/components/game/SpectatorBanner';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
// playerGen import removed — POSITION_WEIGHTS no longer needed
import { POSITIONS, ROSTER_LIMITS, formatRecord } from '@/types';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import type { Player, Position, Team, ImportedProspect } from '@/types';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { coarseOvrBucket } from '@/lib/subscription';
import { expectedOvrForPick, pickGrade, gradeValue, gradeColor, teamDraftGrade } from '@/lib/engine/draftGrades';
import { generateDraftScoutEval, publicConsensusBlurb, type DraftScoutEvaluation } from '@/lib/engine/draftScoutEval';
import { generateScoutingReport } from '@/lib/engine/scoutingReport';
import { FilmReviewContent } from '@/components/draft/FilmReviewContent';
import { InPersonEvalContent } from '@/components/draft/InPersonEvalContent';
import { FullEvalContent } from '@/components/draft/FullEvalContent';
import { TradePickModal } from '@/components/draft/TradePickModal';

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-600';
  if (val >= 65) return 'text-blue-600';
  if (val >= 50) return 'text-amber-600';
  return 'text-red-600';
}

// ---------------------------------------------------------------------------
// Draft Prospect Tags
// ---------------------------------------------------------------------------

function getProspectTag(player: Player, scouted: boolean): { label: string; color: string; bg: string } | null {
  const ovr = player.ratings.overall;
  const pot = player.potential;
  const rank = player.projectedRank ?? 999;

  if (pot >= 95 && ovr >= 80) return { label: 'Generational', color: 'text-purple-700', bg: 'bg-purple-100' };
  if (ovr >= 75) return { label: 'Pro-Ready', color: 'text-green-700', bg: 'bg-green-100' };
  if (pot >= 90 && ovr < 70) return { label: 'High Ceiling', color: 'text-blue-700', bg: 'bg-blue-100' };
  if (pot >= 85 && rank > 100) return { label: 'Diamond in the Rough', color: 'text-amber-700', bg: 'bg-amber-100' };
  if (pot >= 80 && ovr < 60) return { label: 'Project', color: 'text-orange-700', bg: 'bg-orange-100' };
  if (scouted && player.draftProfile === 'bust') return { label: 'Bust Risk', color: 'text-red-700', bg: 'bg-red-100' };
  if (Math.abs(ovr - pot) <= 5 && player.draftProfile !== 'bust') return { label: 'Safe Pick', color: 'text-gray-700', bg: 'bg-gray-100' };
  return null;
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
          <PlayerAvatar player={player} size="lg" teamColor={teamColor} />
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
            <div className="text-[10px] text-[var(--text-sec)] uppercase">Proj</div>
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
  bestFitIsNeedMatch,
  scoutsPick,
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
  onTradePick,
}: {
  currentTeam: Team | undefined;
  currentRound: number;
  currentPickInRound: number;
  currentOverallPick: number;
  bestAvailable: Player | undefined;
  bestFit: Player | null | undefined;
  bestFitIsNeedMatch: boolean;
  scoutsPick: Player | null | undefined;
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
  onTradePick?: () => void;
}) {
  const canSimulate = !draftComplete;

  // Compute ranks for best available and best fit
  function getPositionRank(player: Player): number {
    const samePosProspects = allProspects.filter(p => p.position === player.position);
    return samePosProspects.findIndex(p => p.id === player.id) + 1;
  }
  function getOverallRank(player: Player): number {
    return player.projectedRank ?? allProspects.findIndex(p => p.id === player.id) + 1;
  }

  const teamColor = currentTeam?.primaryColor ?? '#374151';
  const nextPickRound = Math.ceil(nextPickOverall / 32) || 1;
  const nextPickInRound = ((nextPickOverall - 1) % 32) + 1;

  return (
    <div className="space-y-0">
      {/* On The Clock Header */}
      <div
        className={`rounded-t-xl border border-[var(--border)] px-5 py-4${isUserPick ? ' border-transparent' : ''}`}
        style={isUserPick
          ? { background: `linear-gradient(135deg, ${teamColor}, ${currentTeam?.secondaryColor ?? teamColor})` }
          : { borderLeft: `4px solid ${teamColor}` }
        }
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Team badge */}
            <div
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-xs sm:text-sm font-black text-white shrink-0${isUserPick ? ' ring-4 ring-white/30 shadow-lg scale-110' : ''}`}
              style={{ backgroundColor: isUserPick ? 'rgba(255,255,255,0.2)' : teamColor }}
            >
              {currentTeam?.abbreviation ?? '--'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                {isUserPick ? (
                  <>
                    <span className="text-xl animate-pulse">⏰</span>
                    <span className="font-black text-xl sm:text-2xl" style={{ color: 'var(--team-text-on-primary)', textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>YOU&apos;RE ON THE CLOCK</span>
                  </>
                ) : (
                  <>
                    <span className="font-black text-base sm:text-lg">On The Clock</span>
                  </>
                )}
              </div>
              <div
                className="text-xs sm:text-sm"
                style={isUserPick ? { color: 'var(--team-text-on-primary)', opacity: 0.85 } : undefined}
              >
                <span className={isUserPick ? '' : 'text-[var(--text-sec)]'}>
                  {currentTeam ? `${currentTeam.city} ${currentTeam.name}` : 'Draft Complete'}
                </span>
              </div>
            </div>
          </div>
          <div className="sm:text-right">
            <div
              className="text-xs sm:text-sm font-bold mb-1 hidden sm:block"
              style={isUserPick ? { color: 'var(--team-text-on-primary)', textShadow: '0 1px 3px rgba(0,0,0,0.4)' } : undefined}
            >
              Round {currentRound}, Pick {currentPickInRound}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span
                className="text-xs font-bold sm:hidden w-full"
                style={isUserPick ? { color: 'var(--team-text-on-primary)', opacity: 0.85 } : undefined}
              >Rd {currentRound}, Pick {currentPickInRound}</span>
              {!isUserPick && (
                <Button onClick={simDraftPick} size="sm" variant="secondary" disabled={!canSimulate} className="flex-1 min-w-[80px]">
                  Sim Pick
                </Button>
              )}
              {!isUserPick && (
                <Button onClick={simToUserDraftPick} size="sm" variant="secondary" disabled={!canSimulate} className="flex-1 min-w-[80px]">
                  Sim to My Pick
                </Button>
              )}
              <Button onClick={() => onSimAll?.()} size="sm" variant="secondary" disabled={!canSimulate} className="flex-1 min-w-[80px]">
                <span className="hidden sm:inline">Auto-Draft All</span>
                <span className="sm:hidden">Auto All</span>
              </Button>
              {canSimulate && (
                <Button onClick={() => onTradePick?.()} size="sm" className="flex-1 min-w-[80px] bg-indigo-600 hover:bg-indigo-700 text-white">
                  <span className="hidden sm:inline">Trade Pick</span>
                  <span className="sm:hidden">Trade</span>
                </Button>
              )}
            </div>
          </div>
        </div>
        {isUserPick && (
          <div className="h-1 bg-white/20 rounded-full overflow-hidden mt-3">
            <div className="h-full bg-white/60 rounded-full" style={{ animation: 'shrink 30s linear forwards' }} />
          </div>
        )}
      </div>

      {/* Needs Row */}
      <div className="border-x border-[var(--border)] px-5 py-3 bg-[var(--surface)]" style={{ borderLeft: `4px solid ${teamColor}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-[var(--text-sec)] uppercase">Needs</span>
            <div className="flex flex-wrap gap-2">
              {needs.map(need => (
                <Badge
                  key={need.position}
                  variant={need.needScore >= 40 ? 'red' : need.needScore >= 25 ? 'amber' : 'default'}
                  size="sm"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center"
                >
                  {need.position}
                </Badge>
              ))}
            </div>
          </div>
          <div className="text-xs text-[var(--text-sec)]">
            {currentTeam
              ? `${formatRecord(currentTeam.record)}, ${currentTeam.conference} ${currentTeam.division}`
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
                ovrDisplay={(() => {
                  const scout = draftScoutingData[bestAvailable.id];
                  if (!scout) return undefined;
                  const cappedErr = Math.min(scout.error, 6);
                  const lo = Math.max(20, scout.scoutedOvr - cappedErr);
                  const hi = Math.min(99, scout.scoutedOvr + cappedErr);
                  return `${lo}–${hi}`;
                })()}
                onDraft={isUserPick ? onDraft : undefined}
                onPlayerClick={onPlayerClick}
              />
            )}
            {bestFit && (
              <ProspectCard
                label="Best Fit"
                subtitle={!bestFitIsNeedMatch ? 'No position need match' : undefined}
                player={bestFit}
                posRank={getPositionRank(bestFit)}
                ovrRank={getOverallRank(bestFit)}
                teamColor={teamColor}
                ovrDisplay={(() => {
                  const scout = draftScoutingData[bestFit.id];
                  if (!scout) return undefined;
                  const cappedErr = Math.min(scout.error, 6);
                  const lo = Math.max(20, scout.scoutedOvr - cappedErr);
                  const hi = Math.min(99, scout.scoutedOvr + cappedErr);
                  return `${lo}–${hi}`;
                })()}
                onDraft={isUserPick ? onDraft : undefined}
                onPlayerClick={onPlayerClick}
              />
            )}
            {/* Your Scouts Say — only shown when it's the user's pick */}
            {isUserPick && scoutsPick && (
              <ProspectCard
                label="Your Scouts Say"
                player={scoutsPick}
                posRank={getPositionRank(scoutsPick)}
                ovrRank={getOverallRank(scoutsPick)}
                teamColor="#6366f1"
                ovrDisplay={(() => {
                  const scout = draftScoutingData[scoutsPick.id];
                  if (!scout) return String(scoutsPick.ratings.overall);
                  const cappedErr = Math.min(scout.error, 6);
                  const lo = Math.max(20, scout.scoutedOvr - cappedErr);
                  const hi = Math.min(99, scout.scoutedOvr + cappedErr);
                  return `${lo}–${hi}`;
                })()}
                onDraft={onDraft}
                onPlayerClick={onPlayerClick}
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
              <TeamLogo abbreviation={nextPickTeam.abbreviation} primaryColor={nextPickTeam.primaryColor ?? '#374151'} secondaryColor={nextPickTeam.secondaryColor ?? '#fff'} logoUrl={nextPickTeam.logoUrl} size="sm" />
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
// Fit badge color helpers
// ---------------------------------------------------------------------------

function fitBadgeColor(badge: DraftScoutEvaluation['fitBadge']): string {
  switch (badge) {
    case 'Strong Target': return 'text-green-700 bg-green-50 border-green-200';
    case 'Worth a Look': return 'text-blue-700 bg-blue-50 border-blue-200';
    case 'Not a Fit': return 'text-red-600 bg-red-50 border-red-200';
    case 'Roster Redundancy': return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

function fitBadgeEmoji(badge: DraftScoutEvaluation['fitBadge']): string {
  switch (badge) {
    case 'Strong Target': return '🎯';
    case 'Worth a Look': return '🤔';
    case 'Not a Fit': return '❌';
    case 'Roster Redundancy': return '📋';
  }
}

// ---------------------------------------------------------------------------
// Unscouted Panel — shown in expanded row before scouting
// ---------------------------------------------------------------------------

function UnscoutedPanel({
  player,
  scoutsRemaining,
  onScout,
}: {
  player: Player;
  scoutsRemaining: number;
  onScout: () => void;
}) {
  const blurb = publicConsensusBlurb(player);

  return (
    <div className="space-y-3">
      {/* Public blurb */}
      <div>
        <div className="flex flex-wrap gap-1 items-center">
          {player.heismanWinner ? (
            <Badge variant="amber">🏆 Heisman Winner</Badge>
          ) : player.heismanFinalist ? (
            <Badge variant="amber">🏆 Heisman Finalist</Badge>
          ) : null}
          {player.scoutingLabel && (
            <Badge variant={
              player.scoutingLabel === 'Injury history' || player.scoutingLabel === 'Character concerns'
                ? 'amber'
                : player.scoutingLabel === 'Pro-ready' || player.scoutingLabel === 'Combine standout'
                  ? 'green'
                  : 'default'
            }>
              {player.scoutingLabel}
            </Badge>
          )}
        </div>
        <p className="text-sm text-[var(--text)] mt-1.5 leading-relaxed">{blurb}</p>
        {/* College Stats */}
        {player.collegeStats && (
          <div className="flex flex-wrap gap-2 text-[10px] text-[var(--text-sec)] mt-1">
            <span>{player.collegeStats.seasons}yr · {player.collegeStats.gamesPlayed}G</span>
            {player.collegeStats.passYards != null && <span>Pass: {player.collegeStats.passYards.toLocaleString()} yds / {player.collegeStats.passTDs} TD / {player.collegeStats.passINTs} INT</span>}
            {player.collegeStats.rushYards != null && player.position !== 'QB' && <span>Rush: {player.collegeStats.rushYards.toLocaleString()} yds / {player.collegeStats.rushTDs} TD</span>}
            {player.collegeStats.receptions != null && <span>Rec: {player.collegeStats.receptions} / {player.collegeStats.recYards?.toLocaleString()} yds / {player.collegeStats.recTDs} TD</span>}
            {player.collegeStats.tackles != null && <span>TKL: {player.collegeStats.tackles}</span>}
            {player.collegeStats.sacks != null && <span>SCK: {player.collegeStats.sacks}</span>}
            {player.collegeStats.interceptions != null && <span>INT: {player.collegeStats.interceptions}</span>}
            {player.collegeStats.fieldGoalPct != null && <span>FG%: {player.collegeStats.fieldGoalPct}%</span>}
          </div>
        )}
      </div>

      {/* Grayed-out scout report teaser */}
      <div className="border border-dashed border-[var(--border)] rounded-lg p-4 opacity-60">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] mb-2">Scout Report</div>
        <div className="h-2 w-3/4 bg-[var(--surface-2)] rounded mb-2" />
        <div className="h-2 w-1/2 bg-[var(--surface-2)] rounded mb-3" />
        <button
          onClick={(e) => { e.stopPropagation(); onScout(); }}
          disabled={scoutsRemaining <= 0}
          className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Spend 1 Scout Point to unlock full evaluation
          <span className="ml-2 text-xs opacity-80">({scoutsRemaining} remaining)</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scout Evaluation Panel — shown in expanded row after scouting
// ---------------------------------------------------------------------------

function ScoutEvaluationPanel({
  player,
  userRoster,
  publicOvrRange,
  isUserPick,
  onDraft,
  scoutTier = 3,
}: {
  player: Player;
  userRoster: Player[];
  publicOvrRange: { lo: number; hi: number };
  isUserPick: boolean;
  onDraft: () => void;
  scoutTier?: number;
}) {
  const evaluation = generateDraftScoutEval(player, userRoster, publicOvrRange, undefined, 2);

  return (
    <div className="space-y-3">
      {/* Header: fit badge + fit score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border ${fitBadgeColor(evaluation.fitBadge)}`}>
            {fitBadgeEmoji(evaluation.fitBadge)} {evaluation.fitBadge}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-sec)]">Fit Score</span>
            <div className="w-20 h-2 rounded-full bg-[var(--surface)] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${evaluation.fitScore >= 70 ? 'bg-green-500' : evaluation.fitScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${evaluation.fitScore}%` }}
              />
            </div>
            <span className="text-xs font-bold">{evaluation.fitScore}</span>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-sec)]">Scout Evaluation</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Scout's Take (left 2/3) */}
        <div className="col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] mb-1">Scout&apos;s Take</div>
          <p className="text-sm leading-relaxed">{evaluation.scoutsTake}</p>
        </div>

        {/* Roster Comparison (right 1/3) */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] mb-1">Roster Comparison</div>
          <p className="text-sm text-[var(--text)]">{evaluation.rosterComparison}</p>
        </div>
      </div>

      {/* Scout's OVR Estimate */}
      <div className="border-l-2 border-blue-400 pl-3">
        <p className="text-sm italic text-[var(--text)]">
          &ldquo;{evaluation.scoutsTake}&rdquo;
        </p>
        <span className="text-[10px] text-[var(--text-sec)]">— Scout Staff</span>
      </div>

      {/* Risk Factors + Combine — side by side */}
      <div className="grid grid-cols-3 gap-3">
        {/* Risk Factors */}
        {evaluation.riskFactors.length > 0 && (
          <div className={evaluation.riskFactors.length > 0 ? 'col-span-1' : 'hidden'}>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] mb-1">Risk Factors</div>
            <ul className="space-y-0.5">
              {evaluation.riskFactors.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-amber-600">
                  <span className="mt-1 w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Combine Measurables */}
        <div className={evaluation.riskFactors.length > 0 ? 'col-span-2' : 'col-span-3'}>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] mb-1">Combine Measurables</div>
          <div className="grid grid-cols-4 gap-1.5">
            <div className="bg-[var(--surface-2)] rounded-lg px-2 py-1.5 text-center">
              <div className="text-[9px] text-[var(--text-sec)] uppercase">40-Yard</div>
              <div className="text-sm font-bold font-mono">{evaluation.combine.fortyYard}s</div>
            </div>
            <div className="bg-[var(--surface-2)] rounded-lg px-2 py-1.5 text-center">
              <div className="text-[9px] text-[var(--text-sec)] uppercase">Bench</div>
              <div className="text-sm font-bold font-mono">{evaluation.combine.benchPress}</div>
            </div>
            <div className="bg-[var(--surface-2)] rounded-lg px-2 py-1.5 text-center">
              <div className="text-[9px] text-[var(--text-sec)] uppercase">Vertical</div>
              <div className="text-sm font-bold font-mono">{evaluation.combine.verticalJump}&quot;</div>
            </div>
            <div className="bg-[var(--surface-2)] rounded-lg px-2 py-1.5 text-center">
              <div className="text-[9px] text-[var(--text-sec)] uppercase">Shuttle</div>
              <div className="text-sm font-bold font-mono">{evaluation.combine.shuttle}s</div>
            </div>
          </div>
        </div>
      </div>

      {/* Scout Quote */}
      <div className="border-l-2 border-green-400 pl-3">
        <p className="text-sm italic text-[var(--text)]">{evaluation.scoutsTake}</p>
        <span className="text-[10px] text-[var(--text-sec)]">— Scout Staff</span>
      </div>

      {/* Character & Development from full scouting report */}
      {(() => {
        const report = generateScoutingReport(player);
        return (
          <div className="grid grid-cols-2 gap-3">
            {/* Character — only at Full Eval (Tier 3) */}
            {scoutTier >= 3 && report.characterReport && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] mb-1">Character & Intangibles</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="bg-[var(--surface-2)] rounded px-2 py-1 text-center">
                    <div className="text-[9px] text-[var(--text-sec)] uppercase">Work Ethic</div>
                    <div className={`text-xs font-bold ${report.characterReport.workEthic === 'Elite' ? 'text-green-600' : report.characterReport.workEthic === 'Strong' ? 'text-blue-600' : report.characterReport.workEthic === 'Questionable' ? 'text-red-600' : 'text-amber-600'}`}>{report.characterReport.workEthic}</div>
                  </div>
                  <div className="bg-[var(--surface-2)] rounded px-2 py-1 text-center">
                    <div className="text-[9px] text-[var(--text-sec)] uppercase">Compete</div>
                    <div className={`text-xs font-bold ${report.characterReport.competitiveness === 'Alpha Competitor' ? 'text-green-600' : report.characterReport.competitiveness === 'Competitive' ? 'text-blue-600' : 'text-red-600'}`}>{report.characterReport.competitiveness}</div>
                  </div>
                  <div className="bg-[var(--surface-2)] rounded px-2 py-1 text-center">
                    <div className="text-[9px] text-[var(--text-sec)] uppercase">Leadership</div>
                    <div className="text-xs font-bold">{report.characterReport.leadership}</div>
                  </div>
                  <div className="bg-[var(--surface-2)] rounded px-2 py-1 text-center">
                    <div className="text-[9px] text-[var(--text-sec)] uppercase">Coachability</div>
                    <div className="text-xs font-bold">{report.characterReport.coachability}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Development Projection — only at Full Eval (Tier 3) */}
            {scoutTier >= 3 && report.developmentCurve && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] mb-1">Development Projection</div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge variant={report.developmentCurve.trajectory === 'Rapid Riser' ? 'green' : report.developmentCurve.trajectory === 'Steady Climber' ? 'blue' : 'amber'} size="sm">
                    {report.developmentCurve.trajectory}
                  </Badge>
                  <span className="text-[10px] text-[var(--text-sec)]">Peak at age {report.developmentCurve.peakAge}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: 'Now', value: player.ratings.overall },
                    { label: 'Yr 1', value: report.developmentCurve.year1 },
                    { label: 'Yr 2', value: report.developmentCurve.year2 },
                    { label: 'Yr 3', value: report.developmentCurve.year3 },
                  ].map(item => (
                    <div key={item.label} className="bg-[var(--surface-2)] rounded px-2 py-1 text-center">
                      <div className="text-[9px] text-[var(--text-sec)] uppercase">{item.label}</div>
                      <div className={`text-sm font-bold ${ratingColor(item.value)}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Draft button */}
      {isUserPick && (
        <div className="pt-1">
          <button
            onClick={(e) => { e.stopPropagation(); onDraft(); }}
            className="w-full min-h-[44px] px-4 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg active:bg-blue-700 touch-manipulation"
          >
            Draft {player.firstName} {player.lastName}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import Draft Class Modal
// ---------------------------------------------------------------------------

const VALID_POSITIONS = new Set(['QB','RB','WR','TE','OL','DL','LB','CB','S','K','P']);

function ImportDraftClassModal({
  season,
  onImport,
  onClose,
}: {
  season: number;
  onImport: (prospects: ImportedProspect[], targetYear: number) => { count: number; skipped: number };
  onClose: () => void;
}) {
  const [jsonText, setJsonText] = useState('');
  const [targetYear, setTargetYear] = useState(season);
  const [parsed, setParsed] = useState<ImportedProspect[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number; skipped: number } | null>(null);

  function tryParse(text: string) {
    setJsonText(text);
    setParsed(null);
    setParseError(null);
    setResult(null);
    if (!text.trim()) return;
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        setParseError('JSON must be an array of prospect objects.');
        return;
      }
      if (data.length === 0) {
        setParseError('Array is empty.');
        return;
      }
      // Validate each entry lightly for preview
      const valid: ImportedProspect[] = [];
      let invalidCount = 0;
      for (const item of data) {
        if (!item.firstName || !item.lastName || !VALID_POSITIONS.has(item.position)) {
          invalidCount++;
          continue;
        }
        valid.push(item as ImportedProspect);
      }
      if (valid.length === 0) {
        setParseError(`All ${data.length} entries are invalid. Each needs firstName, lastName, and a valid position.`);
        return;
      }
      if (invalidCount > 0) {
        setParseError(`${invalidCount} invalid entries will be skipped.`);
      }
      setParsed(valid);
    } catch {
      setParseError('Invalid JSON. Check syntax and try again.');
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setJsonText(text);
      tryParse(text);
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (!parsed || parsed.length === 0) return;
    const res = onImport(parsed, targetYear);
    setResult(res);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-lg font-black">Import Draft Class</h3>
          <button onClick={onClose} className="text-[var(--text-sec)] hover:text-[var(--text)] text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {result ? (
            <div className="text-center py-8 space-y-3">
              <div className="text-4xl">&#9989;</div>
              <div className="text-lg font-bold">Imported {result.count} prospect{result.count !== 1 ? 's' : ''}</div>
              {result.skipped > 0 && (
                <div className="text-sm text-amber-600">{result.skipped} invalid entries skipped.</div>
              )}
              <Button onClick={onClose}>Done</Button>
            </div>
          ) : (
            <>
              {/* Target year */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-sec)] mb-1">Draft Year</label>
                <input
                  type="number"
                  value={targetYear}
                  onChange={(e) => setTargetYear(Number(e.target.value))}
                  className="w-24 px-2 py-1 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)]"
                />
              </div>

              {/* File upload */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-sec)] mb-1">Upload JSON File</label>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="text-sm"
                />
              </div>

              {/* Textarea */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-sec)] mb-1">Or Paste JSON</label>
                <textarea
                  value={jsonText}
                  onChange={(e) => tryParse(e.target.value)}
                  placeholder={`[\n  { "firstName": "Cam", "lastName": "Ward", "position": "QB", "college": "Miami", "overall": 78, "potential": 85 },\n  { "firstName": "Travis", "lastName": "Hunter", "position": "CB", "college": "Colorado", "overall": 82, "potential": 90 }\n]`}
                  rows={8}
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] font-mono resize-y"
                />
              </div>

              {/* Parse error */}
              {parseError && (
                <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{parseError}</div>
              )}

              {/* Preview table */}
              {parsed && parsed.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-[var(--text-sec)] mb-2">Preview ({parsed.length} prospect{parsed.length !== 1 ? 's' : ''})</div>
                  <div className="max-h-48 overflow-y-auto border border-[var(--border)] rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--bg)] sticky top-0">
                        <tr className="text-left text-[var(--text-sec)]">
                          <th className="px-3 py-1.5">#</th>
                          <th className="px-3 py-1.5">Name</th>
                          <th className="px-3 py-1.5">Pos</th>
                          <th className="px-3 py-1.5">College</th>
                          <th className="px-3 py-1.5">OVR</th>
                          <th className="px-3 py-1.5">POT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.slice(0, 50).map((p, i) => (
                          <tr key={i} className="border-t border-[var(--border)]">
                            <td className="px-3 py-1 text-[var(--text-sec)]">{i + 1}</td>
                            <td className="px-3 py-1 font-semibold">{p.firstName} {p.lastName}</td>
                            <td className="px-3 py-1">{p.position}</td>
                            <td className="px-3 py-1 text-[var(--text-sec)]">{p.college ?? '--'}</td>
                            <td className="px-3 py-1">{p.overall ?? 'auto'}</td>
                            <td className="px-3 py-1">{p.potential ?? 'auto'}</td>
                          </tr>
                        ))}
                        {parsed.length > 50 && (
                          <tr className="border-t border-[var(--border)]">
                            <td colSpan={6} className="px-3 py-1 text-center text-[var(--text-sec)]">
                              ...and {parsed.length - 50} more
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="px-6 py-3 border-t border-[var(--border)] flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              disabled={!parsed || parsed.length === 0}
              onClick={handleImport}
            >
              Import {parsed ? `${parsed.length} Prospect${parsed.length !== 1 ? 's' : ''}` : ''}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Draft Page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Import Draft Class Panel
// ---------------------------------------------------------------------------

function ImportDraftClassPanel({ season }: { season: number }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ImportedProspect[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { importDraftClass, players, freeAgents } = useGameStore();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        let data: unknown[];

        if (file.name.endsWith('.csv')) {
          // Parse CSV — first row is headers
          const lines = text.trim().split('\n');
          if (lines.length < 2) { setError('CSV must have a header row + at least 1 prospect.'); return; }
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          data = lines.slice(1).map(line => {
            const vals = line.split(',').map(v => v.trim());
            const obj: Record<string, unknown> = {};
            headers.forEach((h, i) => {
              const v = vals[i];
              if (h === 'overall' || h === 'potential' || h === 'age') obj[h] = v ? Number(v) : undefined;
              else obj[h === 'firstname' ? 'firstName' : h === 'lastname' ? 'lastName' : h] = v || undefined;
            });
            return obj;
          });
        } else {
          // Parse JSON — expect array of prospects
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) { setError('JSON must be an array of prospects.'); return; }
          data = parsed;
        }

        setPreview(data as ImportedProspect[]);
      } catch (err) {
        setError(`Failed to parse file: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (!preview) return;
    const res = importDraftClass(preview, season);
    setResult(res);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleExport() {
    const prospects = freeAgents
      .map(id => players.find(p => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p && p.experience === 0)
      .sort((a, b) => b.ratings.overall - a.ratings.overall)
      .map(p => ({
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        college: p.college ?? '',
        age: p.age,
        overall: p.ratings.overall,
        potential: p.potential,
      }));
    const blob = new Blob([JSON.stringify(prospects, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `draft-class-${season}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(true)} className="text-xs text-blue-600 hover:underline">
          📥 Import Draft Class
        </button>
        <button onClick={handleExport} className="text-xs text-blue-600 hover:underline">
          📤 Export Current Class
        </button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Draft Class</CardTitle>
        <button onClick={() => { setOpen(false); setPreview(null); setError(null); setResult(null); }} className="text-xs text-[var(--text-sec)] hover:text-[var(--text)]">✕ Close</button>
      </CardHeader>

      <div className="space-y-3">
        <p className="text-xs text-[var(--text-sec)]">
          Upload a <code className="px-1 py-0.5 bg-[var(--surface-2)] rounded text-[10px]">.json</code> or
          {' '}<code className="px-1 py-0.5 bg-[var(--surface-2)] rounded text-[10px]">.csv</code> file with draft prospects.
          Required fields: <strong>firstName, lastName, position</strong>.
          Optional: college, age, overall (40-99), potential (40-99).
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".json,.csv"
          onChange={handleFile}
          className="text-xs file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white file:cursor-pointer"
        />

        {error && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</div>}

        {preview && (
          <div className="space-y-2">
            <div className="text-xs font-bold">{preview.length} prospects parsed:</div>
            <div className="max-h-48 overflow-y-auto text-xs border border-[var(--border)] rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="text-[var(--text-sec)] text-[10px] uppercase">
                    <th className="text-left py-1 px-2">Name</th>
                    <th className="text-center py-1">Pos</th>
                    <th className="text-center py-1">OVR</th>
                    <th className="text-center py-1">School</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((p, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className="py-1 px-2 font-medium">{p.firstName} {p.lastName}</td>
                      <td className="py-1 text-center"><Badge size="sm">{p.position}</Badge></td>
                      <td className="py-1 text-center tabular-nums">{p.overall ?? '?'}</td>
                      <td className="py-1 text-center text-[var(--text-sec)]">{p.college ?? '—'}</td>
                    </tr>
                  ))}
                  {preview.length > 20 && (
                    <tr><td colSpan={4} className="text-center py-1 text-[var(--text-sec)]">...and {preview.length - 20} more</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleImport}>Import {preview.length} Prospects</Button>
              <Button size="sm" variant="ghost" onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ''; }}>Cancel</Button>
            </div>
          </div>
        )}

        {result && (
          <div className="text-xs bg-green-50 border border-green-200 rounded-lg p-2">
            ✅ Imported {result.count} prospects.{result.skipped > 0 && ` (${result.skipped} skipped due to invalid data)`}
          </div>
        )}

        <button onClick={handleExport} className="text-xs text-blue-600 hover:underline">
          📤 Export current draft class to JSON
        </button>
      </div>
    </Card>
  );
}

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
    draftPlayer,
    toggleStarProspect,
    simDraftPick,
    simToUserDraftPick,
    simToEndDraft,
    recoverOrphanDraftPicks,
    season,
    draftLotteryResults,
    leagueSettings,
    scoutingState,
    nflMockDraft,
    importDraftClass,
    currentDraftYear,
  } = useGameStore();
  const isSpectator = useGameStore(s => s.isSpectator ?? false);
  const draftYear = currentDraftYear ?? season;

  // Detect draftResults entries whose player no longer exists. These are
  // "ghost picks" — they show in the table but with no player and no way to
  // interact with them. Tracked separately so we can both auto-recover and
  // surface a manual recovery button if the auto path fails.
  const orphanCount = (() => {
    if (phase !== 'draft') return 0;
    const playerIds = new Set(players.map(p => p.id));
    return draftResults.filter(r => !playerIds.has(r.playerId)).length;
  })();

  // Auto-recovery on mount + whenever orphans appear. Idempotent — no-op
  // when there's nothing to fix.
  useEffect(() => {
    if (phase === 'draft' && orphanCount > 0) recoverOrphanDraftPicks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, orphanCount]);
  const [showMockDraft, setShowMockDraft] = useState(false);

  const { hasScouting } = useSubscription();

  const ss = scoutingState;

  function isPlayerScouted(playerId: string): boolean {
    return !!ss?.filmReviews?.[playerId];
  }

  const [selectedRound, setSelectedRound] = useState(1);
  const [draftResultsTeamFilter, setDraftResultsTeamFilter] = useState<string>('ALL');
  const [autoDrafting, setAutoDrafting] = useState(false);
  const [positionFilter, setPositionFilter] = useState<Position | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProspectId, setExpandedProspectId] = useState<string | null>(null);
  const [prospectFilter, setProspectFilter] = useState<'all' | 'starred' | 'scouted'>('all');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);

  // Spectator early-return placed AFTER all hooks. Same hooks-rule fix as
  // /trades — was crashing the GameShell error boundary on /draft when an
  // observe-only league hit the draft phase.
  if (isSpectator) {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto">
          <SpectatorBanner />
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
            <div className="text-3xl mb-3">🎯</div>
            <h2 className="text-xl font-black mb-1">Draft — Read-only</h2>
            <p className="text-sm text-[var(--text-sec)] max-w-md mx-auto">
              Spectator leagues let the AI run the entire draft. Check the Draft Recap after the picks complete.
            </p>
          </div>
        </div>
      </GameShell>
    );
  }

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
          <div className="flex gap-3 justify-center items-center">
            <a href="/" className="text-sm text-blue-600 hover:underline">Go to Dashboard</a>
            <a href="/standings" className="text-sm text-blue-600 hover:underline">View Schedule</a>
            <button
              onClick={() => setShowImportModal(true)}
              className="text-sm font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1"
            >
              📥 Import Draft Class
            </button>
          </div>
        </div>
        {showImportModal && (
          <ImportDraftClassModal
            season={season}
            onImport={(prospects, targetYear) => importDraftClass(prospects, targetYear)}
            onClose={() => setShowImportModal(false)}
          />
        )}
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
  const currentOverallPick = draftComplete ? totalPicks : Math.min(totalPicks, totalPicks - draftOrder.length + 1);
  const currentRound = Math.min(totalRounds, Math.max(1, Math.ceil(currentOverallPick / picksPerRound)));
  const currentPickInRound = Math.min(picksPerRound, ((currentOverallPick - 1) % picksPerRound) + 1);

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

  const rawProspects = freeAgents
    .map((id) => players.find((player) => player.id === id))
    .filter((player): player is Player => Boolean(player))
    .filter((player) => player.experience === 0);

  // If prospects have projectedRank, sort by it. Otherwise fall back to OVR sort.
  const hasRanks = rawProspects.some(p => p.projectedRank != null);

  // Assign ranks on the fly if missing (handles old saves / imported leagues)
  // Use scoutedOvr (what the user sees) so ranking matches the displayed OVR ranges
  if (!hasRanks && rawProspects.length > 0) {
    const sorted = [...rawProspects].sort((a, b) => {
      const aScout = draftScoutingData[a.id];
      const bScout = draftScoutingData[b.id];
      const aOvr = aScout ? aScout.scoutedOvr : a.ratings.overall;
      const bOvr = bScout ? bScout.scoutedOvr : b.ratings.overall;
      const aAdj = (a.position === 'K' || a.position === 'P') ? aOvr - 40 : aOvr;
      const bAdj = (b.position === 'K' || b.position === 'P') ? bOvr - 40 : bOvr;
      return bAdj - aAdj;
    });
    for (let i = 0; i < sorted.length; i++) {
      sorted[i].projectedRank = i + 1;
    }
  }

  const allProspects = rawProspects.sort((a, b) => {
    const aRank = a.projectedRank ?? 999;
    const bRank = b.projectedRank ?? 999;
    return aRank - bRank;
  });

  const userRoster = players.filter(p => p.teamId === userTeamId && !p.retired);

  const prospects = allProspects
    .filter((player) => positionFilter === 'ALL' || player.position === positionFilter)
    .filter((player) => {
      if (prospectFilter === 'starred' && !player.isStarred) return false;
      if (prospectFilter === 'scouted' && !isPlayerScouted(player.id)) return false;
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return `${player.firstName} ${player.lastName}`.toLowerCase().includes(query);
    })
    .slice(0, 50);

  const currentTeam = teams.find((team) => team.id === currentPickTeamId);
  const nextPickTeam = teams.find((team) => team.id === draftOrder[1]);
  const currentTeamNeeds = currentPickTeamId ? getTeamNeeds(currentPickTeamId) : [];
  const nextPickNeeds = draftOrder[1] ? getTeamNeeds(draftOrder[1]).slice(0, 3) : [];
  const allMyNeeds = getTeamNeeds(userTeamId);
  const myNeeds = allMyNeeds.slice(0, 5);

  // BPA = top of the board (highest projected rank among remaining prospects)
  // allProspects is already sorted by projectedRank, so [0] is BPA
  const bestAvailable = allProspects[0];

  // Best Fit = highest-ranked prospect at a need position
  const bestFitResult = (() => {
    if (!currentPickTeamId) return { player: null as Player | null, isNeedMatch: true };
    const needs = getTeamNeeds(currentPickTeamId);
    const needPositions = new Set(
      needs.filter(n => n.needScore > 0 && n.position !== 'K' && n.position !== 'P').map(n => n.position),
    );
    // allProspects is sorted by projected rank — first need-position match is best fit
    const needMatch = allProspects.find(p => needPositions.has(p.position) && p.id !== allProspects[0]?.id);
    if (needMatch) return { player: needMatch, isNeedMatch: true };
    // No need match — second player on the board (excluding BPA)
    const fallback = allProspects.find(p => p.position !== 'K' && p.position !== 'P' && p.id !== allProspects[0]?.id);
    return { player: fallback ?? null, isNeedMatch: false };
  })();
  const bestFit = bestFitResult.player;

  // "Your Scouts Say" — recommend a player they're excited about.
  // Must pass the fit evaluation (no "Not a Fit" or "Roster Redundancy").
  const scoutsPick = (() => {
    if (!currentPickTeamId) return null;
    const needs = getTeamNeeds(currentPickTeamId);
    const needPositions = new Set(
      needs.filter(n => n.needScore > 0 && n.position !== 'K' && n.position !== 'P').map(n => n.position),
    );

    // Score each prospect and check fit badge
    const candidates = allProspects
      .filter(p => p.position !== 'K' && p.position !== 'P')
      .slice(0, 30)
      .map(p => {
        const scout = draftScoutingData[p.id];
        const ovr = scout ? scout.scoutedOvr : p.ratings.overall;
        const err = scout ? Math.min(scout.error, 6) : 5;
        const lo = Math.max(20, ovr - err);
        const hi = Math.min(99, ovr + err);
        const eval_ = generateDraftScoutEval(p, userRoster, { lo, hi }, undefined, 2);
        const needBonus = needPositions.has(p.position) ? 8 : 0;
        const scoutedBonus = scout?.deepScouted ? 5 : 0;
        const score = ovr + needBonus + scoutedBonus;
        return { player: p, score, fitBadge: eval_.fitBadge };
      })
      // Only recommend players the scouts actually like
      .filter(c => c.fitBadge === 'Strong Target' || c.fitBadge === 'Worth a Look')
      .sort((a, b) => b.score - a.score);

    // Pick someone different from BPA and Best Fit
    const pick = candidates.find(c =>
      c.player.id !== allProspects[0]?.id &&
      c.player.id !== bestFit?.id,
    ) ?? candidates[0];

    // If no candidates pass the fit filter, fall back to best need-match (must be at a need position)
    if (!pick) {
      const needFallback = allProspects
        .filter(p => needPositions.has(p.position) && p.id !== allProspects[0]?.id && p.id !== bestFit?.id)
        .slice(0, 1)[0];
      return needFallback ?? null;
    }
    return pick.player;
  })();

  const orderedTeamIds = [
    ...draftResults.sort((a, b) => a.overallPick - b.overallPick).map((result) => result.teamId),
    ...draftOrder,
  ];

  // Map overall pick number → DraftPick object for undrafted slots
  // draftOrder[i] = ownerTeamId for that slot; match each slot to its DraftPick
  const allCurrentYearPicks = teams.flatMap(t =>
    t.draftPicks.filter(pk => pk.year === draftYear && !pk.playerId),
  );
  const pickBySlot = new Map<number, typeof allCurrentYearPicks[0]>();
  const usedPickIds = new Set<string>();
  for (let i = 0; i < draftOrder.length; i++) {
    const overallPickNum = currentOverallPick + i;
    const round = Math.ceil(overallPickNum / picksPerRound);
    const ownerId = draftOrder[i];
    // Find the pick owned by this team for this round (not yet assigned to a slot)
    const pick = allCurrentYearPicks.find(
      pk => pk.ownerTeamId === ownerId && pk.round === round && !usedPickIds.has(pk.id),
    );
    if (pick) {
      pickBySlot.set(overallPickNum, pick);
      usedPickIds.add(pick.id);
    }
  }

  const roundStart = (selectedRound - 1) * picksPerRound;
  const roundRows = Array.from({ length: picksPerRound }, (_, index) => {
    const overallPick = roundStart + index + 1;
    const pickInRound = index + 1;
    let team = teams.find((item) => item.id === orderedTeamIds[overallPick - 1]);
    const result = draftResults.find((item) => item.overallPick === overallPick);
    let player = result ? players.find((item) => item.id === result.playerId) : null;
    // Render-time fallback for imported leagues where Rounds 1-3 (etc.)
    // were already drafted in the source roster before the in-game draft
    // started — those picks aren't in draftResults but the players carry
    // draftYear/draftRound/draftPick. Match by (year, round, pick-in-round)
    // so the panel shows historic picks instead of empty rows.
    if (!player) {
      const historic = players.find(p =>
        p.draftYear === draftYear
        && p.draftRound === selectedRound
        && p.draftPick === pickInRound,
      );
      if (historic) {
        player = historic;
        const draftedBy = historic.draftTeamId
          ? teams.find(t => t.id === historic.draftTeamId)
          : null;
        if (draftedBy) team = draftedBy;
      }
    }
    return { overallPick, pickInRound, team, player };
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

        {/* Import Draft Class Modal */}
        {showImportModal && (
          <ImportDraftClassModal
            season={season}
            onImport={(prospects, targetYear) => importDraftClass(prospects, targetYear)}
            onClose={() => setShowImportModal(false)}
          />
        )}

        {/* Auto-drafting progress */}
        {autoDrafting && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <div className="text-sm font-bold text-blue-700 mb-1">Auto-Drafting...</div>
            <div className="text-xs text-blue-600">Round {Math.ceil((draftResults.length + 1) / teams.length)}, Pick {draftResults.length + 1} of {teams.length * 7}</div>
            <div className="w-full h-2 bg-blue-100 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(draftResults.length / (teams.length * 7)) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Draft Lottery Results */}
        {draftLotteryResults && draftLotteryResults.length > 0 && leagueSettings?.bsMode && (
          <Card className="border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🎰</span>
              <div className="flex-1">
                <div className="font-bold text-sm text-amber-800 mb-1">BS Mode Draft Lottery Results</div>
                <div className="flex flex-wrap gap-2">
                  {draftLotteryResults.map(r => {
                    const moved = r.originalRank - r.lotteryPick;
                    return (
                      <div key={r.teamId} className="flex items-center gap-1 bg-white rounded-lg px-2 py-1 border border-amber-200 text-xs">
                        <span className="font-black text-amber-700">#{r.lotteryPick}</span>
                        <span className="font-semibold">{r.abbr}</span>
                        {moved > 0 && <span className="text-green-600 font-bold">↑{moved}</span>}
                        {moved < 0 && <span className="text-red-500 font-bold">↓{Math.abs(moved)}</span>}
                        {moved === 0 && <span className="text-[var(--text-sec)]">—</span>}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-amber-600 mt-1">Top 6 picks determined by weighted lottery. Remaining picks follow standard reverse-record order.</p>
              </div>
            </div>
          </Card>
        )}

        {/* Orphan pick recovery banner — surfaces ghost picks (state corruption)
            and lets the user manually trigger a re-recover if the auto path
            didn't take (e.g., IndexedDB lock contention). */}
        {orphanCount > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-amber-800">
                ⚠️ {orphanCount} ghost pick{orphanCount !== 1 ? 's' : ''} detected
              </div>
              <div className="text-xs text-amber-700">
                Some draft results have no player attached. Click Recover to put those slots back in the draft order.
              </div>
            </div>
            <button
              onClick={() => recoverOrphanDraftPicks()}
              className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors shrink-0"
            >
              Recover Picks
            </button>
          </div>
        )}

        {/* On The Clock */}
        <OnTheClockSection
          currentTeam={currentTeam}
          currentRound={currentRound}
          currentPickInRound={currentPickInRound}
          currentOverallPick={currentOverallPick}
          bestAvailable={bestAvailable}
          bestFit={bestFit}
          bestFitIsNeedMatch={bestFitResult.isNeedMatch}
          scoutsPick={scoutsPick}
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
          onSimAll={async () => {
            simToEndDraft({ skipAdvance: true });
            await flushToStorage();
            router.push('/draft-recap');
          }}
          onDraft={(playerId) => draftPlayer(playerId)}
          onPlayerClick={(playerId) => setExpandedProspectId(playerId)}
          onTradePick={() => setShowTradeModal(true)}
        />

        {/* Mock Draft button + dropdown */}
        {nflMockDraft && nflMockDraft.length > 0 && (
          <div className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            <div>
              <div className="text-sm font-bold">🔮 Pre-Draft Mock Projection</div>
              <div className="text-xs text-[var(--text-sec)]">Round 1 projections from the BS Football war room</div>
            </div>
            <button
              onClick={() => setShowMockDraft(!showMockDraft)}
              className="px-3 py-1.5 text-xs font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
            >
              {showMockDraft ? 'Hide' : 'View'} Mock Draft
            </button>
          </div>
        )}

        {showMockDraft && nflMockDraft && nflMockDraft.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Round 1 Mock Projection</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider border-b border-[var(--border)]">
                    <th className="text-left pb-2 pl-2">#</th>
                    <th className="text-left pb-2">Team</th>
                    <th className="text-left pb-2">Projected Pick</th>
                    <th className="text-left pb-2 pr-2">Pos · School</th>
                  </tr>
                </thead>
                <tbody>
                  {nflMockDraft.map((mock) => {
                    const mockTeam = teams.find(t => t.abbreviation === mock.teamAbbr);
                    const isUserMock = mockTeam?.id === userTeamId;
                    return (
                      <tr key={mock.pickNum} className={`border-t border-[var(--border)] ${isUserMock ? 'bg-blue-50' : ''}`}>
                        <td className="py-2 pl-2 text-[var(--text-sec)] font-mono">{mock.pickNum}</td>
                        <td className="py-2 font-bold">{mockTeam?.abbreviation ?? mock.teamAbbr}</td>
                        <td className="py-2">
                          <span className="font-medium">{mock.firstName} {mock.lastName}</span>
                        </td>
                        <td className="py-2 pr-2 text-xs text-[var(--text-sec)]">{mock.position}{mock.college ? ` · ${mock.college}` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Import Draft Class */}
        <ImportDraftClassPanel season={season} />

        <div className="grid grid-cols-12 gap-4">
          {/* Top Prospects */}
          <Card className="col-span-12 lg:col-span-6">
            <CardHeader>
              <CardTitle>Draft Board</CardTitle>
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
            {/* milkytoad 4/27: 3-state filter so you can flip between
                the whole board, your starred shortlist, and what you've
                already opened a scouting report on. Scouting tier
                selector + scout-points UI removed in the binary-tier
                refactor — Premium users get full reports automatically. */}
            <div className="mb-3 flex items-center gap-3 flex-wrap">
              <div className="flex bg-[var(--surface-2)] rounded-lg p-0.5">
                {(['all', 'starred', 'scouted'] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setProspectFilter(opt)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
                      prospectFilter === opt
                        ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                        : 'text-[var(--text-sec)] hover:text-[var(--text)]'
                    }`}
                  >
                    {opt === 'all' ? 'All' : opt === 'starred' ? '⭐ Starred' : 'Scouted'}
                  </button>
                ))}
              </div>
              {!hasScouting && (
                <Link href="/pricing" className="text-xs font-bold text-blue-600 hover:underline">
                  🔒 Detailed scouting is a Premium feature →
                </Link>
              )}
            </div>
            {/* Roster Needs Snapshot */}
            <details className="mb-3" open>
              <summary className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider cursor-pointer hover:text-[var(--text)] transition-colors">
                Roster Needs
              </summary>
              {(() => {
                const allNeeds = getTeamNeeds(userTeamId);
                return (
                  <div className="grid grid-cols-5 sm:grid-cols-11 gap-1.5 mt-2">
                    {POSITIONS.map(pos => {
                      const need = allNeeds.find(n => n.position === pos);
                      const count = need?.count ?? 0;
                      const limits = ROSTER_LIMITS[pos];
                      const isCritical = count < limits.min;
                      const isLow = count < Math.ceil((limits.min + limits.max) / 2);
                      return (
                        <div key={pos} className={`text-center rounded-lg px-1 py-1.5 border ${
                          isCritical ? 'bg-red-50 border-red-200 text-red-700' :
                          isLow ? 'bg-amber-50 border-amber-200 text-amber-700' :
                          'bg-green-50 border-green-200 text-green-700'
                        }`}>
                          <div className="text-[10px] font-bold">{pos}</div>
                          <div className="text-sm font-black">{count}</div>
                          <div className="text-[8px] opacity-70">{limits.min}-{limits.max}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </details>

            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px] sticky-col sticky-action">
              <thead>
                <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                  <th className="text-left pb-2 pl-2 w-6"></th>
                  {hasScouting && <th className="text-center pb-2 w-12">Proj</th>}
                  <th className="text-left pb-2">Player</th>
                  <th className="text-center pb-2">Pos</th>
                  <th className="text-center pb-2">OVR</th>
                  {hasScouting && <th className="text-center pb-2 hidden sm:table-cell">Scout</th>}
                  <th className="text-right pb-2 pr-2 bg-[var(--surface)]">Draft</th>
                </tr>
              </thead>
              <tbody>
                {prospects.map((player) => {
                  const scout = draftScoutingData[player.id];
                  const isScouted = scout?.deepScouted === true || isPlayerScouted(player.id);
                  const err = scout?.error ?? 8;
                  const lo = scout ? Math.max(20, scout.scoutedOvr - err) : Math.max(20, player.ratings.overall - err);
                  const hi = scout ? Math.min(99, scout.scoutedOvr + err) : Math.min(99, player.ratings.overall + err);
                  const ovrForColor = scout ? scout.scoutedOvr : player.ratings.overall;
                  const isExpanded = expandedProspectId === player.id;
                  const projRank = player.projectedRank ?? '—';

                  return (
                    <React.Fragment key={player.id}>
                    <tr
                      className={`border-t border-[var(--border)] cursor-pointer transition-colors ${isExpanded ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]'}`}
                      onClick={() => setExpandedProspectId(isExpanded ? null : player.id)}
                    >
                      <td className="py-2.5 pl-2">
                        <svg className={`w-3 h-3 text-[var(--text-sec)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                      {hasScouting && <td className="py-2.5 text-center text-xs text-[var(--text-sec)] font-mono">{projRank}</td>}
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleStarProspect(player.id); }}
                            className="shrink-0 w-5 h-5 flex items-center justify-center transition-transform hover:scale-110"
                            title={player.isStarred ? 'Unstar prospect' : 'Star prospect'}
                            aria-label={player.isStarred ? 'Unstar prospect' : 'Star prospect'}
                          >
                            <span className={`text-base leading-none ${player.isStarred ? 'text-amber-500' : 'text-[var(--text-sec)]/30 hover:text-amber-400'}`}>
                              {player.isStarred ? '★' : '☆'}
                            </span>
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold truncate">{player.firstName} {player.lastName}</span>
                              {(() => {
                                // Only show "Fills Need" when there's an actual unfilled need
                                // at this position — not just one of the 5 relative highest.
                                // Counts include players drafted earlier in this draft (they
                                // already have teamId set), so the tag clears as picks land.
                                const need = allMyNeeds.find(n => n.position === player.position);
                                if (!need) return null;
                                const target = Math.ceil((need.limits.min + need.limits.max) / 2);
                                const hasRealNeed =
                                  need.count < need.limits.min ||
                                  (need.count < target && need.starterOvr < 72);
                                if (!hasRealNeed) return null;
                                return <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium shrink-0">Fills Need</span>;
                              })()}
                              {(() => {
                                const tag = getProspectTag(player, isScouted);
                                if (!tag) return null;
                                return <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${tag.bg} ${tag.color} shrink-0`}>{tag.label}</span>;
                              })()}
                              {player.heismanWinner ? (
                                <span className="text-[9px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold shrink-0" title="Heisman Trophy winner">🏆 Heisman</span>
                              ) : player.heismanFinalist ? (
                                <span className="text-[9px] bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded font-semibold shrink-0" title="Heisman Finalist">🏆 Finalist</span>
                              ) : null}
                            </div>
                            <div className="text-[10px] text-[var(--text-sec)] flex items-center gap-1 flex-wrap">
                              {player.college ?? player.scoutingLabel ?? 'Unranked'}
                              {hasScouting && isScouted && (() => {
                                const eval_ = generateDraftScoutEval(player, userRoster, { lo, hi }, undefined, 2);
                                return (
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded border ${fitBadgeColor(eval_.fitBadge)}`}>
                                    {fitBadgeEmoji(eval_.fitBadge)} {eval_.fitBadge}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-center"><Badge>{player.position}</Badge></td>
                      <td className={`py-2.5 text-center font-bold ${hasScouting ? ratingColor(player.ratings.overall) : 'text-[var(--text-sec)]'}`}>
                        {hasScouting ? (
                          <span>{player.ratings.overall}</span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wide">{coarseOvrBucket(player.ratings.overall)}</span>
                        )}
                      </td>
                      {hasScouting && (
                        <td className="py-2.5 text-center hidden sm:table-cell">
                          {(() => {
                            const fullD = ss?.fullEvals?.[player.id];
                            const inPersonD = ss?.inPersonEvals?.[player.id];
                            const filmD = ss?.filmReviews?.[player.id];
                            if (fullD) return <span className={`text-xs font-black ${ratingColor(fullD.exactOvr)}`}>{fullD.exactOvr}</span>;
                            if (inPersonD) return <span className={`text-xs font-bold ${ratingColor((inPersonD.ovrRange.low + inPersonD.ovrRange.high) / 2)}`}>{inPersonD.ovrRange.low}–{inPersonD.ovrRange.high}</span>;
                            if (filmD) return <span className={`text-xs font-bold ${ratingColor((filmD.ovrRange.low + filmD.ovrRange.high) / 2)}`}>{filmD.ovrRange.low}–{filmD.ovrRange.high}</span>;
                            return <span className="text-xs text-[var(--text-sec)]">?</span>;
                          })()}
                        </td>
                      )}
                      <td className="py-2.5 pr-2 text-right" onClick={e => e.stopPropagation()}>
                        {isUserPick ? (
                          <button
                            onClick={() => draftPlayer(player.id)}
                            className="min-h-[44px] min-w-[44px] px-3 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg active:bg-blue-700 touch-manipulation"
                          >
                            Draft
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--text-sec)]">—</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-t border-[var(--border)]">
                        <td colSpan={hasScouting ? 7 : 5} className="px-4 py-3 bg-[var(--surface-2)]/50">
                          {!hasScouting ? (
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <div className="text-[var(--text-sec)]">
                                <strong className="text-[var(--text)]">{player.firstName} {player.lastName}</strong>
                                {' · '}{player.position}{' · '}Age {player.age}{player.college ? ` · ${player.college}` : ''}
                                <div className="text-xs mt-1">Detailed scouting (exact OVR, ratings, film review, in-person observations) is a Premium feature.</div>
                              </div>
                              <Link href="/pricing" className="text-xs font-bold text-blue-600 hover:underline whitespace-nowrap">
                                Unlock Premium →
                              </Link>
                            </div>
                          ) : (() => {
                            // Premium users always see the full evaluation —
                            // no scout-points gate. filmData/inPersonData/
                            // fullData fall back to the always-generated
                            // evaluation if the user hasn't manually opened
                            // those modals yet.
                            const filmData = ss?.filmReviews?.[player.id];
                            const inPersonData = ss?.inPersonEvals?.[player.id];
                            const fullData = ss?.fullEvals?.[player.id];
                            const evaluation = generateDraftScoutEval(player, userRoster, { lo, hi }, undefined, 2);
                            return (
                              <div className="space-y-3">
                                {/* Prospect Tag in expanded view */}
                                {(() => {
                                  const tag = getProspectTag(player, true);
                                  if (!tag) return null;
                                  return (
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-bold px-2 py-1 rounded ${tag.bg} ${tag.color}`}>{tag.label}</span>
                                      <span className="text-[10px] text-[var(--text-sec)]">
                                        {tag.label === 'Generational' ? 'Rare, franchise-altering talent.' :
                                         tag.label === 'Pro-Ready' ? 'Can contribute from Day 1.' :
                                         tag.label === 'High Ceiling' ? 'Needs development but sky-high upside.' :
                                         tag.label === 'Diamond in the Rough' ? 'Undervalued — could outperform draft position.' :
                                         tag.label === 'Project' ? 'Raw prospect who needs time.' :
                                         tag.label === 'Safe Pick' ? 'What you see is what you get.' :
                                         tag.label === 'Bust Risk' ? 'Scouts have concerns about long-term viability.' : ''}
                                      </span>
                                    </div>
                                  );
                                })()}
                                {/* Full evaluation at top (or film review summary if full eval failed) */}
                                {fullData ? (
                                  <FullEvalContent evalData={fullData} player={player} fitBadge={evaluation.fitBadge} />
                                ) : filmData ? (
                                  <FilmReviewContent data={filmData} evaluation={evaluation} />
                                ) : null}

                                {/* Scout's Take + Roster Comparison */}
                                <div className="grid grid-cols-2 gap-3 text-xs border-t border-[var(--border)] pt-3">
                                  <div>
                                    <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase mb-0.5">Scout&apos;s Take</div>
                                    <p className="text-[var(--text)] leading-relaxed">{evaluation.scoutsTake}</p>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase mb-0.5">Roster Comparison</div>
                                    <p className="text-[var(--text)] leading-relaxed">{evaluation.rosterComparison}</p>
                                  </div>
                                </div>

                                {/* Collapsible Film Review */}
                                {filmData && (
                                  <details className="border border-[var(--border)] rounded-lg overflow-hidden">
                                    <summary className="px-3 py-2 bg-sky-50 text-sky-700 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-sky-100 transition-colors">
                                      📋 Film Review
                                    </summary>
                                    <div className="px-3 py-2.5 border-t border-[var(--border)]">
                                      <FilmReviewContent data={filmData} evaluation={evaluation} />
                                    </div>
                                  </details>
                                )}

                                {/* Collapsible In-Person Observations */}
                                {inPersonData && (
                                  <details className="border border-[var(--border)] rounded-lg overflow-hidden">
                                    <summary className="px-3 py-2 bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-indigo-100 transition-colors">
                                      👁 In-Person Observations
                                    </summary>
                                    <div className="px-3 py-2.5 border-t border-[var(--border)]">
                                      <InPersonEvalContent evalData={inPersonData!} filmData={filmData!} player={player} />
                                    </div>
                                  </details>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
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
            <table className="w-full text-sm sticky-col">
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
                  // — both in-game (draftResults) and historic (player.draftTeamId
                  // from imported rosters where R1-R3 were already drafted).
                  let rows;
                  if (draftResultsTeamFilter !== 'ALL') {
                    const ingame = draftResults
                      .filter(r => r.teamId === draftResultsTeamFilter)
                      .map(r => ({
                        overallPick: r.overallPick,
                        pickInRound: r.pickInRound,
                        team: teams.find(t => t.id === r.teamId),
                        player: players.find(p => p.id === r.playerId) ?? null,
                      }));
                    const ingameKeys = new Set(ingame.map(r => r.overallPick));
                    const historic = players
                      .filter(p => p.draftYear === draftYear
                        && p.draftRound != null
                        && p.draftPick != null
                        && p.draftTeamId === draftResultsTeamFilter)
                      .map(p => {
                        const overallPick = (p.draftRound! - 1) * picksPerRound + p.draftPick!;
                        return {
                          overallPick,
                          pickInRound: p.draftPick!,
                          team: teams.find(t => t.id === p.draftTeamId),
                          player: p,
                        };
                      })
                      .filter(r => !ingameKeys.has(r.overallPick));
                    rows = [...ingame, ...historic].sort((a, b) => a.overallPick - b.overallPick);
                  } else {
                    rows = roundRows;
                  }

                  return rows.map((row) => (
                    <tr key={row.overallPick} className={`border-t border-[var(--border)] ${row.team?.id === userTeamId ? 'bg-blue-500/5' : ''}`}>
                      <td className="py-2 pl-2 text-[var(--text-sec)]">
                        {draftResultsTeamFilter !== 'ALL'
                          ? `R${Math.ceil(row.overallPick / picksPerRound)}, #${row.overallPick}`
                          : `${row.pickInRound} (${row.overallPick})`
                        }
                      </td>
                      <td className="py-2 font-semibold">
                        {row.team ? (
                          <Link href={`/team/${row.team.id}`} className="hover:text-blue-600 transition-colors">
                            {row.team.abbreviation}
                          </Link>
                        ) : '--'}
                      </td>
                      <td className="py-2">
                        {row.player
                          ? `${row.player.firstName} ${row.player.lastName}`
                          : (() => {
                              const pick = pickBySlot.get(row.overallPick);
                              if (!pick || draftComplete) return '--';
                              const isMyPick = row.team?.id === userTeamId;
                              const href = isMyPick
                                ? `/trades?pick=${pick.id}&own=1&from=draft`
                                : `/trades?team=${row.team?.id}&pick=${pick.id}&from=draft`;
                              return (
                                <Link
                                  href={href}
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  {isMyPick ? 'Trade Pick Away' : 'Trade for Pick'}
                                </Link>
                              );
                            })()
                        }
                      </td>
                      <td className="py-2 text-center">{row.player ? <Badge>{row.player.position}</Badge> : ''}</td>
                      <td className="py-2 text-center">
                        {row.player ? (
                          <span className={`font-bold text-xs ${ratingColor(row.player.ratings.overall)}`}>{row.player.ratings.overall}</span>
                        ) : (
                          ''
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
              const g = pl ? pickGrade(p.overallPick, totalPicks, pl.ratings.overall, pl.potential) : 'C';
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
              <table className="w-full text-sm sticky-col">
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
                          <TeamLogo abbreviation={tg.team.abbreviation} primaryColor={tg.team.primaryColor} secondaryColor={tg.team.secondaryColor} logoUrl={tg.team.logoUrl} size="sm" />
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
                      <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} logoUrl={team.logoUrl} size="xs" />
                    )}
                    <div>
                      <div className="font-semibold">#{pick.overallPick} {team?.abbreviation ?? '--'} - {player?.lastName ?? '--'}</div>
                      <div className="text-xs text-[var(--text-sec)]">{player ? `${player.position} ${player.ratings.overall} · Pot: ${potentialLabel(player.potential, player.experience)}` : '--'}</div>
                    </div>
                  </div>
                  {player ? (() => {
                    const g = pickGrade(pick.overallPick, totalPicks, player.ratings.overall, player.potential);
                    return <span className={`font-bold text-xs ${gradeColor(g)}`}>{g}</span>;
                  })() : <span className="text-[var(--text-sec)]">--</span>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {showTradeModal && (
        <TradePickModal
          onClose={() => setShowTradeModal(false)}
          currentPickTeamId={currentPickTeamId}
          currentOverallPick={currentOverallPick}
          currentRound={currentRound}
          currentPickInRound={currentPickInRound}
        />
      )}
    </GameShell>
  );
}
