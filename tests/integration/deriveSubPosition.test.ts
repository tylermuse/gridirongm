/**
 * Position-group classification (5/29 bryangrove bug).
 *
 * The 4/12 roadmap claimed "Detailed position groups Phase 1 (OT/OG/C,
 * EDGE/DT, OLB/MLB, FS/SS) shipped", but the deriveSubPosition() thresholds
 * were biased so that virtually every OL classified as OG and every DL as DT
 * (with one stray EDGE). The plumbing shipped; the distribution didn't.
 *
 * The fix splits each team's position group *relatively* via
 * classifyTeamSubPositions(): rank within the group and assign realistic
 * proportions. These tests lock in that the labels actually distribute and,
 * critically, that no group collapses to a single sub-position again.
 */

import { describe, it, expect } from 'vitest';
import { generateRoster, generatePlayer } from '@/lib/engine/playerGen';
import { classifyTeamSubPositions } from '@/types';
import type { Player, SubPosition } from '@/types';

const LEAGUE_TEAMS = 32;

function buildLeague(): Player[][] {
  const rosters: Player[][] = [];
  for (let t = 0; t < LEAGUE_TEAMS; t++) {
    rosters.push(generateRoster(`T${t}`, 70));
  }
  return rosters;
}

function countSub(players: Player[], positions: SubPosition[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const sp of positions) counts[sp] = 0;
  for (const p of players) {
    if (p.subPosition && sp_in(p.subPosition, positions)) counts[p.subPosition]++;
  }
  return counts;
}
function sp_in(sp: SubPosition, list: SubPosition[]): boolean {
  return list.includes(sp);
}

describe('sub-position distribution (generateRoster backfill)', () => {
  const rosters = buildLeague();
  const all = rosters.flat();

  it('every generated player has a sub-position', () => {
    expect(all.every(p => !!p.subPosition)).toBe(true);
  });

  it('OL is NOT collapsed to OG — splits OT / OG / C across the league', () => {
    const ol = all.filter(p => p.position === 'OL');
    const c = countSub(ol, ['OT', 'OG', 'C']);
    const total = ol.length;
    // The bug: ~99% OG. Assert a real spread instead.
    expect(c.OT / total).toBeGreaterThan(0.25);
    expect(c.OT / total).toBeLessThan(0.6);
    expect(c.OG / total).toBeGreaterThan(0.25);
    expect(c.C).toBeGreaterThan(0); // at least some centers league-wide
    // No single label may dominate the group.
    expect(Math.max(c.OT, c.OG, c.C) / total).toBeLessThan(0.85);
  });

  it('DL is NOT collapsed to DT — splits EDGE / DT (~40-55% EDGE)', () => {
    const dl = all.filter(p => p.position === 'DL');
    const c = countSub(dl, ['EDGE', 'DT']);
    const total = dl.length;
    expect(c.EDGE / total).toBeGreaterThan(0.35);
    expect(c.EDGE / total).toBeLessThan(0.6);
    expect(c.DT / total).toBeGreaterThan(0.35);
  });

  it('LB splits OLB / MLB', () => {
    const lb = all.filter(p => p.position === 'LB');
    const c = countSub(lb, ['OLB', 'MLB']);
    const total = lb.length;
    expect(c.OLB / total).toBeGreaterThan(0.3);
    expect(c.MLB / total).toBeGreaterThan(0.3);
  });

  it('S splits FS / SS', () => {
    const s = all.filter(p => p.position === 'S');
    const c = countSub(s, ['FS', 'SS']);
    const total = s.length;
    expect(c.FS / total).toBeGreaterThan(0.3);
    expect(c.SS / total).toBeGreaterThan(0.3);
  });

  it('every team has a usable O-line spread (>=2 OT, >=2 OG, >=1 C)', () => {
    for (const roster of rosters) {
      const ol = roster.filter(p => p.position === 'OL');
      const c = countSub(ol, ['OT', 'OG', 'C']);
      expect(c.OT).toBeGreaterThanOrEqual(2);
      expect(c.OG).toBeGreaterThanOrEqual(2);
      expect(c.C).toBeGreaterThanOrEqual(1);
    }
  });

  it('every team has at least one EDGE and one DT', () => {
    for (const roster of rosters) {
      const dl = roster.filter(p => p.position === 'DL');
      const c = countSub(dl, ['EDGE', 'DT']);
      expect(c.EDGE).toBeGreaterThanOrEqual(1);
      expect(c.DT).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('classifyTeamSubPositions (authoritative, pure)', () => {
  it('reclassifies a roster whose stored labels are all wrong', () => {
    const roster = generateRoster('X', 72);
    // Simulate the pre-fix bug: stamp every lineman with the interior default.
    for (const p of roster) {
      if (p.position === 'OL') p.subPosition = 'OG';
      if (p.position === 'DL') p.subPosition = 'DT';
    }
    const map = classifyTeamSubPositions(roster);
    const ol = roster.filter(p => p.position === 'OL');
    const dl = roster.filter(p => p.position === 'DL');
    const olLabels = new Set(ol.map(p => map.get(p.id)));
    const dlLabels = new Set(dl.map(p => map.get(p.id)));
    expect(olLabels.has('OT')).toBe(true);
    expect(olLabels.has('OG')).toBe(true);
    expect(dlLabels.has('EDGE')).toBe(true);
    expect(dlLabels.has('DT')).toBe(true);
  });

  it('is pure — does not mutate the input players', () => {
    const roster = generateRoster('Y', 70);
    const before = roster.map(p => p.subPosition);
    classifyTeamSubPositions(roster);
    const after = roster.map(p => p.subPosition);
    expect(after).toEqual(before);
  });

  it('passes 1:1 positions straight through (QB/WR/TE/CB/K/P)', () => {
    const qb = generatePlayer('QB', 70, { teamId: 'Z' });
    const wr = generatePlayer('WR', 70, { teamId: 'Z' });
    const k = generatePlayer('K', 70, { teamId: 'Z' });
    const map = classifyTeamSubPositions([qb, wr, k]);
    expect(map.get(qb.id)).toBe('QB');
    expect(map.get(wr.id)).toBe('WR');
    expect(map.get(k.id)).toBe('K');
  });
});
