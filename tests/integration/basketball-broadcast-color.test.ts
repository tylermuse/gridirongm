/**
 * Tony's read on the game: real simulated games plus a built one-sided game.
 * The point of the color is that it's specific, so what's checked is that the
 * numbers he says are true at that moment, that he only knows what's happened
 * so far, and that the things he's meant to notice actually get noticed.
 */
import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { eventsFromPlayLog, hasPlayLog } from '@/../apps/bs-basketball/src/lib/live/fromPlayLog';
import { computeEventBeats } from '@/../apps/bs-basketball/src/lib/live/beats';
import { computeMoments } from '@/../apps/bs-basketball/src/lib/live/moments';
import type { LiveEvent } from '@/../apps/bs-basketball/src/lib/live/playByPlay';
import { broadcastClipLines } from '@/../apps/bs-basketball/src/lib/broadcast/gameBroadcast';
import { applyEvent, newGameState } from '@/../apps/bs-basketball/src/lib/broadcast/gameRead';
import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type GameResult = BaseGameResult<BasketballStats>;

let league = createNewBasketballLeague({ rngSeed: 'broadcast-color' });
league = { ...league, userTeamId: league.teams[0].id };
for (let i = 0; i < 6; i++) { const r = simNextDay(league); if (!r) break; league = r.league; }
const players = league.players as Record<string, BasketballPlayer>;
const teams = league.teams as BasketballTeam[];
const games = (league.games as GameResult[]).filter(g => hasPlayLog(g.sportData));

function setup(game: GameResult) {
  const home = teams.find(t => t.id === game.homeTeamId)!;
  const away = teams.find(t => t.id === game.awayTeamId)!;
  const events = eventsFromPlayLog((game.sportData as { playLog: never }).playLog, players, home.abbreviation, away.abbreviation);
  const beats = computeEventBeats(events, home.abbreviation, away.abbreviation);
  const moments = computeMoments(events, beats, home.abbreviation, away.abbreviation);
  const ctx = { homeAbbr: home.abbreviation, awayAbbr: away.abbreviation, homeName: home.city, awayName: away.city };
  const say = (i: number, from = 0) => broadcastClipLines(events, beats, moments, i, from, ctx);
  return { home, away, events, beats, moments, ctx, say };
}

const tonyLines = (g: ReturnType<typeof setup>) =>
  g.events.flatMap((_, i) => g.say(i).filter(l => l.speaker === 'tony').map(l => ({ i, text: l.text })));

describe('Hoops running numbers', () => {
  it('match the final score and the box score', () => {
    expect(games.length).toBeGreaterThan(3);
    for (const game of games.slice(0, 5)) {
      const { events } = setup(game);
      const state = newGameState();
      events.forEach(e => applyEvent(state, e));
      const last = events[events.length - 1];
      expect(state.team.home.pts).toBe(last.home);
      expect(state.team.away.pts).toBe(last.away);
      for (const p of state.players.values()) {
        const box = game.boxScores[p.id as keyof typeof game.boxScores] as Partial<BasketballStats> | undefined;
        if (!box) continue;
        expect(p.pts).toBe(box.points ?? 0);
        expect(p.fga).toBe(box.fieldGoalsAttempted ?? 0);
        expect(p.tpa).toBe(box.threePointsAttempted ?? 0);
        expect(p.stl).toBe(box.steals ?? 0);
        expect(p.blk).toBe(box.blocks ?? 0);
        expect(p.to).toBe(box.turnovers ?? 0);
      }
    }
  });
});

