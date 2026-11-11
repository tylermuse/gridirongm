/**
 * The play-by-play line says who made the play on defense: the tackler on a run or a completion, the man who broke up
 * an incompletion, the rusher on a sack. Whoever the line names is the one the box score credits, in both engines
 * (Tyler 11/10: "indicate who made the tackle and same with pass breakups").
 */

import { describe, it, expect } from 'vitest';
import { simulatePlayByPlay, livePlayerStatsAtEvent, type PlayEvent } from '@/lib/engine/playByPlay';
import { createLiveCoachEngine } from '@/lib/engine/liveCoachEngine';
import { generateRoster } from '@/lib/engine/playerGen';
import { whoMadeThePlay } from '@/lib/engine/liveSim3d';
import { extractPlayers } from '@/lib/engine/gameRead';
import type { Player, Team } from '@/types';

const team = (id: string) => ({ id, abbreviation: id.toUpperCase(), city: id, name: id, depthChart: {} }) as unknown as Team;
const DEF = ['DL', 'LB', 'CB', 'S'];
const tagFull = (p: Player) => `${p.firstName[0]}. ${p.lastName} ${p.position}`;
const tagShort = (p: Player) => `${p.firstName[0]}. ${p.lastName}`;
const sum = (stats: Record<string, Partial<Record<string, number>>>, ids: Set<string>, field: string) =>
  Object.entries(stats).reduce((s, [id, p]) => s + (ids.has(id) ? p[field] ?? 0 : 0), 0);

/** Rosters whose "F. Lastname" tags are unique across both teams, so a name in a line points at one man. */
function rosters(): { home: Player[]; away: Player[] } {
  const home = generateRoster('h', 74), away = generateRoster('a', 74);
  // a letters-only suffix: the feed's name parser reads a last name as letters
  const letters = (i: number) => String.fromCharCode(97 + Math.floor(i / 26) % 26) + String.fromCharCode(97 + i % 26);
  [...home, ...away].forEach((p, i) => { p.lastName = `${p.lastName.replace(/[^A-Za-z]/g, '')}q${letters(i)}`; });
  return { home, away };
}

describe('watch-live engine names the defender who made the play', () => {
  it('every run and completion short of the end zone names a tackler, and the box score credits exactly him', () => {
    for (let g = 0; g < 8; g++) {
      const { home, away } = rosters();
      const r = simulatePlayByPlay(team('h'), team('a'), home, away);
      const stats = r.playerStats as Record<string, Partial<Record<string, number>>>;
      for (const [side, offense, defense] of [['home', home, away], ['away', away, home]] as const) {
        const defenders = defense.filter(p => DEF.includes(p.position));
        const named: Record<string, number> = {};
        const brokeUp: Record<string, number> = {};
        for (const e of r.events) {
          if (e.possession !== side) continue;
          const isCarry = e.type === 'run' && !/spikes the ball|FAKE PUNT|takes a knee|kneel/i.test(e.description);
          if (isCarry || e.type === 'pass_complete') {
            if (/FAKE PUNT/.test(e.description)) continue;
            expect(e.defNote, e.description).toBeTruthy();
            expect(e.description).toContain(e.defNote!);
            const who = defenders.filter(p => e.defNote!.includes(tagFull(p)));
            expect(who, e.description).toHaveLength(1);
            named[who[0].id] = (named[who[0].id] ?? 0) + 1;
            // the ball carrier is still the first man named: the booth and the game read take him from there
            const first = extractPlayers(e.description)[0];
            expect(offense.some(p => p.lastName === first.last), e.description).toBe(true);
          }
          if (e.type === 'pass_incomplete' && e.defNote) {
            const who = defenders.filter(p => e.defNote!.includes(tagFull(p)));
            expect(who, e.description).toHaveLength(1);
            brokeUp[who[0].id] = (brokeUp[who[0].id] ?? 0) + 1;
          }
        }
        expect(Object.keys(named).length).toBeGreaterThan(3);
        for (const p of defenders) {
          expect(stats[p.id]?.tackles ?? 0, `${tagFull(p)} tackles`).toBe(named[p.id] ?? 0);
          expect(stats[p.id]?.passDeflections ?? 0, `${tagFull(p)} breakups`).toBe(brokeUp[p.id] ?? 0);
        }
      }
    }
  });

  it('breaks up a realistic share of incompletions, and the running box score counts tackles as they happen', () => {
    let inc = 0, credited = 0, batted = 0;
    let last: { events: PlayEvent[]; home: Player[]; away: Player[] } | null = null;
    for (let g = 0; g < 30; g++) {
      const { home, away } = rosters();
      const r = simulatePlayByPlay(team('h'), team('a'), home, away);
      for (const e of r.events) {
        if (e.type !== 'pass_incomplete' || /FAKE PUNT/.test(e.description)) continue;
        inc++;
        if (e.defNote) credited++;
        if (/batted down at the line/.test(e.description)) batted++;
      }
      last = { events: r.events, home, away };
    }
    expect(credited / inc).toBeGreaterThan(0.3);
    expect(credited / inc).toBeLessThan(0.52);
    expect(batted / inc).toBeGreaterThan(0.03);
    expect(batted / inc).toBeLessThan(0.12);

    // midway through the game the live panel already shows the tackles made so far
    const mid = last!.events[Math.floor(last!.events.length / 2)];
    const running = livePlayerStatsAtEvent(mid, last!.home, last!.away) as Record<string, Partial<Record<string, number>>>;
    const everyone = new Set([...last!.home, ...last!.away].map(p => p.id));
    const soFar = last!.events.filter(e => e.id <= mid.id && (e.type === 'run' || e.type === 'pass_complete') && e.defNote).length;
    expect(soFar).toBeGreaterThan(10);
    expect(sum(running, everyone, 'tackles')).toBe(soFar);
  });
});

