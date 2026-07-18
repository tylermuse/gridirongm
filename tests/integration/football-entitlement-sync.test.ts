/**
 * Entitlement allocation sync (Zxmis — "upgraded but no extra scouts/intel").
 *
 * Scout points + intel reports are baked into the save from a module cache that
 * defaults to free and resolves async. A premium/founder user who seeded before
 * the resolve gets free values frozen in. syncEntitlementAllocations() raises the
 * baked allocations to the current entitlement (never lowers).
 */

import { describe, it, expect } from 'vitest';
import { useGameStore } from '@/lib/engine/store';
import { setCurrentSubscriptionAllocations } from '@bs/core/billing';

const freeScouting = { scoutPoints: 4, maxScoutPoints: 10, filmReviews: {}, inPersonEvals: {}, inPersonEvalCount: 0, fullEvals: {}, fullEvalCount: 0 };
const freePursuit = { pursuitPoints: 1, maxPursuitPoints: 3, intelReports: {} };

describe('syncEntitlementAllocations', () => {
  it('raises frozen free allocations up to premium entitlement (+ remaining by the delta)', () => {
    useGameStore.setState({ scoutingState: { ...freeScouting }, pursuitState: { ...freePursuit } } as never);
    setCurrentSubscriptionAllocations({ scoutPoints: 30, intelReports: 9, isUnlimited: false });

    useGameStore.getState().syncEntitlementAllocations();

    const s = useGameStore.getState();
    expect(s.scoutingState!.maxScoutPoints).toBe(30);
    expect(s.scoutingState!.scoutPoints).toBe(4 + 20); // remaining bumped by the +20 delta
    expect(s.pursuitState!.maxPursuitPoints).toBe(9);
    expect(s.pursuitState!.pursuitPoints).toBe(1 + 6);
  });

  it('never lowers when the current entitlement is below what is baked (lapsed sub)', () => {
    useGameStore.setState({
      scoutingState: { ...freeScouting, scoutPoints: 25, maxScoutPoints: 30 },
      pursuitState: { ...freePursuit, pursuitPoints: 8, maxPursuitPoints: 9 },
    } as never);
    setCurrentSubscriptionAllocations({ scoutPoints: 10, intelReports: 3, isUnlimited: false });

    useGameStore.getState().syncEntitlementAllocations();

    const s = useGameStore.getState();
    expect(s.scoutingState!.maxScoutPoints).toBe(30);
    expect(s.scoutingState!.scoutPoints).toBe(25);
    expect(s.pursuitState!.maxPursuitPoints).toBe(9);
    expect(s.pursuitState!.pursuitPoints).toBe(8);
  });

  it('grants founder (unlimited) allocations', () => {
    useGameStore.setState({ scoutingState: { ...freeScouting }, pursuitState: { ...freePursuit } } as never);
    setCurrentSubscriptionAllocations({ scoutPoints: 999_999, intelReports: 999_999, isUnlimited: true });

    useGameStore.getState().syncEntitlementAllocations();

    const s = useGameStore.getState();
    expect(s.scoutingState!.maxScoutPoints).toBe(999_999);
    expect(s.pursuitState!.maxPursuitPoints).toBe(999_999);
  });
});
