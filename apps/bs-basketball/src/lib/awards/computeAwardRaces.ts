/**
 * Ranked award-race leaderboards (parity with football's Award Race page).
 * Basketball only had single winners; this returns a sorted top-10 of candidates
 * per category with a normalized score + a stat line, computed live off the
 * aggregated regular-season box scores. Deterministic.
 */

import { perGame, type BasketballPlayer, type BasketballStats } from '@bs/sport-basketball';
import { computeSeasonAwards } from './computeAwards';
import type { BaseLeagueState, PlayerId } from '@bs/core/adapter';
import type { BasketballRatings } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type AwardRaceKey = 'mvp' | 'dpoy' | 'roy' | 'sixthMan' | 'mip' | 'coy';

export interface AwardRaceEntry {
  playerId: string;
  teamId: string;
  position: string;
  score: number;
  keyStatLine: string;
  /** Coach-of-the-year entries are teams (rendered with a team logo). */
  isCoach?: boolean;
}

export interface AwardRace {
  key: AwardRaceKey;
  title: string;
  emoji: string;
  subtitle: string;
  entries: AwardRaceEntry[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const offLine = (g: ReturnType<typeof perGame>) => `${r1(g.points ?? 0)} PPG / ${r1(g.totalRebounds ?? 0)} RPG / ${r1(g.assists ?? 0)} APG`;
const defLine = (g: ReturnType<typeof perGame>) => `${r1(g.points ?? 0)} PPG / ${r1(g.steals ?? 0)} SPG / ${r1(g.blocks ?? 0)} BPG`;

export function computeAwardRaces(league: LeagueState): AwardRace[] | null {
  const awards = computeSeasonAwards(league);
  if (!awards) return null;
  const { seasonStats } = awards;

  const teamById = new Map(league.teams.map(t => [t.id as string, t]));
  const winPct = (teamId: string) => {
    const t = teamById.get(teamId);
    if (!t) return 0;
    const gp = t.record.wins + t.record.losses;
    return gp > 0 ? t.record.wins / gp : 0;
  };

  // Build a candidate row per rostered player who has logged minutes.
  interface Cand { p: BasketballPlayer; teamId: string; g: ReturnType<typeof perGame>; gp: number; started: number }
  const cands: Cand[] = [];
  for (const raw of Object.values(league.players) as BasketballPlayer[]) {
    const teamId = raw.rosterSlot?.teamId;
    if (!teamId) continue;
    const stats = seasonStats.get(raw.id as PlayerId);
    if (!stats || stats.gamesPlayed < 5) continue;
    cands.push({ p: raw, teamId, g: perGame(stats), gp: stats.gamesPlayed, started: stats.gamesStarted ?? 0 });
  }

  const top = (rows: { entry: AwardRaceEntry }[]) =>
    rows.map(r => r.entry).sort((a, b) => b.score - a.score).slice(0, 10);

  const entry = (c: Cand, score: number, line: string): AwardRaceEntry => ({
    playerId: c.p.id, teamId: c.teamId, position: c.p.sportData.position, score: Math.round(score * 10) / 10, keyStatLine: line,
  });

  // MVP — production weighted by team success.
  const mvp = top(cands.map(c => ({
    entry: entry(c, (c.g.points ?? 0) + 0.7 * (c.g.totalRebounds ?? 0) + 0.7 * (c.g.assists ?? 0) + winPct(c.teamId) * 12, offLine(c.g)),
  })));

  // DPOY — stocks + defensive boards.
  const dpoy = top(cands.map(c => ({
    entry: entry(c, (c.g.steals ?? 0) * 4 + (c.g.blocks ?? 0) * 4 + (c.g.defensiveRebounds ?? 0) + winPct(c.teamId) * 4, defLine(c.g)),
  })));

  // ROY — rookies (first year) by production.
  const roy = top(cands.filter(c => c.p.sportData.yearsInLeague === 0).map(c => ({
    entry: entry(c, (c.g.points ?? 0) + 0.6 * (c.g.totalRebounds ?? 0) + 0.6 * (c.g.assists ?? 0), offLine(c.g)),
  })));

  // 6MOY — bench scorers (started < half their games).
  const sixthMan = top(cands.filter(c => c.started / c.gp < 0.5).map(c => ({
    entry: entry(c, (c.g.points ?? 0) + 0.5 * (c.g.assists ?? 0) + 0.5 * (c.g.totalRebounds ?? 0), offLine(c.g)),
  })));

  // MIP — biggest jump vs last season's rating.
  const mip = top(cands.filter(c => {
    const prev = (c.p.sportData as { prevRatings?: BasketballRatings }).prevRatings;
    return prev && c.p.ratings.overall - prev.overall >= 2;
  }).map(c => {
    const prev = (c.p.sportData as { prevRatings?: BasketballRatings }).prevRatings!;
    return { entry: entry(c, (c.p.ratings.overall - prev.overall) * 6 + (c.g.points ?? 0) * 0.4, offLine(c.g)) };
  }));

  // COY — best teams (coach entries, rendered with a team logo).
  const coy: AwardRaceEntry[] = [...league.teams]
    .map(t => ({ playerId: t.id, teamId: t.id, position: '', score: Math.round(winPct(t.id) * 1000) / 10, keyStatLine: `${t.record.wins}-${t.record.losses}`, isCoach: true }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return [
    { key: 'mvp', title: 'Most Valuable Player', emoji: '🏆', subtitle: 'Production + winning', entries: mvp },
    { key: 'dpoy', title: 'Defensive Player of the Year', emoji: '🛡️', subtitle: 'Stocks + defense', entries: dpoy },
    { key: 'roy', title: 'Rookie of the Year', emoji: '🌱', subtitle: 'First-year leaders', entries: roy },
    { key: 'sixthMan', title: 'Sixth Man of the Year', emoji: '🔥', subtitle: 'Best off the bench', entries: sixthMan },
    { key: 'mip', title: 'Most Improved Player', emoji: '📈', subtitle: 'Biggest leap', entries: mip },
    { key: 'coy', title: 'Coach of the Year', emoji: '🎩', subtitle: 'Best records', entries: coy },
  ];
}
