/**
 * Season honors (deeper Awards): All-NBA / All-Defensive / All-Rookie teams and
 * the offseason retirement class. Pure + lazy like computeSeasonAwards — built
 * from aggregated regular-season box scores, with retirements *projected* by
 * aging each rostered player one year and asking the engine if they'd hang it up
 * (the awards screen is viewed before the rollover actually happens).
 */

import {
  perGame,
  addBasketballStats,
  emptyBasketballStats,
  developBasketballPlayer,
  shouldBasketballPlayerRetire,
  type BasketballPlayer,
  type BasketballPosition,
  type BasketballStats,
} from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const MIN_GAMES = 50;
const MIN_ROOKIE_GAMES = 20;

export interface HonorPlayer {
  playerId: string;
  name: string;
  teamId: TeamId | null;
  position: BasketballPosition;
  statline: string;
}

export interface AllLeagueTeam {
  name: string;
  players: HonorPlayer[];
}

export interface RetirementEntry {
  playerId: string;
  name: string;
  position: BasketballPosition;
  teamId: TeamId | null;
  age: number;
  overall: number;
}

export interface SeasonHonors {
  allNBA: AllLeagueTeam[];
  allDefensive: AllLeagueTeam[];
  allRookie: AllLeagueTeam[];
  retirements: RetirementEntry[];
}

function aggregate(league: LeagueState): Map<PlayerId, BasketballStats> {
  const acc = new Map<PlayerId, BasketballStats>();
  for (const g of league.games) {
    if (g.status !== 'played') continue;
    if ((g.sportData as { isPlayoff?: boolean } | undefined)?.isPlayoff) continue;
    for (const pid of Object.keys(g.boxScores) as PlayerId[]) {
      acc.set(pid, addBasketballStats(acc.get(pid) ?? emptyBasketballStats(), g.boxScores[pid]));
    }
  }
  return acc;
}

