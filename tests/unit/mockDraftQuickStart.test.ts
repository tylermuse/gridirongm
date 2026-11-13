import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseQuickStart, replayDraft, teamSlug, type MockDraftData } from '@/lib/mockDraft/engine';

const data: MockDraftData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../public/mock/nfl-2027.json'), 'utf8'),
);

const SEED = 12345;
const q = (s: string) => new URLSearchParams(s);

const withFirst = data.teams.find((t) => data.order.some((s) => s.round === 1 && s.tid === t.tid))!;
const firstSlotOf = (tid: number) => data.order.find((s) => s.tid === tid)!;

describe('team-page quick start (?team=…&go=1)', () => {
  it('needs go=1 and a real team', () => {
    expect(parseQuickStart(data, q(`team=${teamSlug(withFirst)}`), SEED)).toBeNull();
    expect(parseQuickStart(data, q('team=not-a-team&go=1'), SEED)).toBeNull();
  });

  it('opens with the team on the clock and nothing prefilled', () => {
    const quick = parseQuickStart(data, q(`team=${teamSlug(withFirst)}&go=1`), SEED)!;
    expect(quick.settings.userTids).toEqual([withFirst.tid]);
    expect(quick.userPicks).toEqual([]);
    expect(quick.prefilled).toBe(false);
    const replay = replayDraft(data, quick.settings, quick.userPicks);
    expect(replay.onClock?.tid).toBe(withFirst.tid);
  });

  it('rounds always cover the team’s first pick', () => {
    for (const team of data.teams) {
      const quick = parseQuickStart(data, q(`team=${teamSlug(team)}&go=1`), SEED);
      const first = data.order.find((s) => s.tid === team.tid);
      if (!first) {
        expect(quick).toBeNull();
        continue;
      }
      expect(quick!.settings.rounds).toBeGreaterThanOrEqual(first.round);
      expect(replayDraft(data, quick!.settings, []).onClock?.tid).toBe(team.tid);
    }
  });

  it('prefills an available prospect and runs at least 3 rounds', () => {
    // The top prospect left when the team is on the clock is always available.
    const base = replayDraft(data, { seed: SEED, rounds: 3, userTids: [withFirst.tid] }, []);
    const target = base.available[0];
    const quick = parseQuickStart(data, q(`team=${teamSlug(withFirst)}&go=1&pick=${target.pid}`), SEED)!;
    expect(quick.prefilled).toBe(true);
    expect(quick.userPicks).toEqual([target.pid]);
    expect(quick.settings.rounds).toBeGreaterThanOrEqual(3);
    const replay = replayDraft(data, quick.settings, quick.userPicks);
    expect(replay.invalid).toBe(false);
    const mine = replay.picks.find((p) => p.isUser)!;
    expect(mine.prospect.pid).toBe(target.pid);
    expect(mine.slot.pick).toBe(firstSlotOf(withFirst.tid).pick);
  });

  it('falls back to on-the-clock with a notice when the prospect is already gone', () => {
    const base = replayDraft(data, { seed: SEED, rounds: 3, userTids: [withFirst.tid] }, []);
    const taken = base.picks[0]; // pick 1 goes before anyone else's first slot, unless the team owns it
    if (taken.slot.tid === withFirst.tid) return;
    const quick = parseQuickStart(data, q(`team=${teamSlug(withFirst)}&go=1&pick=${taken.prospect.pid}`), SEED)!;
    expect(quick.prefilled).toBe(false);
    expect(quick.userPicks).toEqual([]);
    expect(quick.goneNotice).toContain(taken.prospect.lastName);
    expect(quick.goneNotice).toContain(`No. ${taken.slot.pick}`);
  });

  it('ignores a pick that is not a prospect', () => {
    const quick = parseQuickStart(data, q(`team=${teamSlug(withFirst)}&go=1&pick=abc`), SEED)!;
    expect(quick.prefilled).toBe(false);
    expect(quick.goneNotice).toBeNull();
  });
});
