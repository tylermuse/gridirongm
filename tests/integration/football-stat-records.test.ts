// Stat records (History → Records): career and single-season boards, league-wide
// or for one franchise, derived from what a save already holds. Plus the
// rollover change that makes the season log credit the team a season was
// played for, so the franchise boards stay right after free agency.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { useGameStore } from '@/lib/engine/store';
import { RECORD_CATEGORIES, careerRecords, singleSeasonRecords, type RecordBoard } from '@/lib/engine/records';
import { emptyStats, type Player, type PlayerStats } from '@/types';

const stats = (over: Partial<PlayerStats> = {}): PlayerStats => ({ ...emptyStats(), gamesPlayed: 17, ...over });
const sumStats = (lines: PlayerStats[]): PlayerStats => {
  const total = emptyStats();
  for (const line of lines) for (const k of Object.keys(total) as (keyof PlayerStats)[]) total[k] += line[k];
  return total;
};

interface Fixture {
  id: string;
  position?: string;
  teamId?: string | null;
  retired?: boolean;
  /** Finished seasons: [season, team, stats]. */
  log?: [number, string, Partial<PlayerStats>][];
  /** The season in progress. */
  current?: Partial<PlayerStats>;
  seasonTeamId?: string;
  /** Overrides the default career total (log + current). */
  career?: Partial<PlayerStats>;
}

function makePlayer(f: Fixture): Player {
  const seasonLog = (f.log ?? []).map(([season, teamId, s]) => ({ season, teamId, stats: stats(s) }));
  const current = f.current ? stats(f.current) : emptyStats();
  return {
    id: f.id,
    firstName: f.id,
    lastName: 'Player',
    position: f.position ?? 'QB',
    teamId: f.teamId === undefined ? 'DAL' : f.teamId,
    retired: f.retired ?? false,
    stats: current,
    careerStats: f.career ? stats(f.career) : sumStats([...seasonLog.map(e => e.stats), current]),
    seasonLog: seasonLog.length > 0 ? seasonLog : undefined,
    seasonTeamId: f.seasonTeamId,
  } as unknown as Player;
}

const board = (boards: RecordBoard[], key: string) => boards.find(b => b.key === key);
const rows = (boards: RecordBoard[], key: string) =>
  (board(boards, key)?.entries ?? []).map(e => [e.playerId, e.value, e.season ?? null, e.teamId]);

// A three-season league, 2029 in progress.
const league: Player[] = [
  // Career-long Cowboy.
  makePlayer({ id: 'dak', log: [[2026, 'DAL', { passYards: 4200, passTDs: 30 }], [2027, 'DAL', { passYards: 4800, passTDs: 38 }], [2028, 'DAL', { passYards: 3900, passTDs: 25 }]], current: { passYards: 1500, passTDs: 11 } }),
  // Two seasons in Philadelphia, then Dallas.
  makePlayer({ id: 'journeyman', log: [[2026, 'PHI', { passYards: 5100, passTDs: 41 }], [2027, 'PHI', { passYards: 4400, passTDs: 33 }], [2028, 'DAL', { passYards: 300, passTDs: 2 }]], current: { passYards: 0 }, teamId: 'DAL' }),
  // Retired after 2027; never a Cowboy.
  makePlayer({ id: 'legend', teamId: null, retired: true, log: [[2026, 'NYG', { passYards: 4700, passTDs: 35 }], [2027, 'NYG', { passYards: 4600, passTDs: 29 }]] }),
  makePlayer({ id: 'back', position: 'RB', log: [[2027, 'DAL', { rushYards: 1650, rushTDs: 14 }], [2028, 'DAL', { rushYards: 1200, rushTDs: 9, receivingTDs: 2 }]], current: { rushYards: 700, rushTDs: 6 } }),
  makePlayer({ id: 'edge', position: 'DL', teamId: 'PHI', log: [[2028, 'PHI', { sacks: 19.5, tackles: 60, tacklesForLoss: 22 }]], current: { sacks: 8, tackles: 30 } }),
];
const opts = { currentSeason: 2029 };