export function computeHonors(league: LeagueState): SeasonHonors | null {
  const stats = aggregate(league);
  if (stats.size === 0) return null;

  const players = (Object.values(league.players) as BasketballPlayer[]).map(p => ({
    p,
    s: stats.get(p.id) ?? emptyBasketballStats(),
  }));
  const eligible = players.filter(x => x.s.gamesPlayed >= MIN_GAMES);

  const name = (p: BasketballPlayer) => `${p.firstName} ${p.lastName}`;
  const teamOf = (p: BasketballPlayer) => p.rosterSlot?.teamId ?? null;

  // BUG-35: previously a tanking team's stat-padders could sweep an entire
  // All-League team (LaMelo + four other Hornets on First Team in Tyler's
  // 2028 save), because raw counting stats ignored team success. Real-NBA
  // voters weigh winning heavily — we mirror that with a multiplier on the
  // base score: a 60-win team's stars get ~1.18x, a 22-win team's ~0.82x.
  const teamWins = new Map<string, number>();
  for (const t of league.teams) teamWins.set(t.id, t.record.wins);
  const winFactor = (p: BasketballPlayer): number => {
    const w = teamOf(p) ? teamWins.get(teamOf(p)!) ?? 41 : 41;
    // 41 wins = neutral 1.0; ±20 wins from neutral → ±0.18x. Clamped 0.75-1.25.
    const factor = 1 + (w - 41) / 110;
    return Math.max(0.75, Math.min(1.25, factor));
  };

  const offenseBase = (s: BasketballStats) => {
    const pg = perGame(s);
    const efg = s.fieldGoalsAttempted > 0 ? s.fieldGoalsMade / s.fieldGoalsAttempted : 0;
    return (pg.points ?? 0) * 1.0 + (pg.assists ?? 0) * 0.8 + (pg.totalRebounds ?? 0) * 0.6
      + (s.plusMinus / Math.max(1, s.gamesPlayed)) * 2 + (efg - 0.45) * 20;
  };
  const offense = (p: BasketballPlayer, s: BasketballStats) => offenseBase(s) * winFactor(p);
  const defense = (p: BasketballPlayer, s: BasketballStats) => {
    const pg = perGame(s);
    const base = ((pg.steals ?? 0) + (pg.blocks ?? 0)) * 8 + (pg.defensiveRebounds ?? 0) * 1.5
      + (p.ratings.perimeterDefense + p.ratings.interiorDefense) / 2 * 0.18;
    return base * winFactor(p);
  };
  const offLine = (s: BasketballStats) => {
    const pg = perGame(s);
    return `${(pg.points ?? 0).toFixed(1)} / ${(pg.totalRebounds ?? 0).toFixed(1)} / ${(pg.assists ?? 0).toFixed(1)}`;
  };
  const defLine = (s: BasketballStats) => {
    const pg = perGame(s);
    return `${(pg.steals ?? 0).toFixed(1)} SPG · ${(pg.blocks ?? 0).toFixed(1)} BPG`;
  };

  // Positional teams: best player at each position → First, next → Second, etc.
  const positionalTeams = (
    pool: { p: BasketballPlayer; s: BasketballStats }[],
    score: (p: BasketballPlayer, s: BasketballStats) => number,
    line: (s: BasketballStats) => string,
    teamNames: string[],
  ): AllLeagueTeam[] => {
    const byPos: Record<BasketballPosition, { p: BasketballPlayer; s: BasketballStats }[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
    for (const x of pool) byPos[x.p.sportData.position].push(x);
    for (const pos of POSITIONS) byPos[pos].sort((a, b) => score(b.p, b.s) - score(a.p, a.s));
    return teamNames.map((tn, tier) => ({
      name: tn,
      players: POSITIONS.map(pos => byPos[pos][tier]).filter(Boolean).map(x => ({
        playerId: x.p.id, name: name(x.p), teamId: teamOf(x.p), position: x.p.sportData.position, statline: line(x.s),
      })),
    }));
  };

  // BUG-35: rename All-NBA → All-League (Tyler's request — the league inside
  // BS Hoops is "BS Hoops," not the NBA), and pass `offense(p, s)` so the
  // win-factor multiplier applies. All-Defensive already took (p, s).
  const allNBA = positionalTeams(eligible, offense, offLine, ['All-League First Team', 'All-League Second Team', 'All-League Third Team']);
  const allDefensive = positionalTeams(eligible, defense, defLine, ['All-Defensive First Team', 'All-Defensive Second Team']);

  // All-Rookie: top scorers among first-year players, top-5 / next-5.
  const rookies = players
    .filter(x => x.s.gamesPlayed >= MIN_ROOKIE_GAMES && (x.p.sportData as { yearsInLeague?: number }).yearsInLeague === 0)
    .sort((a, b) => offense(b.p, b.s) - offense(a.p, a.s));
  const toHonor = (x: { p: BasketballPlayer; s: BasketballStats }): HonorPlayer => ({
    playerId: x.p.id, name: name(x.p), teamId: teamOf(x.p), position: x.p.sportData.position, statline: offLine(x.s),
  });
  const allRookie: AllLeagueTeam[] = [
    { name: 'All-Rookie First Team', players: rookies.slice(0, 5).map(toHonor) },
    { name: 'All-Rookie Second Team', players: rookies.slice(5, 10).map(toHonor) },
  ].filter(t => t.players.length > 0);

  // Projected retirements: age each rostered player a year and ask the engine.
  const retirements: RetirementEntry[] = [];
  for (const x of players) {
    if (!x.p.rosterSlot) continue;
    const aged = developBasketballPlayer(x.p, league.currentSeason + 1);
    if (shouldBasketballPlayerRetire(aged)) {
      retirements.push({
        playerId: x.p.id, name: name(x.p), teamId: teamOf(x.p),
        position: x.p.sportData.position, age: aged.age, overall: x.p.ratings.overall,
      });
    }
  }
  retirements.sort((a, b) => b.overall - a.overall);

  return { allNBA, allDefensive, allRookie, retirements };
}
