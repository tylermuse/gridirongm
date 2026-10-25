/**
 * The Booth (call-in) for BS Hoops: grounding + template chips.
 *
 * - boothFetchOptions builds the hosts' inputs from a real league, and
 *   buildSpotlightTeamData turns them into the payload /api/spotlight-chat gets.
 * - Every call-in chip returns two host replies with real text (no
 *   "undefined" / "NaN" leaking from missing fields), preseason and mid-season.
 * - The episode key changes as the week advances.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { buildSpotlightTeamData } from '@/../apps/bs-basketball/src/lib/ai/aiSpotlight';
import { buildSpotlight } from '@/../apps/bs-basketball/src/lib/show/spotlight';
import { boothEpisodeKey, boothFetchOptions, episodeTopics } from '@/../apps/bs-basketball/src/lib/show/booth';
import { CALL_IN_CHIPS, answerChip, type CallInTeamData } from '@/../apps/bs-basketball/src/lib/show/callInTemplates';
import type { BasketballLeagueState } from '@/../apps/bs-basketball/src/lib/persistence/db';

function simDays(league: BasketballLeagueState, days: number): BasketballLeagueState {
  let l = league;
  for (let i = 0; i < days; i++) { const r = simNextDay(l); if (!r) break; l = r.league; }
  return l;
}

function expectCleanAnswers(league: BasketballLeagueState) {
  const opts = boothFetchOptions(league)!;
  expect(opts).not.toBeNull();
  const teamData = buildSpotlightTeamData(opts) as unknown as CallInTeamData;
  expect(teamData.team.name).toBeTruthy();
  expect(teamData.topPlayers.length).toBeGreaterThan(0);
  expect(typeof teamData.topPlayers[0].salary).toBe('number');
  for (const chip of CALL_IN_CHIPS) {
    for (const seed of [1, 2, 3]) {
      const replies = answerChip(chip.id, teamData, seed);
      expect(replies.length, chip.id).toBe(2);
      expect(new Set(replies.map(r => r.speaker))).toEqual(new Set(['marcus', 'tony']));
      for (const r of replies) {
        expect(r.text.trim().length, chip.id).toBeGreaterThan(10);
        expect(r.text, `${chip.id}: ${r.text}`).not.toMatch(/undefined|NaN|\[object/);
      }
    }
  }
}

describe('the Booth (Hoops call-in)', () => {
  const base = createNewBasketballLeague({ rngSeed: 'booth-test' });
  // A new league has no user team until one is picked.
  const fresh: BasketballLeagueState = { ...base, userTeamId: base.teams[0].id };

  it('answers every chip cleanly before tip-off', () => {
    expectCleanAnswers(fresh);
  });

  it('answers every chip cleanly mid-season and the episode key moves with the week', () => {
    const later = simDays(fresh, 30);
    expect(later.currentTick).toBeGreaterThan(fresh.currentTick);
    expectCleanAnswers(later);
    expect(boothEpisodeKey(later)).not.toBe(boothEpisodeKey(fresh));
  });

  it('maps the Team Spotlight into On Air topics with host lines', () => {
    const topics = episodeTopics(buildSpotlight(simDays(fresh, 14)));
    expect(topics.length).toBeGreaterThan(0);
    expect(topics[0].headline).toBeTruthy();
    expect(topics.some(t => t.exchanges.some(e => e.speakerId === 'stats'))).toBe(true);
  });
});
