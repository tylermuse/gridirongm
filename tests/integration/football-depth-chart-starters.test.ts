/**
 * The players the roster page starts are the players the season sim plays
 * (Tyler 11/23: "I have to reset the depth chart because my main starters
 * aren't playing"). Every engine starts the first N of a position's flat
 * depth list; the page's formation card starts the top players of each
 * sub-position row. Straight off the NFL 2026 import, 20 of 32 teams had a
 * card DL starter outside the flat top four (Buffalo played Rousseau, Chubb,
 * Oliver and Parker — three EDGEs — while the card started DT Sanders).
 *
 * Heavy (33MB roster file). Run on its own:
 *   NODE_OPTIONS=--max-old-space-size=12000 npx vitest run tests/integration/football-depth-chart-starters.test.ts --pool=forks
 */
import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import { useGameStore, simulateScheduledGame } from '@/lib/engine/store';
import { defenseSlots, fillSlots, lineupDepthChart, OFFENSE_SLOTS } from '@/lib/engine/lineup';
import type { Player, Position, Team } from '@/types';

const ROSTER_URL = '/rosters/FBGM_NFL_Roster_2026_Updated.json';

function stubRosterFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (!path.startsWith('/rosters/')) return { ok: true, status: 200, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(`public${path}`, 'utf8')) };
  }));
}

const canPlay = (p: Player) => !p.onIR && (!p.injury || p.injury.weeksLeft <= 0 || !!p.playingThroughInjury);

/** The roster page's depth group (getDepthGroup): saved order, then anyone missing; no PS or retired. */
function pageGroup(team: Team, players: Player[], pos: Position): Player[] {
  const ps = new Set(team.practiceSquad ?? []);
  const mine = players.filter(p => p.teamId === team.id && p.position === pos && !p.retired && !ps.has(p.id));
  const saved = (team.depthChart[pos] ?? []).map(id => mine.find(p => p.id === id)).filter((p): p is Player => !!p);
  return [...saved, ...mine.filter(p => !saved.includes(p))];
}

describe('depth chart starters', () => {
  it('every team fields the formation card’s starters', async () => {
    stubRosterFetch();
    await useGameStore.getState().newLeague('BUF', ROSTER_URL, 'regular');
    const s = useGameStore.getState();

    for (const team of s.teams) {
      const slots = [...OFFENSE_SLOTS, ...defenseSlots(team.baseFormation)];
      const lined = lineupDepthChart(team, s.players);
      for (const pos of ['OL', 'DL', 'LB', 'S'] as Position[]) {
        const posSlots = slots.filter(sl => sl.pos === pos);
        const cardStarters = fillSlots(pageGroup(team, s.players, pos), posSlots)
          .filter((p): p is Player => !!p && canPlay(p));
        const fielded = lined[pos].slice(0, posSlots.length);
        for (const p of cardStarters) {
          expect(fielded, `${team.abbreviation} ${pos}: ${p.firstName} ${p.lastName} starts on the card`).toContain(p.id);
        }
      }
    }
  }, 120_000);

  it('the season sim rushes the passer with the card’s front four, not a backup EDGE', async () => {
    const s = useGameStore.getState();
    const buf = s.teams.find(t => t.abbreviation === 'BUF')!;
    const game = s.schedule.find(g => !g.played && g.week === s.week && (g.homeTeamId === buf.id || g.awayTeamId === buf.id))!;
    expect(game).toBeDefined();

    const dlSlots = defenseSlots(buf.baseFormation).filter(sl => sl.pos === 'DL');
    const front = fillSlots(pageGroup(buf, s.players, 'DL').filter(canPlay), dlSlots).map(p => p!.id);
    const dl = new Set(s.players.filter(p => p.teamId === buf.id && p.position === 'DL').map(p => p.id));
    const sacks = new Map<string, number>();
    for (let i = 0; i < 300; i++) {
      const r = simulateScheduledGame(s, s.teams, game);
      for (const [id, st] of Object.entries(r.playerStats)) {
        if (dl.has(id) && (st.sacks ?? 0) > 0) sacks.set(id, (sacks.get(id) ?? 0) + (st.sacks ?? 0));
      }
    }
    // The quick sim's sack pool is the first four DL: exactly the card's front.
    expect([...sacks.keys()].filter(id => !front.includes(id))).toEqual([]);
    const dts = front.filter(id => s.players.find(p => p.id === id)!.subPosition === 'DT');
    expect(dts.length).toBeGreaterThanOrEqual(2);
    for (const id of dts) expect(sacks.get(id) ?? 0, `DT ${id} never rushed`).toBeGreaterThan(0);
  }, 120_000);
});
