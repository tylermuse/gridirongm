/**
 * Season recap (Phase 2E-7).
 *
 * Assembles the just-finished season into a storyboard: champion, the marquee
 * awards, the scoring leader, and the season's notable moves. Built from live
 * state when the playoffs have just finished (richest: full awards +
 * transactions); falls back to the denormalized seasonHistory entry afterward.
 */

import { perGame, type BasketballPlayer } from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getBracket } from '../playoffs';
import { computeSeasonAwards } from '../awards';
import { getTransactions } from '../transactions';
import { getSeasonHistory } from '../history';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface RecapAward {
  label: string;
  playerId: string;
  name: string;
  teamId: TeamId | null;
  statline: string;
}

export interface RecapMove {
  summary: string;
  detail: string;
}

export interface SeasonRecap {
  season: number;
  champion: TeamId | null;
  runnerUp: TeamId | null;
  finalsMvp: RecapAward | null;
  mvp: RecapAward | null;
  scoringLeader: RecapAward | null;
  otherAwards: RecapAward[];
  notableMoves: RecapMove[];
  source: 'live' | 'history';
}

function nameOf(league: LeagueState, id: PlayerId): string {
  const p = league.players[id] as BasketballPlayer | undefined;
  return p ? `${p.firstName} ${p.lastName}` : String(id);
}

/** Build a recap, or null if no season has finished yet. */
export function buildRecap(league: LeagueState): SeasonRecap | null {
  const bracket = getBracket(league);

  // Live recap: playoffs just finished, games + bracket still present.
  if (bracket?.complete) {
    const awards = computeSeasonAwards(league);
    const w = awards?.winners;

    const award = (label: string, id: PlayerId | undefined, statline: string, teamId?: TeamId): RecapAward | null =>
      id ? { label, playerId: id, name: nameOf(league, id), teamId: teamId ?? null, statline } : null;

    const mvpId = w?.mvp?.winnerId as PlayerId | undefined;
    const mvpPg = mvpId ? perGame(awards!.seasonStats.get(mvpId) ?? zero()) : null;
    const finalsId = w?.finalsMvp?.winnerId as PlayerId | undefined;
    const finalsPg = finalsId ? perGame(awards!.finalsStats?.get(finalsId) ?? zero()) : null;

    const scoringLeader = (() => {
      if (!awards) return null;
      let best: PlayerId | null = null;
      let bestPpg = -1;
      for (const [id, s] of awards.seasonStats) {
        if ((s.gamesPlayed ?? 0) < 1) continue;
        const ppg = s.points / s.gamesPlayed;
        if (ppg > bestPpg) { bestPpg = ppg; best = id; }
      }
      return best ? award('Scoring Leader', best, `${bestPpg.toFixed(1)} PPG`) : null;
    })();

    const otherAwards = [
      w?.dpoy && award('Defensive Player of the Year', w.dpoy.winnerId as PlayerId, statFor(awards!, w.dpoy.winnerId as PlayerId, 'def'), w.dpoy.teamId),
      w?.roy && award('Rookie of the Year', w.roy.winnerId as PlayerId, statFor(awards!, w.roy.winnerId as PlayerId, 'scoring'), w.roy.teamId),
      w?.sixthMan && award('Sixth Man', w.sixthMan.winnerId as PlayerId, statFor(awards!, w.sixthMan.winnerId as PlayerId, 'scoring'), w.sixthMan.teamId),
      w?.mip && award('Most Improved', w.mip.winnerId as PlayerId, statFor(awards!, w.mip.winnerId as PlayerId, 'scoring'), w.mip.teamId),
    ].filter((a): a is RecapAward => !!a);

    const notableMoves = getTransactions(league)
      .filter(t => t.season === league.currentSeason && (t.kind === 'trade' || t.kind === 'signing'))
      .slice(0, 5)
      .map(t => ({ summary: t.summary, detail: t.detail }));

    return {
      season: league.currentSeason,
      champion: bracket.championTeamId,
      runnerUp: bracket.runnerUpTeamId,
      finalsMvp: finalsId
        ? award('Finals MVP', finalsId, `${(finalsPg!.points ?? 0).toFixed(1)} PPG in the Finals`, w!.finalsMvp!.teamId)
        : null,
      mvp: mvpId
        ? award('MVP', mvpId, `${(mvpPg!.points ?? 0).toFixed(1)} / ${(mvpPg!.totalRebounds ?? 0).toFixed(1)} / ${(mvpPg!.assists ?? 0).toFixed(1)}`, w!.mvp!.teamId)
        : null,
      scoringLeader,
      otherAwards,
      notableMoves,
      source: 'live',
    };
  }

  // History recap: a prior season, from the denormalized record.
  const latest = getSeasonHistory(league)[0];
  if (!latest) return null;
  const toAward = (label: string, ref: { id: string; name: string; teamId: TeamId | null; statline: string } | null): RecapAward | null =>
    ref ? { label, playerId: ref.id, name: ref.name, teamId: ref.teamId, statline: ref.statline } : null;

  return {
    season: latest.season,
    champion: latest.champion,
    runnerUp: latest.runnerUp,
    finalsMvp: toAward('Finals MVP', latest.finalsMvp),
    mvp: toAward('MVP', latest.mvp),
    scoringLeader: toAward('Scoring Leader', latest.scoringLeader),
    otherAwards: [],
    notableMoves: [],
    source: 'history',
  };
}

function statFor(
  awards: NonNullable<ReturnType<typeof computeSeasonAwards>>,
  id: PlayerId,
  kind: 'scoring' | 'def',
): string {
  const pg = perGame(awards.seasonStats.get(id) ?? zero());
  return kind === 'def'
    ? `${(pg.steals ?? 0).toFixed(1)} SPG · ${(pg.blocks ?? 0).toFixed(1)} BPG`
    : `${(pg.points ?? 0).toFixed(1)} PPG`;
}

function zero(): BasketballStats {
  return {
    gamesPlayed: 0, gamesStarted: 0, minutes: 0, points: 0,
    fieldGoalsMade: 0, fieldGoalsAttempted: 0, threePointsMade: 0, threePointsAttempted: 0,
    freeThrowsMade: 0, freeThrowsAttempted: 0, assists: 0, turnovers: 0,
    offensiveRebounds: 0, defensiveRebounds: 0, totalRebounds: 0,
    steals: 0, blocks: 0, personalFouls: 0, plusMinus: 0, trueShootingAttempts: 0,
  };
}
