/**
 * Dashboard summary helpers (parity audit P0.3–P0.5).
 *
 * Everything here is derived live from league state — nothing is persisted — so
 * it works for existing saves with no migration. Powers the team-themed hero,
 * owner objectives, next-matchup card, and the standings/cap/stats row.
 */

import {
  basketballTeamCapStatus,
  type TeamCapStatus,
  type BasketballPlayer,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type { BaseGameResult, BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;
type Conference = 'Eastern' | 'Western';

const PLAYOFF_SEEDS = 8;

export function conferenceOf(team: BasketballTeam): Conference {
  return (team.sportData as { conference: Conference }).conference;
}

export function divisionOf(team: BasketballTeam): string {
  return (team.sportData as { division: string }).division;
}

function teamPlayers(league: LeagueState, team: BasketballTeam): BasketballPlayer[] {
  const players = league.players as Record<string, BasketballPlayer>;
  return team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p);
}

/** Standings sort: wins desc → losses asc → point-diff desc (matches /standings). */
function byStanding(a: BasketballTeam, b: BasketballTeam): number {
  if (b.record.wins !== a.record.wins) return b.record.wins - a.record.wins;
  if (a.record.losses !== b.record.losses) return a.record.losses - b.record.losses;
  return (b.record.pointsFor - b.record.pointsAgainst) - (a.record.pointsFor - a.record.pointsAgainst);
}

/** A conference's teams, seeded. */
export function conferenceStandings(league: LeagueState, conference: Conference): BasketballTeam[] {
  return (league.teams as BasketballTeam[])
    .filter(t => conferenceOf(t) === conference)
    .sort(byStanding);
}

export interface StandingsRow { team: BasketballTeam; seed: number; isUser: boolean }

/** The user team plus the two teams above and two below it in its conference. */
export function standingsSlice(league: LeagueState, teamId: string): { conference: Conference; rows: StandingsRow[] } | null {
  const team = (league.teams as BasketballTeam[]).find(t => t.id === teamId);
  if (!team) return null;
  const conference = conferenceOf(team);
  const ranked = conferenceStandings(league, conference);
  const idx = ranked.findIndex(t => t.id === teamId);
  if (idx === -1) return null;
  const start = Math.max(0, Math.min(idx - 2, ranked.length - 5));
  const window = ranked.slice(start, start + 5);
  return {
    conference,
    rows: window.map(t => ({ team: t, seed: ranked.indexOf(t) + 1, isUser: t.id === teamId })),
  };
}

export function teamCap(league: LeagueState, team: BasketballTeam): TeamCapStatus {
  return basketballTeamCapStatus(teamPlayers(league, team), league.currentSeason);
}

export interface Objective { icon: string; label: string; detail: string; met: boolean }

/** Three owner objectives, computed live from record / seed / cap. */
export function teamObjectives(league: LeagueState, team: BasketballTeam, cap: TeamCapStatus): Objective[] {
  const slice = standingsSlice(league, team.id);
  const seed = slice ? slice.rows.find(r => r.isUser)?.seed ?? null : null;
  const conferenceSeed = (() => {
    const ranked = conferenceStandings(league, conferenceOf(team));
    return ranked.findIndex(t => t.id === team.id) + 1;
  })();
  const inPlayoffs = conferenceSeed > 0 && conferenceSeed <= PLAYOFF_SEEDS;
  const { wins, losses } = team.record;

  return [
    {
      icon: '🏆',
      label: 'Make the playoffs',
      detail: conferenceSeed > 0 ? (inPlayoffs ? `#${seed ?? conferenceSeed} seed` : `#${conferenceSeed} — outside the top ${PLAYOFF_SEEDS}`) : '—',
      met: inPlayoffs,
    },
    {
      icon: '📈',
      label: 'Finish above .500',
      detail: `${wins}–${losses}`,
      met: wins > losses,
    },
    {
      icon: '💰',
      label: 'Stay under the luxury tax',
      detail: cap.isOverTax ? `$${(cap.taxBill / 1e6).toFixed(1)}M tax bill` : `$${((cap.taxThreshold - cap.payroll) / 1e6).toFixed(1)}M under`,
      met: !cap.isOverTax,
    },
  ];
}

export interface TeamStatLine {
  gamesPlayed: number;
  ppg: number;
  oppPpg: number;
  diff: number;
  fgPct: number | null;
  tpPct: number | null;
  ftPct: number | null;
  leader: { name: string; ppg: number } | null;
}

export function teamStatLine(league: LeagueState, team: BasketballTeam): TeamStatLine {
  const gp = team.record.wins + team.record.losses + (team.record.otherResults ?? 0);
  const ppg = gp > 0 ? team.record.pointsFor / gp : 0;
  const oppPpg = gp > 0 ? team.record.pointsAgainst / gp : 0;

  let fgm = 0, fga = 0, tpm = 0, tpa = 0, ftm = 0, fta = 0;
  let leader: { name: string; ppg: number } | null = null;
  for (const p of teamPlayers(league, team)) {
    const s = p.seasonStats;
    fgm += s.fieldGoalsMade; fga += s.fieldGoalsAttempted;
    tpm += s.threePointsMade; tpa += s.threePointsAttempted;
    ftm += s.freeThrowsMade; fta += s.freeThrowsAttempted;
    if (s.gamesPlayed > 0) {
      const pppg = s.points / s.gamesPlayed;
      if (!leader || pppg > leader.ppg) leader = { name: `${p.firstName[0]}. ${p.lastName}`, ppg: pppg };
    }
  }

  return {
    gamesPlayed: gp,
    ppg, oppPpg, diff: ppg - oppPpg,
    fgPct: fga > 0 ? (fgm / fga) * 100 : null,
    tpPct: tpa > 0 ? (tpm / tpa) * 100 : null,
    ftPct: fta > 0 ? (ftm / fta) * 100 : null,
    leader,
  };
}

export interface NextMatchup {
  game: GameResult;
  opponent: BasketballTeam | null;
  isHome: boolean;
  dayOfSeason: number | null;
  played: boolean;
}

/** The team's next scheduled game, or — if the slate is done — its most recent
 *  played game (so the card always has something to show). */
export function nextMatchup(league: LeagueState, teamId: string): NextMatchup | null {
  const games = (league.games as GameResult[]).filter(g => g.homeTeamId === teamId || g.awayTeamId === teamId);
  const dayOf = (g: GameResult) => (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? null;

  const scheduled = games
    .filter(g => g.status === 'scheduled')
    .sort((a, b) => (dayOf(a) ?? Infinity) - (dayOf(b) ?? Infinity));
  const pick = scheduled[0]
    ?? games.filter(g => g.status === 'played').sort((a, b) => (dayOf(b) ?? 0) - (dayOf(a) ?? 0))[0];
  if (!pick) return null;

  const isHome = pick.homeTeamId === teamId;
  const oppId = isHome ? pick.awayTeamId : pick.homeTeamId;
  return {
    game: pick,
    opponent: (league.teams as BasketballTeam[]).find(t => t.id === oppId) ?? null,
    isHome,
    dayOfSeason: dayOf(pick),
    played: pick.status === 'played',
  };
}

export function fmtMoney(n: number): string {
  const m = n / 1e6;
  return `$${m.toFixed(1)}M`;
}
