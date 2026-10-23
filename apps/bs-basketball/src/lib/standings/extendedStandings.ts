/**
 * Extended standings + league scoreboard derivations.
 *
 * Pure functions over `league.games` — nothing persisted. Regular-season
 * records only (playoff games are excluded from every split), so the numbers
 * stay stable once the postseason injects games into `league.games`.
 */

import type { BaseGameResult, BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;

export interface WL { w: number; l: number }

export interface ExtendedTeamStanding {
  teamId: TeamId;
  wins: number;
  losses: number;
  /** Games played (wins + losses). */
  gp: number;
  pct: number;
  conf: WL;
  div: WL;
  home: WL;
  away: WL;
  pointsFor: number;
  pointsAgainst: number;
  ppg: number;
  oppPpg: number;
  /** Per-game differential (ppg − oppPpg). */
  diffPerGame: number;
  /** Current streak, e.g. 'W3' / 'L2'; '—' before any games. */
  streak: string;
  /** Last ten results, oldest → newest ('W' | 'L'). */
  last10: ('W' | 'L')[];
  last10Record: WL;
}

interface GameSD {
  dayOfSeason?: number;
  isPlayoff?: boolean;
  wentToOvertime?: boolean;
  periodsPlayed?: number;
}

export function gameSD(g: GameResult): GameSD {
  return (g.sportData as GameSD | undefined) ?? {};
}

export function dayOf(g: GameResult): number {
  return gameSD(g).dayOfSeason ?? 0;
}

function teamConfDiv(t: BasketballTeam): { conference: string; division: string } {
  const sd = t.sportData as { conference?: string; division?: string } | undefined;
  return { conference: sd?.conference ?? '', division: sd?.division ?? '' };
}

/** Game behind a leader, NBA formula. */
export function gamesBehind(leader: { wins: number; losses: number }, t: { wins: number; losses: number }): number {
  return ((leader.wins - t.wins) + (t.losses - leader.losses)) / 2;
}

export function computeExtendedStandings(league: LeagueState): Map<TeamId, ExtendedTeamStanding> {
  const meta = new Map<TeamId, { conference: string; division: string }>();
  for (const t of league.teams) meta.set(t.id, teamConfDiv(t as BasketballTeam));

  const results = new Map<TeamId, ('W' | 'L')[]>();
  const out = new Map<TeamId, ExtendedTeamStanding>();
  for (const t of league.teams) {
    results.set(t.id, []);
    out.set(t.id, {
      teamId: t.id, wins: 0, losses: 0, gp: 0, pct: 0,
      conf: { w: 0, l: 0 }, div: { w: 0, l: 0 }, home: { w: 0, l: 0 }, away: { w: 0, l: 0 },
      pointsFor: 0, pointsAgainst: 0, ppg: 0, oppPpg: 0, diffPerGame: 0,
      streak: '—', last10: [], last10Record: { w: 0, l: 0 },
    });
  }

  // Chronological so streak / last-10 read in order. Stable sort keeps
  // same-day games in schedule order (irrelevant: a team plays once a day).
  const played = (league.games as GameResult[])
    .filter(g => g.status === 'played' && !!g.finalScore && !gameSD(g).isPlayoff)
    .sort((a, b) => dayOf(a) - dayOf(b));

  for (const g of played) {
    const home = out.get(g.homeTeamId);
    const away = out.get(g.awayTeamId);
    if (!home || !away) continue;
    const { home: hs, away: as } = g.finalScore!;
    const homeWon = hs > as;

    home.pointsFor += hs; home.pointsAgainst += as;
    away.pointsFor += as; away.pointsAgainst += hs;

    const hm = meta.get(g.homeTeamId)!;
    const am = meta.get(g.awayTeamId)!;
    const sameConf = hm.conference !== '' && hm.conference === am.conference;
    const sameDiv = sameConf && hm.division === am.division;

    const credit = (s: ExtendedTeamStanding, won: boolean, venue: WL) => {
      if (won) { s.wins++; venue.w++; } else { s.losses++; venue.l++; }
      if (sameConf) { if (won) s.conf.w++; else s.conf.l++; }
      if (sameDiv) { if (won) s.div.w++; else s.div.l++; }
      results.get(s.teamId)!.push(won ? 'W' : 'L');
    };
    credit(home, homeWon, home.home);
    credit(away, !homeWon, away.away);
  }

  for (const s of out.values()) {
    s.gp = s.wins + s.losses;
    s.pct = s.gp > 0 ? s.wins / s.gp : 0;
    s.ppg = s.gp > 0 ? s.pointsFor / s.gp : 0;
    s.oppPpg = s.gp > 0 ? s.pointsAgainst / s.gp : 0;
    s.diffPerGame = s.ppg - s.oppPpg;
    const r = results.get(s.teamId)!;
    s.streak = streakLabel(r);
    s.last10 = r.slice(-10);
    s.last10Record = {
      w: s.last10.filter(x => x === 'W').length,
      l: s.last10.filter(x => x === 'L').length,
    };
  }
  return out;
}

/** 'W3' / 'L2' from a chronological result list; '—' when empty. */
export function streakLabel(results: ('W' | 'L')[]): string {
  if (results.length === 0) return '—';
  const last = results[results.length - 1];
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === last; i--) n++;
  return `${last}${n}`;
}

