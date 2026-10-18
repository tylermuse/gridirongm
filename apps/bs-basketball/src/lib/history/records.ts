/**
 * Record book (history drill-down, franchise records, league records).
 *
 * Pure reads over the season archive in `league.seasonHistory` (see
 * history.ts). Full-season games are replaced at rollover, so everything here
 * comes from what the archive keeps:
 *
 *   - Extended entries (written by `buildSeasonHistoryEntry` since the record
 *     book shipped) carry team records, playoff depth, every award, All-League
 *     teams, per-player season totals, and the retirement class.
 *   - Legacy entries only have champion / runner-up / MVP / Finals MVP /
 *     scoring leader. For those we fall back to each *current* player's
 *     `sportData.seasonLog` (ppg/rpg/apg, no team) for stat leaders — players
 *     who've since retired are gone from that fallback.
 *
 * Franchise splits credit a player's whole season to the team he finished it
 * on (mid-season trades aren't split).
 */

import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import type { AllLeagueTeam } from '../awards';
import {
  getSeasonHistory,
  type HistoryAwardRef,
  type HistoryPlayerLine,
  type HistoryRetiree,
  type HistoryTeamRecord,
  type SeasonHistoryEntry,
} from './history';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type AwardKey = 'mvp' | 'finalsMvp' | 'dpoy' | 'roy' | 'sixthMan' | 'mip' | 'coy';

export const AWARD_LABELS: Record<AwardKey, string> = {
  mvp: 'Most Valuable Player',
  finalsMvp: 'Finals MVP',
  dpoy: 'Defensive Player of the Year',
  roy: 'Rookie of the Year',
  sixthMan: 'Sixth Man of the Year',
  mip: 'Most Improved Player',
  coy: 'Coach of the Year',
};
const AWARD_ORDER: AwardKey[] = ['mvp', 'finalsMvp', 'dpoy', 'roy', 'sixthMan', 'mip', 'coy'];

export type StatCategory = 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'tpg';
export const STAT_LABELS: Record<StatCategory, string> = {
  ppg: 'Points', rpg: 'Rebounds', apg: 'Assists', spg: 'Steals', bpg: 'Blocks', tpg: '3-Pointers',
};

/** One per-game season line, normalized from either archive source. */
export interface SeasonLine {
  season: number;
  playerId: string;
  name: string;
  teamId: TeamId | null;
  gp: number;
  ppg: number;
  rpg: number;
  apg: number;
  /** Null when the source (legacy seasonLog) didn't track it. */
  spg: number | null;
  bpg: number | null;
  tpg: number | null;
}

export interface StatLeader {
  category: StatCategory;
  playerId: string;
  name: string;
  teamId: TeamId | null;
  value: number;
}

export interface SeasonAwardRow {
  key: AwardKey;
  label: string;
  winner: HistoryAwardRef;
}

export interface SeasonDrillDown {
  season: number;
  champion: TeamId | null;
  runnerUp: TeamId | null;
  finals: { championWins: number; runnerUpWins: number } | null;
  bestRecord: HistoryTeamRecord | null;
  bestByConference: { Eastern: HistoryTeamRecord | null; Western: HistoryTeamRecord | null };
  standings: HistoryTeamRecord[];
  awards: SeasonAwardRow[];
  leaders: StatLeader[];
  allLeague: AllLeagueTeam[];
  allDefensive: AllLeagueTeam[];
  allRookie: AllLeagueTeam[];
  retired: HistoryRetiree[];
  /** False for saves written before the extended archive: only the legacy
   *  fields are available and leaders come from surviving players' logs. */
  extended: boolean;
}

// ===========================================================================
// Helpers
// ===========================================================================

function playerName(league: LeagueState, id: string): string {
  const p = league.players[id as keyof typeof league.players] as BasketballPlayer | undefined;
  return p ? `${p.firstName} ${p.lastName}` : 'Unknown player';
}

function fromArchive(season: number, l: HistoryPlayerLine): SeasonLine {
  const g = Math.max(1, l.gp);
  return {
    season, playerId: l.id, name: l.name, teamId: l.teamId, gp: l.gp,
    ppg: l.pts / g, rpg: l.reb / g, apg: l.ast / g,
    spg: l.stl / g, bpg: l.blk / g, tpg: l.tpm / g,
  };
}

