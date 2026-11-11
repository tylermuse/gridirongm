import type { Player } from '@/types';

/** Smallest on-roster group that counts as a real draft class (half a round). */
const MIN_CLASS_SIZE = 16;

/**
 * The draft year of this season's rookie class, or null when no drafted class
 * can be identified (a generated league in its first season, for example).
 *
 * `experience` alone can't identify rookies: the season rollover adds a year to
 * everyone on a roster, including the class drafted a few weeks earlier, so a
 * drafted rookie plays his first season at experience 1. Only rookies who join
 * a league that starts mid-year (the real NFL roster) are still at 0.
 *
 * Normally the class is the one drafted for this season. A league started in
 * the offseason drafts first and then rolls straight into the next season, so
 * its first rookies carry last season's draft year; that class counts only
 * when this league ran the draft itself, which keeps second-year players from
 * a roster file that simply has no rookies in it from being called rookies.
 */
export function rookieClassYear(players: Player[], season: number): number | null {
  let thisYear = 0;
  let lastYear = 0;
  let lastYearDraftedHere = false;
  for (const p of players) {
    if (p.retired || !p.teamId) continue;
    if (p.draftYear === season) thisYear++;
    else if (p.draftYear === season - 1) {
      lastYear++;
      if (p.acquiredVia === 'draft' && p.acquiredSeason === season - 1) lastYearDraftedHere = true;
    }
  }
  if (thisYear >= MIN_CLASS_SIZE) return season;
  if (lastYear >= MIN_CLASS_SIZE && lastYearDraftedHere) return season - 1;
  return null;
}

/**
 * Builds the "is this player a rookie this season?" test for a league.
 * A rookie is in his first season: either he has never been through a rollover
 * (experience 0), or he belongs to this season's draft class and has been
 * through exactly the one rollover that follows the draft.
 */
export function makeRookieTest(players: Player[], season: number): (p: Player) => boolean {
  const classYear = rookieClassYear(players, season);
  return (p: Player) => {
    if (p.experience === 0) return true;
    if (p.experience !== 1 || classYear === null || p.draftYear == null) return false;
    return p.draftYear >= classYear && p.draftYear <= season;
  };
}
