/**
 * Broadcast audio (pregame / halftime / live game) — the BS Football parity
 * port. Covers the pure script builders the client sends to the audio routes:
 * the live call is deterministic (cache hits on re-watch), calls a sane
 * number of events, names cities not abbreviations, and breaks at the half;
 * the pregame fact sheet never leaks tonight's result; the halftime notes are
 * a valid route payload.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { eventsFromPlayLog, hasPlayLog } from '@/../apps/bs-basketball/src/lib/live/fromPlayLog';
import { computeEventBeats } from '@/../apps/bs-basketball/src/lib/live/beats';
import { computeMoments } from '@/../apps/bs-basketball/src/lib/live/moments';
import { broadcastClipLines, countCalls, isCalled, speakable } from '@/../apps/bs-basketball/src/lib/broadcast/gameBroadcast';
import { buildPregameFacts, generateTemplatedPregame, parseAiPregame, pregameAudioLines, priorScoringAverages } from '@/../apps/bs-basketball/src/lib/broadcast/pregameShow';
import { generateHalftimeNotes, type HalfLine } from '@/../apps/bs-basketball/src/lib/broadcast/halftimeNotes';
import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type GameResult = BaseGameResult<BasketballStats>;

function seasonDays(days: number) {
  let league = createNewBasketballLeague({ rngSeed: 'broadcast-audio' });
  league = { ...league, userTeamId: league.teams[0].id };
  for (let i = 0; i < days; i++) { const r = simNextDay(league); if (!r) break; league = r.league; }
  return league;
}

describe('broadcast audio', () => {
  const league = seasonDays(20);
  const players = league.players as Record<string, BasketballPlayer>;
  const teams = league.teams as BasketballTeam[];
  const games = league.games as GameResult[];
  const game = games.filter(g => hasPlayLog(g.sportData)).at(-1)!;
  const home = teams.find(t => t.id === game.homeTeamId)!;
  const away = teams.find(t => t.id === game.awayTeamId)!;
  const events = eventsFromPlayLog((game.sportData as { playLog: never }).playLog, players, home.abbreviation, away.abbreviation);
  const beats = computeEventBeats(events, home.abbreviation, away.abbreviation);
  const moments = computeMoments(events, beats, home.abbreviation, away.abbreviation);
  const ctx = { homeAbbr: home.abbreviation, awayAbbr: away.abbreviation, homeName: home.city, awayName: away.city };

  describe('live game call', () => {
    it('is deterministic, so a re-watch hits the audio cache', () => {
      for (let i = 0; i < events.length; i += 7) {
        expect(broadcastClipLines(events, beats, moments, i, 0, ctx)).toEqual(broadcastClipLines(events, beats, moments, i, 0, ctx));
      }
    });

    it('calls the plays a broadcast would, not every feed event', () => {
      const calls = countCalls(events, beats, moments, 0, ctx);
      const makes = events.filter(e => e.kind === 'make2' || e.kind === 'make3').length;
      expect(calls).toBeGreaterThanOrEqual(makes);
      expect(calls).toBeLessThan(events.length * 0.6);
      // Subs and boards never get a clip.
      for (let i = 1; i < events.length; i++) {
        if (events[i].kind === 'sub' || events[i].kind === 'rebound') {
          expect(broadcastClipLines(events, beats, moments, i, 0, ctx)).toEqual([]);
        }
      }
    });

    it('opens the show on the first clip and fits the route limits', () => {
      const first = broadcastClipLines(events, beats, moments, 0, 0, ctx);
      expect(first[0].speaker).toBe('marcus');
      expect(first[0].text).toContain('Marcus Cole');
      for (let i = 0; i < events.length; i++) {
        const lines = broadcastClipLines(events, beats, moments, i, 0, ctx);
        expect(lines.length).toBeLessThanOrEqual(12);
        for (const l of lines) {
          expect(l.text.length).toBeLessThanOrEqual(400);
          expect(l.text).not.toMatch(new RegExp(`\\b(${home.abbreviation}|${away.abbreviation})\\b`));
          expect(l.text).not.toMatch(/\b[A-Z]\. [A-Z]/); // no "J. Tatum" initials
        }
      }
    });

    it('calls the half and the final with the score', () => {
      const ht = events.findIndex(e => e.kind === 'period' && e.quarter === 2);
      expect(ht).toBeGreaterThan(0);
      const htLines = broadcastClipLines(events, beats, moments, ht, 0, ctx);
      expect(htLines[0].text).toMatch(/That's the half/);
      expect(htLines[0].text).toContain(String(events[ht].home));
      const fin = broadcastClipLines(events, beats, moments, events.length - 1, 0, ctx);
      expect(fin[0].text).toMatch(/ballgame/);
      expect(fin[0].text).toContain(String(game.finalScore!.home));
    });

    it('joins mid-game with a catch-up open', () => {
      const from = Math.floor(events.length / 2);
      const lines = broadcastClipLines(events, beats, moments, from, from, ctx);
      expect(lines[0].text).toMatch(/joining you/);
      expect(isCalled(events[from], moments[from]) || lines.length >= 2).toBe(true);
    });

    it('speaks feed text naturally', () => {
      expect(speakable('J. Tatum drains a three (B. Smart assists)')).toBe('Tatum drains a three — Smart with the assist');
      expect(speakable('M. Smart picks off J. Brown — turnover')).toBe('Smart picks off Brown');
    });
  });

  describe('pregame show', () => {
    const facts = buildPregameFacts({ game, games, teams, players })!;

    it('builds facts from games before tonight only', () => {
      const day = (game.sportData as { dayOfSeason: number }).dayOfSeason;
      const before = games.filter(g => g.status === 'played' && (g.sportData as { dayOfSeason: number }).dayOfSeason < day
        && (g.homeTeamId === home.id || g.awayTeamId === home.id));
      expect(facts.home.gamesPlayed).toBe(before.length);
      expect(facts.home.wins + facts.home.losses).toBe(before.length);
      expect(facts.home.abbr).toBe(home.abbreviation);
      expect(facts.home.stars.length).toBeGreaterThan(0);
    });

    it('templated show is deterministic with valid picks', () => {
      const a = generateTemplatedPregame(facts);
      expect(a).toEqual(generateTemplatedPregame(facts));
      expect(a.exchanges.length).toBeGreaterThanOrEqual(6);
      expect(a.exchanges.length).toBeLessThanOrEqual(20);
      expect([home.abbreviation, away.abbreviation]).toContain(a.picks.stats.abbr);
      const audio = pregameAudioLines(a);
      expect(audio.every(l => l.speaker === 'marcus' || l.speaker === 'tony')).toBe(true);
    });

    it('validates an untrusted AI payload, falling back on bad picks', () => {
      expect(parseAiPregame({ exchanges: [] }, facts)).toBeNull();
      const show = parseAiPregame({
        headline: 'Big one',
        exchanges: Array.from({ length: 6 }, (_, i) => ({ speakerId: i % 2 ? 'hottake' : 'stats', text: `line ${i}` })),
        picks: { stats: { abbr: 'ZZZ', score: '1-0' }, hottake: { abbr: home.abbreviation, score: 'x' } },
      }, facts)!;
      expect(show.source).toBe('ai');
      expect([home.abbreviation, away.abbreviation]).toContain(show.picks.stats.abbr);
      expect(show.picks.hottake.abbr).toBe(home.abbreviation);
    });
  });

  describe('halftime notes', () => {
    it('produces a valid /api/halftime-audio payload from first-half lines', () => {
      const ht = events.findIndex(e => e.kind === 'period' && e.quarter === 2);
      const lines = new Map<string, HalfLine>();
      const codes: Record<string, keyof HalfLine> = { pts: 'pts', reb: 'reb', ast: 'ast', fgm: 'fgm', fga: 'fga', '3pm': 'tpm', '3pa': 'tpa', ftm: 'ftm', fta: 'fta', stl: 'stl', blk: 'blk', to: 'to', pf: 'pf' };
      for (const e of events.slice(0, ht + 1)) for (const [pid, code, d] of e.stats ?? []) {
        const k = codes[code]; if (!k) continue;
        const l = lines.get(pid) ?? { pts: 0, reb: 0, ast: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, stl: 0, blk: 0, to: 0, pf: 0 };
        l[k] += d; lines.set(pid, l);
      }
      const notes = generateHalftimeNotes({
        home, away, score: { home: events[ht].home, away: events[ht].away }, lines, players,
        seasonPpg: priorScoringAverages(game, games),
      });
      expect(notes.length).toBeGreaterThanOrEqual(6);
      expect(notes.length).toBeLessThanOrEqual(24);
      for (const n of notes) {
        expect(['marcus', 'tony']).toContain(n.speaker);
        expect(n.text.length).toBeLessThanOrEqual(600);
      }
      expect(notes.map(n => n.text).join(' ')).toContain(home.city);
    });
  });
});
