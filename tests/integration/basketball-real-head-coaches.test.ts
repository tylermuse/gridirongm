/**
 * Real NBA head coaches on real-roster leagues.
 *
 * The weekly roster script writes a BS-only `bsCoaches` block (one head coach
 * per team from ESPN) into BBGM_NBA_Roster_2026_Updated.json. The importer
 * re-keys it to our team ids and league creation renames each team's generated
 * HC to the real person; the player-development coach stays generated, and
 * files without the block are untouched.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { convertBbgmLeague, type BbgmLeagueFile } from '@/../apps/bs-basketball/src/lib/data/leagueImport';
import { assembleLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { applyRealHeadCoaches } from '@/../apps/bs-basketball/src/lib/coaching/realHeadCoaches';
import { coachData, getDevCoach, getHeadCoach } from '@/../apps/bs-basketball/src/lib/coaching/coaches';
import fixtureJson from '../../apps/bs-basketball/tests/fixtures/bbgm-nba-trimmed.json';

const fixture = fixtureJson as unknown as BbgmLeagueFile;

function build(file: BbgmLeagueFile) {
  const imported = convertBbgmLeague(file);
  const league = assembleLeague({
    teams: imported.teams,
    players: imported.players,
    freeAgentIds: imported.freeAgentIds,
    season: imported.season,
    displayName: 'test',
  });
  return { imported, league };
}

describe('real NBA head coaches', () => {
  it('renames each team\'s HC from bsCoaches and leaves the dev coach generated', () => {
    const file: BbgmLeagueFile = {
      ...fixture,
      bsCoaches: {
        ATL: { name: 'Quin Snyder', experience: 12 },
        BOS: { name: 'Joe Mazzulla', experience: 4, age: 38 },
      },
    };
    const { imported, league } = build(file);
    const atl = league.teams.find(t => t.abbreviation === 'ATL')!;
    const bos = league.teams.find(t => t.abbreviation === 'BOS')!;
    const chi = league.teams.find(t => t.abbreviation === 'CHI')!;
    expect(imported.realHeadCoaches).toEqual({
      [atl.id]: { name: 'Quin Snyder', experience: 12 },
      [bos.id]: { name: 'Joe Mazzulla', experience: 4, age: 38 },
    });

    const genAtlHc = getHeadCoach(league, atl.id)!;
    const genAtlDev = getDevCoach(league, atl.id)!;
    const genChiHc = getHeadCoach(league, chi.id)!;

    const real = applyRealHeadCoaches(league, imported.realHeadCoaches);
    const atlHc = getHeadCoach(real, atl.id)!;
    expect(atlHc.id).toBe(genAtlHc.id);
    expect(`${atlHc.firstName} ${atlHc.lastName}`).toBe('Quin Snyder');
    expect(atlHc.age).toBeGreaterThanOrEqual(48);
    expect(coachData(atlHc).hiredSeason).toBe(league.currentSeason - 12);
    expect(coachData(atlHc).real).toBe(true);
    // Generated attributes survive: ratings, scheme, contract.
    expect(atlHc.ratings).toEqual(genAtlHc.ratings);
    expect(coachData(atlHc).scheme).toBe(coachData(genAtlHc).scheme);
    expect(atlHc.contract).toEqual(genAtlHc.contract);

    const bosHc = getHeadCoach(real, bos.id)!;
    expect(bosHc.lastName).toBe('Mazzulla');
    expect(bosHc.age).toBe(38);

    // Dev coach and teams without an entry are untouched.
    expect(getDevCoach(real, atl.id)).toEqual(genAtlDev);
    expect(getHeadCoach(real, chi.id)).toEqual(genChiHc);
    expect(coachData(genChiHc).real).toBeUndefined();
  });

  it('is a no-op for files without bsCoaches', () => {
    const { imported, league } = build(fixture);
    expect(imported.realHeadCoaches).toBeNull();
    expect(applyRealHeadCoaches(league, imported.realHeadCoaches)).toBe(league);
  });

  it('shipped roster carries a real HC for all 30 teams; the vanilla variant drops the block', () => {
    const raw = JSON.parse(readFileSync('apps/bs-basketball/public/rosters/BBGM_NBA_Roster_2026_Updated.json', 'utf8')) as BbgmLeagueFile;
    expect(Object.keys(raw.bsCoaches ?? {})).toHaveLength(30);
    const imported = convertBbgmLeague(raw);
    expect(Object.keys(imported.realHeadCoaches ?? {})).toHaveLength(30);
    for (const team of imported.teams) {
      const entry = imported.realHeadCoaches![team.id];
      expect(entry, team.abbreviation).toBeDefined();
      expect(entry.name.split(' ').length).toBeGreaterThanOrEqual(2);
    }
    const vanilla = JSON.parse(readFileSync('apps/bs-basketball/public/rosters/BBGM_NBA_Roster_2026_Vanilla.json', 'utf8'));
    expect(vanilla.bsCoaches).toBeUndefined();
  });
});