/** Season lines for one season — archived totals if present, else the
 *  surviving players' seasonLog entries (no team, no steals/blocks). */
export function seasonLines(league: LeagueState, entry: SeasonHistoryEntry): SeasonLine[] {
  if (entry.playerLines) return entry.playerLines.map(l => fromArchive(entry.season, l));
  const out: SeasonLine[] = [];
  for (const p of Object.values(league.players) as BasketballPlayer[]) {
    const e = p.sportData.seasonLog?.find(x => x.season === entry.season);
    if (!e || e.gamesPlayed < 1) continue;
    out.push({
      season: entry.season, playerId: p.id, name: `${p.firstName} ${p.lastName}`, teamId: null,
      gp: e.gamesPlayed, ppg: e.ppg, rpg: e.rpg, apg: e.apg, spg: null, bpg: null, tpg: null,
    });
  }
  return out;
}

/** Qualifier for per-game leaders: 60% of the most games anyone played. */
function qualified(lines: SeasonLine[]): SeasonLine[] {
  const maxGp = lines.reduce((m, l) => Math.max(m, l.gp), 0);
  const min = Math.max(1, Math.round(maxGp * 0.6));
  return lines.filter(l => l.gp >= min);
}

function leaderOf(lines: SeasonLine[], cat: StatCategory): SeasonLine | null {
  let best: SeasonLine | null = null;
  for (const l of lines) {
    const v = l[cat];
    if (v == null) continue;
    if (!best || v > (best[cat] as number)) best = l;
  }
  return best;
}

function byRecord(a: HistoryTeamRecord, b: HistoryTeamRecord): number {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (a.losses !== b.losses) return a.losses - b.losses;
  return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
}

function winPct(r: { wins: number; losses: number }): number {
  const g = r.wins + r.losses;
  return g > 0 ? r.wins / g : 0;
}

function findEntry(league: LeagueState, season: number): SeasonHistoryEntry | null {
  return getSeasonHistory(league).find(e => e.season === season) ?? null;
}

/** Furthest round reached; legacy entries only know champion/runner-up. */
function roundReached(entry: SeasonHistoryEntry, teamId: string): number {
  if (entry.playoffRound) return entry.playoffRound[teamId] ?? 0;
  if (entry.champion === teamId || entry.runnerUp === teamId) return 4;
  return 0;
}

// ===========================================================================
// Season drill-down
// ===========================================================================

export function getSeasonDrillDown(league: LeagueState, season: number): SeasonDrillDown | null {
  const entry = findEntry(league, season);
  if (!entry) return null;

  const standings = [...(entry.teamRecords ?? [])].sort(byRecord);
  const bestIn = (conf: 'Eastern' | 'Western') => standings.find(r => r.conference === conf) ?? null;

  // Awards — extended map, else the two legacy refs.
  const awardMap: Partial<Record<AwardKey, HistoryAwardRef>> = entry.awards
    ? entry.awards
    : {
        ...(entry.mvp ? { mvp: entry.mvp } : {}),
        ...(entry.finalsMvp ? { finalsMvp: entry.finalsMvp } : {}),
      };
  const awards: SeasonAwardRow[] = AWARD_ORDER
    .filter(k => !!awardMap[k])
    .map(k => ({ key: k, label: AWARD_LABELS[k], winner: awardMap[k]! }));

  const pool = qualified(seasonLines(league, entry));
  const leaders: StatLeader[] = [];
  for (const cat of Object.keys(STAT_LABELS) as StatCategory[]) {
    const l = leaderOf(pool, cat);
    if (l) leaders.push({ category: cat, playerId: l.playerId, name: l.name, teamId: l.teamId, value: l[cat] as number });
  }

  return {
    season,
    champion: entry.champion,
    runnerUp: entry.runnerUp,
    finals: entry.finals ?? null,
    bestRecord: standings[0] ?? null,
    bestByConference: { Eastern: bestIn('Eastern'), Western: bestIn('Western') },
    standings,
    awards,
    leaders,
    allLeague: entry.allLeague ?? [],
    allDefensive: entry.allDefensive ?? [],
    allRookie: entry.allRookie ?? [],
    retired: entry.retired ?? [],
    extended: !!entry.playerLines,
  };
}

// ===========================================================================
// Franchise records
// ===========================================================================

export interface FranchiseSeasonRow {
  season: number;
  wins: number;
  losses: number;
  /** 0 = missed the main bracket, 1-4 = round reached. */
  playoffRound: number;
  champion: boolean;
}

