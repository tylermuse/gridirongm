/**
 * League history (Phase 2E-4).
 *
 * At rollover we snapshot the completed season into `league.seasonHistory[year]`
 * — champion, runner-up, Finals MVP, MVP, and scoring leader — with player
 * names/teams denormalized so the record survives roster churn. The /history
 * route reads these back; career stats are accumulated separately into
 * `player.careerStats` at the same point (see season/advanceSeason).
 */

import { perGame, type BasketballPlayer } from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getBracket } from '../playoffs';
import { computeSeasonAwards, computeHonors, type AllLeagueTeam } from '../awards';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface HistoryPlayerRef {
  id: string;
  name: string;
  teamId: TeamId | null;
  /** Short stat line for display, e.g. "28.4 / 8.1 / 6.0". */
  statline: string;
}

/** One award winner, denormalized. `id` is a player id (or coach id for COY). */
export interface HistoryAwardRef {
  id: string;
  name: string;
  teamId: TeamId | null;
  statline: string;
}

/** Final regular-season record of one team. */
export interface HistoryTeamRecord {
  teamId: TeamId;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  conference?: 'Eastern' | 'Western';
}

/** Compact season totals for one player (regular season), credited to the
 *  team he finished the season on. Kept on the history entry so the record
 *  book survives retirement (retirees are deleted from `league.players`). */
export interface HistoryPlayerLine {
  id: string;
  name: string;
  teamId: TeamId | null;
  pos: string;
  age: number;
  gp: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tpm: number;
}

export interface HistoryRetiree {
  id: string;
  name: string;
  pos: string;
  teamId: TeamId | null;
  age: number;
  overall: number;
  /** Career totals at retirement. */
  gp: number;
  pts: number;
}

export interface SeasonHistoryEntry {
  season: number;
  champion: TeamId | null;
  runnerUp: TeamId | null;
  finalsMvp: HistoryPlayerRef | null;
  mvp: HistoryPlayerRef | null;
  scoringLeader: HistoryPlayerRef | null;
  // ---- Extended archive (record book). All optional: saves written before
  // these existed simply lack them and the record book degrades gracefully. ----
  /** Finals series score, champion's wins first (e.g. 4-2). */
  finals?: { championWins: number; runnerUpWins: number };
  /** Every team's final regular-season record. */
  teamRecords?: HistoryTeamRecord[];
  /** Furthest playoff round reached per team (1 = First Round … 4 = Finals),
   *  for teams that made the main 16-team bracket. */
  playoffRound?: Record<string, number>;
  /** All season awards (MVP, DPOY, ROY, 6MOY, MIP, COY, Finals MVP). */
  awards?: Partial<Record<'mvp' | 'dpoy' | 'roy' | 'sixthMan' | 'mip' | 'coy' | 'finalsMvp', HistoryAwardRef>>;
  allLeague?: AllLeagueTeam[];
  allDefensive?: AllLeagueTeam[];
  allRookie?: AllLeagueTeam[];
  /** Per-player regular-season totals. */
  playerLines?: HistoryPlayerLine[];
  /** Players who retired at the end of this season (filled in at rollover). */
  retired?: HistoryRetiree[];
}

function nameOf(league: LeagueState, id: PlayerId): string {
  const p = league.players[id] as BasketballPlayer | undefined;
  return p ? `${p.firstName} ${p.lastName}` : String(id);
}
function teamOf(league: LeagueState, id: PlayerId): TeamId | null {
  return (league.players[id] as BasketballPlayer | undefined)?.rosterSlot?.teamId ?? null;
}

/**
 * Build the history entry for the just-finished season. Call BEFORE players are
 * aged and games are replaced (i.e. at the top of enterOffseason).
 */
