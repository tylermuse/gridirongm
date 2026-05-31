/**
 * Playoff seeding with NBA-style tiebreakers (Phase 2D-1).
 *
 * Teams are seeded 1-8 within each conference by regular-season record. Ties
 * break by, in order:
 *   1. Win percentage (raw wins, since every team plays 82)
 *   2. Head-to-head record between the tied teams
 *   3. Division record (only decisive among same-division teams)
 *   4. Conference record
 *   5. Point differential
 *
 * Only regular-season (non-playoff) played games feed the metrics, so re-seeding
 * is stable even after playoff games are injected into `league.games`.
 */

import type { BaseGameResult, BaseLeagueState, TeamId } from '@bs/core/adapter';
import type {
  BasketballRatings,
  BasketballStats,
  BasketballTeam,
} from '@bs/sport-basketball';
import type { PlayoffSeedInfo } from './types';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;

interface TeamMeta {
  conference: 'Eastern' | 'Western';
  division: string;
}

interface SeedMetric {
  teamId: TeamId;
  conference: 'Eastern' | 'Western';
  division: string;
  wins: number;
  losses: number;
  pointDiff: number;
  confW: number;
  confL: number;
  divW: number;
  divL: number;
  /** Head-to-head wins keyed by opponent team id. */
  vsWins: Record<string, number>;
}

function meta(t: BasketballTeam): TeamMeta {
  const sd = t.sportData as { conference: 'Eastern' | 'Western'; division: string };
  return { conference: sd.conference, division: sd.division };
}

function isRegularSeasonGame(g: GameResult): boolean {
  const sd = g.sportData as { isPlayoff?: boolean } | undefined;
  return g.status === 'played' && !!g.finalScore && !sd?.isPlayoff;
}

/**
 * Compute the 1-8 seeding for a conference, applying tiebreakers. Returns the
 * seeded team ids (index 0 = the 1-seed) plus the per-team seed metadata the
 * bracket uses for home-court decisions.
 */
export function seedConferences(league: LeagueState): {
  Eastern: TeamId[];
  Western: TeamId[];
  seedInfo: Record<string, PlayoffSeedInfo>;
} {
  const teamMeta = new Map<TeamId, TeamMeta>();
  for (const t of league.teams) teamMeta.set(t.id, meta(t as BasketballTeam));

  const metrics = new Map<TeamId, SeedMetric>();
  for (const t of league.teams) {
    const m = teamMeta.get(t.id)!;
    metrics.set(t.id, {
      teamId: t.id,
      conference: m.conference,
      division: m.division,
      wins: 0,
      losses: 0,
      pointDiff: 0,
      confW: 0,
      confL: 0,
      divW: 0,
      divL: 0,
      vsWins: {},
    });
  }

  for (const g of league.games) {
    if (!isRegularSeasonGame(g)) continue;
    const score = g.finalScore!;
    const homeWon = score.home > score.away;
    const winnerId = homeWon ? g.homeTeamId : g.awayTeamId;
    const loserId = homeWon ? g.awayTeamId : g.homeTeamId;
    const win = metrics.get(winnerId);
    const lose = metrics.get(loserId);
    if (!win || !lose) continue;

    win.wins += 1;
    lose.losses += 1;
    win.pointDiff += Math.abs(score.home - score.away);
    lose.pointDiff -= Math.abs(score.home - score.away);
    win.vsWins[loserId] = (win.vsWins[loserId] ?? 0) + 1;

    const sameConf = win.conference === lose.conference;
    const sameDiv = sameConf && win.division === lose.division;
    if (sameConf) {
      win.confW += 1;
      lose.confL += 1;
    }
    if (sameDiv) {
      win.divW += 1;
      lose.divL += 1;
    }
  }

  const pct = (w: number, l: number) => (w + l > 0 ? w / (w + l) : 0);

  function compare(a: SeedMetric, b: SeedMetric): number {
    if (b.wins !== a.wins) return b.wins - a.wins;
    // Head-to-head: more wins against the other team ranks higher.
    const aH2H = a.vsWins[b.teamId] ?? 0;
    const bH2H = b.vsWins[a.teamId] ?? 0;
    if (aH2H !== bH2H) return bH2H - aH2H;
    // Division record — decisive only for same-division ties, harmless otherwise.
    const aDiv = pct(a.divW, a.divL);
    const bDiv = pct(b.divW, b.divL);
    if (aDiv !== bDiv) return bDiv - aDiv;
    // Conference record.
    const aConf = pct(a.confW, a.confL);
    const bConf = pct(b.confW, b.confL);
    if (aConf !== bConf) return bConf - aConf;
    // Point differential.
    return b.pointDiff - a.pointDiff;
  }

  const seedInfo: Record<string, PlayoffSeedInfo> = {};
  const result = { Eastern: [] as TeamId[], Western: [] as TeamId[] };

  for (const conf of ['Eastern', 'Western'] as const) {
    const inConf = [...metrics.values()].filter(m => m.conference === conf).sort(compare);
    // Top 10 make the field: 1-6 are locked in, 7-10 fight through the play-in.
    const topN = inConf.slice(0, 10);
    result[conf] = topN.map(m => m.teamId);
    topN.forEach((m, i) => {
      seedInfo[m.teamId] = {
        teamId: m.teamId,
        conference: conf,
        seed: i + 1,
        wins: m.wins,
        pointDiff: m.pointDiff,
      };
    });
  }

  return { Eastern: result.Eastern, Western: result.Western, seedInfo };
}
