/**
 * Phase 2D-4 — Draft flow integration tests.
 *
 * Covers the app-level draft: offseason setup builds a 60-pick order with a
 * lottery, picks assign rookies with rookie-scale contracts, auto-pick runs the
 * board to completion, and startNextSeason finalizes legal, playable rosters.
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
import {
  enterOffseason,
  startNextSeason,
} from '@/../apps/bs-basketball/src/lib/season';
import {
  getDraft,
  currentSlot,
  makeDraftPick,
  autoPickUntilUser,
  recommendedProspectId,
} from '@/../apps/bs-basketball/src/lib/draft';
import type { BasketballPlayer } from '@bs/sport-basketball';

function completeSeason(seed: string) {
  let league = createNewBasketballLeague({ rngSeed: seed });
  let guard = 0;
  while (!isRegularSeasonComplete(league) && guard < 400) {
    const r = simNextDay(league);
    if (!r) break;
    league = r.league;
    guard++;
  }
  league = initializePlayoffs(league);
  guard = 0;
  while (!getBracket(league)!.complete && guard < 200) {
    const r = simPlayoffDay(league);
    if (!r) break;
    league = r.league;
    guard++;
  }
  return league;
}

describe('draft setup', () => {
  it('enters the offseason with a 60-pick, 14-team-lottery board', () => {
    const off = enterOffseason(completeSeason('draft-setup'));
    expect(off.currentPhase).toBe('offseason');
    const draft = getDraft(off)!;
    expect(draft.picks).toHaveLength(60);
    expect(draft.poolIds).toHaveLength(60);
    expect(draft.currentPick).toBe(0);
    expect(draft.complete).toBe(false);

    expect(draft.picks.filter(p => p.round === 1)).toHaveLength(30);
    expect(draft.picks.filter(p => p.round === 2)).toHaveLength(30);
    expect(draft.picks.filter(p => p.isLottery)).toHaveLength(14);
    expect(draft.picks[0].overall).toBe(1);
    expect(draft.picks[59].overall).toBe(60);

    // The #1 pick belongs to a team that did NOT make the playoffs (lottery).
    const bracket = getBracket(off)!;
    const playoffTeams = new Set([...bracket.seeds.Eastern, ...bracket.seeds.Western]);
    expect(playoffTeams.has(draft.picks[0].teamId)).toBe(false);
  });
});

describe('making picks', () => {
  it('assigns a prospect with a rookie-scale contract and advances the clock', () => {
    const off = enterOffseason(completeSeason('draft-pick'));
    const draft = getDraft(off)!;
    const slot = currentSlot(draft)!;
    const prospectId = recommendedProspectId(off, draft)!;

    const after = makeDraftPick(off, prospectId);
    const afterDraft = getDraft(after)!;

    // Pick recorded + clock advanced + pool shrunk.
    expect(afterDraft.picks[0].prospectId).toBe(prospectId);
    expect(afterDraft.currentPick).toBe(1);
    expect(afterDraft.poolIds).toHaveLength(59);

    // Prospect is on the picking team with a contract.
    const drafted = after.players[prospectId] as BasketballPlayer;
    expect(drafted.rosterSlot?.teamId).toBe(slot.teamId);
    expect(after.teams.find(t => t.id === slot.teamId)!.playerIds).toContain(prospectId);
    expect(drafted.contract).toBeTruthy();
    // Round 1 → 4-year deal.
    expect(drafted.contract!.years).toHaveLength(4);
  });

  it('round-2 picks get a 2-year minimum deal', () => {
    let league = enterOffseason(completeSeason('draft-r2'));
    // Auto-pick through all of round 1 (30 picks).
    for (let i = 0; i < 30; i++) league = autoPick(league);
    const draft = getDraft(league)!;
    const slot = currentSlot(draft)!;
    expect(slot.round).toBe(2);
    const rec = recommendedProspectId(league, draft)!;
    const after = makeDraftPick(league, rec);
    const drafted = after.players[rec] as BasketballPlayer;
    expect(drafted.contract!.years).toHaveLength(2);
  });
});

describe('completing the draft + next season', () => {
  it('auto-picks the full board then tips off a legal, playable season', () => {
    const off = enterOffseason(completeSeason('draft-complete'));
    const drafted = autoPickUntilUser(off, null); // null → pick everyone
    const draft = getDraft(drafted)!;
    expect(draft.complete).toBe(true);
    expect(draft.poolIds).toHaveLength(0);
    // Every pick was made.
    expect(draft.picks.every(p => p.prospectId)).toBe(true);

    const next = startNextSeason(drafted);
    expect(next.currentSeason).toBe(off.currentSeason + 1);
    expect(getDraft(next)).toBeNull();
    expect(getBracket(next)).toBeNull();
    expect(next.games.length).toBe(1230);

    // Legal rosters, all resolving to real players.
    for (const t of next.teams) {
      expect(t.playerIds.length).toBeGreaterThanOrEqual(13);
      expect(t.playerIds.length).toBeLessThanOrEqual(15);
      for (const pid of t.playerIds) expect(next.players[pid]).toBeTruthy();
    }

    // Playable.
    const sim = simNextDay(next);
    expect(sim).not.toBeNull();
    expect(sim!.gamesSimmed).toBeGreaterThan(0);
  });
});

// Local helper: auto-pick the current selection.
function autoPick(league: ReturnType<typeof createNewBasketballLeague>) {
  const draft = getDraft(league)!;
  const rec = recommendedProspectId(league, draft)!;
  return makeDraftPick(league, rec);
}
