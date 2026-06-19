/**
 * BUG-21 regression — the re-sign window must not pre-mark expiring players
 * as "Re-signed" when no decision has been made yet.
 *
 * Reported by Tyler 2026-06-17 on a Clippers save in the inaugural 2026
 * offseason: every expiring player (Kawhi, Bradley Beal, Bogdan, etc.) showed
 * a green checkmark + "Re-signed · -$X/yr" badge, and the cap header read
 * `CAP SPACE TO SPEND (2026) = ROOM IF ALL RE-SIGNED = -$93.5M` — i.e. the
 * page treated every undecided expiring as already committed before he
 * clicked anything.
 *
 * Mechanism: `resignProjection` and the re-sign page sorted candidates into
 * "pending" vs "resigned" via `hasSalaryForSeason(p, upcomingSeason(league))`.
 * For an inaugural import `upcomingSeason` returns `currentSeason` (the
 * draft + about-to-play year), which is the SAME year the player's existing
 * 1-year deal already covers — so every candidate matched and got tagged
 * resigned.
 *
 * Fix: re-sign extensions actually commit to `currentSeason + 1`
 * (`extensionMarket.startSeason = expiringSeason + 1`). The projection +
 * page now use that value, so an undecided 1-year-left candidate cleanly
 * registers as pending and only flips to resigned after the user clicks
 * Re-sign (which writes contract years starting at currentSeason + 1).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { convertBbgmLeague, type BbgmLeagueFile } from '@/../apps/bs-basketball/src/lib/data/leagueImport';
import { assembleLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { resignProjection, hasSalaryForSeason } from '@/../apps/bs-basketball/src/lib/roster/resignProjection';
import { contractYearsLeft } from '@/../apps/bs-basketball/src/lib/roster/playerActions';
import { extensionMarket } from '@/../apps/bs-basketball/src/lib/roster/extension';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const FILE = resolve(__dirname, '../../apps/bs-basketball/public/rosters/BBGM_NBA_Roster_2026_Updated.json');

function importInauguralLeague(): LeagueState {
  const file = JSON.parse(readFileSync(FILE, 'utf8')) as BbgmLeagueFile;
  const imported = convertBbgmLeague(file);
  return assembleLeague({
    teams: imported.teams,
    players: imported.players,
    freeAgentIds: imported.freeAgentIds,
    season: imported.season,
  });
}

describe('BUG-21: re-sign window does not pre-mark expiring players as already re-signed', () => {
  const league = importInauguralLeague();
  const team = league.teams[0] as BasketballTeam;
  const season = league.currentSeason;

  // 1-year-left candidates on this team — the exact population that broke in
  // Tyler's screenshot. Built the same way the re-sign page builds candidates.
  const candidates = team.playerIds
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p && !!p.contract && contractYearsLeft(p, season) <= 1);

  it('the test fixture actually contains 1-year-left candidates (otherwise we are testing nothing)', () => {
    expect(candidates.length).toBeGreaterThan(0);
  });

  it('every 1-year-left candidate registers as PENDING (not already re-signed) when no decision is made', () => {
    const proj = resignProjection(league, team, {});

    // The projection's target year IS the season extensions commit to. After
    // BUG-21 fix that's currentSeason + 1 (post-existing-deal), not currentSeason.
    expect(proj.nextSeason).toBe(season + 1);

    // No candidate has a salary for the projection's target year before the
    // user touches anything — they're all pending decisions.
    for (const p of candidates) {
      expect(
        hasSalaryForSeason(p, proj.nextSeason),
        `Candidate ${p.firstName} ${p.lastName} was tagged as already re-signed before any user action`,
      ).toBe(false);
    }

    // And the projection treats them as pending — the pendingAsk total is
    // non-zero (sum of market asks across the un-decided candidates).
    expect(proj.pendingAsk).toBeGreaterThan(0);

    // Sanity: committed payroll for the target year is strictly less than the
    // committed-with-everyone-re-signed figure, so the cap-space tile reflects
    // current obligations rather than hypothetical future commitments.
    expect(proj.projectedSpace).toBeGreaterThan(proj.roomIfAllReSigned);
  });

  it('extensionMarket.startSeason agrees with the projection target year for 1-year-left candidates', () => {
    const proj = resignProjection(league, team, {});
    for (const p of candidates) {
      const market = extensionMarket(p, season);
      expect(
        market.startSeason,
        `extension for ${p.firstName} ${p.lastName} would start at ${market.startSeason} but projection targets ${proj.nextSeason}`,
      ).toBe(proj.nextSeason);
    }
  });
});