describe("Tony's read", () => {
  const all = games.slice(0, 5).map(setup);

  it('talks about the game, with real numbers, in every game', () => {
    for (const g of all) {
      const withNumbers = tonyLines(g).filter(l => /\d/.test(l.text));
      expect(withNumbers.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('says true numbers: every "X has N on M of A" matches the game at that moment', () => {
    let checked = 0;
    for (const g of all) {
      for (const { i, text } of tonyLines(g)) {
        const m = /(\S+) has (\d+) on (\d+) of (\d+) shooting/.exec(text);
        if (!m) continue;
        const state = newGameState();
        g.events.slice(0, i + 1).forEach(e => applyEvent(state, e));
        // Last names can repeat across a league, so any match with that line will do.
        const match = [...state.players.values()].some(x => x.name === m[1] && x.pts === +m[2] && x.fgm === +m[3] && x.fga === +m[4]);
        expect(match, text).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('only knows what has happened so far', () => {
    const g = all[0];
    const cut = Math.floor(g.events.length / 2);
    const events = g.events.slice(0, cut);
    const beats = computeEventBeats(events, g.ctx.homeAbbr, g.ctx.awayAbbr);
    const moments = computeMoments(events, beats, g.ctx.homeAbbr, g.ctx.awayAbbr);
    for (let i = 0; i < cut; i++) {
      expect(broadcastClipLines(events, beats, moments, i, 0, g.ctx)).toEqual(g.say(i));
    }
  });

  it('says the same thing however the listener joined, so the audio cache still hits', () => {
    const g = all[0];
    const from = 100;
    for (let i = from + 1; i < g.events.length; i += 3) expect(g.say(i, from)).toEqual(g.say(i, 0));
  });

  it('does not repeat itself back to back or call a run on every bucket', () => {
    for (const g of all) {
      const lines = tonyLines(g).map(l => l.text);
      for (let i = 1; i < lines.length; i++) expect(lines[i]).not.toBe(lines[i - 1]);
      const runs = lines.filter(l => /-0 run!/.test(l));
      expect(runs.length).toBeLessThanOrEqual(10);
    }
  });

  it('is not all shouting: at least a third of what he says has a number in it', () => {
    for (const g of all) {
      const lines = tonyLines(g);
      expect(lines.filter(l => /\d/.test(l.text)).length / lines.length).toBeGreaterThan(0.33);
    }
  });
});

// ── A built game: Boston can't miss, and Miami can't do anything about it ──────

function blowout(): LiveEvent[] {
  const out: LiveEvent[] = [];
  let home = 0, away = 0;
  let clock = 720;
  const tick = () => { clock -= 9; return `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`; };
  const stat = (id: string, ...codes: string[]) => codes.map(c => [id, c, 1] as [string, string, number]);
  for (let n = 0; n < 38; n++) {
    // Boston: Tatum and White make nearly everything.
    const shooter = n % 2 === 0 ? 'tatum' : 'white';
    const label = n % 2 === 0 ? 'J. Tatum' : 'D. White';
    if (n % 6 === 5) {
      out.push({ quarter: 1, clock: tick(), side: 'home', kind: 'miss', scoring: false, points: 0, home, away, playerId: shooter, text: `${label} misses the jumper`, stats: stat(shooter, 'fga') });
    } else {
      home += 2;
      out.push({ quarter: 1, clock: tick(), side: 'home', kind: 'make2', scoring: true, points: 2, home, away, playerId: shooter, text: `${label} hits the jumper`, stats: [...stat(shooter, 'fga', 'fgm'), [shooter, 'pts', 2]] });
    }
    // Miami: bricks, with the odd make.
    if (n % 5 === 0) {
      away += 2;
      out.push({ quarter: 1, clock: tick(), side: 'away', kind: 'make2', scoring: true, points: 2, home, away, playerId: 'herro', text: 'T. Herro hits the jumper', stats: [...stat('herro', 'fga', 'fgm'), ['herro', 'pts', 2]] });
    } else {
      out.push({ quarter: 1, clock: tick(), side: 'away', kind: 'miss', scoring: false, points: 0, home, away, playerId: 'herro', text: 'T. Herro misses the jumper', stats: stat('herro', 'fga') });
    }
  }
  return out;
}

describe('in a one-sided game', () => {
  const events = blowout();
  const ctx = { homeAbbr: 'BOS', awayAbbr: 'MIA', homeName: 'Boston', awayName: 'Miami' };
  const beats = computeEventBeats(events, 'BOS', 'MIA');
  const moments = computeMoments(events, beats, 'BOS', 'MIA');
  const said = events.flatMap((_, i) => broadcastClipLines(events, beats, moments, i, 0, ctx))
    .filter(l => l.speaker === 'tony').map(l => l.text).join(' ');

  it('says who to get the ball to', () => {
    expect(said).toMatch(/(Tatum|White)/);
    expect(said).toMatch(/run everything through him|Give (Tatum|White) the ball|every touch|second guy/);
  });
  it('says the team is on fire', () => {
    expect(said).toMatch(/on (fire|FIRE)|hula hoop|knocking them down/);
  });
  it('says what the team getting beat has to do, including steals and blocks', () => {
    expect(said).toMatch(/no steals and no blocks/);
    expect(said).toMatch(/Miami/);
  });
});
