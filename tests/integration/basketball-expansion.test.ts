/**
 * League expansion (30 → 31 / 32 teams).
 *
 * Drives a real season → playoffs → offseason → draft, runs the expansion, then
 * rolls into and plays the full next season: every team plays exactly 82
 * (41H/41A), protected players are never taken, no existing team loses more
 * than one player, new teams have legal rosters + future picks, the lottery is
 * sized to the non-first-round teams, playoffs crown a champion, and
 * conferences stay consistent. Also pins the 30-team schedule shape.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs,
  simPlayoffDay,
  getBracket,
  isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import { enterOffseason, startNextSeason } from '@/../apps/bs-basketball/src/lib/season';
import { getDraft, autoPickUntilUser } from '@/../apps/bs-basketball/src/lib/draft';
import { getTeamPicks } from '@/../apps/bs-basketball/src/lib/trade/picks';
import {
  expansionWindow,
  proposeRealignment,
  startExpansion,
  setUserProtection,
  beginExpansionDraft,
  autoExpansionUntilUser,
  finishExpansion,
  getExpansion,
  isExpansionExempt,
  protectablePlayers,
  makeExpansionPick,
  availableForExpansion,
  expansionTeamOnClock,
  PROTECTED_PER_TEAM,
  type ExpansionTeamConfig,
} from '@/../apps/bs-basketball/src/lib/expansion';
import {
  generateBasketballSchedule,
  lotteryOddsTable,
  generateBasketballDraftOrder,
  type BasketballPlayer,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type League = BaseLeagueState<BasketballRatings, BasketballStats>;

const SEATTLE: ExpansionTeamConfig = {
  city: 'Seattle', name: 'Sound', abbreviation: 'SEA',
  primaryColor: '#00654b', secondaryColor: '#ffc200',
  conference: 'Western', division: 'Northwest',
};
const VEGAS: ExpansionTeamConfig = {
  city: 'Las Vegas', name: 'Aces High', abbreviation: 'LVA',
  primaryColor: '#000000', secondaryColor: '#c4a24c',
  conference: 'Western', division: 'Pacific',
};

function playRegularSeason(league: League): League {
  let l = league;
  for (let guard = 0; guard < 400 && !isRegularSeasonComplete(l); guard++) {
    const r = simNextDay(l);
    if (!r) break;
    l = r.league;
  }
  return l;
}

function playPlayoffs(league: League): League {
  let l = initializePlayoffs(league);
  for (let guard = 0; guard < 200 && !getBracket(l)!.complete; guard++) {
    const r = simPlayoffDay(l);
    if (!r) break;
    l = r.league;
  }
  return l;
}

function confOf(t: BasketballTeam): string { return (t.sportData as { conference: string }).conference; }
function divOf(t: BasketballTeam): string { return (t.sportData as { division: string }).division; }

function assertBalancedSchedule(league: League) {
  const regular = league.games.filter(g => !(g.sportData as { isPlayoff?: boolean } | undefined)?.isPlayoff);
  for (const t of league.teams) {
    const home = regular.filter(g => g.homeTeamId === t.id).length;
    const away = regular.filter(g => g.awayTeamId === t.id).length;
    expect(home, `${t.abbreviation} home`).toBe(41);
    expect(away, `${t.abbreviation} away`).toBe(41);
  }
  expect(regular.length).toBe(league.teams.length * 41);
}

/** One shared offseason (real season simmed) the expansion tests branch off. */
let offseasonBeforeDraft: League;
let offseasonAfterDraft: League;

beforeAll(() => {
  const season = playPlayoffs(playRegularSeason(createNewBasketballLeague({ rngSeed: 'expansion' })));
  offseasonBeforeDraft = enterOffseason(season);
  offseasonAfterDraft = autoPickUntilUser(offseasonBeforeDraft, null);
}, 600_000);

describe('30-team regression', () => {
  it('a normal league still schedules 82 games (41H/41A) for all 30 teams', () => {
    const league = createNewBasketballLeague({ rngSeed: 'exp-30' });
    expect(league.teams).toHaveLength(30);
    assertBalancedSchedule(league);
    // Classic layout: 4 vs division rivals, 2 vs every other-conference team.
    const t = league.teams[0] as BasketballTeam;
    const vs = (o: BasketballTeam) => league.games.filter(g =>
      (g.homeTeamId === t.id && g.awayTeamId === o.id) || (g.homeTeamId === o.id && g.awayTeamId === t.id)).length;
    for (const o of league.teams as BasketballTeam[]) {
      if (o.id === t.id) continue;
      if (confOf(o) !== confOf(t)) expect(vs(o)).toBe(2);
      else if (divOf(o) === divOf(t)) expect(vs(o)).toBe(4);
      else expect([3, 4]).toContain(vs(o));
    }
  });

  it('30-team draft keeps the 14-team lottery with standard odds', () => {
    const draft = getDraft(offseasonAfterDraft)!;
    expect(draft.picks).toHaveLength(60);
    expect(draft.picks.filter(p => p.isLottery)).toHaveLength(14);
    expect(lotteryOddsTable(14)[0]).toBe(140);
  });
});

