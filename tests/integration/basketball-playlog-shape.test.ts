/**
 * Possession shape for the live 3D sim (court-cam): every possession in the
 * play log carries a play type, every shot a zone, and dunks are flagged on a
 * sane share of rim finishes. The shape is hashed, not drawn from the game RNG,
 * so the same seed still produces the same box score — guarded here by a
 * fixed-seed fingerprint of the engine's output.
 */
import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simBasketballGame, type BasketballPlayer, type BasketballGameSide, type PlayLogEntry } from '@bs/sport-basketball';
import { buildDefaultBasketballLineup } from '@/../apps/bs-basketball/src/lib/lineup/lineup';

const ZONES: Record<string, string[]> = {
  three: ['lc', 'lw', 'top', 'rw', 'rc'], midrange: ['lb', 'le', 'ft', 're', 'rb'], at_rim: ['l', 'c', 'r'], post: ['l', 'r'],
};
const PLAY_TYPES = ['pnr', 'iso', 'spot', 'drive', 'post', 'cut', 'trans', 'putback'];

describe('play log possession shape', () => {
  const league = createNewBasketballLeague({ rngSeed: 'shape' });
  const side = (i: number): BasketballGameSide => {
    const t = league.teams[i];
    const players = t.playerIds.map(id => league.players[id] as BasketballPlayer);
    return { teamId: t.id, players, lineup: buildDefaultBasketballLineup(players) };
  };
  const games = Array.from({ length: 12 }, (_, i) => simBasketballGame(side(i), side(i + 12), {
    gameId: `g${i}` as never, season: 2026, date: '2026-11-01', competitionId: 'c' as never, isPlayoff: false, rngSeed: `shape-${i}`,
  }));
  const poss = games.flatMap(g => (g.sportData as { playLog: { entries: PlayLogEntry[] } }).playLog.entries.filter(e => e.k === 'p')) as Extract<PlayLogEntry, { k: 'p' }>[];

  it('gives every possession a play type and every shot a zone', () => {
    expect(poss.length).toBeGreaterThan(2000);
    for (const p of poss) {
      expect(PLAY_TYPES).toContain(p.pt);
      if (p.st) expect(ZONES[p.st]).toContain(p.z);
      else expect(p.z).toBeUndefined();
      if (p.d) expect(p.st === 'at_rim' && p.e.some(e => e[1] === 'fgm')).toBe(true);
    }
  });

  it('uses the whole vocabulary in basketball-like proportions', () => {
    const count = (f: (p: Extract<PlayLogEntry, { k: 'p' }>) => boolean) => poss.filter(f).length;
    const shots = count(p => !!p.st);
    expect(count(p => p.pt === 'pnr') / poss.length).toBeGreaterThan(0.2);
    expect(count(p => p.pt === 'trans') / poss.length).toBeGreaterThan(0.04);
    expect(count(p => p.pt === 'putback') / poss.length).toBeGreaterThan(0.02);
    expect(count(p => p.pt === 'cut') / poss.length).toBeGreaterThan(0.015);
    const threes = count(p => p.st === 'three');
    expect(count(p => p.st === 'three' && (p.z === 'lc' || p.z === 'rc')) / threes).toBeGreaterThan(0.12);
    const rimMakes = count(p => p.st === 'at_rim' && p.e.some(e => e[1] === 'fgm'));
    const dunkShare = count(p => !!p.d) / rimMakes;
    expect(dunkShare).toBeGreaterThan(0.15);
    expect(dunkShare).toBeLessThan(0.5);
    expect(shots / poss.length).toBeGreaterThan(0.7);
  });

  it('is a pure function of the seed (replays identically)', () => {
    const again = simBasketballGame(side(0), side(12), {
      gameId: 'g0' as never, season: 2026, date: '2026-11-01', competitionId: 'c' as never, isPlayoff: false, rngSeed: 'shape-0',
    });
    expect(JSON.stringify((again.sportData as { playLog: unknown }).playLog)).toBe(JSON.stringify((games[0].sportData as { playLog: unknown }).playLog));
    expect(again.finalScore).toEqual(games[0].finalScore);
  });
});
