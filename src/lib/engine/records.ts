/**
 * Stat records: career and single-season leaderboards, league-wide or for one
 * franchise.
 *
 * Pure and derived. Nothing here is persisted: every board is computed from
 * what a save already holds, so it works on existing saves as they are.
 *
 *   - `player.seasonLog`   one line per finished season, with the team the
 *                          season is credited to (written at rollover)
 *   - `player.stats`       the season being played
 *   - `player.careerStats` the running career total
 *
 * Single-game records are deliberately not here. Box scores
 * (`schedule[].playerStats`) are stripped from every non-user game when a save
 * is written and the whole schedule is replaced at rollover, so there is no
 * history to derive them from.
 */

import type { Player, PlayerStats } from '@/types';

export interface RecordCategory {
  key: string;
  label: string;
  /** Must be additive across stat lines (a sum of fields, never a rate), so a
   *  career value is the sum of its seasons' values. */
  value: (s: PlayerStats) => number;
}

export const RECORD_CATEGORIES: RecordCategory[] = [
  { key: 'passYards', label: 'Passing Yards', value: s => s.passYards },
  { key: 'passTDs', label: 'Passing TDs', value: s => s.passTDs },
  { key: 'rushYards', label: 'Rushing Yards', value: s => s.rushYards },
  { key: 'receivingYards', label: 'Receiving Yards', value: s => s.receivingYards },
  { key: 'totalTDs', label: 'Total TDs', value: s => s.passTDs + s.rushTDs + s.receivingTDs },
  { key: 'sacks', label: 'Sacks', value: s => s.sacks },
  { key: 'tackles', label: 'Tackles', value: s => s.tackles },
  { key: 'tacklesForLoss', label: 'Tackles for Loss', value: s => s.tacklesForLoss },
  { key: 'defensiveINTs', label: 'Def. Interceptions', value: s => s.defensiveINTs },
  { key: 'passDeflections', label: 'Pass Deflections', value: s => s.passDeflections },
];

export interface RecordEntry {
  playerId: string;
  name: string;
  position: string;
  /** Single-season boards: the team that season. Career boards: the team the
   *  board is scoped to, else the player's current team (null when a free
   *  agent or retired). */
  teamId: string | null;
  value: number;
  retired: boolean;
  /** Single-season boards: the season the total was put up. */
  season?: number;
  /** Single-season boards: the season is still being played. */
  inProgress?: boolean;
  /** Career boards: first and last season counted, when the save has a
   *  season-by-season log for the player. */
  firstSeason?: number;
  lastSeason?: number;
}

export interface RecordBoard {
  key: string;
  label: string;
  entries: RecordEntry[];
}

export interface RecordOptions {
  /** The season in progress (`state.season`). */
  currentSeason: number;
  /** Only count seasons played for this team. Omit for league-wide boards. */
  teamId?: string;
  /** Rows per board. */
  limit?: number;
}

const DEFAULT_LIMIT = 10;

interface SeasonLine {
  season: number;
  teamId: string | null;
  stats: PlayerStats;
  inProgress: boolean;
}

/** A player's seasons: the logged ones plus the one in progress. */
function seasonLines(player: Player, currentSeason: number): SeasonLine[] {
  const lines: SeasonLine[] = [];
  let currentLogged = false;
  for (const entry of player.seasonLog ?? []) {
    if (!entry?.stats) continue;
    if (entry.season === currentSeason) currentLogged = true;
    lines.push({ season: entry.season, teamId: entry.teamId ?? null, stats: entry.stats, inProgress: false });
  }
  // `stats` is the current season until rollover moves it into the log. Skip
  // it if the log somehow already has this season, so it is never counted
  // twice. In the offseason `seasonTeamId` is the team the season was played
  // for, which a free-agent signing has not changed.
  if (!currentLogged && player.stats) {
    lines.push({
      season: currentSeason,
      teamId: player.seasonTeamId ?? player.teamId ?? null,
      stats: player.stats,
      inProgress: true,
    });
  }
  return lines;
}

