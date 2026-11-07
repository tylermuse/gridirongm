// Headless: real store + the real NFL roster file. Starts a league at the 2027
// draft from a finished /mock-draft and checks the mock's picks land as mocked.
import { it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { useGameStore } from '@/lib/engine/store';
import { draftStartPlan, encodeShareQuery, parseShareQuery, replayDraft, type MockDraftData } from '@/lib/mockDraft/engine';

const root = path.resolve(__dirname, '../../public');
const data: MockDraftData = JSON.parse(fs.readFileSync(path.join(root, 'mock/nfl-2027.json'), 'utf8'));

it('starts a league at the 2027 draft with the mock applied', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const file = path.join(root, String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0]);
    const body = fs.readFileSync(file, 'utf8');
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  const DAL = data.teams.find((t) => t.abbrev === 'DAL')!;
  // Dallas drafts the top remaining prospect at each of its picks, 1 round.
  const settings = { seed: 7, rounds: 1 as const, userTids: [DAL.tid] };
  const userPicks: number[] = [];
  let replay = replayDraft(data, settings, userPicks);
  while (replay.onClock) { userPicks.push(replay.available[0].pid); replay = replayDraft(data, settings, userPicks); }
  const share = parseShareQuery(data, new URLSearchParams(encodeShareQuery(data, settings, userPicks)));
  expect(share.kind).toBe('ok');
  const plan = draftStartPlan(data, replay);

  const result = await useGameStore.getState().startAtMockDraft('DAL', '/rosters/FBGM_NFL_Roster_2026_Updated.json', plan);
  const s = useGameStore.getState();

  expect(s.phase).toBe('draft');
  expect(s.isSpectator).toBe(false);
  expect(s.userTeamId).toBe(`team-${DAL.tid}`);
  expect(result.applied).toBe(32);
  // Round 1 went exactly as mocked, team by team.
  for (const made of replay.picks) {
    const r = s.draftResults.find((x) => x.overallPick === made.slot.pick)!;
    expect(r.playerId).toBe(`player-${made.prospect.pid}`);
    expect(r.teamId).toBe(`team-${made.slot.tid}`);
  }
  const dalRookies = s.players.filter((p) => p.teamId === `team-${DAL.tid}` && p.draftYear === 2027);
  expect(dalRookies.length).toBeGreaterThan(0);
  // Round 2 is next, in the mock's order.
  expect(s.draftOrder[0]).toBe(`team-${data.order[32].tid}`);
}, 600_000);

it('a 7-round mock leaves the draft complete with every mocked pick made', async () => {
  const GB = data.teams.find((t) => t.abbrev === 'GB')!;
  const settings = { seed: 11, rounds: 7 as const, userTids: [GB.tid] };
  const userPicks: number[] = [];
  let replay = replayDraft(data, settings, userPicks);
  while (replay.onClock) { userPicks.push(replay.available[0].pid); replay = replayDraft(data, settings, userPicks); }
  const result = await useGameStore.getState().startAtMockDraft('GB', '/rosters/FBGM_NFL_Roster_2026_Updated.json', draftStartPlan(data, replay));
  const s = useGameStore.getState();
  expect(result).toEqual({ applied: 224, skipped: 0 });
  expect(s.draftOrder).toHaveLength(0);
  const gbRookies = s.players.filter((p) => p.teamId === `team-${GB.tid}` && p.draftYear === 2027);
  expect(gbRookies.map((p) => p.id).sort()).toEqual(replay.picks.filter((p) => p.slot.tid === GB.tid).map((p) => `player-${p.prospect.pid}`).sort());
}, 600_000);
