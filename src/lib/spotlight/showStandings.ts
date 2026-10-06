/**
 * Standings for the show's graphics: the conference playoff race (seeds,
 * the cut line, games back) or the team's division. Pure (client-safe).
 */
import type { Team } from '@/types';

export interface StandingsRow {
  teamId: string;
  abbreviation: string;
  name: string;
  record: string;
  /** Playoff seed (1–7) if they'd be in today. */
  seed: number | null;
  /** Games back of the last playoff spot (conference) or the leader (division); 0 = in / leading. */
  gb: number;
  isUser: boolean;
}

export interface StandingsBoard {
  title: string;
  rows: StandingsRow[];
  /** Draw the playoff cut line after this many rows (conference race). */
  cutAfter: number | null;
}

const games = (t: Team) => t.record.wins + t.record.losses + (t.record.ties ?? 0);
const pct = (t: Team) => (games(t) ? (t.record.wins + (t.record.ties ?? 0) / 2) / games(t) : 0);
const diff = (t: Team) => t.record.pointsFor - t.record.pointsAgainst;
const byRecord = (a: Team, b: Team) => pct(b) - pct(a) || diff(b) - diff(a);
const rec = (t: Team) => `${t.record.wins}-${t.record.losses}${t.record.ties ? `-${t.record.ties}` : ''}`;
const behind = (a: Team, b: Team) => Math.max(0, ((b.record.wins - a.record.wins) + (a.record.losses - b.record.losses)) / 2);

const CONF = { AC: 'AC', NC: 'NC' } as const;

/** The team's conference race: division leaders seeded 1–4, wild cards 5–7. */
export function conferenceRace(team: Team, teams: Team[]): StandingsBoard {
  const conf = teams.filter(t => t.conference === team.conference);
  const leaders = (['North', 'South', 'East', 'West'] as const)
    .map(d => conf.filter(t => t.division === d).sort(byRecord)[0])
    .filter((t): t is Team => !!t)
    .sort(byRecord);
  const rest = conf.filter(t => !leaders.includes(t)).sort(byRecord);
  const order = [...leaders, ...rest.slice(0, 3), ...rest.slice(3)];
  const seven = order[6];
  const all: StandingsRow[] = order.map((t, i) => ({
    teamId: t.id, abbreviation: t.abbreviation, name: `${t.city} ${t.name}`, record: rec(t),
    seed: i < 7 ? i + 1 : null,
    gb: i < 7 || !seven ? 0 : behind(t, seven),
    isUser: t.id === team.id,
  }));
  const me = all.findIndex(r => r.isUser);
  // In the hunt: seeds 1–8. Further back: the bottom seeds, then the team
  // and the teams around it.
  const rows = me <= 7 ? all.slice(0, 8) : [...all.slice(3, 7), ...all.slice(Math.max(7, me - 2), me + 2)];
  return { title: `${CONF[team.conference]} playoff race`, rows, cutAfter: rows.findIndex(r => !r.seed) > 0 ? rows.findIndex(r => !r.seed) : null };
}

/** The team's division, leader first. */
export function divisionTable(team: Team, teams: Team[]): StandingsBoard {
  const div = teams.filter(t => t.conference === team.conference && t.division === team.division).sort(byRecord);
  const lead = div[0];
  return {
    title: `${team.conference} ${team.division}`,
    rows: div.map(t => ({ teamId: t.id, abbreviation: t.abbreviation, name: `${t.city} ${t.name}`, record: rec(t), seed: null, gb: lead ? behind(t, lead) : 0, isUser: t.id === team.id })),
    cutAfter: null,
  };
}