function baseEntry(player: Player): Pick<RecordEntry, 'playerId' | 'name' | 'position' | 'retired'> {
  return {
    playerId: player.id,
    name: `${player.firstName} ${player.lastName}`,
    position: player.position,
    retired: !!player.retired,
  };
}

/** Highest value first; a tie goes to whoever got there first, then by name
 *  so the order never depends on the order of `players`. */
function rank(entries: RecordEntry[], limit: number): RecordEntry[] {
  return entries
    .filter(e => e.value > 0)
    .sort((a, b) =>
      b.value - a.value
      || (a.season ?? a.lastSeason ?? 0) - (b.season ?? b.lastSeason ?? 0)
      || a.name.localeCompare(b.name)
      || a.playerId.localeCompare(b.playerId))
    .slice(0, limit);
}

function boards(perCategory: RecordEntry[][], limit: number): RecordBoard[] {
  return RECORD_CATEGORIES
    .map((cat, i) => ({ key: cat.key, label: cat.label, entries: rank(perCategory[i], limit) }))
    .filter(board => board.entries.length > 0);
}

/**
 * Best single-season totals. Each player season is its own entry, so one
 * player can hold several spots on a board. With `teamId`, only seasons the
 * player finished on that team count.
 */
export function singleSeasonRecords(players: Player[], options: RecordOptions): RecordBoard[] {
  const { currentSeason, teamId, limit = DEFAULT_LIMIT } = options;
  const perCategory: RecordEntry[][] = RECORD_CATEGORIES.map(() => []);

  for (const player of players) {
    const base = baseEntry(player);
    for (const line of seasonLines(player, currentSeason)) {
      if (teamId !== undefined && line.teamId !== teamId) continue;
      RECORD_CATEGORIES.forEach((cat, i) => {
        const value = cat.value(line.stats);
        if (value > 0) {
          perCategory[i].push({
            ...base,
            teamId: line.teamId,
            value,
            season: line.season,
            ...(line.inProgress ? { inProgress: true } : {}),
          });
        }
      });
    }
  }

  return boards(perCategory, limit);
}

/**
 * Career totals.
 *
 * League-wide: the larger of `careerStats` and the sum of the player's logged
 * seasons. `careerStats` is normally the bigger or equal one (it can include
 * seasons from before the log existed), but it is not updated by every path
 * that commits a game, so the season log is the floor.
 *
 * With `teamId`: only the seasons the player finished on that team, summed
 * from the season log and the season in progress. A player traded away keeps
 * the totals from his seasons with the team; seasons a save has no log for
 * cannot be attributed to a team and are left out.
 */
export function careerRecords(players: Player[], options: RecordOptions): RecordBoard[] {
  const { currentSeason, teamId, limit = DEFAULT_LIMIT } = options;
  const perCategory: RecordEntry[][] = RECORD_CATEGORIES.map(() => []);

  for (const player of players) {
    const lines = seasonLines(player, currentSeason)
      .filter(line => teamId === undefined || line.teamId === teamId);
    if (teamId !== undefined && lines.length === 0) continue;

    const base = baseEntry(player);
    RECORD_CATEGORIES.forEach((cat, i) => {
      let logged = 0;
      let firstSeason: number | undefined;
      let lastSeason: number | undefined;
      for (const line of lines) {
        const v = cat.value(line.stats);
        if (v <= 0) continue;
        logged += v;
        if (firstSeason === undefined || line.season < firstSeason) firstSeason = line.season;
        if (lastSeason === undefined || line.season > lastSeason) lastSeason = line.season;
      }
      const value = teamId !== undefined
        ? logged
        : Math.max(logged, player.careerStats ? cat.value(player.careerStats) : 0);
      if (value > 0) {
        perCategory[i].push({
          ...base,
          teamId: teamId ?? player.teamId ?? null,
          value,
          ...(firstSeason !== undefined ? { firstSeason, lastSeason } : {}),
        });
      }
    });
  }

  return boards(perCategory, limit);
}
