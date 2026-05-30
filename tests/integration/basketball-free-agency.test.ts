/**
 * Phase 2D-5 — Free agency integration tests.
 *
 * The pool comes from a completed season rolled into the next (draft-overflow
 * waivers). Verifies offers resolve: a strong offer signs, a lowball with no
 * rival is rejected, full rosters require a release, and a rival can outbid.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs,
  simPlayoffDay,
  getBracket,
  isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import { advanceToNextSeason } from '@/../apps/bs-basketball/src/lib/season';
import {
  freeAgentPool,
  bestCompetingOffer,
  resolveUserOffer,
  releasePlayer,
  rosterCount,
  MAX_ROSTER,
} from '@/../apps/bs-basketball/src/lib/freeAgency';
import type { BasketballPlayer } from '@bs/sport-basketball';
import type { PlayerId, TeamId } from '@bs/core/adapter';

/** Release a team's worst player if it's full, opening a roster spot. */
function openRoom(league: ReturnType<typeof createNewBasketballLeague>, teamId: TeamId) {
  const team = league.teams.find(t => t.id === teamId)!;
  if (team.playerIds.length < MAX_ROSTER) return league;
  const worst = [...team.playerIds].sort(
    (a, b) => (league.players[a] as BasketballPlayer).ratings.overall - (league.players[b] as BasketballPlayer).ratings.overall,
  )[0] as PlayerId;
  return releasePlayer(league, worst);
}

/** Make `teamId` the user team and guarantee an open roster spot. */
function userWithRoom(league: ReturnType<typeof createNewBasketballLeague>, teamId: TeamId) {
  return openRoom({ ...league, userTeamId: teamId }, teamId);
}

function nextSeasonLeague(seed: string) {
  let league = createNewBasketballLeague({ rngSeed: seed });
  let g = 0;
  while (!isRegularSeasonComplete(league) && g++ < 400) {
    const r = simNextDay(league);
    if (!r) break;
    league = r.league;
  }
  league = initializePlayoffs(league);
  g = 0;
  while (!getBracket(league)!.complete && g++ < 200) {
    const r = simPlayoffDay(league);
    if (!r) break;
    league = r.league;
  }
  return advanceToNextSeason(league);
}

describe('free agent pool', () => {
  it('exposes a sorted pool with market asks and last teams', () => {
    const league = nextSeasonLeague('fa-pool');
    const pool = freeAgentPool(league);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.length).toBe(league.freeAgentIds.length);
    // Sorted by OVR descending.
    for (let i = 1; i < pool.length; i++) {
      expect(pool[i - 1].player.ratings.overall).toBeGreaterThanOrEqual(pool[i].player.ratings.overall);
    }
    for (const f of pool) {
      expect(f.marketSalary).toBeGreaterThan(0);
      expect(f.desiredYears).toBeGreaterThanOrEqual(1);
    }
    // Waived players carry a last team.
    expect(pool.some(f => f.lastTeamId)).toBe(true);
  });
});

describe('resolving offers', () => {
  it('signs a free agent on a strong offer to a team with room', () => {
    const base = nextSeasonLeague('fa-sign');
    const userTeam = base.teams[0];
    const league = userWithRoom(base, userTeam.id);

    const target = freeAgentPool(league)[0];
    const offer = { years: Math.max(1, target.desiredYears), salaryPerYear: target.marketSalary * 3 };
    const res = resolveUserOffer(league, target.player.id, offer);

    expect(res.outcome).toBe('signed');
    expect(res.signedTeamId).toBe(userTeam.id);
    const signed = res.league.players[target.player.id] as BasketballPlayer;
    expect(signed.rosterSlot?.teamId).toBe(userTeam.id);
    expect(signed.contract).toBeTruthy();
    expect(res.league.freeAgentIds).not.toContain(target.player.id);
    expect(res.league.teams.find(t => t.id === userTeam.id)!.playerIds).toContain(target.player.id);
  });

  it('rejects a lowball when no rival is interested', () => {
    const base = nextSeasonLeague('fa-lowball');
    const league = userWithRoom(base, base.teams[0].id);

    // Find a FA nobody competes for.
    const pool = freeAgentPool(league);
    const lonely = pool.find(f => bestCompetingOffer(league, f) === null);
    expect(lonely).toBeTruthy();

    const offer = { years: 1, salaryPerYear: Math.round(lonely!.marketSalary * 0.1) };
    const before = league.freeAgentIds.length;
    const res = resolveUserOffer(league, lonely!.player.id, offer);

    expect(res.outcome).toBe('rejected');
    expect(res.league.freeAgentIds.length).toBe(before);
  });

  it('requires a release when the roster is full, then signs', () => {
    let league = nextSeasonLeague('fa-full');
    const fullTeam = league.teams.find(t => t.playerIds.length === MAX_ROSTER)!;
    league = { ...league, userTeamId: fullTeam.id };

    const target = freeAgentPool(league)[0];
    const offer = { years: Math.max(1, target.desiredYears), salaryPerYear: target.marketSalary * 3 };

    // No release → rejected.
    const blocked = resolveUserOffer(league, target.player.id, offer);
    expect(blocked.outcome).toBe('rejected');

    // With a release → signed, roster still 15, released player is now a FA.
    const dropId = fullTeam.playerIds[0] as PlayerId;
    const ok = resolveUserOffer(league, target.player.id, offer, dropId);
    expect(ok.outcome).toBe('signed');
    expect(rosterCount(ok.league, fullTeam.id)).toBe(MAX_ROSTER);
    expect(ok.league.freeAgentIds).toContain(dropId);
    expect((ok.league.players[dropId] as BasketballPlayer).rosterSlot).toBeNull();
  });

  it('lets a rival outbid a weak user offer', () => {
    const base = nextSeasonLeague('fa-rival');
    const userTeam = base.teams[0];
    let league = userWithRoom(base, userTeam.id);
    // Open room on several rivals so positional needs (and bids) exist.
    for (let i = 1; i <= 6; i++) league = openRoom(league, base.teams[i].id);

    // Find a FA with competing interest and a multi-year ask.
    const pool = freeAgentPool(league);
    const contested = pool.find(f => f.desiredYears > 1 && bestCompetingOffer(league, f) !== null);
    expect(contested).toBeTruthy();

    // One year at market < rival's multi-year market total.
    const offer = { years: 1, salaryPerYear: contested!.marketSalary };
    const res = resolveUserOffer(league, contested!.player.id, offer);

    expect(res.outcome).toBe('signed_elsewhere');
    expect(res.signedTeamId).not.toBe(userTeam.id);
    expect(res.league.freeAgentIds).not.toContain(contested!.player.id);
    // Landed on the rival's roster.
    const landed = res.league.players[contested!.player.id] as BasketballPlayer;
    expect(landed.rosterSlot?.teamId).toBe(res.signedTeamId as TeamId);
  });
});
