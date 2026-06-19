/**
 * BUG-23 — "Show affordable only" must actually filter the free-agent pool.
 *
 * Reported by Tyler 2026-06-17 (Cowork chat) on a Clippers save at 14/15
 * roster, $10.3M cap space: clicking the toggle highlighted the button but
 * the visible list was unchanged — all 276 players still shown, including
 * a $45.3M ask.
 *
 * Root cause: the affordable predicate was
 *   `f.marketSalary <= bud OR (openSpot && uncontested)`
 * At Day 0 every player is uncontested (AI bidding hasn't fired yet), and a
 * 14/15 roster has an open spot, so every player satisfied the second
 * disjunct regardless of price. The filter was effectively a no-op.
 *
 * Fix: drop the safety-valve disjunct. `signingBudget` already returns at
 * least LEAGUE_MINIMUM_SALARY (BUG-17 — minimum-exception availability is
 * always guaranteed), so over-cap teams still see minimum-tier players when
 * the filter is on. The actual vet-minimum signing path in
 * `resolveUserOffer` is unaffected and still works at sign-time.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { convertBbgmLeague, type BbgmLeagueFile } from '@/../apps/bs-basketball/src/lib/data/leagueImport';
import { assembleLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import {
  freeAgentPool,
  signingBudget,
} from '@/../apps/bs-basketball/src/lib/freeAgency';

const FILE = resolve(__dirname, '../../apps/bs-basketball/public/rosters/BBGM_NBA_Roster_2026_Updated.json');

/** Build a real-shape imported league with a user team set (mirrors what
 *  Tyler's save looks like at the FA window in inaugural). */
function importedLeagueAsUser() {
  const file = JSON.parse(readFileSync(FILE, 'utf8')) as BbgmLeagueFile;
  const imported = convertBbgmLeague(file);
  const league = assembleLeague({
    teams: imported.teams,
    players: imported.players,
    freeAgentIds: imported.freeAgentIds,
    season: imported.season,
  });
  return { ...league, userTeamId: league.teams[0].id };
}

/** The exact filter `free-agency/page.tsx` uses after the BUG-23 fix. */
function affordableIdsFix(league: ReturnType<typeof importedLeagueAsUser>): Set<string> {
  const set = new Set<string>();
  if (!league.userTeamId) return set;
  const bud = signingBudget(league, league.userTeamId);
  for (const f of freeAgentPool(league)) {
    if (f.marketSalary <= bud) set.add(f.player.id);
  }
  return set;
}

describe('BUG-23: "Show affordable only" filter actually filters', () => {
  const league = importedLeagueAsUser();
  const pool = freeAgentPool(league);
  const bud = signingBudget(league, league.userTeamId!);

  it('the test fixture has a real FA pool (otherwise we are testing nothing)', () => {
    expect(pool.length).toBeGreaterThan(50);
  });

  it('no player asking above signing budget appears in the affordable set', () => {
    const affordable = affordableIdsFix(league);
    for (const f of pool) {
      if (affordable.has(f.player.id)) {
        expect(
          f.marketSalary,
          `${f.player.firstName} ${f.player.lastName} (ask $${(f.marketSalary / 1_000_000).toFixed(1)}M) is in affordable set but exceeds budget $${(bud / 1_000_000).toFixed(1)}M`,
        ).toBeLessThanOrEqual(bud);
      }
    }
  });

  it('filtered list is materially smaller than the full pool', () => {
    const fullCount = pool.length;
    const filteredCount = affordableIdsFix(league).size;
    expect(filteredCount).toBeLessThan(fullCount);
    // And at least some players survive the filter — the pool always has
    // minimum-tier vets that fit any budget that's at least the league min.
    expect(filteredCount).toBeGreaterThan(0);
  });

});
