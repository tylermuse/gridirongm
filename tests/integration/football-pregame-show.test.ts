/**
 * Pregame Show — Marcus + Tony preview a matchup before kickoff.
 * Free tier = templated show; Premium = LLM via /api/pregame, with
 * parseAiPregame guarding the untrusted response. These guard that:
 *  - the fact sheet picks starters/injuries correctly and handles week 1,
 *  - the templated show is deterministic per game and only cites real players,
 *  - AI output is validated (bad speakers dropped, invalid picks replaced).
 */
import { describe, it, expect } from 'vitest';
import { buildPregameFacts, generateTemplatedPregame, parseAiPregame } from '@/lib/engine/pregameShow';
import type { Player, Position, Team } from '@/types';

function makeTeam(id: string, city: string, w: number, l: number, pf: number, pa: number, streak = 0): Team {
  return {
    id, city, name: `${city}s`, abbreviation: id,
    record: { wins: w, losses: l, ties: 0, pointsFor: pf, pointsAgainst: pa, streak },
    depthChart: {},
  } as unknown as Team;
}

let n = 0;
function makePlayer(teamId: string, position: Position, ovr: number, stats: Record<string, number> = {}, injured = false): Player {
  n++;
  return {
    id: `p${n}`, firstName: 'Pl', lastName: `${teamId}${position}${n}`, position, teamId,
    ratings: { overall: ovr },
    injury: injured ? { type: 'Knee', weeksLeft: 2 } : null,
    stats: {
      passAttempts: 0, passYards: 0, passTDs: 0, interceptions: 0, rushAttempts: 0, rushYards: 0, rushTDs: 0,
      receptions: 0, receivingYards: 0, receivingTDs: 0, tackles: 0, sacks: 0, defensiveINTs: 0, ...stats,
    },
  } as unknown as Player;
}

function league(gamesPlayed: boolean) {
  const home = makeTeam('HOM', 'Homeville', gamesPlayed ? 5 : 0, gamesPlayed ? 1 : 0, gamesPlayed ? 170 : 0, gamesPlayed ? 90 : 0, gamesPlayed ? 4 : 0);
  const away = makeTeam('AWY', 'Awaytown', gamesPlayed ? 2 : 0, gamesPlayed ? 4 : 0, gamesPlayed ? 100 : 0, gamesPlayed ? 160 : 0);
  const s = (x: Record<string, number>) => (gamesPlayed ? x : {});
  const homePlayers = [
    makePlayer('HOM', 'QB', 88, s({ passAttempts: 200, passYards: 1600, passTDs: 12, interceptions: 3 })),
    makePlayer('HOM', 'QB', 90, {}, true), // injured star QB — must not start, must be on report
    makePlayer('HOM', 'WR', 84, s({ receptions: 40, receivingYards: 600, receivingTDs: 5 })),
    makePlayer('HOM', 'LB', 80, s({ tackles: 50, sacks: 3 })),
  ];
  const awayPlayers = [
    makePlayer('AWY', 'QB', 74, s({ passAttempts: 190, passYards: 1200, passTDs: 6, interceptions: 8 })),
    makePlayer('AWY', 'RB', 78, s({ rushAttempts: 90, rushYards: 450, rushTDs: 3 })),
    makePlayer('AWY', 'CB', 76, s({ tackles: 20, defensiveINTs: 2 })),
  ];
  const teams = [home, away, makeTeam('OTH', 'Other', gamesPlayed ? 3 : 0, gamesPlayed ? 3 : 0, gamesPlayed ? 120 : 0, gamesPlayed ? 120 : 0)];
  return buildPregameFacts({
    gameId: 'g-1', season: 2026, week: gamesPlayed ? 7 : 1, isPlayoff: false,
    homeTeam: home, awayTeam: away, homePlayers, awayPlayers, teams,
    players: [...homePlayers, ...awayPlayers],
  });
}

describe('buildPregameFacts', () => {
  const f = league(true);
  it('starts the healthy QB and lists the injured one', () => {
    expect(f.home.qb?.ovr).toBe(88);
    expect(f.home.injuries).toHaveLength(1);
    expect(f.home.injuries[0]).toMatch(/\(QB\)$/);
  });
  it('computes records, ranks and a home-favoring edge', () => {
    expect(f.home.record).toBe('5-1');
    expect(f.home.ranks?.ppg).toBe(1);
    expect(f.away.ranks?.ptsAllowed).toBe(3);
    expect(f.homeEdge).toBeGreaterThan(0);
  });
  it('has null ranks and null stat lines before any games', () => {
    const f0 = league(false);
    expect(f0.home.ranks).toBeNull();
    expect(f0.home.qb?.statLine).toBeNull();
  });
});

describe('generateTemplatedPregame', () => {
  it('is deterministic per game and produces a real back-and-forth', () => {
    const f = league(true);
    const a = generateTemplatedPregame(f);
    const b = generateTemplatedPregame(f);
    expect(a).toEqual(b);
    expect(a.source).toBe('template');
    expect(a.exchanges.length).toBeGreaterThanOrEqual(6);
    expect(new Set(a.exchanges.map(e => e.speakerId))).toEqual(new Set(['stats', 'hottake']));
    expect(['HOM', 'AWY']).toContain(a.picks.stats.abbr);
    expect(a.picks.stats.abbr).toBe('HOM'); // Marcus goes with the favorite
  });
  it('mentions the actual starting QBs and works in week 1', () => {
    const f = league(true);
    const text = generateTemplatedPregame(f).exchanges.map(e => e.text).join(' ');
    expect(text).toContain(f.home.qb!.name);
    expect(text).toContain(f.away.qb!.name);
    const wk1 = generateTemplatedPregame(league(false));
    expect(wk1.exchanges.map(e => e.text).join(' ')).not.toMatch(/undefined|NaN/);
  });
});

describe('parseAiPregame', () => {
  const f = league(true);
  it('rejects unusable payloads', () => {
    expect(parseAiPregame(null, f)).toBeNull();
    expect(parseAiPregame({ exchanges: [{ speakerId: 'stats', text: 'hi' }] }, f)).toBeNull();
  });
  it('drops unknown speakers and replaces invalid picks', () => {
    const show = parseAiPregame({
      headline: 'Big one',
      exchanges: [
        { speakerId: 'stats', text: 'a' }, { speakerId: 'hottake', text: 'b' },
        { speakerId: 'narrator', text: 'x' }, { speakerId: 'stats', text: 'c' }, { speakerId: 'hottake', text: 'd' },
      ],
      picks: { stats: { abbr: 'HOM', score: 'HOM 27, AWY 17' }, hottake: { abbr: 'NOPE', score: '1-0' } },
    }, f)!;
    expect(show.source).toBe('ai');
    expect(show.exchanges).toHaveLength(4);
    expect(show.picks.stats).toEqual({ abbr: 'HOM', score: 'HOM 27, AWY 17' });
    expect(['HOM', 'AWY']).toContain(show.picks.hottake.abbr);
  });
});