export interface CareerLeaderRow {
  playerId: string;
  name: string;
  value: number;
  gp: number;
}

export interface FranchiseRecords {
  teamId: TeamId;
  titles: number[];
  finalsAppearances: number[];
  playoffAppearances: number[];
  seasons: FranchiseSeasonRow[];
  bestSeason: FranchiseSeasonRow | null;
  worstSeason: FranchiseSeasonRow | null;
  /** Franchise-only career totals (from archived per-season lines). */
  careerLeaders: { points: CareerLeaderRow[]; rebounds: CareerLeaderRow[]; assists: CareerLeaderRow[] };
  /** Best single seasons in a franchise uniform. */
  bestSeasons: Record<'ppg' | 'rpg' | 'apg', SeasonLine[]>;
  /** Award wins by franchise players (team at time of award). */
  awardsWon: { season: number; key: AwardKey; label: string; name: string; id: string }[];
  /** Seasons with no per-team archive (legacy saves): leaders/records skip them. */
  seasonsWithoutSplits: number[];
}

const TOP_N = 10;

export function getFranchiseRecords(league: LeagueState, teamId: TeamId): FranchiseRecords {
  const history = getSeasonHistory(league).slice().sort((a, b) => a.season - b.season);
  const titles: number[] = [];
  const finalsAppearances: number[] = [];
  const playoffAppearances: number[] = [];
  const seasons: FranchiseSeasonRow[] = [];
  const seasonsWithoutSplits: number[] = [];
  const totals = new Map<string, { name: string; gp: number; pts: number; reb: number; ast: number }>();
  const lines: SeasonLine[] = [];
  const awardsWon: FranchiseRecords['awardsWon'] = [];

  for (const e of history) {
    const round = roundReached(e, teamId);
    if (e.champion === teamId) titles.push(e.season);
    if (e.champion === teamId || e.runnerUp === teamId) finalsAppearances.push(e.season);
    if (round > 0) playoffAppearances.push(e.season);

    const rec = e.teamRecords?.find(r => r.teamId === teamId);
    if (rec) seasons.push({ season: e.season, wins: rec.wins, losses: rec.losses, playoffRound: round, champion: e.champion === teamId });

    if (e.playerLines) {
      for (const l of e.playerLines) {
        if (l.teamId !== teamId) continue;
        const t = totals.get(l.id) ?? { name: l.name, gp: 0, pts: 0, reb: 0, ast: 0 };
        t.name = l.name; t.gp += l.gp; t.pts += l.pts; t.reb += l.reb; t.ast += l.ast;
        totals.set(l.id, t);
        lines.push(fromArchive(e.season, l));
      }
    } else {
      seasonsWithoutSplits.push(e.season);
    }

    const awardMap = e.awards ?? {
      ...(e.mvp ? { mvp: e.mvp } : {}),
      ...(e.finalsMvp ? { finalsMvp: e.finalsMvp } : {}),
    };
    for (const k of AWARD_ORDER) {
      const a = (awardMap as Partial<Record<AwardKey, HistoryAwardRef>>)[k];
      if (a && a.teamId === teamId) awardsWon.push({ season: e.season, key: k, label: AWARD_LABELS[k], name: a.name, id: a.id });
    }
  }

  const leaders = (field: 'pts' | 'reb' | 'ast'): CareerLeaderRow[] =>
    [...totals.entries()]
      .map(([playerId, t]) => ({ playerId, name: t.name, value: t[field], gp: t.gp }))
      .filter(r => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_N);

  // Per-season qualifier is applied within each season's league-wide pool.
  const qualifiedLines = history.flatMap(e => {
    if (!e.playerLines) return [];
    const q = new Set(qualified(e.playerLines.map(l => fromArchive(e.season, l))).map(l => l.playerId));
    return lines.filter(l => l.season === e.season && q.has(l.playerId));
  });
  const top = (cat: 'ppg' | 'rpg' | 'apg') =>
    [...qualifiedLines].sort((a, b) => b[cat] - a[cat]).slice(0, 5);

  const ranked = [...seasons].sort((a, b) => winPct(b) - winPct(a) || b.wins - a.wins);

  return {
    teamId,
    titles,
    finalsAppearances,
    playoffAppearances,
    seasons: seasons.slice().reverse(),
    bestSeason: ranked[0] ?? null,
    worstSeason: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    careerLeaders: { points: leaders('pts'), rebounds: leaders('reb'), assists: leaders('ast') },
    bestSeasons: { ppg: top('ppg'), rpg: top('rpg'), apg: top('apg') },
    awardsWon: awardsWon.reverse(),
    seasonsWithoutSplits,
  };
}

