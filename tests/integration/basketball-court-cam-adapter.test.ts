/**
 * Court Cam adapter: every possession of a real play log converts to a sim
 * message with valid slots (the five on the floor), the right actors, and the
 * running score; dumps one game's messages for the headless sim contract run.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { hasPlayLog } from '@/../apps/bs-basketball/src/lib/live/fromPlayLog';
import { eventsFromPlayLog } from '@/../apps/bs-basketball/src/lib/live/fromPlayLog';
import { toSimPossession, toSimTeam, toSimPlayers, lineupsAt } from '@/../apps/bs-basketball/src/lib/live/liveSim3d';
import type { BasketballPlayer, BasketballTeam, PlayLog } from '@bs/sport-basketball';

describe('court cam adapter', () => {
  let league = createNewBasketballLeague({ rngSeed: 'court-cam' });
  league = { ...league, userTeamId: league.teams[0].id };
  for (let i = 0; i < 3; i++) { const r = simNextDay(league); if (!r) break; league = r.league; }
  const players = league.players as Record<string, BasketballPlayer>;
  const game = league.games.find(g => g.status === 'played' && hasPlayLog(g.sportData) && (g.homeTeamId === league.userTeamId || g.awayTeamId === league.userTeamId))!;
  const log = (game.sportData as { playLog: PlayLog }).playLog;
  const home = league.teams.find(t => t.id === game.homeTeamId) as BasketballTeam, away = league.teams.find(t => t.id === game.awayTeamId) as BasketballTeam;

  it('converts every possession with valid slots and a consistent score', () => {
    let n = 0, lastScore = { h: 0, a: 0 };
    log.entries.forEach((e, idx) => {
      const p = toSimPossession(log, idx, players);
      if (e.k !== 'p') { expect(p).toBeNull(); return; }
      if (!p) { expect(e.e.length).toBe(0); return; }   // a bare foul line with no FTs is the only possession with nothing to picture
      n++;
      expect(p.lineups.home.length).toBe(5); expect(p.lineups.away.length).toBe(5);
      for (const k of ['shooter', 'assister', 'blk', 'orb', 'drb', 'to', 'stl', 'fouler', 'ftShooter'] as const) { const v = p[k]; if (v != null) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(5); } }
      if (p.to != null) expect(p.shooter).toBeNull(); else if (!p.bonusFt) { expect(p.shooter).not.toBeNull(); expect(['three', 'midrange', 'at_rim', 'post']).toContain(p.st); expect(p.zone).toBeTruthy(); }
      if (p.made) expect(p.pts).toBeGreaterThanOrEqual(2);
      if (p.fouled || p.bonusFt) { expect(p.fta).toBeGreaterThan(0); expect(p.ftMakes!.length).toBe(p.fta); expect(p.ftMakes!.filter(Boolean).length).toBe(p.ftm); }
      expect(p.h).toBeGreaterThanOrEqual(lastScore.h); expect(p.a).toBeGreaterThanOrEqual(lastScore.a); lastScore = { h: p.h, a: p.a };
      expect(p.clockStart).toBeGreaterThanOrEqual(p.clockEnd);
      // the shooter really is on the floor for the offense
      if (p.shooter != null) { const five = p.lineups[p.off === 0 ? 'home' : 'away']; const fga = e.e.find(x => x[1] === 'fga'); expect(five[p.shooter].id).toBe(log.ids[fga![0]]); }
      if (p.stl != null) { const five = p.lineups[p.off === 0 ? 'away' : 'home']; const stl = e.e.find(x => x[1] === 'stl'); expect(five[p.stl].id).toBe(log.ids[stl![0]]); }
    });
    expect(n).toBeGreaterThan(150);
    expect(lastScore).toEqual({ h: game.finalScore!.home, a: game.finalScore!.away });
  });

  it('events carry the possession index the viewer keys the sim on', () => {
    const events = eventsFromPlayLog(log, players, home.abbreviation, away.abbreviation);
    const withIdx = events.filter(e => e.possIdx != null);
    expect(withIdx.length).toBeGreaterThan(150);
    const firsts = events.filter((e, i) => e.possIdx != null && e.possIdx !== events[i - 1]?.possIdx);
    const possCount = log.entries.filter(e => e.k === 'p' && e.e.length > 0).length;
    expect(firsts.length).toBe(possCount);
  });

  it('writes the sim contract fixture', () => {
    const five = lineupsAt(log, 0);
    const msgs = log.entries.map((_, idx) => toSimPossession(log, idx, players)).filter(Boolean);
    const fixture = { home: toSimTeam(home, 'home', away, toSimPlayers(five.home, players)), away: toSimTeam(away, 'away', home, toSimPlayers(five.away, players)), possessions: msgs };
    writeFileSync('/tmp/court-cam-fixture.json', JSON.stringify(fixture));
    expect(fixture.home.players.length).toBe(5);
  });
});
