/**
 * Real NFL head coaches on real-roster leagues.
 *
 * The weekly roster script writes a BS-only `bsCoaches` block (one head coach
 * per team from ESPN) into FBGM_NFL_Roster_2026_Updated.json. At league
 * creation the generated HC of each team is renamed to the real person; the
 * coordinators and position coaches stay generated, and files without the
 * block are untouched.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { convertFbgmLeague } from '@/lib/data/leagueImport';
import { applyRealHeadCoach, realHeadCoachesFromFile } from '@/lib/data/realHeadCoaches';
import { generateCoachingStaff } from '@/lib/engine/coaching';

const TEAM = { id: 'team-det', city: 'Detroit', name: 'Lions', abbreviation: 'DET' };
const ENTRIES = {
  DET: { name: 'Dan Campbell', experience: 6, age: 50 },
  ARI: { name: 'Mike LaFleur', experience: 0 },
};

describe('applyRealHeadCoach', () => {
  it('renames only the HC and keeps the rest of the staff generated', () => {
    const staff = generateCoachingStaff();
    const before = staff.map(c => ({ ...c }));
    expect(applyRealHeadCoach(staff, TEAM, ENTRIES, 2026)).toBe(true);

    const hc = staff.find(c => c.role === 'HC')!;
    expect(hc.firstName).toBe('Dan');
    expect(hc.lastName).toBe('Campbell');
    expect(hc.age).toBe(50);
    expect(hc.yearsWithTeam).toBe(6);
    expect(hc.careerWins + hc.careerLosses).toBe(17 * 6);
    expect(hc.history).toHaveLength(1);
    expect(hc.history![0]).toMatchObject({ teamId: 'team-det', role: 'HC', seasonStart: 2020, seasonEnd: 2025 });
    expect(hc.bio).toContain('Dan Campbell');
    expect(hc.bio).toContain('7th season');
    // Generated attributes survive: rating, schemes, personality, contract.
    const genHc = before.find(c => c.role === 'HC')!;
    expect(hc.ovr).toBe(genHc.ovr);
    expect(hc.offensiveScheme).toBe(genHc.offensiveScheme);
    expect(hc.personality).toBe(genHc.personality);
    expect(hc.salary).toBe(genHc.salary);

    for (const c of staff.filter(c => c.role !== 'HC')) {
      const gen = before.find(b => b.id === c.id)!;
      expect(c).toEqual(gen);
    }
  });

  it('gives a first-year HC a plausible age, no record and no invented stints', () => {
    const staff = generateCoachingStaff();
    applyRealHeadCoach(staff, { ...TEAM, id: 'team-ari', city: 'Arizona', name: 'Cardinals', abbreviation: 'ARI' }, ENTRIES, 2026);
    const hc = staff.find(c => c.role === 'HC')!;
    expect(`${hc.firstName} ${hc.lastName}`).toBe('Mike LaFleur');
    expect(hc.age).toBeGreaterThanOrEqual(36);
    expect(hc.yearsWithTeam).toBe(0);
    expect(hc.careerWins).toBe(0);
    expect(hc.careerLosses).toBe(0);
    expect(hc.history).toEqual([]);
    expect(hc.bio).toContain('first season');
  });

  it('leaves teams without an entry, and files without the block, alone', () => {
    const staff = generateCoachingStaff();
    const before = staff.map(c => ({ ...c }));
    expect(applyRealHeadCoach(staff, { ...TEAM, abbreviation: 'KC' }, ENTRIES, 2026)).toBe(false);
    expect(applyRealHeadCoach(staff, TEAM, undefined, 2026)).toBe(false);
    expect(staff).toEqual(before);
    expect(realHeadCoachesFromFile(undefined)).toBeUndefined();
    expect(realHeadCoachesFromFile({})).toBeUndefined();
    expect(realHeadCoachesFromFile({ DET: { name: '' } })).toBeUndefined();
  });
});

describe('shipped NFL 2026 roster file', () => {
  it('carries a real head coach for all 32 teams and the importer passes them through', () => {
    const raw = JSON.parse(readFileSync('public/rosters/FBGM_NFL_Roster_2026_Updated.json', 'utf8'));
    expect(Object.keys(raw.bsCoaches)).toHaveLength(32);
    const { teams, realHeadCoaches } = convertFbgmLeague(raw);
    expect(realHeadCoaches).toBeDefined();
    for (const team of teams) {
      const entry = realHeadCoaches![team.abbreviation];
      expect(entry, team.abbreviation).toBeDefined();
      expect(entry.name.split(' ').length).toBeGreaterThanOrEqual(2);
      expect(entry.experience).toBeGreaterThanOrEqual(0);
    }
    // The stock-FBGM download variant must not carry the BS-only block.
    const vanilla = JSON.parse(readFileSync('public/rosters/FBGM_NFL_Roster_2026_Vanilla.json', 'utf8'));
    expect(vanilla.bsCoaches).toBeUndefined();
  });
});
