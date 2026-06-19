/**
 * FEAT-1 — inaugural draft picks are tradeable from the main Trade Center.
 *
 * Before this change, `getTeamPicks` filtered the in-progress draft via
 * `activeNormalDraft` and explicitly excluded inaugural drafts because their
 * slots can have a team holding multiple firsts in a round (real-life NBA
 * trade provenance baked into the BBGM import). That left current-year picks
 * untradeable in the main flow — Tyler hit this trying to deal his 2026 first
 * after importing the NBA roster.
 *
 * This test pulls an inaugural-draft league state, asserts a team's R1 + R2
 * picks show up in `getTeamPicks`, then runs them through `applyPickMoves` and
 * confirms the slot's `teamId` flipped (the inaugural source of truth lives on
 * the draft state, not the registry).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { convertBbgmLeague, type BbgmLeagueFile } from '@/../apps/bs-basketball/src/lib/data/leagueImport';
import { assembleLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import {
  getTeamPicks,
  pickFromId,
  applyPickMoves,
  inauguralPickKey,
} from '@/../apps/bs-basketball/src/lib/trade/picks';
import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const FILE = resolve(__dirname, '../../apps/bs-basketball/public/rosters/BBGM_NBA_Roster_2026_Updated.json');

/** Build an imported league + attach a minimal inaugural draft (one pick per
 *  team per round, in team-array order — enough to exercise the trade path). */
function importLeagueWithInauguralDraft(): LeagueState {
  const file = JSON.parse(readFileSync(FILE, 'utf8')) as BbgmLeagueFile;
  const imported = convertBbgmLeague(file);
  const league = assembleLeague({
    teams: imported.teams,
    players: imported.players,
    freeAgentIds: imported.freeAgentIds,
    season: imported.season,
  });

  const order = (league.teams as { id: string }[]).map(t => t.id);
  const picks = [];
  for (let round = 1; round <= 2; round++) {
    for (let i = 0; i < order.length; i++) {
      const overall = (round - 1) * order.length + i + 1;
      picks.push({
        overall,
        round,
        pickInRound: i + 1,
        originalTeamId: order[i] as TeamId,
        teamId: order[i] as TeamId,
        isLottery: overall <= 14,
        prospectId: null,
      });
    }
  }
  return {
    ...league,
    currentPhase: 'offseason',
    sportData: {
      ...(league.sportData as object),
      draft: {
        season: imported.season,
        picks,
        poolIds: [...imported.draftProspectIds],
        currentPick: 0,
        complete: false,
        lotteryRevealed: true,
        scoutsRemaining: 0,
        scoutedIds: [],
        inaugural: true,
      },
    },
  } as LeagueState;
}

describe('FEAT-1: inaugural draft picks tradeable from the main Trade Center', () => {
  const league = importLeagueWithInauguralDraft();
  const firstTeamId = (league.teams[0].id as unknown) as TeamId;
  const secondTeamId = (league.teams[1].id as unknown) as TeamId;

  it('getTeamPicks includes inaugural R1 + R2 picks for the team', () => {
    const picks = getTeamPicks(league, firstTeamId);
    const inauguralOnly = picks.filter(p => p.season === league.currentSeason);
    expect(inauguralOnly.length).toBeGreaterThanOrEqual(2);
    expect(inauguralOnly.some(p => p.round === 1)).toBe(true);
    expect(inauguralOnly.some(p => p.round === 2)).toBe(true);
    // Inaugural picks carry their slot overall.
    for (const p of inauguralOnly) {
      expect(p.overall).toBeGreaterThan(0);
      expect(p.id.startsWith('inaug-')).toBe(true);
    }
  });

  it('pickFromId round-trips an inaugural pick id', () => {
    const picks = getTeamPicks(league, firstTeamId);
    const r1 = picks.find(p => p.season === league.currentSeason && p.round === 1)!;
    const recovered = pickFromId(league, r1.id);
    expect(recovered).toBeTruthy();
    expect(recovered!.season).toBe(r1.season);
    expect(recovered!.round).toBe(r1.round);
    expect(recovered!.overall).toBe(r1.overall);
    expect(recovered!.currentTeamId).toBe(firstTeamId);
  });

  it('applyPickMoves transfers an inaugural pick by updating the draft slot teamId', () => {
    const picks = getTeamPicks(league, firstTeamId);
    const pick = picks.find(p => p.season === league.currentSeason && p.round === 1)!;
    const overall = pick.overall!;

    // Before: slot owned by firstTeamId; second team doesn't have it.
    const before = (league.sportData as { draft: { picks: { overall: number; teamId: TeamId }[] } }).draft.picks;
    expect(before.find(s => s.overall === overall)!.teamId).toBe(firstTeamId);

    const updated = applyPickMoves(league, [{ pick, toTeamId: secondTeamId }]);

    // After: that slot's teamId flipped to secondTeamId.
    const after = (updated.sportData as { draft: { picks: { overall: number; teamId: TeamId }[] } }).draft.picks;
    expect(after.find(s => s.overall === overall)!.teamId).toBe(secondTeamId);

    // The new owner now sees the pick in their pick list; the original owner doesn't.
    const firstAfter = getTeamPicks(updated, firstTeamId);
    const secondAfter = getTeamPicks(updated, secondTeamId);
    expect(firstAfter.find(p => p.id === pick.id)).toBeUndefined();
    expect(secondAfter.find(p => p.id === pick.id)).toBeTruthy();
  });

  it('once a pick has been made (prospectId set), it drops out of the tradeable list', () => {
    // Tag the first R1 slot as drafted by stamping a prospectId.
    const draft = (league.sportData as { draft: { picks: { overall: number; prospectId: string | null }[] } }).draft;
    const picksWithMade = draft.picks.map(s =>
      s.overall === 1 ? { ...s, prospectId: 'fake-prospect' } : s,
    );
    const withMade = {
      ...league,
      sportData: { ...(league.sportData as object), draft: { ...draft, picks: picksWithMade } },
    } as LeagueState;

    const ownerOfFirstPick = picksWithMade[0].overall === 1
      ? (league.sportData as { draft: { picks: { overall: number; teamId: TeamId }[] } }).draft.picks[0].teamId
      : firstTeamId;
    const picks = getTeamPicks(withMade, ownerOfFirstPick);
    const madeKey = inauguralPickKey(league.currentSeason, 1);
    expect(picks.find(p => p.id === madeKey)).toBeUndefined();
  });
});
