import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  findTeamBySlug,
  houseMock,
  needLabel,
  parseTeamPreselect,
  starterRank,
  teamDraftNeeds,
  teamSlug,
  type MockDraftData,
} from '@/lib/mockDraft/engine';

const data: MockDraftData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../public/mock/nfl-2027.json'), 'utf8'),
);

describe('mock draft team pages', () => {
  it('gives every team a unique, URL-safe slug that resolves back to it', () => {
    const slugs = data.teams.map(teamSlug);
    expect(new Set(slugs).size).toBe(data.teams.length);
    for (const team of data.teams) {
      expect(teamSlug(team)).toMatch(/^[a-z0-9-]+$/);
      expect(findTeamBySlug(data, teamSlug(team))?.tid).toBe(team.tid);
    }
    expect(teamSlug({ name: '49ers' })).toBe('49ers');
    expect(findTeamBySlug(data, 'BEARS')?.abbrev).toBe('CHI');
    expect(findTeamBySlug(data, 'chi')).toBeUndefined();
  });

  it('preselects a team from ?team=, starting at 3 rounds when it has no 1st', () => {
    const chi = findTeamBySlug(data, 'bears')!;
    expect(parseTeamPreselect(data, new URLSearchParams('team=bears'))).toEqual({ userTids: [chi.tid], rounds: 1 });
    expect(parseTeamPreselect(data, new URLSearchParams('team=nope'))).toBeNull();
    expect(parseTeamPreselect(data, new URLSearchParams(''))).toBeNull();

    for (const team of data.teams) {
      const preselect = parseTeamPreselect(data, new URLSearchParams(`team=${teamSlug(team)}`))!;
      const hasFirst = data.order.some((slot) => slot.round === 1 && slot.tid === team.tid);
      expect(preselect.rounds).toBe(hasFirst ? 1 : 3);
      // The preselected team always has a pick in the chosen rounds, so setup never opens it greyed out.
      expect(data.order.some((slot) => slot.round <= preselect.rounds && slot.tid === team.tid)).toBe(true);
    }
  });

  it('lists needs without K or P, QB first, and flags a sub-minimum position', () => {
    for (const team of data.teams) {
      const needs = teamDraftNeeds(data, team);
      expect(needs.some((n) => n.pos === 'K' || n.pos === 'P')).toBe(false);
      expect(new Set(needs.map((n) => n.pos)).size).toBe(needs.length);
      const qb = needs.findIndex((n) => n.reason === 'qb');
      if (qb >= 0) expect(qb).toBe(0);
    }
    const weak = { ...data.teams[0], hasDevQB: false, bestQbOvr: 60, countByPosition: { ...data.teams[0].countByPosition, LB: 1 } };
    const needs = teamDraftNeeds(data, weak);
    expect(needs[0]).toMatchObject({ pos: 'QB', reason: 'qb' });
    expect(needs.find((n) => n.pos === 'LB')).toMatchObject({ reason: 'below-min', value: 1, bar: 3 });
    expect(teamDraftNeeds(data, { ...weak, hasDevQB: true }).some((n) => n.pos === 'QB')).toBe(false);
  });

  it('flags bottom-quarter starters as weak, worst first, and drops a need once it is drafted for', () => {
    const chi = findTeamBySlug(data, 'bears')!;
    const needs = teamDraftNeeds(data, chi);
    const weak = needs.filter((n) => n.reason === 'weak');
    for (const need of weak) expect(starterRank(data, chi, need.pos)).toBeGreaterThanOrEqual(25);
    for (let i = 1; i < weak.length; i++) expect(weak[i - 1].rank!).toBeGreaterThanOrEqual(weak[i].rank!);
    // Every team gets a reasoned list from the data, not just the 2 the roster-minimum check finds.
    expect(data.teams.filter((t) => teamDraftNeeds(data, t).length > 0).length).toBeGreaterThan(28);

    const first = needs[0];
    expect(needLabel(first)).toMatch(new RegExp(`^${first.pos}: `));
    const live = { ...chi.countByPosition, [first.pos]: chi.countByPosition[first.pos] + 1 };
    expect(teamDraftNeeds(data, chi, live).some((n) => n.pos === first.pos)).toBe(false);
  });

  it('carries a logo URL for every team', () => {
    for (const team of data.teams) expect(team.imgURL).toMatch(/^https:\/\//);
  });

  it('runs one complete, deterministic house mock', () => {
    const a = houseMock(data);
    const b = houseMock(data);
    expect(a.complete).toBe(true);
    expect(a.picks).toHaveLength(data.order.length);
    expect(a.picks.map((p) => p.prospect.pid)).toEqual(b.picks.map((p) => p.prospect.pid));
  });
});
