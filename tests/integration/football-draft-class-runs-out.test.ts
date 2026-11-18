/**
 * A draft whose class is smaller than its pick count has to end when the
 * prospects run out.
 *
 * Player report, 2026-11-16 ("Doesn't move past draft recap"): an imported
 * college-football league file has far more than 32 teams, so 7 rounds is
 * several hundred picks more than the draft class. "Auto-Draft All" stopped
 * when the class was empty and left the rest of the order in place. The top
 * bar reads the order to decide the draft is still on, so it kept showing
 * "Sim Pick / Sim to My Pick / Auto-Draft All" (which did nothing but reopen
 * the recap) and never "Start New Season". The same happens to any league with
 * more picks than prospects, e.g. a 33rd expansion team (231 picks, 224
 * generated prospects).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@bs/core/analytics/track', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/engine/gmSync', () => ({ buildGmSyncPayload: () => null, syncGmStats: vi.fn() }));

import { useGameStore } from '@/lib/engine/store';
import { isDraftOver } from '@/lib/engine/draftStatus';

const st = () => useGameStore.getState();

/** A league on the clock in its first draft (the reporter's context: draft
 *  phase, week 1, season 2026) with `prospects` left in the class. */
async function draftWithShortClass(prospects: number) {
  await st().newLeague('DAL'); // offseason start: re-signing → free agency → draft
  st().advanceToFreeAgency();
  st().advanceToDraft();
  expect(st().phase).toBe('draft');
  expect(st().draftOrder.length).toBe(224);
  useGameStore.setState({ freeAgents: st().freeAgents.slice(0, prospects) });
}

describe('draft class smaller than the number of picks', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('Auto-Draft All ends the draft once the class is gone', async () => {
    await draftWithShortClass(40);
    expect(isDraftOver(st())).toBe(false);

    st().simToEndDraft({ skipAdvance: true });

    expect(st().draftResults).toHaveLength(40);
    expect(st().freeAgents).toHaveLength(0);
    // Nothing is on the clock any more: this is what the top bar reads to
    // swap the draft buttons for "Draft Recap" + "Start New Season".
    expect(st().draftOrder).toEqual([]);
    expect(isDraftOver(st())).toBe(true);
  }, 120_000);

  it('the season then starts', async () => {
    await draftWithShortClass(40);
    st().simToEndDraft({ skipAdvance: true });
    const draftSeason = st().season;

    st().startNewSeason();

    expect(['preseason', 'regular']).toContain(st().phase);
    expect(st().season).toBeGreaterThanOrEqual(draftSeason);
    expect(st().draftResults).toEqual([]);
  }, 120_000);

  it('Sim to My Pick ends the draft instead of doing nothing', async () => {
    await draftWithShortClass(0);
    // Put an AI team on the clock so the action has something to do.
    const order = st().draftOrder;
    useGameStore.setState({ draftOrder: order.slice(order.findIndex(t => t !== st().userTeamId)) });

    st().simToUserDraftPick();

    expect(st().draftOrder).toEqual([]);
  }, 120_000);

  it('Sim Pick ends the draft instead of skipping one empty slot at a time', async () => {
    await draftWithShortClass(0);

    st().simDraftPick();

    expect(st().draftOrder).toEqual([]);
  }, 120_000);

  it('drafting the last prospect ends the draft', async () => {
    await draftWithShortClass(1);
    const lastProspect = st().freeAgents[0];

    st().draftPlayer(lastProspect);

    expect(st().draftResults).toHaveLength(1);
    expect(st().draftOrder).toEqual([]);
  }, 120_000);

  it('a save already stuck there can start the season, and the leftover order is cleared', async () => {
    await draftWithShortClass(0);
    expect(st().draftOrder).toHaveLength(224);

    st().startNewSeason();

    expect(['preseason', 'regular']).toContain(st().phase);
    expect(st().draftOrder).toEqual([]);
  }, 120_000);

  it('a save already stuck there reads as over, with or without released veterans in the pool', async () => {
    await draftWithShortClass(0);
    // The saved state the reporter was left in: picks still "on the clock",
    // nobody left to take.
    expect(st().draftOrder.length).toBeGreaterThan(0);
    expect(isDraftOver(st())).toBe(true);

    // Players released during the draft land in the same pool. They are not
    // draft prospects, so they don't reopen it.
    const veteran = st().players.find(p => p.teamId === st().userTeamId && p.experience > 0)!;
    useGameStore.setState({ freeAgents: [veteran.id] });
    expect(isDraftOver(st())).toBe(true);
  }, 120_000);

  it('a normal draft is not over until the last pick', async () => {
    await st().newLeague('DAL');
    st().advanceToFreeAgency();
    st().advanceToDraft();
    expect(isDraftOver(st())).toBe(false);

    st().simDraftPick();
    expect(st().draftOrder).toHaveLength(223);
    expect(isDraftOver(st())).toBe(false);

    st().simToEndDraft({ skipAdvance: true });
    expect(st().draftResults).toHaveLength(224);
    expect(st().draftOrder).toEqual([]);
    expect(isDraftOver(st())).toBe(true);
  }, 120_000);
});
