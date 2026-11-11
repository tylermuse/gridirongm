// A pick that has been used in the draft must not be tradeable afterwards.
// Reported bug: trade for the #1 pick, make the selection, then trade the #1
// pick away again in round 5. Cause: with two picks in one round the draft
// stamped the wrong pick as used and never stamped the other.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { useGameStore } from '@/lib/engine/store';
import { isDraftPickSpent, resolvePickOnClock } from '@/lib/engine/draftPicks';
import type { DraftPick, Team } from '@/types';

const root = path.resolve(__dirname, '../../public');
const st = () => useGameStore.getState();

const pick = (id: string, over: Partial<DraftPick> = {}): DraftPick =>
  ({ id, year: 2027, round: 1, originalTeamId: 'A', ownerTeamId: 'A', ...over });
const team = (id: string, draftPicks: DraftPick[]) => ({ id, draftPicks }) as unknown as Team;

describe('resolvePickOnClock', () => {
  // Team A owns its own first (slot 6) and a traded-in first (slot 0), in that array order.
  const teams = [team('A', [pick('own'), pick('traded', { originalTeamId: 'B' })]), team('B', [])];
  const draftPickOrder = ['traded', 'x1', 'x2', 'x3', 'x4', 'x5', 'own'];

  it('names the pick in the slot on the clock, not the first one in the array', () => {
    expect(resolvePickOnClock(teams, { draftPickOrder, slotIndex: 0, draftYear: 2027, teamId: 'A', round: 1 })).toBe('traded');
    expect(resolvePickOnClock(teams, { draftPickOrder, slotIndex: 6, draftYear: 2027, teamId: 'A', round: 1 })).toBe('own');
  });

  it('falls back to the first unused pick in the round when there is no slot list', () => {
    expect(resolvePickOnClock(teams, { draftPickOrder: undefined, slotIndex: 0, draftYear: 2027, teamId: 'A', round: 1 })).toBe('own');
    const oneLeft = [team('A', [pick('own', { playerId: 'p1' }), pick('traded')])];
    expect(resolvePickOnClock(oneLeft, { draftPickOrder: undefined, slotIndex: 6, draftYear: 2027, teamId: 'A', round: 1 })).toBe('traded');
  });
});

describe('isDraftPickSpent', () => {
  const draft = { season: 2026, phase: 'draft' as const, currentDraftYear: 2027, draftPickOrder: ['a', 'b', 'c'], draftOrder: ['T3'] };

  it('treats a stamped pick as spent', () => {
    expect(isDraftPickSpent(pick('c', { playerId: 'p' }), draft)).toBe(true);
  });
  it('treats a pick whose slot has gone by as spent even if it was never stamped', () => {
    expect(isDraftPickSpent(pick('a'), draft)).toBe(true);
    expect(isDraftPickSpent(pick('b'), draft)).toBe(true);
    expect(isDraftPickSpent(pick('c'), draft)).toBe(false);
  });
  it('keeps future-year picks open during the draft', () => {
    expect(isDraftPickSpent(pick('f', { year: 2028 }), draft)).toBe(false);
  });
  it('treats this season\'s picks as spent once the season is underway', () => {
    expect(isDraftPickSpent(pick('s'), { season: 2027, phase: 'regular' })).toBe(true);
    expect(isDraftPickSpent(pick('n', { year: 2028 }), { season: 2027, phase: 'regular' })).toBe(false);
  });
  it('keeps this season\'s picks open in an offseason that comes before the season is played', () => {
    expect(isDraftPickSpent(pick('s'), { season: 2027, phase: 'freeAgency', champions: [] })).toBe(false);
    expect(isDraftPickSpent(pick('s'), { season: 2027, phase: 'freeAgency', champions: [{ season: 2027 }] })).toBe(true);
  });
});

