import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  classGrade,
  dataFingerprint,
  encodeShareQuery,
  gradePick,
  parseShareQuery,
  replayDraft,
  slotsForRounds,
  teamNeeds,
  type DraftSettings,
  type MadePick,
  type MockDraftData,
} from '@/lib/mockDraft/engine';

const data: MockDraftData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../public/mock/nfl-2027.json'), 'utf8'),
);

/** Plays a whole draft, taking the top remaining prospect at each user slot. */
function playDraft(d: MockDraftData, settings: DraftSettings) {
  const userPicks: number[] = [];
  let replay = replayDraft(d, settings, userPicks);
  while (replay.onClock) {
    userPicks.push(replay.available[0].pid);
    replay = replayDraft(d, settings, userPicks);
  }
  return { userPicks, replay };
}

const summarize = (picks: MadePick[]) => picks.map((p) => [p.slot.pick, p.slot.tid, p.prospect.pid, p.isUser, p.grade]);
const params = (query: string) => new URLSearchParams(query);
const clone = (): MockDraftData => JSON.parse(JSON.stringify(data));

const firstRoundTeam = data.order[0].tid;
const SETTINGS: DraftSettings[] = [
  { seed: 12345, rounds: 1, userTids: [firstRoundTeam] },
  { seed: 987654321, rounds: 3, userTids: [firstRoundTeam, data.order[9].tid] },
  { seed: 4294967295, rounds: 7, userTids: data.teams.map((t) => t.tid) },
  { seed: 0, rounds: 7, userTids: [] },
];

describe('share URL replay', () => {
  it.each(SETTINGS)('reproduces every pick from the URL (seed $seed, $rounds rounds)', (settings) => {
    const { userPicks, replay } = playDraft(data, settings);
    expect(replay.complete).toBe(true);

    const parsed = parseShareQuery(data, params(encodeShareQuery(data, settings, userPicks)));
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;
    expect(parsed.userPicks).toEqual(userPicks);
    expect(parsed.settings).toEqual(settings);
    expect(summarize(parsed.replay.picks)).toEqual(summarize(replay.picks));
  });

  it('survives a URL round trip, including extra tracking params', () => {
    const settings = SETTINGS[1];
    const { userPicks, replay } = playDraft(data, settings);
    const url = new URL(`https://bs-football.com/mock-draft?${encodeShareQuery(data, settings, userPicks)}&utm_source=x`);
    const parsed = parseShareQuery(data, url.searchParams);
    expect(parsed.kind === 'ok' && summarize(parsed.replay.picks)).toEqual(summarize(replay.picks));
  });

  it('gives different AI picks for a different seed', () => {
    const a = replayDraft(data, { seed: 1, rounds: 7, userTids: [] }, []);
    const b = replayDraft(data, { seed: 2, rounds: 7, userTids: [] }, []);
    expect(summarize(a.picks)).not.toEqual(summarize(b.picks));
  });

  it('never drafts a prospect twice', () => {
    const { replay } = playDraft(data, SETTINGS[1]);
    const pids = replay.picks.map((p) => p.prospect.pid);
    expect(new Set(pids).size).toBe(pids.length);
    expect(pids).toHaveLength(96);
  });

  it('keeps the URL short: base36 pids, and `all` instead of 32 tids', () => {
    const settings = SETTINGS[2];
    const { userPicks } = playDraft(data, settings);
    const query = encodeShareQuery(data, settings, userPicks);
    expect(query).toContain('t=all');
    expect(query.length).toBeLessThan(1000);
  });
});

describe('undo', () => {
  it('rewinds to the same board: the prefix before the undone pick is unchanged', () => {
    const settings: DraftSettings = { seed: 555, rounds: 3, userTids: [firstRoundTeam] };
    const { userPicks } = playDraft(data, settings);
    const undone = replayDraft(data, settings, userPicks.slice(0, -1));
    const full = replayDraft(data, settings, userPicks);
    expect(undone.onClock).not.toBeNull();
    expect(summarize(undone.picks)).toEqual(summarize(full.picks.slice(0, undone.picks.length)));
    expect(undone.picks.length).toBe(full.picks.findLastIndex((p) => p.isUser));
  });
});

