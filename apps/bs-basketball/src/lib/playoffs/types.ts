/**
 * Playoff bracket types (Phase 2D-1).
 *
 * The bracket lives on `league.sportData.playoffs`. It is plain serializable
 * data (no functions) so it survives the Dexie JSON round-trip.
 *
 * Shape: a symmetric 16-team NBA bracket — 8 seeds per conference, 1v8 / 4v5 /
 * 3v6 / 2v7 in round 1, winners feed conference semis → conference finals →
 * Finals. Each series is best-of-7 with home court to the higher seed
 * (better regular-season record decides the cross-conference Finals).
 *
 * Each series stores its two bracket slots (`teamA` = home-court team once both
 * sides are known, `teamB` = the other) plus per-side series-win counts and the
 * ids of the games that have been played. Later rounds start with null slots
 * that fill in as earlier series resolve.
 */

import type { TeamId } from '@bs/core/adapter';

export type PlayoffConference = 'Eastern' | 'Western' | 'Finals';

/** A single best-of-7 series. */
export interface PlayoffSeries {
  id: string;
  /** 1 = First Round, 2 = Conf Semis, 3 = Conf Finals, 4 = Finals. */
  round: number;
  roundName: string;
  conference: PlayoffConference;
  /** Top bracket slot. Normalized to the home-court (higher) seed once both
   *  teams are known. Null until the feeding series resolve. */
  teamA: TeamId | null;
  teamB: TeamId | null;
  /** Conference seed (1-8) of each slot, for display. Null until known. */
  seedA: number | null;
  seedB: number | null;
  winsA: number;
  winsB: number;
  /** Set when one side reaches 4 wins. */
  winnerTeamId: TeamId | null;
  /** Ids of games played in this series, in order. */
  gameIds: string[];
  /** Where this series' winner advances. Null for the Finals. */
  next: { seriesId: string; slot: 'A' | 'B' } | null;
}

/** Per-team metadata used to decide home court in any matchup. */
export interface PlayoffSeedInfo {
  teamId: TeamId;
  conference: 'Eastern' | 'Western';
  seed: number; // 1-8 within conference
  wins: number;
  pointDiff: number;
}

export interface PlayoffBracket {
  season: number;
  /** rounds[0] = first round (8 series), [1] = semis (4), [2] = conf finals (2),
   *  [3] = Finals (1). */
  rounds: PlayoffSeries[][];
  /** Seeded team ids per conference, index 0 = the 1-seed. */
  seeds: { Eastern: TeamId[]; Western: TeamId[] };
  /** Lookup for home-court decisions, keyed by team id. */
  seedInfo: Record<string, PlayoffSeedInfo>;
  /** Number of playoff "days" simmed so far (one game per active series/day). */
  dayIndex: number;
  championTeamId: TeamId | null;
  runnerUpTeamId: TeamId | null;
  complete: boolean;
}
