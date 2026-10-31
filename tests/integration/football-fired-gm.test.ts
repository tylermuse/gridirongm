/**
 * Fired-GM flow (analytics work plan WI-1).
 *
 * Prod data: gm_fired logged up to 63 times for the same device-season —
 * every press of "Advance to Re-signing" re-ran the firing. A firing must
 * be tracked once, close out the season exactly once, and leave the user
 * two ways forward: take a job with another team in the same league
 * (acceptGmJob) or start a new league.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@bs/core/analytics/track', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/engine/gmSync', () => ({ buildGmSyncPayload: () => null, syncGmStats: vi.fn() }));

import { trackEvent } from '@bs/core/analytics/track';
import { useGameStore } from '@/lib/engine/store';
import { getGmJobOpenings } from '@/lib/engine/gmJobs';
import { defaultApproval } from '@/lib/engine/approval';

const tracked = (event: string) => vi.mocked(trackEvent).mock.calls.filter(c => c[0] === event);

/** A generated league whose season is over, with the user's owner approval set. */
async function finishedSeason(ownerApproval: number, warningIssued: boolean) {
  await useGameStore.getState().newLeague('');
  const s = useGameStore.getState();
  const teams = s.teams.map((t, i) => {
    const wins = t.id === s.userTeamId ? 2 : (i * 5) % 17;
    return {
      ...t,
      record: { ...t.record, wins, losses: 17 - wins, ties: 0, pointsFor: 300 + i, pointsAgainst: 350 },
      approval: t.id === s.userTeamId
        ? { ...defaultApproval(), ownerApproval, warningIssued, tenureSeasons: 3 }
        : t.approval,
    };
  });
  useGameStore.setState({ teams, phase: 'playoffs', seasonHistory: [], firedState: null });
  vi.mocked(trackEvent).mockClear();
  return useGameStore.getState();
}

describe('fired GM', () => {
  it('tracks one gm_fired and closes the season once, however many times Advance is pressed', async () => {
    const before = await finishedSeason(0, true);
    const { advanceToResigning } = useGameStore.getState();

    advanceToResigning();
    advanceToResigning();
    advanceToResigning();

    const s = useGameStore.getState();
    expect(s.firedState?.fired).toBe(true);
    expect(s.phase).toBe('playoffs');
    expect(s.seasonHistory).toHaveLength(1);
    expect(s.seasonHistory[0].userRecord).toEqual({ wins: 2, losses: 15 });

    const fired = tracked('gm_fired');
    expect(fired).toHaveLength(1);
    expect(fired[0][1]).toEqual({
      season: before.season,
      seasons_completed: 1,
      tenure_seasons: 4,
      final_approval: 0,
    });
    expect(tracked('season_completed')).toHaveLength(1);
    expect(s.newsItems.filter(n => n.headline.includes('has fired the GM'))).toHaveLength(1);
  });

  it('a firing from the end-of-season review is also tracked once', async () => {
    await finishedSeason(5, true);
    const { advanceToResigning } = useGameStore.getState();

    advanceToResigning();
    advanceToResigning();

    expect(useGameStore.getState().firedState?.fired).toBe(true);
    const fired = tracked('gm_fired');
    expect(fired).toHaveLength(1);
    expect(fired[0][1]).toMatchObject({ final_approval: 5, tenure_seasons: 4 });
  });

  it('leaves a GM in good standing alone', async () => {
    await finishedSeason(60, false);
    useGameStore.getState().advanceToResigning();

    const s = useGameStore.getState();
    expect(s.firedState).toBeNull();
    expect(s.phase).toBe('resigning');
    expect(tracked('gm_fired')).toHaveLength(0);
  });

  it('acceptGmJob moves the user to the new team in re-signing without re-closing the season', async () => {
    const before = await finishedSeason(0, true);
    const oldTeamId = before.userTeamId;
    useGameStore.getState().advanceToResigning();

    const fired = useGameStore.getState();
    const target = getGmJobOpenings(fired.teams, oldTeamId)[0];
    const capAfterSeason = fired.teams.find(t => t.id === target.id)!.salaryCap;
    const retiredAfterSeason = fired.players.filter(p => p.retired).length;

    useGameStore.getState().acceptGmJob(target.id);

    const s = useGameStore.getState();
    expect(s.userTeamId).toBe(target.id);
    expect(s.firedState).toBeNull();
    expect(s.phase).toBe('resigning');
    expect(s.seasonHistory).toHaveLength(1);
    expect(s.players.filter(p => p.retired)).toHaveLength(retiredAfterSeason);
    expect(s.teams.find(t => t.id === target.id)!.salaryCap).toBe(capAfterSeason);
    for (const entry of s.resigningPlayers) {
      expect(s.players.find(p => p.id === entry.playerId)?.teamId).toBe(target.id);
    }
    const newApproval = s.teams.find(t => t.id === target.id)!.approval!;
    expect(newApproval.ownerApproval).toBe(defaultApproval().ownerApproval);
    expect(newApproval.tenureSeasons).toBe(0);
    expect(newApproval.objectives.length).toBeGreaterThan(0);
    expect(s.teams.find(t => t.id === oldTeamId)!.approval).toBeUndefined();

    expect(tracked('gm_hired')).toEqual([['gm_hired', {
      from_team: before.teams.find(t => t.id === oldTeamId)!.abbreviation,
      to_team: target.abbreviation,
      seasons_completed: 1,
    }]]);
    expect(tracked('gm_fired')).toHaveLength(1);
  });

  it('acceptGmJob closes out the season for a save fired by the old early-return path', async () => {
    const before = await finishedSeason(0, true);
    // Old builds fired before closing the season: no history row, no retirements.
    useGameStore.setState({ firedState: { fired: true, season: before.season, reason: 'Owner lost patience after repeated underperformance.' } });
    const target = getGmJobOpenings(before.teams, before.userTeamId)[0];

    useGameStore.getState().acceptGmJob(target.id);

    const s = useGameStore.getState();
    expect(s.userTeamId).toBe(target.id);
    expect(s.phase).toBe('resigning');
    expect(s.seasonHistory).toHaveLength(1);
    // The closed-out season is the one the user ran, not the new team's.
    expect(s.seasonHistory[0].userRecord).toEqual({ wins: 2, losses: 15 });
    expect(tracked('gm_fired')).toHaveLength(0);
    expect(tracked('gm_hired')).toHaveLength(1);
  });

  it('acceptGmJob is a no-op unless the user is fired', async () => {
    const before = await finishedSeason(60, false);
    const other = before.teams.find(t => t.id !== before.userTeamId)!;

    useGameStore.getState().acceptGmJob(other.id);

    expect(useGameStore.getState().userTeamId).toBe(before.userTeamId);
    expect(tracked('gm_hired')).toHaveLength(0);
  });
});

describe('getGmJobOpenings', () => {
  it('lists the five worst records, excluding the team that fired the GM, in a stable order', async () => {
    const s = await finishedSeason(0, true);
    const openings = getGmJobOpenings(s.teams, s.userTeamId);

    expect(openings).toHaveLength(5);
    expect(openings.map(t => t.id)).not.toContain(s.userTeamId);
    const winsOf = openings.map(t => t.record.wins);
    expect(winsOf).toEqual([...winsOf].sort((a, b) => a - b));
    const worstOther = Math.min(...s.teams.filter(t => t.id !== s.userTeamId).map(t => t.record.wins));
    expect(winsOf[0]).toBe(worstOther);
    expect(getGmJobOpenings(s.teams, s.userTeamId).map(t => t.id)).toEqual(openings.map(t => t.id));
  });
});