// ===========================================================================
// League records
// ===========================================================================

export interface TitleCount { teamId: TeamId; titles: number; seasons: number[] }
export interface TeamSeasonMark { season: number; teamId: TeamId; wins: number; losses: number }

export interface LeagueRecords {
  singleSeason: Record<'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg', SeasonLine | null>;
  mostTitles: TitleCount[];
  bestTeamSeason: TeamSeasonMark | null;
  worstTeamSeason: TeamSeasonMark | null;
  mostMvps: { playerId: string; name: string; count: number }[];
  /** Career leaders across active players (careerStats) — retirees are
   *  pruned from `league.players`, so only their archived points survive. */
  careerPoints: CareerLeaderRow[];
  careerRebounds: CareerLeaderRow[];
  careerAssists: CareerLeaderRow[];
}

export function getLeagueRecords(league: LeagueState): LeagueRecords {
  const history = getSeasonHistory(league);

  const allQualified = history.flatMap(e => qualified(seasonLines(league, e)));
  const best = (cat: 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg'): SeasonLine | null => leaderOf(allQualified, cat);

  const titleMap = new Map<string, number[]>();
  for (const e of history) {
    if (!e.champion) continue;
    titleMap.set(e.champion, [...(titleMap.get(e.champion) ?? []), e.season]);
  }
  const mostTitles: TitleCount[] = [...titleMap.entries()]
    .map(([teamId, seasons]) => ({ teamId: teamId as TeamId, titles: seasons.length, seasons: seasons.sort((a, b) => a - b) }))
    .sort((a, b) => b.titles - a.titles || a.seasons[0] - b.seasons[0]);

  const teamSeasons: TeamSeasonMark[] = history.flatMap(e =>
    (e.teamRecords ?? []).map(r => ({ season: e.season, teamId: r.teamId, wins: r.wins, losses: r.losses })));
  const byPct = [...teamSeasons].sort((a, b) => winPct(b) - winPct(a) || b.wins - a.wins);

  const mvpCounts = new Map<string, { name: string; count: number }>();
  for (const e of history) {
    const m = e.awards?.mvp ?? e.mvp;
    if (!m) continue;
    const cur = mvpCounts.get(m.id) ?? { name: m.name, count: 0 };
    cur.count++;
    mvpCounts.set(m.id, cur);
  }

  const active = (Object.values(league.players) as BasketballPlayer[]).filter(p => (p.careerStats?.gamesPlayed ?? 0) > 0);
  const career = (field: 'points' | 'totalRebounds' | 'assists'): CareerLeaderRow[] =>
    active
      .map(p => ({ playerId: p.id, name: `${p.firstName} ${p.lastName}`, value: p.careerStats[field] ?? 0, gp: p.careerStats.gamesPlayed }))
      .filter(r => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_N);

  // Fold retirees' archived career points into the points list.
  const careerPoints = career('points');
  const seen = new Set(careerPoints.map(r => r.playerId));
  for (const e of history) {
    for (const r of e.retired ?? []) {
      if (seen.has(r.id) || r.pts <= 0) continue;
      seen.add(r.id);
      careerPoints.push({ playerId: r.id, name: r.name, value: r.pts, gp: r.gp });
    }
  }
  careerPoints.sort((a, b) => b.value - a.value);

  return {
    singleSeason: { ppg: best('ppg'), rpg: best('rpg'), apg: best('apg'), spg: best('spg'), bpg: best('bpg') },
    mostTitles,
    bestTeamSeason: byPct[0] ?? null,
    worstTeamSeason: byPct.length > 1 ? byPct[byPct.length - 1] : null,
    mostMvps: [...mvpCounts.entries()]
      .map(([playerId, v]) => ({ playerId, name: v.name || playerName(league, playerId), count: v.count }))
      .sort((a, b) => b.count - a.count),
    careerPoints: careerPoints.slice(0, TOP_N),
    careerRebounds: career('totalRebounds'),
    careerAssists: career('assists'),
  };
}
