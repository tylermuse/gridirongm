import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { convertBbgmLeague } from '@/../apps/bs-basketball/src/lib/data/leagueImport';
import { pickKey } from '@/../apps/bs-basketball/src/lib/trade';

describe('import future traded picks (BUG-9 imported leagues)', () => {
  it('captures future-year traded picks from the real roster file', () => {
    const path = `${process.cwd()}/2025-26.NBA.Roster.json`;
    if (!existsSync(path)) { console.log('roster file not present — skipping'); return; }
    const file = JSON.parse(readFileSync(path, 'utf8'));
    const imported = convertBbgmLeague(file);

    const seasons = [...new Set(imported.draftPickOwnership.map(o => o.season))].sort();
    const future = imported.draftPickOwnership.filter(o => o.season >= imported.season + 1);
    console.log(`import season=${imported.season}; pick-ownership seasons=${seasons.join(',')}; total=${imported.draftPickOwnership.length}, future=${future.length}`);

    // Future obligations are now captured (were dropped before — the BUG-9 fix).
    expect(future.length).toBeGreaterThan(0);
    expect(seasons.some(s => s >= imported.season + 1)).toBe(true);

    // Build the registry the way the store does and confirm a future pick resolves
    // to its new owner (not the original team).
    const reg: Record<string, string> = {};
    for (const o of imported.draftPickOwnership) reg[pickKey(o.season, o.round, o.originalTeamId)] = o.ownerTeamId;
    const sample = future[0];
    const key = pickKey(sample.season, sample.round, sample.originalTeamId);
    console.log(`sample future pick: ${key} → ${reg[key]} (original ${sample.originalTeamId})`);
    expect(reg[key]).toBe(sample.ownerTeamId);
    expect(reg[key]).not.toBe(sample.originalTeamId);
  });
});
