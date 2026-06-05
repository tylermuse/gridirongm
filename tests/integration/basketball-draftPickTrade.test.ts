/**
 * Regression: a draft pick traded MID-DRAFT must take effect immediately.
 *
 * draft.picks[].teamId is a setup-time snapshot. Before the fix, trading a
 * pick during the draft updated the ownership registry but the active draft
 * kept showing — and picking for — the old team (the trade looked like a no-op).
 * getDraft now re-resolves each slot against the registry on every read.
 */

import { describe, it, expect } from 'vitest';
import type { BaseDraftPick, TeamId } from '@bs/core/adapter';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { setupDraft, getDraft } from '@/../apps/bs-basketball/src/lib/draft';
import { applyPickMoves } from '@/../apps/bs-basketball/src/lib/trade/picks';

function leagueWithDraft() {
  const base = createNewBasketballLeague({ rngSeed: 'pick-trade' });
  const draftSeason = base.currentSeason + 1;
  const draft = setupDraft(base, draftSeason, []);
  const league = { ...base, sportData: { ...(base.sportData as object), draft } };
  return { league, draftSeason };
}

describe('mid-draft pick trade', () => {
  it('re-resolves the on-the-clock team after a pick changes hands', () => {
    const { league, draftSeason } = leagueWithDraft();
    const draft = getDraft(league)!;

    // The 9th overall pick and its current owner.
    const slot = draft.picks[8];
    const fromTeam = slot.teamId;
    const toTeam = league.teams.find(t => t.id !== fromTeam)!.id as TeamId;

    // Trade that exact pick away (registry-only move, like executeTrade does).
    const pick: BaseDraftPick = {
      season: draftSeason,
      round: slot.round,
      originalTeamId: slot.originalTeamId,
      currentTeamId: fromTeam,
    };
    const traded = applyPickMoves(league, [{ pick, toTeamId: toTeam }]);

    // The active draft now reflects the new owner — not the stale snapshot.
    const resolved = getDraft(traded)!;
    expect(resolved.picks[8].teamId).toBe(toTeam);
    expect(resolved.picks[8].teamId).not.toBe(fromTeam);
    // Other slots are untouched.
    expect(resolved.picks[7].teamId).toBe(draft.picks[7].teamId);
  });

  it('repairs an older save whose slots lack originalTeamId (back-compat)', () => {
    const { league, draftSeason } = leagueWithDraft();
    const draft = getDraft(league)!;
    const slot = draft.picks[8];
    const owner = slot.teamId;
    const toTeam = league.teams.find(t => t.id !== owner)!.id as TeamId;

    // Simulate a pre-fix save: strip originalTeamId from the stored slots.
    const legacyPicks = draft.picks.map(p => {
      const { originalTeamId: _omit, ...rest } = p;
      return rest;
    });
    const legacy = {
      ...league,
      sportData: { ...(league.sportData as object), draft: { ...draft, picks: legacyPicks } },
    };

    // The slot's original team is its (snapshot) owner; trade it away.
    const pick: BaseDraftPick = { season: draftSeason, round: 1, originalTeamId: owner, currentTeamId: owner };
    const traded = applyPickMoves(legacy, [{ pick, toTeamId: toTeam }]);

    expect(getDraft(traded)!.picks[8].teamId).toBe(toTeam);
  });
});