describe('stale and malformed share URLs degrade to the setup screen', () => {
  const settings = SETTINGS[1];
  const { userPicks } = playDraft(data, settings);
  const query = encodeShareQuery(data, settings, userPicks);

  it('reports none when there is no share state', () => {
    expect(parseShareQuery(data, params('')).kind).toBe('none');
    expect(parseShareQuery(data, params('utm_source=x')).kind).toBe('none');
  });

  it('flags a refresh that kept every pid but moved the draft order', () => {
    const moved = clone();
    [moved.order[0].tid, moved.order[1].tid] = [moved.order[1].tid, moved.order[0].tid];
    expect(dataFingerprint(moved)).not.toBe(dataFingerprint(data));
    const parsed = parseShareQuery(moved, params(query));
    expect(parsed.kind).toBe('stale');
    if (parsed.kind === 'stale') {
      expect(parsed.hint.rounds).toBe(3);
      expect(parsed.hint.userTids).toEqual(settings.userTids);
    }
  });

  it('flags a refresh that removed a drafted prospect', () => {
    const gone = clone();
    gone.prospects = gone.prospects.filter((p) => p.pid !== userPicks[0]);
    expect(parseShareQuery(gone, params(query)).kind).toBe('stale');
  });

  it('flags a pid that is not on the board even when the fingerprint matches', () => {
    const bad = query.replace(/p=[^&]+/, 'p=zzzzz');
    expect(parseShareQuery(data, params(bad)).kind).toBe('stale');
  });

  it.each([
    ['no fingerprint', query.replace(/&d=[^&]+/, '')],
    ['too few picks', query.replace(/p=[^&.]+\./, 'p=')],
    ['too many picks', query.replace(/p=/, 'p=1.')],
    ['garbage seed', query.replace(/s=[^&]+/, 's=!!')],
    ['seed over 32 bits', query.replace(/s=[^&]+/, 's=zzzzzzz')],
    ['unsupported rounds', query.replace(/r=\d/, 'r=2')],
    ['unknown team', query.replace(/t=[^&]+/, 't=99')],
    ['duplicate team', query.replace(/t=[^&]+/, `t=${firstRoundTeam},${firstRoundTeam}`)],
  ])('flags %s', (_label, bad) => {
    expect(bad).not.toBe(query);
    expect(parseShareQuery(data, params(bad)).kind).toBe('stale');
  });
});

describe('grades', () => {
  it('grades a slot the same whatever the draft length', () => {
    const oneRound = replayDraft(data, { seed: 9, rounds: 1, userTids: [] }, []);
    const sevenRounds = replayDraft(data, { seed: 9, rounds: 7, userTids: [] }, []);
    expect(summarize(oneRound.picks)).toEqual(summarize(sevenRounds.picks.slice(0, 32)));
  });

  it('gives best-available round-1 picks a credible grade, not the C/D of raw OVR', () => {
    const grades = data.order.slice(0, 32).map((slot, i) => gradePick(data, slot.pick, data.prospects[i]));
    expect(grades.filter((g) => /^[AB]/.test(g)).length).toBeGreaterThanOrEqual(24);
    expect(grades.some((g) => g === 'D' || g === 'F')).toBe(false);
  });

  it('computes a class grade only when there are picks', () => {
    expect(classGrade([])).toBeNull();
    const { replay } = playDraft(data, SETTINGS[0]);
    expect(classGrade(replay.picks.filter((p) => p.isUser))).toMatch(/^[A-D]/);
  });
});

describe('teams', () => {
  it('handles a team with no pick in the chosen rounds', () => {
    const r1 = new Set(slotsForRounds(data, 1).map((s) => s.tid));
    const noFirst = data.teams.find((t) => !r1.has(t.tid));
    expect(noFirst).toBeDefined();
    const settings: DraftSettings = { seed: 3, rounds: 1, userTids: [noFirst!.tid] };
    const replay = replayDraft(data, settings, []);
    expect(replay.complete).toBe(true);
    expect(replay.picks.filter((p) => p.isUser)).toHaveLength(0);
  });

  it('updates a team\'s counts after it picks', () => {
    const settings: DraftSettings = { seed: 3, rounds: 1, userTids: [firstRoundTeam] };
    const before = replayDraft(data, settings, []);
    const pick = before.available[0];
    const after = replayDraft(data, settings, [pick.pid]);
    const start = data.teams.find((t) => t.tid === firstRoundTeam)!.countByPosition[pick.pos];
    expect(after.countsByTeam.get(firstRoundTeam)![pick.pos]).toBeGreaterThanOrEqual(start + 1);
  });

  it('never lists K or P as a need, since the data file caps them at 0 for every team', () => {
    for (const team of data.teams) {
      const needs = teamNeeds(team.countByPosition);
      expect(needs).not.toContain('K');
      expect(needs).not.toContain('P');
    }
  });
});

describe('performance and isolation', () => {
  it('finishes a 7-round all-AI mock in under a second', () => {
    const start = performance.now();
    const replay = replayDraft(data, { seed: 42, rounds: 7, userTids: [] }, []);
    expect(replay.picks).toHaveLength(224);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('does not import the game store from the mock-draft code', () => {
    const root = path.resolve(__dirname, '../../src');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) files.push(full);
      }
    };
    walk(path.join(root, 'app/mock-draft'));
    walk(path.join(root, 'lib/mockDraft'));
    walk(path.join(root, 'app/api/og'));
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(/engine\/store/);
    }
  });
});