describe('single-season records', () => {
  it('ranks every player season league-wide, with its team and year', () => {
    const b = singleSeasonRecords(league, opts);
    expect(rows(b, 'passYards').slice(0, 4)).toEqual([
      ['journeyman', 5100, 2026, 'PHI'],
      ['dak', 4800, 2027, 'DAL'],
      ['legend', 4700, 2026, 'NYG'],
      ['legend', 4600, 2027, 'NYG'],
    ]);
    expect(board(b, 'passYards')!.entries[2]).toMatchObject({ name: 'legend Player', position: 'QB', retired: true });
  });

  it('includes the season in progress and marks it', () => {
    const entry = board(singleSeasonRecords(league, opts), 'sacks')!.entries.find(e => e.season === 2029)!;
    expect(entry).toMatchObject({ playerId: 'edge', value: 8, inProgress: true, teamId: 'PHI' });
    // Finished seasons are not marked.
    expect(board(singleSeasonRecords(league, opts), 'sacks')!.entries[0].inProgress).toBeUndefined();
  });

  it('team scope keeps only seasons played for that team', () => {
    const b = singleSeasonRecords(league, { ...opts, teamId: 'DAL' });
    expect(rows(b, 'passYards')).toEqual([
      ['dak', 4800, 2027, 'DAL'],
      ['dak', 4200, 2026, 'DAL'],
      ['dak', 3900, 2028, 'DAL'],
      ['dak', 1500, 2029, 'DAL'],
      ['journeyman', 300, 2028, 'DAL'],
    ]);
    // No Cowboy has a sack, so there is no sacks board at all.
    expect(board(b, 'sacks')).toBeUndefined();
  });

  it('adds up combined categories', () => {
    expect(rows(singleSeasonRecords(league, { ...opts, teamId: 'DAL' }), 'totalTDs')[0]).toEqual(['dak', 38, 2027, 'DAL']);
    expect(rows(singleSeasonRecords(league, opts), 'totalTDs')).toContainEqual(['back', 11, 2028, 'DAL']);
  });

  it('never counts a season twice if the log already holds the current one', () => {
    const p = makePlayer({ id: 'x', log: [[2029, 'DAL', { passYards: 4000 }]], current: { passYards: 4000 } });
    expect(rows(singleSeasonRecords([p], opts), 'passYards')).toEqual([['x', 4000, 2029, 'DAL']]);
  });

  it('in the offseason, credits the finished season to the team it was played for', () => {
    // Signed with PHI in free agency; the 2029 stats are still on `stats`.
    const moved = makePlayer({ id: 'moved', teamId: 'PHI', seasonTeamId: 'DAL', current: { passYards: 4100 } });
    expect(rows(singleSeasonRecords([moved], { ...opts, teamId: 'DAL' }), 'passYards')).toEqual([['moved', 4100, 2029, 'DAL']]);
    expect(board(singleSeasonRecords([moved], { ...opts, teamId: 'PHI' }), 'passYards')).toBeUndefined();
  });

  it('caps a board at the limit and breaks ties by who got there first', () => {
    const tied = [
      makePlayer({ id: 'late', log: [[2028, 'DAL', { passTDs: 40 }]] }),
      makePlayer({ id: 'early', log: [[2026, 'DAL', { passTDs: 40 }]] }),
      makePlayer({ id: 'other', log: [[2027, 'DAL', { passTDs: 12 }]] }),
    ];
    expect(rows(singleSeasonRecords(tied, { ...opts, limit: 2 }), 'passTDs').map(r => r[0])).toEqual(['early', 'late']);
  });
});