describe('live-coach engine names the defender who made the play', () => {
  it('tackles, breakups and sacks name a defender, and the box score credits him', () => {
    let breakups = 0, incompletions = 0, sacks = 0;
    for (let g = 0; g < 12; g++) {
      const { home, away } = rosters();
      const eng = createLiveCoachEngine(team('h'), team('a'), home, away, {
        quarter: 1, timeSecs: 900, possession: 'home', fieldPos: 25, down: 1, yardsToGo: 10, homeScore: 0, awayScore: 0,
        isGameOver: false, twoMinWarningQ2Fired: false, twoMinWarningQ4Fired: false, overtime: false,
        awaitingXpChoice: false, awaitingKickoffChoice: false, homeTimeouts: 3, awayTimeouts: 3,
      }, 'home');
      const events: PlayEvent[] = [];
      let safety = 0;
      while (!eng.isFinished() && safety++ < 4000) events.push(...eng.runOnePlay());
      const stats = eng.getPlayerStats() as Record<string, Partial<Record<string, number>>>;
      const named: Record<string, number> = {};
      const brokeUp: Record<string, number> = {};
      for (const e of events) {
        const defense = (e.possession === 'home' ? away : home).filter(p => DEF.includes(p.position));
        const scored = e.isScoring || /TOUCHDOWN/.test(e.description);
        if ((e.type === 'run' && /runs for|breaks free|stuffed|loses \d/.test(e.description) && !scored) || (e.type === 'pass_complete' && !scored)) {
          expect(e.defNote, e.description).toBeTruthy();
          const who = defense.filter(p => e.defNote!.includes(tagShort(p)));
          expect(who, e.description).toHaveLength(1);
          named[who[0].id] = (named[who[0].id] ?? 0) + 1;
        }
        if (e.type === 'pass_incomplete') {
          incompletions++;
          if (e.defNote) {
            breakups++;
            const who = defense.filter(p => e.defNote!.includes(tagShort(p)));
            expect(who, e.description).toHaveLength(1);
            brokeUp[who[0].id] = (brokeUp[who[0].id] ?? 0) + 1;
          }
        }
        if (e.type === 'sack') {
          sacks++;
          expect(e.description).toMatch(/is sacked by [A-Z]\. /);
          // the quarterback is still named first, the rusher second
          const offense = e.possession === 'home' ? home : away;
          const names = extractPlayers(e.description);
          expect(offense.find(p => p.lastName === names[0].last)?.position).toBe('QB');
          expect(defense.some(p => p.lastName === names[1].last)).toBe(true);
        }
      }
      for (const p of [...home, ...away].filter(x => DEF.includes(x.position))) {
        expect(stats[p.id]?.tackles ?? 0, `${tagShort(p)} tackles`).toBe(named[p.id] ?? 0);
        expect(stats[p.id]?.passDeflections ?? 0, `${tagShort(p)} breakups`).toBe(brokeUp[p.id] ?? 0);
      }
    }
    expect(sacks).toBeGreaterThan(0);
    expect(breakups / incompletions).toBeGreaterThan(0.18);
    expect(breakups / incompletions).toBeLessThan(0.45);
  });
});

describe('the 3D sim still gives the ball to the right man', () => {
  const man = (firstName: string, lastName: string, position: string, jerseyNumber: number) =>
    ({ firstName, lastName, position, jerseyNumber, id: `${lastName}${jerseyNumber}` }) as unknown as Parameters<typeof whoMadeThePlay>[1][number];
  const offense = [man('Jaxson', 'Dart', 'QB', 6), man('Malik', 'Nabers', 'WR', 1), man('Tyrone', 'Tracy', 'RB', 29), man('Trevon', 'Diggs', 'WR', 80)];
  const defense = [man('Trevon', 'Diggs', 'CB', 7), man('Micah', 'Parsons', 'DL', 11)];
  const ev = (type: string, base: string, defNote: string) =>
    ({ type, description: base + defNote, defNote }) as unknown as PlayEvent;

  it('a tackler who shares a name with an offensive player is not taken for the ball carrier', () => {
    expect(whoMadeThePlay(ev('pass_complete', 'J. Dart completes to M. Nabers for 8 yards.', ' Tackled by T. Diggs.'), offense, defense)?.ball?.n).toBe(1);
    expect(whoMadeThePlay(ev('run', 'T. Tracy runs for 4 yards.', ' T. Diggs makes the tackle.'), offense, defense)?.ball?.n).toBe(29);
    expect(whoMadeThePlay(ev('pass_incomplete', "J. Dart's pass to M. Nabers", ' is broken up by T. Diggs.'), offense, defense)?.ball?.n).toBe(1);
  });

  it('the sacker named in a live-coach sack line is the defender', () => {
    const sack = { type: 'sack', description: 'J. Dart is sacked by M. Parsons for a loss of 5.' } as unknown as PlayEvent;
    expect(whoMadeThePlay(sack, offense, defense)?.def?.n).toBe(11);
  });
});
