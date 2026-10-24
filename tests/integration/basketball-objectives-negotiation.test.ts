/**
 * BS Hoops front office — owner objectives + re-sign negotiation personality.
 *
 *   Objectives: deterministic per save+season, fit team context (contend vs
 *   rebuild), progress tracks during a simmed season, and grades feed owner
 *   approval (met > missed with results held constant).
 *
 *   Negotiation: fair offers accepted within patience, lowballs cost patience
 *   and repeated lowballs end talks, counters sit between offer and anchor,
 *   "offer what he wants" always works when cap-legal, deterministic.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { applySeasonApproval } from '@/../apps/bs-basketball/src/lib/approval';
import {
  generateSeasonObjectives, ensureSeasonObjectives, getStoredObjectives, objectiveProgress,
  gradeObjectives, objectiveApprovalDelta, teamContext, OBJECTIVE_APPROVAL_CAP,
  type ObjectiveSet,
} from '@/../apps/bs-basketball/src/lib/owner/objectives';
import { buildOwnerMessage } from '@/../apps/bs-basketball/src/lib/owner/ownerMessage';
import {
  negotiationProfile, openTalk, respondToOffer, negotiateExtension, acceptExtensionAsk,
  currentAsk, getTalk, validateOffer, type TalkState,
} from '@/../apps/bs-basketball/src/lib/roster/negotiation';
import { hasSalaryForSeason } from '@/../apps/bs-basketball/src/lib/roster/resignProjection';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

function topTeam(league: LeagueState, best: boolean): TeamId {
  const strength = (t: BasketballTeam) => {
    const ovr = t.playerIds.map(id => (league.players[id] as BasketballPlayer).ratings.overall).sort((a, b) => b - a).slice(0, 8);
    return ovr.reduce((s, x) => s + x, 0) / ovr.length;
  };
  const sorted = [...(league.teams as BasketballTeam[])].sort((a, b) => strength(b) - strength(a));
  return (best ? sorted[0] : sorted[sorted.length - 1]).id;
}

function simDays(league: LeagueState, n: number): LeagueState {
  let l = league;
  for (let i = 0; i < n; i++) { const r = simNextDay(l); if (!r) break; l = r.league; }
  return l;
}

function completeSeason(league: LeagueState): LeagueState {
  let l = league;
  let g = 0;
  while (!isRegularSeasonComplete(l) && g++ < 400) { const r = simNextDay(l); if (!r) break; l = r.league; }
  l = initializePlayoffs(l); g = 0;
  while (!getBracket(l)!.complete && g++ < 200) { const r = simPlayoffDay(l); if (!r) break; l = r.league; }
  return l;
}

const base = createNewBasketballLeague({ rngSeed: 'objectives-neg-1' });
const contenderId = topTeam(base, true);
const rebuildId = topTeam(base, false);

describe('owner objectives — generation', () => {
  it('is deterministic per save + season', () => {
    const a = generateSeasonObjectives({ ...base, userTeamId: contenderId }, contenderId);
    const b = generateSeasonObjectives({ ...base, userTeamId: contenderId }, contenderId);
    expect(a).toEqual(b);
    expect(a!.objectives.length).toBeGreaterThanOrEqual(2);
    expect(a!.objectives.length).toBeLessThanOrEqual(3);
  });

  it('fits team context: contenders chase wins + playoff rounds, rebuilds improve/develop', () => {
    const c = generateSeasonObjectives(base, contenderId)!;
    const r = generateSeasonObjectives(base, rebuildId)!;
    expect(teamContext(base, contenderId)!.posture).toBe('contend');
    expect(teamContext(base, rebuildId)!.posture).toBe('rebuild');
    expect(c.objectives.some(o => o.kind === 'playoff_round')).toBe(true);
    const cWins = c.objectives.find(o => o.kind === 'wins')!;
    expect(cWins.target).toBeGreaterThanOrEqual(48);
    expect(r.objectives.some(o => o.kind === 'playoff_round' || o.kind === 'playoffs')).toBe(false);
    const rWins = r.objectives.find(o => o.kind === 'wins' || o.kind === 'improve')!;
    expect(rWins.target).toBeLessThan(cWins.target);
  });

  it('old saves without objectives get them lazily on the first simmed day (no crash)', () => {
    const league = { ...base, userTeamId: contenderId };
    expect(getStoredObjectives(league)).toBeNull();
    expect(buildOwnerMessage(league, league.currentSeason)).not.toBeNull();
    const after = simDays(league, 1);
    expect(getStoredObjectives(after)).toEqual(generateSeasonObjectives(league, contenderId));
  });
});

describe('owner objectives — live progress + grading', () => {
  const userTeamId = contenderId;
  const start = ensureSeasonObjectives({ ...base, userTeamId });
  const set = getStoredObjectives(start)!;
  const mid = simDays(start, 40);
  const done = completeSeason(mid);

  it('tracks progress during a simmed season', () => {
    const before = objectiveProgress(start, set);
    const during = objectiveProgress(mid, set);
    const winsBefore = before.find(p => p.objective.kind === 'wins')!;
    const winsDuring = during.find(p => p.objective.kind === 'wins')!;
    expect(winsBefore.pct).toBe(0);
    expect(winsDuring.pct).toBeGreaterThan(0);
    expect(winsDuring.detail).toMatch(/\d+–\d+/);
    // Objectives stay frozen once stored.
    expect(getStoredObjectives(mid)).toEqual(set);
  });

  it('grades at season end and feeds owner approval (met beats missed, results constant)', () => {
    const team = done.teams.find(t => t.id === userTeamId)!;
    const grades = gradeObjectives(done, set);
    expect(grades.length).toBe(set.objectives.length);
    for (const g of grades) expect(['met', 'partial', 'missed', 'pending']).toContain(g.grade);

    // Same season + record + bracket; only the objectives differ.
    const easy: ObjectiveSet = { ...set, objectives: [
      { id: 'e1', kind: 'wins', description: 'Win 1+ games', target: 1 },
      { id: 'e2', kind: 'tax', description: 'Stay under the luxury tax', target: 1e12 },
    ] };
    const hard: ObjectiveSet = { ...set, objectives: [
      { id: 'h1', kind: 'wins', description: 'Win 82+ games', target: 82 },
      { id: 'h2', kind: 'tax', description: 'Stay under the luxury tax', target: 1 },
    ] };
    const withSet = (s: ObjectiveSet) => ({ ...done, sportData: { ...(done.sportData as object), ownerObjectives: s } });
    const met = applySeasonApproval(withSet(easy));
    const missed = applySeasonApproval(withSet(hard));
    const none = applySeasonApproval({ ...done, sportData: { ...(done.sportData as object), ownerObjectives: undefined } });
    const appr = (r: typeof met) => r.league.teams.find(t => t.id === userTeamId)!.approval.ownerApproval;

    expect(met.objectiveDelta).toBeGreaterThan(0);
    expect(missed.objectiveDelta).toBeLessThan(0);
    expect(none.objectiveDelta).toBe(0);
    expect(appr(met)).toBeGreaterThanOrEqual(appr(none));
    expect(appr(missed)).toBeLessThanOrEqual(appr(none));
    expect(appr(met)).toBeGreaterThan(appr(missed));
    // Bounded: never more than the cap either way.
    expect(Math.abs(met.objectiveDelta)).toBeLessThanOrEqual(OBJECTIVE_APPROVAL_CAP);
    expect(objectiveApprovalDelta([...grades, ...grades, ...grades]).valueOf()).toBeLessThanOrEqual(OBJECTIVE_APPROVAL_CAP);
    // Archived for the owner message.
    const msg = buildOwnerMessage(met.league, done.currentSeason)!;
    expect(msg.objectiveGrades.map(g => g.grade)).toEqual(['met', 'met']);
    expect(team).toBeTruthy();
  });
});

// ===========================================================================
// Negotiation
// ===========================================================================

function negotiationLeague(): { league: LeagueState; player: BasketballPlayer } {
  const league = { ...base, userTeamId: contenderId };
  const team = league.teams.find(t => t.id === contenderId)!;
  const player = team.playerIds
    .map(id => league.players[id] as BasketballPlayer)
    .filter(p => p.ratings.overall >= 70)
    .sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
  return { league, player };
}

describe('re-sign negotiation personality', () => {
  const { league, player } = negotiationLeague();
  const name = 'He';

  it('profiles are deterministic and in range', () => {
    const a = negotiationProfile(league, player);
    const b = negotiationProfile(league, player);
    expect(a).toEqual(b);
    expect(a.patience).toBeGreaterThanOrEqual(2);
    expect(a.patience).toBeLessThanOrEqual(4);
    expect(a.reservation).toBeLessThanOrEqual(a.anchor);
    expect(a.lowballLine).toBeLessThan(a.reservation);
  });

  it('accepts a fair offer within patience', () => {
    const talk = openTalk(league, player);
    const res = respondToOffer(talk, { years: talk.profile.askYears, salaryPerYear: talk.currentAsk }, name);
    expect(res.kind).toBe('accepted');
    // Haggling: open at his floor, then split the difference with each counter —
    // a fair negotiator lands a deal within his patience.
    let t: TalkState = openTalk(league, player);
    let offerSalary = t.profile.reservation;
    let accepted = false;
    for (let i = 0; i < t.profile.patience && !accepted; i++) {
      const r = respondToOffer(t, { years: t.profile.askYears, salaryPerYear: offerSalary }, name);
      t = r.talk;
      if (r.kind === 'accepted') accepted = true;
      else {
        expect(r.kind).toBe('countered');
        offerSalary = Math.ceil(((offerSalary + r.counter!.salaryPerYear) / 2) / 100_000) * 100_000;
      }
    }
    expect(accepted).toBe(true);
  });

  it('counter sits between the offer and his anchor', () => {
    const talk = openTalk(league, player);
    const offer = { years: talk.profile.askYears, salaryPerYear: Math.round(((talk.profile.reservation + talk.profile.lowballLine) / 2) / 100_000) * 100_000 + 100_000 };
    const res = respondToOffer(talk, offer, name);
    expect(res.kind).toBe('countered');
    expect(res.counter!.salaryPerYear).toBeGreaterThanOrEqual(offer.salaryPerYear);
    expect(res.counter!.salaryPerYear).toBeLessThanOrEqual(talk.profile.anchor);
    expect(res.talk.patienceLeft).toBe(talk.patienceLeft - 1);
  });

  it('a lowball offends (patience −1); repeated lowballs end talks', () => {
    const talk = openTalk(league, player);
    const low = { years: talk.profile.askYears, salaryPerYear: Math.max(talk.profile.minSalary, Math.round(talk.profile.lowballLine * 0.6 / 100_000) * 100_000) };
    const r1 = respondToOffer(talk, low, name);
    expect(r1.kind).toBe('offended');
    expect(r1.talk.patienceLeft).toBe(talk.patienceLeft - 1);
    expect(r1.talk.profile.reservation).toBeGreaterThanOrEqual(talk.profile.reservation);
    const r2 = respondToOffer(r1.talk, low, name);
    expect(r2.kind).toBe('walked');
    expect(r2.talk.status).toBe('ended');
    // Ended talks refuse further offers.
    expect(respondToOffer(r2.talk, { years: talk.profile.askYears, salaryPerYear: talk.profile.anchor }, name).kind).toBe('invalid');
  });

  it('cap-illegal offers are rejected without costing patience', () => {
    const talk = openTalk(league, player);
    const res = respondToOffer(talk, { years: 7, salaryPerYear: talk.currentAsk }, name);
    expect(res.kind).toBe('invalid');
    expect(res.talk.patienceLeft).toBe(talk.patienceLeft);
    expect(validateOffer(talk.profile, { years: 2, salaryPerYear: talk.profile.maxSalary * 2 })).toMatch(/max/);
  });

  it('persists talks per player and "offer what he wants" always signs (even after talks end)', () => {
    const nextSeason = league.currentSeason + 1;
    const low = { years: 2, salaryPerYear: openTalk(league, player).profile.minSalary };
    let l = league;
    for (let i = 0; i < 2; i++) l = negotiateExtension(l, player.id, low)!.league;
    const talk = getTalk(l, player.id)!;
    expect(talk.status).toBe('ended');
    expect(talk.rounds.length).toBe(2);
    const price = currentAsk(talk);
    expect(price.salaryPerYear).toBeGreaterThanOrEqual(talk.profile.anchor);
    const signed = acceptExtensionAsk(l, player.id)!;
    expect(signed.response.kind).toBe('accepted');
    const p = signed.league.players[player.id] as BasketballPlayer;
    const lastYear = Math.max(...(player.contract?.years ?? []).map(y => y.season));
    expect(hasSalaryForSeason(p, lastYear + 1)).toBe(true);
    expect(p.contract!.years.length).toBe((player.contract?.years.length ?? 0) + price.years);
    expect(nextSeason).toBeGreaterThan(0);

    // Fresh talks: ask path works for every player on the roster.
    for (const id of league.teams.find(t => t.id === contenderId)!.playerIds) {
      const out = acceptExtensionAsk(league, id)!;
      expect(out.response.kind).toBe('accepted');
    }
  });

  it('is deterministic end to end', () => {
    const offers = [0.7, 0.85, 0.95].map(f => ({ years: 3, salaryPerYear: Math.round(openTalk(league, player).profile.anchor * f / 100_000) * 100_000 }));
    const run = () => {
      let l = league;
      const kinds: string[] = [];
      for (const o of offers) { const out = negotiateExtension(l, player.id, o)!; l = out.league; kinds.push(out.response.kind); }
      return { kinds, talk: getTalk(l, player.id) };
    };
    expect(run()).toEqual(run());
  });
});