describe('a used pick in a live draft', () => {
  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const file = path.join(root, String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0]);
      return new Response(fs.readFileSync(file, 'utf8'), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    await st().newLeague('', '/rosters/FBGM_NFL_Roster_2026_Updated.json', 'regular', true);
    for (let g = 0; st().phase === 'regular' && g < 30; g++) st().simWeek();
    st().simAllPlayoffGames();
    st().advanceToResigning();
    st().advanceToFreeAgency();
    st().advanceToDraft();
  }, 600_000);

  const findPick = (id: string) => st().teams.flatMap(t => t.draftPicks).find(pk => pk.id === id)!;
  const bestProspect = () => {
    const s = st();
    const open = new Set(s.freeAgents);
    return s.players
      .filter(p => open.has(p.id) && p.draftYear === s.currentDraftYear)
      .sort((a, b) => b.ratings.overall - a.ratings.overall)[0].id;
  };

  it('stamps the traded-in #1 pick when it is used and refuses to trade it later', () => {
    expect(st().phase).toBe('draft');
    const order = st().draftPickOrder!;
    const firstPickId = order[0];
    // The user runs the team picking 6th and has traded for the #1 pick.
    const userTeamId = st().draftOrder[5];
    const ownFirstId = order[5];
    expect(findPick(ownFirstId).ownerTeamId).toBe(userTeamId);
    const firstPick = findPick(firstPickId);
    expect(firstPick.ownerTeamId).not.toBe(userTeamId);
    useGameStore.setState({
      isSpectator: false,
      userTeamId,
      // Same shape a trade leaves behind: own picks first, the new pick appended.
      teams: st().teams.map(t => {
        const kept = t.draftPicks.filter(pk => pk.id !== firstPickId);
        return t.id === userTeamId ? { ...t, draftPicks: [...kept, { ...firstPick, ownerTeamId: userTeamId }] } : { ...t, draftPicks: kept };
      }),
      draftOrder: [userTeamId, ...st().draftOrder.slice(1)],
    });

    st().draftPlayer(bestProspect());
    expect(findPick(firstPickId).playerId).toBeTruthy();
    expect(findPick(firstPickId).pick).toBe(1);
    expect(findPick(ownFirstId).playerId).toBeUndefined();

    st().simToUserDraftPick();
    expect(st().draftOrder[0]).toBe(userTeamId);
    st().draftPlayer(bestProspect());
    expect(findPick(ownFirstId).playerId).toBeTruthy();
    expect(findPick(ownFirstId).pick).toBe(6);

    // Later in the draft neither first-rounder is on offer any more.
    st().simToUserDraftPick();
    const s = st();
    const userTeam = s.teams.find(t => t.id === userTeamId)!;
    const stillOpen = userTeam.draftPicks.filter(pk => pk.year === s.currentDraftYear && !isDraftPickSpent(pk, s));
    expect(stillOpen.map(pk => pk.id)).not.toContain(firstPickId);
    expect(stillOpen.map(pk => pk.id)).not.toContain(ownFirstId);

    const partner = s.teams.find(t => t.id !== userTeamId)!;
    const result = st().executeTrade([], [firstPickId], [], [], partner.id, true);
    expect(result.success).toBe(false);
    expect(findPick(firstPickId).ownerTeamId).toBe(userTeamId);
  });

  it('leaves every selection in the draft with exactly one stamped pick', () => {
    st().simToEndDraft({ skipAdvance: true });
    const s = st();
    const stamped = s.teams.flatMap(t => t.draftPicks).filter(pk => pk.year === s.currentDraftYear && pk.playerId);
    const stampedPlayers = stamped.map(pk => pk.playerId);
    expect(new Set(stampedPlayers).size).toBe(stampedPlayers.length);
    for (const r of s.draftResults) {
      const pk = stamped.find(x => x.playerId === r.playerId);
      expect(pk, `pick #${r.overallPick}`).toBeTruthy();
      expect(pk!.ownerTeamId).toBe(r.teamId);
      expect(pk!.pick).toBe(r.overallPick);
    }
  });
});
