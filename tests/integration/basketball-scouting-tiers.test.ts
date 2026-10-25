/**
 * Tiered draft scouting + mock draft (BS Hoops).
 *
 * - Points budget: tiers cost 1 / 3 / 6 (cumulative), upgrades pay the
 *   difference, and the budget can never be overspent. The budget is
 *   tier-based (10 free / 30 Premium / unlimited); most tests pin Premium.
 * - Potential ranges narrow monotonically with each tier, always contain the
 *   true potential, and collapse to it exactly at a full evaluation.
 * - Reports are deterministic per save.
 * - Legacy saves (flat `scoutedIds` / `scoutsRemaining`) read as fully
 *   evaluated and convert lazily.
 * - Watchlist toggles persist on the draft state.
 * - The mock draft projects one prospect per slot, no duplicates, and — with no
 *   user interference or trades — matches what the AI actually drafts, pick for
 *   pick, because both run the same aiChooseProspect function.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getScoutingAllocations, setCurrentSubscriptionAllocations } from '@bs/core/billing';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import { enterOffseason } from '@/../apps/bs-basketball/src/lib/season';
import {
  getDraft, autoPickUntilUser, autoPickCurrent, buildMockDraft, SCOUT_POINTS_PER_DRAFT, SCOUTS_PER_DRAFT,
  type DraftState,
} from '@/../apps/bs-basketball/src/lib/draft';
import {
  scoutProspect, scoutPointsLeft, scoutLevel, isScouted, tierCost, upgradeCost,
  potentialRange, buildTieredReport, toggleWatchlist, isWatched, revealedPotential,
} from '@/../apps/bs-basketball/src/lib/scouting';
import type { BasketballPlayer } from '@bs/sport-basketball';
import type { BasketballLeagueState } from '@/../apps/bs-basketball/src/lib/persistence/db';

function offseason(seed: string): BasketballLeagueState {
  let league = createNewBasketballLeague({ rngSeed: seed });
  let g = 0;
  while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
  league = initializePlayoffs(league); g = 0;
  while (!getBracket(league)!.complete && g++ < 200) { const r = simPlayoffDay(league); if (!r) break; league = r.league; }
  return enterOffseason(league) as BasketballLeagueState;
}

function withDraft(league: BasketballLeagueState, draft: DraftState): BasketballLeagueState {
  return { ...league, sportData: { ...(league.sportData as object), draft } } as BasketballLeagueState;
}

let base: BasketballLeagueState;
beforeAll(() => { base = offseason('scout-tiers'); }, 120_000);

// Pin Premium (30 pts) so the budget arithmetic below reads against SCOUT_POINTS_PER_DRAFT.
beforeAll(() => setCurrentSubscriptionAllocations(getScoutingAllocations('premium', false)));
afterAll(() => setCurrentSubscriptionAllocations(getScoutingAllocations('free', false)));

describe('tiered scouting budget', () => {
  it('starts with the full points budget and nothing scouted', () => {
    const draft = getDraft(base)!;
    expect(scoutPointsLeft(draft)).toBe(SCOUT_POINTS_PER_DRAFT);
    expect(scoutLevel(draft, draft.poolIds[0])).toBe(0);
  });

  it('tier costs are 1 / 3 / 6 and upgrades pay only the difference', () => {
    expect([tierCost(1), tierCost(2), tierCost(3)]).toEqual([1, 3, 6]);
    const id = getDraft(base)!.poolIds[0];
    let l = scoutProspect(base, id, 1);
    expect(scoutPointsLeft(getDraft(l)!)).toBe(SCOUT_POINTS_PER_DRAFT - 1);
    expect(upgradeCost(getDraft(l)!, id, 3)).toBe(5);
    l = scoutProspect(l, id, 2);
    expect(scoutPointsLeft(getDraft(l)!)).toBe(SCOUT_POINTS_PER_DRAFT - 3);
    l = scoutProspect(l, id, 3);
    expect(scoutPointsLeft(getDraft(l)!)).toBe(SCOUT_POINTS_PER_DRAFT - 6);
    expect(isScouted(getDraft(l)!, id)).toBe(true);
    // Re-scouting or downgrading is free (no-op).
    expect(scoutProspect(l, id, 1)).toBe(l);
    expect(scoutProspect(l, id, 3)).toBe(l);
  });

  it('can never overspend — an unaffordable tier is a no-op', () => {
    const pool = getDraft(base)!.poolIds;
    let l = base;
    for (let i = 0; i < 20; i++) l = scoutProspect(l, pool[i], 3);
    const draft = getDraft(l)!;
    const full = Math.floor(SCOUT_POINTS_PER_DRAFT / 6);
    expect(pool.filter(id => isScouted(draft, id)).length).toBe(full);
    expect(scoutPointsLeft(draft)).toBe(SCOUT_POINTS_PER_DRAFT - full * 6);
    expect(scoutPointsLeft(draft)).toBeGreaterThanOrEqual(0);
    // Spend the remainder on quick looks, then confirm one more is refused.
    for (let i = full; i < 60; i++) l = scoutProspect(l, pool[i], 1);
    expect(scoutPointsLeft(getDraft(l)!)).toBe(0);
    const before = l;
    expect(scoutProspect(l, pool[59], 1)).toBe(before);
  });

  it('a budget fits ~4 full evaluations plus several quick looks', () => {
    const pool = getDraft(base)!.poolIds;
    let l = base;
    for (let i = 0; i < 4; i++) l = scoutProspect(l, pool[i], 3);
    for (let i = 4; i < 10; i++) l = scoutProspect(l, pool[i], 1);
    const d = getDraft(l)!;
    expect(pool.slice(0, 4).every(id => scoutLevel(d, id) === 3)).toBe(true);
    expect(pool.slice(4, 10).every(id => scoutLevel(d, id) === 1)).toBe(true);
    expect(scoutPointsLeft(d)).toBe(SCOUT_POINTS_PER_DRAFT - 24 - 6);
  });

  it('ignores ids that are not in the pool', () => {
    expect(scoutProspect(base, 'not-a-prospect', 1)).toBe(base);
  });
});

describe('ranges + reports', () => {
  it('ranges narrow monotonically, always contain the truth, and are exact at tier 3', () => {
    const draft = getDraft(base)!;
    for (const id of draft.poolIds) {
      const p = base.players[id] as BasketballPlayer;
      const pot = p.development.potential;
      const r = [0, 1, 2, 3].map(lvl => potentialRange(p, lvl as 0 | 1 | 2 | 3, base.id, draft.season));
      for (let i = 0; i < 4; i++) {
        expect(r[i].low).toBeLessThanOrEqual(pot);
        expect(r[i].high).toBeGreaterThanOrEqual(pot);
        if (i > 0) {
          expect(r[i].low).toBeGreaterThanOrEqual(r[i - 1].low);
          expect(r[i].high).toBeLessThanOrEqual(r[i - 1].high);
        }
      }
      expect(r[3]).toEqual({ low: pot, high: pot });
    }
  });

  it('reveals progressively: L1 skills, L2 combine + S/W, L3 truth + verdict + comp', () => {
    const id = getDraft(base)!.poolIds[0];
    const p = base.players[id] as BasketballPlayer;
    const at = (lvl: 0 | 1 | 2 | 3) => {
      const l = lvl === 0 ? base : scoutProspect(base, id, lvl);
      return buildTieredReport(l, getDraft(l)!, p);
    };
    const r0 = at(0), r1 = at(1), r2 = at(2), r3 = at(3);
    expect(r0.skills).toBeNull();
    expect(r0.combine).toBeNull();
    expect(r0.truePotential).toBeNull();
    expect(r0.upgrades.map(u => u.costFromHere)).toEqual([1, 3, 6]);

    expect(r1.skills).toHaveLength(5);
    expect(r1.combine).toBeNull();
    expect(r1.upgrades.map(u => u.costFromHere)).toEqual([2, 5]);

    expect(r2.combine!.map(c => c.label)).toEqual(expect.arrayContaining(['Height', 'Wingspan', 'Max vert', 'Lane agility']));
    expect(r2.strengths).not.toBeNull();
    expect(r2.truePotential).toBeNull();
    expect(r2.verdict).toBeNull();

    expect(r3.truePotential).toBe(p.development.potential);
    expect(['Gem', 'As advertised', 'Bust risk']).toContain(r3.verdict);
    expect(r3.archetype).toBeTruthy();
    expect(r3.comparison).toBeTruthy();
    expect(r3.upgrades).toHaveLength(0);
  });

  it('is deterministic per save (same save → same reports)', () => {
    const pool = getDraft(base)!.poolIds.slice(0, 10);
    const build = () => {
      let l = base;
      pool.forEach((id, i) => { l = scoutProspect(l, id, ((i % 3) + 1) as 1 | 2 | 3); });
      const d = getDraft(l)!;
      return pool.map(id => buildTieredReport(l, d, l.players[id] as BasketballPlayer));
    };
    expect(build()).toEqual(build());
  });

  it('a different save gets different noise for the same prospect', () => {
    const draft = getDraft(base)!;
    const other = { ...base, id: `${base.id}-other` } as BasketballLeagueState;
    const differ = draft.poolIds.some(id => {
      const p = base.players[id] as BasketballPlayer;
      const a = potentialRange(p, 1, base.id, draft.season);
      const b = potentialRange(p, 1, other.id, draft.season);
      return a.low !== b.low;
    });
    expect(differ).toBe(true);
  });
});

describe('legacy (flat scout) back-compat', () => {
  it('treats old scoutedIds as fully evaluated and charges them as full evaluations', () => {
    const d = getDraft(base)!;
    const [a, b, c] = d.poolIds;
    const legacy: DraftState = { ...d, scoutPoints: undefined, scoutLevels: undefined, scoutedIds: [a, b], scoutsRemaining: SCOUTS_PER_DRAFT - 2 };
    const l = withDraft(base, legacy);
    const ld = getDraft(l)!;
    expect(scoutLevel(ld, a)).toBe(3);
    expect(isScouted(ld, b)).toBe(true);
    expect(revealedPotential(ld, l.players[a] as BasketballPlayer)).toBe((l.players[a] as BasketballPlayer).development.potential);
    expect(scoutLevel(ld, c)).toBe(0);
    const expected = SCOUT_POINTS_PER_DRAFT - 2 * tierCost(3);
    expect(scoutPointsLeft(ld)).toBe(expected);

    // First tiered action materializes the new fields and keeps the old reveals.
    const after = getDraft(scoutProspect(l, c, 1))!;
    expect(after.scoutPoints).toBe(expected - 1);
    expect(after.scoutLevels![a]).toBe(3);
    expect(after.scoutLevels![b]).toBe(3);
    expect(after.scoutLevels![c]).toBe(1);
  });

  it('a pre-scouting save with no budget fields gets the full budget', () => {
    const d = getDraft(base)!;
    const bare: DraftState = { ...d, scoutPoints: undefined, scoutLevels: undefined, scoutedIds: undefined, scoutsRemaining: undefined };
    expect(scoutPointsLeft(bare)).toBe(SCOUT_POINTS_PER_DRAFT);
  });
});

describe('tier-based budget', () => {
  it('free gets 10 points, Premium 30, founders unlimited', () => {
    const d = getDraft(base)!;
    expect(scoutPointsLeft(d, getScoutingAllocations('free', false).scoutPoints)).toBe(10);
    expect(scoutPointsLeft(d, getScoutingAllocations('premium', false).scoutPoints)).toBe(30);
    expect(scoutPointsLeft(d, getScoutingAllocations('free', true).scoutPoints)).toBeGreaterThan(1000);
  });

  it('a free budget stops spending at 10 and an upgrade mid-draft adds the difference', () => {
    const d = getDraft(base)!;
    const FREE = 10;
    let l = base;
    for (const id of d.poolIds.slice(0, 3)) l = scoutProspect(l, id, 3, FREE); // 6, then two no-ops (6 > 4 left)
    expect(scoutPointsLeft(getDraft(l)!, FREE)).toBe(FREE - 6);
    l = scoutProspect(l, d.poolIds[1], 2, FREE); // workout costs 3 → 1 left
    expect(scoutPointsLeft(getDraft(l)!, FREE)).toBe(1);
    expect(scoutProspect(l, d.poolIds[2], 2, FREE)).toBe(l); // can't afford
    // Same draft state, Premium budget: spend so far is kept, the rest unlocks.
    expect(scoutPointsLeft(getDraft(l)!, 30)).toBe(30 - 9);
    expect(scoutLevel(getDraft(scoutProspect(l, d.poolIds[2], 2, 30))!, d.poolIds[2])).toBe(2);
  });

  it('defaults to the tier SubscriptionProvider publishes', () => {
    const d = getDraft(base)!;
    try {
      setCurrentSubscriptionAllocations(getScoutingAllocations('free', false));
      expect(scoutPointsLeft(d)).toBe(10);
    } finally {
      setCurrentSubscriptionAllocations(getScoutingAllocations('premium', false));
    }
    expect(scoutPointsLeft(d)).toBe(30);
  });
});

describe('watchlist', () => {
  it('toggles on and off and persists on the draft state', () => {
    const id = getDraft(base)!.poolIds[3];
    const on = toggleWatchlist(base, id);
    expect(isWatched(getDraft(on)!, id)).toBe(true);
    expect(getDraft(on)!.watchlist).toContain(id);
    const off = toggleWatchlist(on, id);
    expect(isWatched(getDraft(off)!, id)).toBe(false);
  });
});

describe('mock draft', () => {
  it('projects one prospect per slot with no duplicates', () => {
    const mock = buildMockDraft(base)!;
    const draft = getDraft(base)!;
    expect(mock).toHaveLength(Math.min(draft.picks.length, draft.poolIds.length));
    expect(mock.map(m => m.overall)).toEqual(draft.picks.slice(0, mock.length).map(p => p.overall));
    expect(new Set(mock.map(m => m.prospectId)).size).toBe(mock.length);
    expect(mock.every(m => draft.poolIds.includes(m.prospectId))).toBe(true);
    expect(mock.every(m => !m.made)).toBe(true);
    expect(buildMockDraft(base, { rounds: 1 })!).toHaveLength(30);
  });

  it('matches what the AI actually drafts when simmed with no user interference', () => {
    const mock = buildMockDraft(base)!;
    const simmed = autoPickUntilUser(base, null);
    const actual = getDraft(simmed)!.picks.map(p => p.prospectId);
    expect(mock.map(m => m.prospectId)).toEqual(actual.slice(0, mock.length));
  });

  it('recomputes mid-draft: made picks are reported as made, the rest still match the AI', () => {
    let l = base;
    for (let i = 0; i < 5; i++) l = autoPickCurrent(l) as BasketballLeagueState;
    const mid = buildMockDraft(l)!;
    const madeCount = getDraft(l)!.currentPick;
    expect(madeCount).toBe(5);
    expect(mid.slice(0, madeCount).every(m => m.made)).toBe(true);
    const finished = getDraft(autoPickUntilUser(l, null))!.picks.map(p => p.prospectId);
    expect(mid.map(m => m.prospectId)).toEqual(finished.slice(0, mid.length));
  });

  it('consensus-board leagues project the board order (BUG-19 strict consensus)', () => {
    const draft = getDraft(base)!;
    // Stamp a consensus rank on 12 prospects picked from deep in the pool.
    const ranked = draft.poolIds.slice(-12).reverse();
    const players = { ...base.players };
    ranked.forEach((id, i) => {
      const p = players[id] as BasketballPlayer;
      players[id] = { ...p, sportData: { ...p.sportData, draftProjection: i + 1 } };
    });
    const l = { ...base, players } as BasketballLeagueState;
    const mock = buildMockDraft(l)!;
    expect(mock.slice(0, 12).map(m => m.prospectId)).toEqual(ranked);
  });
});
