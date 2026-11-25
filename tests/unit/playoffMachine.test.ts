import { describe, expect, it } from 'vitest';
import snapshot from '@/lib/data/predictions/nfl-latest.json';
import {
  decodePicks,
  encodePicks,
  gameKey,
  recordWithPicks,
  runPlayoffMachine,
  type MachineGame,
  type MachineTeam,
  type Picks,
} from '@/lib/predictions/playoffMachine';

const teams: MachineTeam[] = snapshot.teams.map((t) => ({
  abbrev: t.abbrev, city: t.city, name: t.name, conference: t.conference, division: t.division, rating: t.rating,
}));
const games = snapshot.games as MachineGame[];
const remaining = games.filter((g) => !g.done);

describe('playoff machine', () => {
  it('with no picks, matches the published /predictions odds closely', () => {
    const res = runPlayoffMachine(teams, games, {}, 6000);
    const byAbbrev = new Map(res.teams.map((t) => [t.abbrev, t]));
    let worst = 0;
    for (const t of snapshot.teams) {
      const r = byAbbrev.get(t.abbrev)!;
      worst = Math.max(worst, Math.abs(r.playoffs - t.playoffs));
      expect(Math.abs(r.projectedWins - t.projectedWins)).toBeLessThan(0.3);
    }
    // Different seed + playoff ratings (see module doc), so allow sampling noise.
    expect(worst).toBeLessThan(4);
  });

  it('each conference fills exactly 7 seeds per sim', () => {
    const res = runPlayoffMachine(teams, games, {}, 500);
    for (const c of ['AFC', 'NFC']) {
      const sum = res.teams
        .filter((t) => teams.find((x) => x.abbrev === t.abbrev)!.conference === c)
        .reduce((s, t) => s + t.playoffs, 0);
      expect(sum).toBeCloseTo(700, 0);
    }
  });

  it('picking every remaining game for a bubble team raises its odds; losing them all lowers them', () => {
    const base = runPlayoffMachine(teams, games, {}, 2000);
    const bubble = [...base.teams].sort((a, b) => Math.abs(a.playoffs - 50) - Math.abs(b.playoffs - 50))[0];
    const winAll: Picks = {};
    const loseAll: Picks = {};
    for (const g of remaining) {
      if (g.home !== bubble.abbrev && g.away !== bubble.abbrev) continue;
      winAll[gameKey(g)] = bubble.abbrev;
      loseAll[gameKey(g)] = g.home === bubble.abbrev ? g.away : g.home;
    }
    const up = runPlayoffMachine(teams, games, winAll, 2000).teams.find((t) => t.abbrev === bubble.abbrev)!;
    const down = runPlayoffMachine(teams, games, loseAll, 2000).teams.find((t) => t.abbrev === bubble.abbrev)!;
    expect(up.playoffs).toBeGreaterThan(bubble.playoffs + 15);
    expect(down.playoffs).toBeLessThan(bubble.playoffs - 15);
    const rec = recordWithPicks(bubble.abbrev, games, winAll);
    expect(rec.picked).toBeGreaterThan(0);
    expect(up.projectedWins).toBeCloseTo(rec.w + rec.t * 0, 5);
  });

  it('round-trips picks through a share link and ignores junk tokens', () => {
    const picks: Picks = {};
    remaining.slice(0, 12).forEach((g, i) => { picks[gameKey(g)] = i % 2 ? g.home : g.away; });
    const encoded = encodePicks(games, picks);
    expect(decodePicks(games, encoded)).toEqual(picks);
    expect(decodePicks(games, `${encoded}.99XXX.garbage.1KC`)).toEqual(picks);
  });
});