describe('expansion window', () => {
  it('is closed before the draft finishes and open after', () => {
    expect(expansionWindow(offseasonBeforeDraft).open).toBe(false);
    expect(expansionWindow(createNewBasketballLeague({ rngSeed: 'exp-win' })).open).toBe(false);
    const w = expansionWindow(offseasonAfterDraft);
    expect(w.open).toBe(true);
    expect(w.maxNewTeams).toBe(2);
  });
});

describe('realignment', () => {
  it('keeps conferences 15/16 and 16/16 with 5-6 team divisions', () => {
    const one = proposeRealignment(offseasonAfterDraft, [SEATTLE]);
    expect([one.sizes.Eastern, one.sizes.Western].sort()).toEqual([15, 16]);
    // Two new West teams → one West team must move East to keep 16/16.
    const two = proposeRealignment(offseasonAfterDraft, [SEATTLE, VEGAS]);
    expect(two.sizes).toEqual({ Eastern: 16, Western: 16 });
    expect(two.moves.length).toBeGreaterThanOrEqual(1);
    for (const n of Object.values(two.divisionSizes)) expect([5, 6]).toContain(n);
  });
});

describe('schedule generator for 31 and 32 teams', () => {
  for (const n of [31, 32]) {
    it(`gives all ${n} teams exactly 82 games, 41 home / 41 away`, () => {
      const configs = n === 31 ? [SEATTLE] : [SEATTLE, VEGAS];
      const plan = proposeRealignment(offseasonAfterDraft, configs);
      const l = startExpansion(offseasonAfterDraft, configs, plan);
      for (let seed = 0; seed < 5; seed++) {
        const games = generateBasketballSchedule(l.teams as BasketballTeam[], { season: 2030, rngSeed: `s-${n}-${seed}` });
        for (const t of l.teams) {
          expect(games.filter(g => g.homeTeamId === t.id).length).toBe(41);
          expect(games.filter(g => g.awayTeamId === t.id).length).toBe(41);
        }
      }
    });
  }

  it('draft order handles 31/32 teams with a 15/16-team lottery', () => {
    for (const n of [31, 32]) {
      const standings = Array.from({ length: n }, (_, i) => ({
        teamId: `t${i}` as TeamId, wins: 20 + i, losses: 62 - i, madePlayoffs: i >= n - 16,
      }));
      const order = generateBasketballDraftOrder(standings, { rngSeed: 'x', lotteryBoardSize: n - 16 });
      expect(order).toHaveLength(n * 2);
      expect(new Set(order.slice(0, n)).size).toBe(n);
      expect(new Set(order.slice(0, n - 16))).toEqual(new Set(standings.slice(0, n - 16).map(s => s.teamId)));
    }
  });
});

describe('protection + live draft (user GM)', () => {
  it('honors the user\'s protected list and the one-per-team limit', () => {
    const userTeamId = offseasonAfterDraft.teams[3].id;
    let l: League = { ...offseasonAfterDraft, userTeamId };
    l = startExpansion(l, [SEATTLE], proposeRealignment(l, [SEATTLE]));
    expect(getExpansion(l)!.userProtectionPending).toBe(true);
    const season = getExpansion(l)!.season;
    const eligible = protectablePlayers(l, userTeamId, season);
    // Protect the WORST eight — the best players must be left exposed.
    const mine = eligible.slice().sort((a, b) => a.ratings.overall - b.ratings.overall).slice(0, PROTECTED_PER_TEAM).map(p => p.id as PlayerId);
    expect(() => setUserProtection(l, [...mine, ...eligible.map(p => p.id as PlayerId)].slice(0, 9))).toThrow();
    l = setUserProtection(l, mine);
    l = beginExpansionDraft(l);
    l = autoExpansionUntilUser(l, null);
    l = finishExpansion(l);
    const exp = getExpansion(l)!;
    const taken = exp.picks.filter(p => p.playerId).map(p => p.playerId!);
    for (const id of mine) expect(taken).not.toContain(id);
    expect(l.teams.find(t => t.id === userTeamId)!.playerIds).toEqual(expect.arrayContaining(mine));
  });

  it('lets the user take over the expansion team and pick live', () => {
    let l: League = { ...offseasonAfterDraft, userTeamId: offseasonAfterDraft.teams[0].id };
    l = startExpansion(l, [SEATTLE, VEGAS], proposeRealignment(l, [SEATTLE, VEGAS]), { takeOverIndex: 1 });
    const exp0 = getExpansion(l)!;
    expect(l.userTeamId).toBe(exp0.newTeamIds[1]);
    expect(exp0.userProtectionPending).toBe(false); // old team auto-protects
    l = beginExpansionDraft(l);
    l = autoExpansionUntilUser(l, l.userTeamId); // SEA picks first, then user's LVA
    const exp1 = getExpansion(l)!;
    expect(expansionTeamOnClock(exp1)).toBe(l.userTeamId);
    const pool = availableForExpansion(l, l.userTeamId);
    const choice = pool.sort((a, b) => a.ratings.overall - b.ratings.overall)[0];
    l = makeExpansionPick(l, choice.id as PlayerId);
    expect(l.teams.find(t => t.id === l.userTeamId)!.playerIds).toContain(choice.id);
    // A protected player cannot be taken.
    const prot = Object.values(getExpansion(l)!.protected).flat()[0];
    l = autoExpansionUntilUser(l, l.userTeamId);
    if (expansionTeamOnClock(getExpansion(l)!)) expect(() => makeExpansionPick(l, prot)).toThrow();
  });
});

