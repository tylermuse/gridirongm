/**
 * Standings for the show's graphics (basketball): the conference race (seeds
 * 1–6 in, 7–10 play-in, the cut line, games back) or the team's division.
 * Pure (client-safe). Port of BS Football's showStandings.
 */
import type { ShowScheduleGame, ShowTeam } from './types';

export interface StandingsRow {
  teamId: string;
  abbreviation: string;
  name: string;
  record: string;
  /** Conference seed (1–10: 1–6 in, 7–10 play-in) if they'd be in today. */
  seed: number | null;
  /** Games back of the last play-in spot (conference) or the leader (division); 0 = in / leading. */
  gb: number;
  isUser: boolean;
}

export interface StandingsBoard {
  title: string;
  rows: StandingsRow[];
  /** Draw the playoff cut line after this many rows (conference race). */
  cutAfter: number | null;
}

const games = (t: ShowTeam) => t.record.wins + t.record.losses;
const pct = (t: ShowTeam) => (games(t) ? t.record.wins / games(t) : 0);
const diff = (t: ShowTeam) => t.record.pointsFor - t.record.pointsAgainst;
const byRecord = (a: ShowTeam, b: ShowTeam) => pct(b) - pct(a) || diff(b) - diff(a);
const rec = (t: ShowTeam) => `${t.record.wins}-${t.record.losses}`;
const behind = (a: ShowTeam, b: ShowTeam) => Math.max(0, ((b.record.wins - a.record.wins) + (a.record.losses - b.record.losses)) / 2);

const IN = 6;
const PLAY_IN = 10;

/** The team's conference race. */
export function conferenceRace(team: ShowTeam, teams: ShowTeam[]): StandingsBoard {
  const order = teams.filter(t => t.conference === team.conference).sort(byRecord);
  const tenth = order[PLAY_IN - 1];
  const all: StandingsRow[] = order.map((t, i) => ({
    teamId: t.id, abbreviation: t.abbreviation, name: `${t.city} ${t.name}`, record: rec(t),
    seed: i < PLAY_IN ? i + 1 : null,
    gb: i < PLAY_IN || !tenth ? 0 : behind(t, tenth),
    isUser: t.id === team.id,
  }));
  const me = all.findIndex(r => r.isUser);
  // In the hunt: the top 10. Further back: the play-in seeds, then the team
  // and the teams around it.
  const rows = me < PLAY_IN ? all.slice(0, PLAY_IN) : [...all.slice(IN, PLAY_IN), ...all.slice(Math.max(PLAY_IN, me - 2), me + 2)];
  const cut = rows.findIndex(r => !r.seed);
  return { title: `${team.conference} playoff race`, rows, cutAfter: cut > 0 ? cut : null };
}

/** The team's division, leader first. */
export function divisionTable(team: ShowTeam, teams: ShowTeam[]): StandingsBoard {
  const div = teams.filter(t => t.conference === team.conference && t.division === team.division).sort(byRecord);
  const lead = div[0];
  return {
    title: `${team.division} Division`,
    rows: div.map(t => ({ teamId: t.id, abbreviation: t.abbreviation, name: `${t.city} ${t.name}`, record: rec(t), seed: null, gb: lead ? behind(t, lead) : 0, isUser: t.id === team.id })),
    cutAfter: null,
  };
}

/** One game on the schedule board. */
export interface ScheduleRow {
  week: number;
  teamId: string;
  abbreviation: string;
  name: string;
  record: string;
  home: boolean;
  /** Played: the result from the spotlight team's side. */
  result?: { won: boolean; us: number; them: number };
}

export interface ScheduleBoard {
  title: string;
  rows: ScheduleRow[];
}

/**
 * The road ahead: the team's next `ahead` games (plus the last one played,
 * for context), with each opponent's record. Null before the schedule is
 * known or after the regular season.
 */
export function upcomingSchedule(team: ShowTeam, teams: ShowTeam[], schedule: ShowScheduleGame[], season: number, ahead = 5): ScheduleBoard | null {
  const mine = schedule
    .filter(g => g.season === season && (g.homeTeamId === team.id || g.awayTeamId === team.id));
  const next = mine.findIndex(g => !g.played);
  if (next < 0) return null;
  // `week` carries the game number (G41): Hoops plays several games a week.
  const rows = mine.slice(Math.max(0, next - 1), next + ahead).flatMap((g, k): ScheduleRow[] => {
    const home = g.homeTeamId === team.id;
    const opp = teams.find(t => t.id === (home ? g.awayTeamId : g.homeTeamId));
    if (!opp) return [];
    const us = home ? g.homeScore : g.awayScore, them = home ? g.awayScore : g.homeScore;
    return [{
      week: Math.max(0, next - 1) + k + 1, teamId: opp.id, abbreviation: opp.abbreviation, name: `${opp.city} ${opp.name}`, record: rec(opp), home,
      ...(g.played ? { result: { won: us > them, us, them } } : {}),
    }];
  });
  if (!rows.length) return null;
  const road = rows.filter(r => !r.result && !r.home).length;
  const left = rows.filter(r => !r.result).length;
  return { title: road >= Math.ceil(left / 2) && left > 1 ? `The road ahead · ${road} of the next ${left} away` : 'The road ahead', rows };
}
