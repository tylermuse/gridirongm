/**
 * Imported NBA leagues start with their real upcoming draft (the bug: import
 * skipped the 2026 draft and jumped to free agency). convertBbgmLeague now keeps
 * the season's draft class + real pick ownership instead of discarding tid<=-2.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { convertBbgmLeague, type BbgmLeagueFile } from '@/../apps/bs-basketball/src/lib/data/leagueImport';
import { aiBasketballDraftPick } from '@bs/sport-basketball';
import type { TeamId } from '@bs/core/adapter';

const FILE = resolve(__dirname, '../../apps/bs-basketball/public/rosters/BBGM_NBA_Roster_2026_Updated.json');

describe('convertBbgmLeague — inaugural draft', () => {
  const file = JSON.parse(readFileSync(FILE, 'utf8')) as BbgmLeagueFile;
  const imported = convertBbgmLeague(file);

  it('imports the upcoming draft class (no longer discarded)', () => {
    expect(imported.draftProspectIds.length).toBeGreaterThan(40); // ~70 for 2026
    for (const id of imported.draftProspectIds) {
      const p = imported.players[id];
      expect(p).toBeTruthy();
      expect(p.rosterSlot).toBeNull();        // a prospect, not rostered
      expect(p.sportData.yearsInLeague).toBe(0); // rookie
    }
  });

  it('rates prospects raw (low current OVR) with the upside in potential, not as inflated veterans', () => {
    const pros = imported.draftProspectIds.map(id => imported.players[id]);
    // Prospects stay in draft range (the consensus #1 tops out ~73), never
    // calibrated into established-veteran territory (80+).
    expect(Math.max(...pros.map(p => p.ratings.overall))).toBeLessThanOrEqual(75);
    // Most carry real upside (a clear gap from current OVR to ceiling).
    const withUpside = pros.filter(p => p.development.potential >= p.ratings.overall + 10);
    expect(withUpside.length).toBeGreaterThan(pros.length / 2);
  });

  it('ranks the consensus class (Dybantsa #1) and orders by reverse standings', () => {
    const pros = imported.draftProspectIds
      .map(id => imported.players[id])
      .sort((a, b) => b.ratings.overall - a.ratings.overall || b.development.potential - a.development.potential);
    expect(`${pros[0].firstName} ${pros[0].lastName}`).toBe('AJ Dybantsa');
    // Worst record from the most recent completed season picks first (Utah 17-65).
    expect(imported.draftOrderTeamIds).toHaveLength(30);
    expect(imported.draftOrderTeamIds[0]).toBe('team-uta');
  });

  it('keeps the real pick ownership for traded picks', () => {
    // Only actual trades are recorded (owner !== original).
    for (const o of imported.draftPickOwnership) {
      expect(o.ownerTeamId).not.toBe(o.originalTeamId);
      expect([1, 2]).toContain(o.round);
      expect(imported.teams.some(t => t.id === o.ownerTeamId)).toBe(true);
      expect(imported.teams.some(t => t.id === o.originalTeamId)).toBe(true);
    }
  });

  it('still maps 30 teams + a free-agent pool, prospects excluded from both', () => {
    expect(imported.teams).toHaveLength(30);
    expect(imported.freeAgentIds.length).toBeGreaterThan(0);
    // No prospect is on a roster or in the FA pool.
    const rostered = new Set(imported.teams.flatMap(t => t.playerIds as string[]));
    for (const id of imported.draftProspectIds) {
      expect(rostered.has(id)).toBe(false);
      expect(imported.freeAgentIds).not.toContain(id);
    }
  });
});

describe('strict consensus draft order (BUG-19)', () => {
  const file = JSON.parse(readFileSync(FILE, 'utf8')) as BbgmLeagueFile;
  const imported = convertBbgmLeague(file);

  // Board prospects now carry their consensus rank as draftProjection.
  const ranked = imported.draftProspectIds
    .map(id => imported.players[id])
    .filter(p => typeof p.sportData.draftProjection === 'number');

  it('stamps the consensus rank on board prospects (Dybantsa = 1)', () => {
    expect(ranked.length).toBeGreaterThanOrEqual(40); // ~41-name board
    const top = [...ranked].sort(
      (a, b) => a.sportData.draftProjection! - b.sportData.draftProjection!,
    )[0];
    expect(`${top.firstName} ${top.lastName}`).toBe('AJ Dybantsa');
    expect(top.sportData.draftProjection).toBe(1);
  });

  it('auto-drafts the board in near-exact order with no reaches', () => {
    const pool = imported.draftProspectIds.map(id => imported.players[id]);
    const remaining = [...pool];
    const draftedRanks: number[] = [];
    let pick = 0;
    while (remaining.length && pick < ranked.length) {
      // Hand the picking team a lopsided roster so positional need is in play —
      // the consensus board must still hold (no need-driven reaches).
      const fakeRoster = pool.slice(0, (pick % 5) + 1);
      const chosenId = aiBasketballDraftPick(
        { teamId: `team-${pick}` as TeamId, rosterPlayers: fakeRoster },
        remaining,
        { rngSeed: `bug19-${pick}` },
      );
      const idx = remaining.findIndex(p => p.id === chosenId);
      const chosen = remaining[idx];
      remaining.splice(idx, 1);
      if (typeof chosen.sportData.draftProjection === 'number') {
        draftedRanks.push(chosen.sportData.draftProjection);
      }
      pick++;
    }
    // The consensus #1 goes first...
    expect(draftedRanks[0]).toBe(1);
    // ...and every ranked prospect comes off the board in exact ascending rank
    // order — ranked talent always outscores unranked, so the board holds.
    const expected = ranked
      .map(p => p.sportData.draftProjection!)
      .sort((a, b) => a - b);
    expect(draftedRanks.slice(0, expected.length)).toEqual(expected);
  });
});
