import { describe, it, expect } from 'vitest';
import { lineupDepthChart, fillSlots, defenseSlots, startersFirst, OFFENSE_SLOTS } from '@/lib/engine/lineup';
import type { Player, Position, SubPosition } from '@/types';

// Tyler 11/23: "I have to reset the depth chart because my main starters
// aren't playing." The engines start the first N of a position's flat depth
// list; the roster page starts the top players of each sub-position row.
// lineupDepthChart lines the flat list up so the two agree.

const R = { passRush: 60, speed: 60, tackling: 60, coverage: 60, strength: 60, agility: 60, blocking: 60, carrying: 60, awareness: 60, overall: 60 };
let n = 0;
function pl(position: Position, subPosition: SubPosition, extra: Partial<Player> = {}): Player {
  return { id: `${subPosition}${++n}`, position, subPosition, teamId: 'T', ratings: { ...R }, ...extra } as unknown as Player;
}
const team = (depthChart: Partial<Record<Position, string[]>>, extra: Record<string, unknown> = {}) =>
  ({ id: 'T', depthChart: depthChart as Record<Position, string[]>, ...extra });

describe('lineupDepthChart', () => {
  // The screenshot's DL, sorted by OVR (what Reset and the import produce):
  // three EDGEs outrank the second DT, so the flat top four was 3 EDGE + 1 DT.
  const williams = pl('DL', 'EDGE'), griffin = pl('DL', 'DT'), faulk = pl('DL', 'EDGE'), oladejo = pl('DL', 'EDGE'),
    ojomo = pl('DL', 'DT'), gibson = pl('DL', 'DT'), franklin = pl('DL', 'EDGE'), washington = pl('DL', 'EDGE'), travis = pl('DL', 'DT');
  const dl = [williams, griffin, faulk, oladejo, ojomo, gibson, franklin, washington, travis];
  const ids = (ps: Player[]) => ps.map(p => p.id);

  it('starts both DTs of a 4-3 front, in slot order LDE LDT RDT RDE', () => {
    const chart = lineupDepthChart(team({ DL: ids(dl) }), dl);
    expect(chart.DL.slice(0, 4)).toEqual(ids([williams, griffin, ojomo, faulk]));
    // nobody lost, and each sub-position row keeps its order
    expect([...chart.DL].sort()).toEqual(ids(dl).sort());
    const row = (sp: SubPosition) => chart.DL.filter(id => dl.find(p => p.id === id)!.subPosition === sp);
    expect(row('EDGE')).toEqual(ids([williams, faulk, oladejo, franklin, washington]));
    expect(row('DT')).toEqual(ids([griffin, ojomo, gibson, travis]));
  });

  it('promoting a DT in the DT row keeps the other starting DT on the field', () => {
    // The roster page's sub-row reorder swaps Ojomo into Griffin's flat slot,
    // which dropped Griffin (77) to flat index 4: a backup to every engine.
    const promoted = [williams, ojomo, faulk, oladejo, griffin, gibson, franklin, washington, travis];
    const chart = lineupDepthChart(team({ DL: ids(promoted) }), promoted);
    expect(chart.DL.slice(0, 4)).toEqual(ids([williams, ojomo, griffin, faulk]));
  });

  it('replaces an injured starter from his own sub-position', () => {
    const hurt = { ...griffin, injury: { type: 'Ankle', weeksLeft: 2 } } as Player;
    const roster = dl.map(p => (p.id === griffin.id ? hurt : p));
    const chart = lineupDepthChart(team({ DL: ids(dl) }), roster);
    expect(chart.DL.slice(0, 4)).toEqual(ids([williams, ojomo, gibson, faulk]));
    expect(chart.DL).toContain(griffin.id); // still on the chart, just not lined up
  });

  it('a player playing through an injury still starts', () => {
    const through = { ...griffin, injury: { type: 'Ankle', weeksLeft: 1 }, playingThroughInjury: true } as Player;
    const chart = lineupDepthChart(team({ DL: ids(dl) }), dl.map(p => (p.id === griffin.id ? through : p)));
    expect(chart.DL.slice(0, 4)).toEqual(ids([williams, griffin, ojomo, faulk]));
  });

  it('skips practice-squad and IR players, and lines up a fresh signing the chart does not list yet', () => {
    const psDt = pl('DL', 'DT'), irDt = pl('DL', 'DT', { onIR: true }), signed = pl('DL', 'DT');
    const roster = [williams, psDt, irDt, faulk, signed];
    const chart = lineupDepthChart(team({ DL: ids([williams, psDt, irDt, faulk]) }, { practiceSquad: [psDt.id] }), roster);
    expect(chart.DL.slice(0, 3)).toEqual(ids([williams, signed, faulk]));
  });

  it('fills a slot the roster cannot fill at its sub-position with the next man up', () => {
    const oneDt = [williams, griffin, faulk, oladejo, franklin];
    const chart = lineupDepthChart(team({ DL: ids(oneDt) }), oneDt);
    expect(chart.DL.slice(0, 4)).toEqual(ids([williams, griffin, oladejo, faulk]));
  });

  it('starts a free and a strong safety, and the 4-3 linebackers', () => {
    const fs1 = pl('S', 'FS'), fs2 = pl('S', 'FS'), ss1 = pl('S', 'SS');
    const mlb1 = pl('LB', 'MLB'), olb1 = pl('LB', 'OLB'), mlb2 = pl('LB', 'MLB'), olb2 = pl('LB', 'OLB');
    const chart = lineupDepthChart(team({ S: ids([fs1, fs2, ss1]), LB: ids([mlb1, mlb2, olb1, olb2]) }),
      [fs1, fs2, ss1, mlb1, olb1, mlb2, olb2]);
    expect(chart.S.slice(0, 2)).toEqual(ids([fs1, ss1]));
    expect(chart.LB.slice(0, 3)).toEqual(ids([olb1, mlb1, olb2]));
  });

  it('follows the formation: a 3-4 starts one DT and two inside linebackers', () => {
    const mlb1 = pl('LB', 'MLB'), olb1 = pl('LB', 'OLB'), mlb2 = pl('LB', 'MLB'), olb2 = pl('LB', 'OLB');
    const chart = lineupDepthChart(team({ DL: ids(dl), LB: ids([olb1, olb2, mlb1, mlb2]) }, { baseFormation: '3-4' }),
      [...dl, mlb1, olb1, mlb2, olb2]);
    expect(chart.DL.slice(0, 3)).toEqual(ids([williams, griffin, faulk]));
    expect(chart.LB.slice(0, 4)).toEqual(ids([olb1, mlb1, mlb2, olb2]));
  });

  it('leaves positions without sub-position rows exactly as saved', () => {
    const cb1 = pl('CB', 'CB'), cb2 = pl('CB', 'CB'), qb = pl('QB', 'QB');
    const saved = { CB: ids([cb2, cb1]), QB: ids([qb]) };
    const chart = lineupDepthChart(team(saved), [cb1, cb2, qb]);
    expect(chart.CB).toEqual(saved.CB);
    expect(chart.QB).toEqual(saved.QB);
  });

  it('lines the OL up LT, LG, C, RG, RT from the sub-position rows', () => {
    const ot1 = pl('OL', 'OT'), ot2 = pl('OL', 'OT'), ot3 = pl('OL', 'OT'), og1 = pl('OL', 'OG'), og2 = pl('OL', 'OG'), c1 = pl('OL', 'C');
    const flat = [ot1, ot2, ot3, c1, og1, og2];
    const chart = lineupDepthChart(team({ OL: ids(flat) }), flat);
    expect(chart.OL.slice(0, 5)).toEqual(ids([ot1, og1, c1, og2, ot2]));
  });
});

describe('fillSlots / startersFirst', () => {
  it('never starts one man in two slots', () => {
    const e1 = pl('DL', 'EDGE'), e2 = pl('DL', 'EDGE'), e3 = pl('DL', 'EDGE');
    const filled = fillSlots([e1, e2, e3], defenseSlots('4-3').filter(s => s.pos === 'DL'));
    expect(filled.map(p => p?.id)).toEqual([e1.id, e3.id, undefined, e2.id]);
  });

  it('keeps a whole-position row in saved order', () => {
    const wr = [pl('WR', 'WR'), pl('WR', 'WR'), pl('WR', 'WR')];
    expect(startersFirst(wr, OFFENSE_SLOTS.filter(s => s.pos === 'WR'))).toEqual(wr);
  });
});