export function fmtWL(r: WL): string {
  return `${r.w}-${r.l}`;
}

// ===========================================================================
// Scoreboard
// ===========================================================================

export interface TopScorer { playerId: PlayerId; name: string; points: number; rebounds: number; assists: number }

export interface ScoreboardGame {
  gameId: string;
  day: number;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  played: boolean;
  homeScore: number | null;
  awayScore: number | null;
  winnerId: TeamId | null;
  /** Number of OT periods (0 = regulation). */
  overtimes: number;
  isPlayoff: boolean;
  topHome: TopScorer | null;
  topAway: TopScorer | null;
}

/** Sorted list of distinct days that have any game. */
export function scoreboardDays(league: LeagueState): number[] {
  return [...new Set((league.games as GameResult[]).map(dayOf))].sort((a, b) => a - b);
}

/** Latest day with at least one played game, else the first scheduled day. */
export function defaultScoreboardDay(league: LeagueState): number | null {
  const games = league.games as GameResult[];
  let latest: number | null = null;
  for (const g of games) if (g.status === 'played') latest = Math.max(latest ?? -Infinity, dayOf(g));
  if (latest !== null) return latest;
  const days = scoreboardDays(league);
  return days.length > 0 ? days[0] : null;
}

/**
 * Box-score lines carry no team id, so attribute a player via his current
 * roster slot. A player traded since the game whose new team isn't in it is
 * skipped (rare; the top scorer for that side falls to the next player).
 */
function topScorerFor(g: GameResult, teamId: TeamId, league: LeagueState): TopScorer | null {
  let best: TopScorer | null = null;
  for (const [pid, line] of Object.entries(g.boxScores)) {
    const p = league.players[pid as PlayerId];
    if (!p || p.rosterSlot?.teamId !== teamId) continue;
    const pts = line.points ?? 0;
    if (!best || pts > best.points) {
      best = {
        playerId: pid as PlayerId,
        name: `${p.firstName.charAt(0)}. ${p.lastName}`,
        points: pts,
        rebounds: line.totalRebounds ?? 0,
        assists: line.assists ?? 0,
      };
    }
  }
  return best;
}

export function scoreboardForDay(league: LeagueState, day: number): ScoreboardGame[] {
  return (league.games as GameResult[])
    .filter(g => dayOf(g) === day)
    .map(g => {
      const sd = gameSD(g);
      const played = g.status === 'played' && !!g.finalScore;
      const hs = played ? g.finalScore!.home : null;
      const as = played ? g.finalScore!.away : null;
      const overtimes = sd.wentToOvertime ? Math.max(1, (sd.periodsPlayed ?? 5) - 4) : 0;
      return {
        gameId: g.id,
        day,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        played,
        homeScore: hs,
        awayScore: as,
        winnerId: played ? (hs! > as! ? g.homeTeamId : g.awayTeamId) : null,
        overtimes: played ? overtimes : 0,
        isPlayoff: !!sd.isPlayoff,
        topHome: played ? topScorerFor(g, g.homeTeamId, league) : null,
        topAway: played ? topScorerFor(g, g.awayTeamId, league) : null,
      };
    })
    // Finals first, then scheduled.
    .sort((a, b) => Number(b.played) - Number(a.played));
}