export function buildSeasonHistoryEntry(league: LeagueState): SeasonHistoryEntry {
  const bracket = getBracket(league);
  const awards = computeSeasonAwards(league);
  const w = awards?.winners;

  const mvpRef = (): HistoryPlayerRef | null => {
    const id = w?.mvp?.winnerId as PlayerId | undefined;
    if (!id) return null;
    const pg = perGame(awards!.seasonStats.get(id) ?? zero());
    return {
      id, name: nameOf(league, id), teamId: w!.mvp!.teamId ?? teamOf(league, id),
      statline: `${(pg.points ?? 0).toFixed(1)} / ${(pg.totalRebounds ?? 0).toFixed(1)} / ${(pg.assists ?? 0).toFixed(1)}`,
    };
  };

  const finalsMvpRef = (): HistoryPlayerRef | null => {
    const id = w?.finalsMvp?.winnerId as PlayerId | undefined;
    if (!id) return null;
    const pg = perGame(awards!.finalsStats?.get(id) ?? zero());
    return {
      id, name: nameOf(league, id), teamId: w!.finalsMvp!.teamId ?? teamOf(league, id),
      statline: `${(pg.points ?? 0).toFixed(1)} PPG in the Finals`,
    };
  };

  const scoringLeaderRef = (): HistoryPlayerRef | null => {
    if (!awards) return null;
    let bestId: PlayerId | null = null;
    let bestPpg = -1;
    for (const [id, stats] of awards.seasonStats) {
      if ((stats.gamesPlayed ?? 0) < 1) continue;
      const ppg = stats.points / stats.gamesPlayed;
      if (ppg > bestPpg) { bestPpg = ppg; bestId = id; }
    }
    if (!bestId) return null;
    return {
      id: bestId, name: nameOf(league, bestId), teamId: teamOf(league, bestId),
      statline: `${bestPpg.toFixed(1)} PPG`,
    };
  };

  // ---- Extended archive ----
  const finalsSeries = bracket?.rounds?.[3]?.[0];
  const finals = finalsSeries?.winnerTeamId
    ? finalsSeries.winnerTeamId === finalsSeries.teamA
      ? { championWins: finalsSeries.winsA, runnerUpWins: finalsSeries.winsB }
      : { championWins: finalsSeries.winsB, runnerUpWins: finalsSeries.winsA }
    : undefined;

  const playoffRound: Record<string, number> = {};
  for (const round of bracket?.rounds ?? []) {
    for (const s of round) {
      for (const t of [s.teamA, s.teamB]) {
        if (t) playoffRound[t] = Math.max(playoffRound[t] ?? 0, s.round);
      }
    }
  }

  const teamRecords: HistoryTeamRecord[] = league.teams.map(t => ({
    teamId: t.id,
    wins: t.record.wins,
    losses: t.record.losses,
    pointsFor: t.record.pointsFor,
    pointsAgainst: t.record.pointsAgainst,
    conference: (t.sportData as { conference?: 'Eastern' | 'Western' } | undefined)?.conference,
  }));

  const line = (s: BasketballStats) => {
    const pg = perGame(s);
    return `${(pg.points ?? 0).toFixed(1)} / ${(pg.totalRebounds ?? 0).toFixed(1)} / ${(pg.assists ?? 0).toFixed(1)}`;
  };
  const defLine = (s: BasketballStats) => {
    const pg = perGame(s);
    return `${(pg.steals ?? 0).toFixed(1)} SPG · ${(pg.blocks ?? 0).toFixed(1)} BPG`;
  };
  const awardRefs: NonNullable<SeasonHistoryEntry['awards']> = {};
  if (w && awards) {
    const playerAward = (key: 'dpoy' | 'roy' | 'sixthMan' | 'mip', fmt: (s: BasketballStats) => string) => {
      const r = w[key];
      if (!r) return;
      const id = r.winnerId as PlayerId;
      awardRefs[key] = {
        id, name: nameOf(league, id), teamId: r.teamId ?? teamOf(league, id),
        statline: fmt(awards.seasonStats.get(id) ?? zero()),
      };
    };
    const m = mvpRef();
    if (m) awardRefs.mvp = m;
    const f = finalsMvpRef();
    if (f) awardRefs.finalsMvp = f;
    playerAward('dpoy', defLine);
    playerAward('roy', line);
    playerAward('sixthMan', line);
    playerAward('mip', line);
    if (w.coy) {
      const coach = (league.coaches as Record<string, { firstName: string; lastName: string } | undefined>)[w.coy.winnerId];
      const rec = w.coy.teamId ? league.teams.find(t => t.id === w.coy!.teamId)?.record : undefined;
      awardRefs.coy = {
        id: w.coy.winnerId,
        name: coach ? `${coach.firstName} ${coach.lastName}` : 'Head coach',
        teamId: w.coy.teamId ?? null,
        statline: rec ? `${rec.wins}-${rec.losses}` : '',
      };
    }
  }

  const honors = computeHonors(league);

  const playerLines: HistoryPlayerLine[] = [];
  for (const [id, s] of awards?.seasonStats ?? []) {
    if ((s.gamesPlayed ?? 0) < 1) continue;
    const p = league.players[id] as BasketballPlayer | undefined;
    playerLines.push({
      id, name: nameOf(league, id), teamId: teamOf(league, id),
      pos: p?.sportData.position ?? '',
      age: p?.age ?? 0,
      gp: s.gamesPlayed, pts: s.points, reb: s.totalRebounds, ast: s.assists,
      stl: s.steals, blk: s.blocks, tpm: s.threePointsMade,
    });
  }

  return {
    season: league.currentSeason,
    champion: bracket?.championTeamId ?? null,
    runnerUp: bracket?.runnerUpTeamId ?? null,
    finalsMvp: finalsMvpRef(),
    mvp: mvpRef(),
    scoringLeader: scoringLeaderRef(),
    finals,
    teamRecords,
    playoffRound,
    awards: awardRefs,
    allLeague: honors?.allNBA,
    allDefensive: honors?.allDefensive,
    allRookie: honors?.allRookie,
    playerLines,
  };
}

/** Archive entry for a player retiring at this rollover. `p` is the player as
 *  he finished the season (career stats already include the final season). */
export function buildRetireeEntry(p: BasketballPlayer, age: number): HistoryRetiree {
  return {
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    pos: p.sportData.position,
    teamId: p.rosterSlot?.teamId ?? null,
    age,
    overall: p.ratings.overall,
    gp: p.careerStats?.gamesPlayed ?? 0,
    pts: p.careerStats?.points ?? 0,
  };
}

/** All recorded seasons, newest first. */
export function getSeasonHistory(league: LeagueState): SeasonHistoryEntry[] {
  return Object.values(league.seasonHistory as Record<number, SeasonHistoryEntry>)
    .filter((e): e is SeasonHistoryEntry => !!e && typeof (e as SeasonHistoryEntry).season === 'number')
    .sort((a, b) => b.season - a.season);
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