describe('career records', () => {
  it('league-wide: whole-career totals, with the current team', () => {
    const b = careerRecords(league, opts);
    expect(rows(b, 'passYards')).toEqual([
      ['dak', 14400, null, 'DAL'],
      ['journeyman', 9800, null, 'DAL'],
      ['legend', 9300, null, null],
    ]);
    expect(board(b, 'passYards')!.entries[0]).toMatchObject({ firstSeason: 2026, lastSeason: 2029 });
  });

  it('team scope: only the seasons with that team, not the whole career', () => {
    const b = careerRecords(league, { ...opts, teamId: 'DAL' });
    expect(rows(b, 'passYards')).toEqual([
      ['dak', 14400, null, 'DAL'],
      ['journeyman', 300, null, 'DAL'],
    ]);
    expect(board(b, 'passYards')!.entries[1]).toMatchObject({ firstSeason: 2028, lastSeason: 2028 });
    // A player who left still holds what he did for the team.
    const philly = careerRecords(league, { ...opts, teamId: 'PHI' });
    expect(rows(philly, 'passYards')).toEqual([['journeyman', 9500, null, 'PHI']]);
    expect(rows(philly, 'sacks')).toEqual([['edge', 27.5, null, 'PHI']]);
  });

  it('uses careerStats when it holds more than the season log (history from before the log)', () => {
    const vet = makePlayer({ id: 'vet', log: [[2028, 'DAL', { rushYards: 900 }]], career: { rushYards: 9000 }, position: 'RB' });
    expect(rows(careerRecords([vet], opts), 'rushYards')).toEqual([['vet', 9000, null, 'DAL']]);
    // The team board can only count the seasons the save has a line for.
    expect(rows(careerRecords([vet], { ...opts, teamId: 'DAL' }), 'rushYards')).toEqual([['vet', 900, null, 'DAL']]);
  });

  it('uses the season log when careerStats fell behind it', () => {
    const p = makePlayer({ id: 'p', log: [[2027, 'DAL', { tackles: 120 }], [2028, 'DAL', { tackles: 110 }]], career: { tackles: 150 }, position: 'LB' });
    expect(rows(careerRecords([p], opts), 'tackles')).toEqual([['p', 230, null, 'DAL']]);
  });

  it('works on a save with no season log at all', () => {
    const old = { ...makePlayer({ id: 'old', career: { passYards: 30000 } }), seasonLog: undefined } as Player;
    expect(rows(careerRecords([old], opts), 'passYards')).toEqual([['old', 30000, null, 'DAL']]);
    expect(singleSeasonRecords([old], opts)).toEqual([]);
    expect(careerRecords([old], { ...opts, teamId: 'DAL' })).toEqual([]);
  });

  it('returns boards in category order and drops empty ones', () => {
    const keys = careerRecords(league, opts).map(b => b.key);
    expect(keys).toEqual(RECORD_CATEGORIES.map(c => c.key).filter(k => keys.includes(k)));
    expect(keys).not.toContain('defensiveINTs');
    expect(careerRecords([], opts)).toEqual([]);
  });
});

describe('season log at rollover', () => {
  const root = path.resolve(__dirname, '../../public');
  const st = () => useGameStore.getState();

  it('credits the season to the team it was played for, and keeps a retiree\'s last season', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const file = path.join(root, String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0]);
      return new Response(fs.readFileSync(file, 'utf8'), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    await st().newLeague('', '/rosters/FBGM_NFL_Roster_2026_Updated.json', 'regular', true);
    for (let g = 0; st().phase === 'regular' && g < 30; g++) st().simWeek();
    st().simAllPlayoffGames();
    const season = st().season;
    st().advanceToResigning();

    const played = st().players.filter(p => p.teamId && !p.retired && p.stats.gamesPlayed > 0 && p.age < 28);
    expect(played.length).toBeGreaterThan(500);
    expect(played.every(p => p.seasonTeamId === p.teamId)).toBe(true);

    // Three offseason fates: signs elsewhere, goes unsigned, retires.
    const [mover, unsigned, retiree] = played.filter(p => RECORD_CATEGORIES.some(c => c.value(p.stats) > 0));
    const before = new Map([mover, unsigned, retiree].map(p => [p.id, { teamId: p.teamId!, stats: { ...p.stats } }]));
    const otherTeam = st().teams.find(t => t.id !== mover.teamId)!.id;
    useGameStore.setState({
      players: st().players.map(p =>
        p.id === mover.id ? { ...p, teamId: otherTeam }
          : p.id === unsigned.id ? { ...p, teamId: null }
            : p.id === retiree.id ? { ...p, retired: true }
              : p),
    });
    // The offseason boards already credit the old team.
    const offseason = singleSeasonRecords(st().players, { currentSeason: season, teamId: before.get(mover.id)!.teamId, limit: 5000 });
    expect(offseason.some(b => b.entries.some(e => e.playerId === mover.id))).toBe(true);

    st().advanceToFreeAgency();
    st().advanceToDraft();
    st().simToEndDraft({ skipAdvance: true });
    st().startNewSeason();
    expect(st().season).toBe(season + 1);

    for (const original of [mover, unsigned, retiree]) {
      const p = st().players.find(x => x.id === original.id)!;
      const logged = p.seasonLog?.find(e => e.season === season);
      expect(logged, `${original.id} season logged`).toBeTruthy();
      expect(logged!.teamId).toBe(before.get(p.id)!.teamId);
      expect(logged!.stats.gamesPlayed).toBe(before.get(p.id)!.stats.gamesPlayed);
      expect(p.seasonTeamId).toBeUndefined();
      expect(p.stats.gamesPlayed).toBe(0);
    }
    expect(st().players.find(x => x.id === retiree.id)).toMatchObject({ retired: true, teamId: null });
    // Nobody carries a stamp into the new season.
    expect(st().players.some(p => p.seasonTeamId)).toBe(false);
  }, 600_000);
});