for (const n of [31, 32] as const) {
  describe(`full cycle at ${n} teams`, () => {
    let expanded: League;
    let nextSeason: League;
    let played: League;
    let newIds: TeamId[];

    beforeAll(() => {
      const configs = n === 31 ? [SEATTLE] : [SEATTLE, VEGAS];
      let l = startExpansion(offseasonAfterDraft, configs, proposeRealignment(offseasonAfterDraft, configs));
      l = beginExpansionDraft(l);
      l = autoExpansionUntilUser(l, null);
      expanded = finishExpansion(l);
      newIds = getExpansion(expanded)!.newTeamIds;
      nextSeason = startNextSeason(expanded);
      played = playPlayoffs(playRegularSeason(nextSeason));
    }, 900_000);

    it('drafts legally: protected players untouched, ≤1 per existing team', () => {
      const exp = getExpansion(expanded)!;
      const prot = new Set(Object.values(exp.protected).flat());
      const taken = exp.picks.filter(p => p.playerId);
      expect(taken.length).toBeGreaterThanOrEqual(10 * newIds.length);
      const fromCount = new Map<string, number>();
      for (const p of taken) {
        expect(prot.has(p.playerId!)).toBe(false);
        fromCount.set(p.fromTeamId!, (fromCount.get(p.fromTeamId!) ?? 0) + 1);
        const pl = offseasonAfterDraft.players[p.playerId!] as BasketballPlayer;
        expect(isExpansionExempt(pl, exp.season)).toBe(false);
        // Contract carried over unchanged.
        expect((expanded.players[p.playerId!] as BasketballPlayer).contract).toEqual(pl.contract);
      }
      for (const c of fromCount.values()) expect(c).toBe(1);
      for (const lists of Object.values(exp.protected)) expect(lists.length).toBeLessThanOrEqual(PROTECTED_PER_TEAM);
    });

    it('new teams have legal rosters, a coach, and future picks', () => {
      for (const id of newIds) {
        const t = nextSeason.teams.find(x => x.id === id)!;
        expect(t.playerIds.length).toBeGreaterThanOrEqual(13);
        expect(t.playerIds.length).toBeLessThanOrEqual(15);
        for (const pid of t.playerIds) expect(nextSeason.players[pid]?.rosterSlot?.teamId).toBe(id);
        expect(t.coachIds.length).toBe(1);
        const picks = getTeamPicks(nextSeason, id);
        expect(picks.filter(p => p.originalTeamId === id).length).toBeGreaterThanOrEqual(6); // 3 yrs × 2 rds
      }
    });

    it(`the next season is a ${n}-team, 82-game (41H/41A) schedule`, () => {
      expect(nextSeason.teams).toHaveLength(n);
      assertBalancedSchedule(nextSeason);
      const confs = new Map<string, number>();
      for (const t of nextSeason.teams as BasketballTeam[]) confs.set(confOf(t), (confs.get(confOf(t)) ?? 0) + 1);
      expect([...confs.values()].sort()).toEqual(n === 31 ? [15, 16] : [16, 16]);
      expect(nextSeason.competitions[0].standings).toHaveLength(n);
    });

    it('plays the full season: 82 games each, standings consistent, a champion', () => {
      for (const t of played.teams) expect(t.record.wins + t.record.losses).toBe(82);
      const totalW = played.teams.reduce((s, t) => s + t.record.wins, 0);
      expect(totalW).toBe(n * 41);
      const bracket = getBracket(played)!;
      expect(bracket.complete).toBe(true);
      expect(played.teams.some(t => t.id === bracket.championTeamId)).toBe(true);
      for (const conf of ['Eastern', 'Western'] as const) {
        for (const id of bracket.seeds[conf]) {
          expect(confOf(played.teams.find(t => t.id === id) as BasketballTeam)).toBe(conf);
        }
      }
    });

    it(`the following draft has ${n * 2} picks and a ${n - 16}-team lottery incl. the new teams' own picks`, () => {
      const off = enterOffseason(played);
      const draft = getDraft(off)!;
      expect(draft.picks).toHaveLength(n * 2);
      expect(draft.picks.filter(p => p.isLottery)).toHaveLength(n - 16);
      // Draw pool = non-seeded teams (N − 20; play-in teams count as seeded, as at 30).
      expect(draft.lotteryOrder).toHaveLength(n - 20);
      expect(draft.poolIds).toHaveLength(n * 2);
      for (const id of newIds) {
        expect(draft.picks.filter(p => p.originalTeamId === id)).toHaveLength(2);
      }
      const done = autoPickUntilUser(off, null);
      expect(getDraft(done)!.complete).toBe(true);
      const after = startNextSeason(done);
      assertBalancedSchedule(after);
    }, 300_000);
  });
}
