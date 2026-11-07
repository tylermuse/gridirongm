import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Position } from '@/types';
import { chooseDraftPick, type DraftAITeamContext } from '@/lib/engine/draftAI';

// Validates public/mock/nfl-2027.json (built by scripts/build_mock_draft.py)
// and runs a full 7-round AI-only mock on it with a seeded RNG.
const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/mock/nfl-2027.json'), 'utf8'));

function seeded(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

describe('mock draft data (nfl-2027.json)', () => {
  it('has 7 full rounds with every slot owned by a real team', () => {
    expect(data.order).toHaveLength(data.teams.length * 7);
    const tids = new Set(data.teams.map((t: { tid: number }) => t.tid));
    for (const o of data.order) expect(tids.has(o.tid)).toBe(true);
    expect(data.order.map((o: { pick: number }) => o.pick)).toEqual(data.order.map((_: unknown, i: number) => i + 1));
  });

  it('has enough prospects for every pick', () => {
    expect(data.prospects.length).toBeGreaterThanOrEqual(data.order.length);
  });

  it('runs a full AI mock with no duplicate picks', () => {
    const rng = seeded(42);
    const ctx = new Map<number, DraftAITeamContext>(data.teams.map((t: any) => [t.tid, {
      countByPosition: { ...t.countByPosition }, bestQbOvr: t.bestQbOvr, hasDevQB: t.hasDevQB,
    }]));
    let available = data.prospects.map((p: any) => ({ id: String(p.pid), position: p.pos as Position, overall: p.ovr, potential: p.pot, boardScore: p.value * 15 }));
    const taken: string[] = [];
    for (const o of data.order) {
      const team = ctx.get(o.tid)!;
      const id = chooseDraftPick({ overallPick: o.pick, available, team, rng });
      expect(id).toBeDefined();
      const p = available.find((x: { id: string }) => x.id === id)!;
      available = available.filter((x: { id: string }) => x.id !== id);
      team.countByPosition[p.position] = (team.countByPosition[p.position] ?? 0) + 1;
      taken.push(id!);
    }
    expect(new Set(taken).size).toBe(data.order.length);
    // Credibility: round 1 should come from the top of the board.
    const byRank = new Map(data.prospects.map((p: any) => [String(p.pid), p.rank]));
    const r1 = taken.slice(0, 32).map((id) => byRank.get(id) as number);
    expect(Math.max(...r1)).toBeLessThanOrEqual(64);
    // Print round 1 for eyeballing.
    const byId = new Map(data.prospects.map((p: any) => [String(p.pid), p]));
    const abbr = new Map(data.teams.map((t: any) => [t.tid, t.abbrev]));
    console.log(taken.slice(0, 32).map((id, i) => {
      const p: any = byId.get(id);
      return `${i + 1}. ${abbr.get(data.order[i].tid)} — ${p.firstName} ${p.lastName} ${p.pos} (${p.college}) #${p.rank}`;
    }).join('\n'));
  });
});
