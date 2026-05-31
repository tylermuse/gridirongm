/**
 * "What's new" changelog (Tier 2.8). Bump CHANGELOG_VERSION when shipping
 * user-facing features and prepend an entry. A returning save whose
 * `sportData.lastSeenChangelog` is behind sees everything newer once.
 */

import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export const CHANGELOG_VERSION = 3;

export interface ChangelogEntry {
  v: number;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    v: 3,
    title: 'Polish + depth',
    items: [
      'New sidebar navigation and a phase-aware top bar that always shows your next move',
      'A schedule ticker on your dashboard and team page',
      'Deeper awards: All-NBA, All-Defensive and All-Rookie teams, plus the retirement class',
      'Bulk sim — a week, to the trade deadline, or the whole season at once',
      'Sim playoff rounds or the entire bracket in one click',
      'Draft scouting: spend scouts to reveal a prospect’s true potential',
    ],
  },
  {
    v: 2,
    title: 'The full GM loop',
    items: [
      'Playoffs, an awards ceremony, and a complete offseason: draft → free agency → trades',
      'Injuries, league history + career stats, and GM job security (get fired if you tank)',
    ],
  },
];

interface LeagueSportData { lastSeenChangelog?: number; [k: string]: unknown }

export function lastSeenChangelog(league: LeagueState): number {
  return (league.sportData as LeagueSportData | undefined)?.lastSeenChangelog ?? 0;
}

/** Entries newer than what this save has seen. */
export function unseenChangelog(league: LeagueState): ChangelogEntry[] {
  const seen = lastSeenChangelog(league);
  return CHANGELOG.filter(e => e.v > seen);
}

export function markChangelogSeen(league: LeagueState): LeagueState {
  return {
    ...league,
    sportData: { ...(league.sportData as LeagueSportData), lastSeenChangelog: CHANGELOG_VERSION },
  };
}
