/**
 * BS Hoops Team Spotlight video show (port of BS Football's):
 * - the basketball data layer on a real simulated league (stat line, last
 *   game breakdown, focus detection, schedule board);
 * - the script composer builds a themed episode from Hoops clips only;
 * - every clip the show can play ships in apps/bs-basketball/public.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { fromLeague } from '@/../apps/bs-basketball/src/lib/videoShow/adapters';
import { computeShowStatLine, statsMentioned } from '@/../apps/bs-basketball/src/lib/videoShow/teamStats';
import { buildGameTopics, gameTopicsForMoment } from '@/../apps/bs-basketball/src/lib/videoShow/showGame';
import { focusForLine } from '@/../apps/bs-basketball/src/lib/videoShow/showFocus';
import { computePlayerStatLine } from '@/../apps/bs-basketball/src/lib/videoShow/playerStats';
import { conferenceRace, upcomingSchedule } from '@/../apps/bs-basketball/src/lib/videoShow/showStandings';
import { buildShowScript, SHOW_CLIPS } from '@/../apps/bs-basketball/src/lib/videoShow/showScript';
import { PHRASES } from '@/../apps/bs-basketball/src/lib/videoShow/phrases';
import { THEMES, WIDE_CLIPS, SIGNOFFS, planTheme, themeFor } from '@/../apps/bs-basketball/src/lib/videoShow/showThemes';
import { ordinalSrc } from '@/../apps/bs-basketball/src/lib/videoShow/phrases';
import { ALL_SFX, sfxSrc } from '@/../apps/bs-basketball/src/lib/videoShow/showSfx';
import type { BasketballLeagueState } from '@/../apps/bs-basketball/src/lib/persistence/db';

const PUBLIC = path.resolve(__dirname, '../../apps/bs-basketball/public');

function league30(): BasketballLeagueState {
  const base = createNewBasketballLeague({ rngSeed: 'video-show' });
  let l: BasketballLeagueState = { ...base, userTeamId: base.teams[0].id };
  for (let i = 0; i < 30; i++) { const r = simNextDay(l); if (!r) break; l = r.league; }
  return l;
}

describe('Hoops video show — data layer', () => {
  const league = league30();
  const view = fromLeague(league)!;

  it('builds the team stat line with league ranks', () => {
    const line = computeShowStatLine(view.team, view.teams, view.players)!;
    expect(line.record).toMatch(/^\d+-\d+$/);
    expect(line.stats.map(s => s.key)).toEqual(['ppg', 'pag', 'fg3', 'reb', 'ast']);
    for (const s of line.stats) {
      expect(s.rank).toBeGreaterThanOrEqual(1);
      expect(s.rank).toBeLessThanOrEqual(s.of);
      expect(s.value).not.toMatch(/NaN/);
    }
    expect(statsMentioned('They cannot hit from three and they get killed on the glass')).toEqual(['fg3', 'reb']);
  });

  it('breaks down the last game from the box score', () => {
    const topics = buildGameTopics(league, view.team, view.teams, view.players);
    expect(topics.length).toBeGreaterThanOrEqual(1);
    const [g] = topics;
    expect(g.headline).toMatch(new RegExp(`${view.team.abbreviation} \\d+, [A-Z]+ \\d+`));
    expect(g.depth).toBe('deep');
    expect(g.gameCompare?.rows.map(r => r.key)).toEqual(['pts', 'fg', 'fg3', 'reb', 'ast', 'to']);
    expect(g.exchanges.some(e => /Scoring by quarter/.test(e.text))).toBe(true);
    expect(Object.keys(g.gameLines ?? {}).length).toBeGreaterThan(5);
    const deadline = gameTopicsForMoment(topics, 'tradeDeadline');
    expect(deadline).toHaveLength(1);
    expect(deadline[0].depth).toBeUndefined();
  });

  it('puts the right graphic up for a line', () => {
    const star = view.players.filter(p => p.teamId === view.team.id && p.stats).sort((a, b) => b.stats!.points - a.stats!.points)[0];
    const ctx = { team: view.team, teams: view.teams, players: view.players, earlier: [] as string[] };
    const f = focusForLine(`${star.firstName} ${star.lastName} has been unreal.`, ctx);
    expect(f.kind).toBe('player');
    expect(computePlayerStatLine(star, view.players)?.length).toBeGreaterThan(0);
    expect(focusForLine('Their bench is getting outscored every night.', ctx).kind).toBe('unit');
    expect(focusForLine('They are clinging to a play-in spot.', ctx).kind).toBe('standings');
    expect(focusForLine('Look at the road trip coming up.', ctx).kind).toBe('schedule');
  });

  it('puts the line score up when the hosts talk about how the game swung', () => {
    const [g] = buildGameTopics(league, view.team, view.teams, view.players);
    const q = g.gameQuarters!;
    expect(q.periods.length).toBeGreaterThanOrEqual(4);
    const [, us, them] = g.headline.match(/ (\d+), [A-Z]+ (\d+)$/)!.map(Number);
    expect(q.periods.reduce((s, [a]) => s + a, 0)).toBe(us);
    expect(q.periods.reduce((s, [, b]) => s + b, 0)).toBe(them);

    const ctx = { topic: g, team: view.team, teams: view.teams, players: view.players, earlier: [] as string[] };
    const hot = (text: string) => { const f = focusForLine(text, ctx); return f.kind === 'quarters' ? f.hot : f.kind; };
    expect(hot("Fine. But they did come back and win the last two quarters by a little, so the effort's not the issue. The issue is they keep digging the hole first.")).toEqual([3, 4]);
    expect(hot('They lost the first quarter by sixteen.')).toEqual([1]);
    expect(hot('Down twenty-eight at the half.')).toEqual([1, 2]);
    expect(hot('Out of halftime they finally woke up.')).toEqual([3, 4]);
    expect(hot('The second and fourth quarters were a mess.')).toEqual([2, 4]);
    expect(hot('Another slow start.')).toEqual([1]);
    expect(hot('They keep digging a hole and then trying to climb out.')).toEqual([]);
    // Box-score talk stays on the box score; "the fourth" as a count isn't Q4.
    expect(hot('They shot 47 percent from the field.')).toBe('team');
    expect(hot('That is the fourth straight loss.')).toBe('team');
  });

  it('builds the conference race and the road ahead', () => {
    const race = conferenceRace(view.team, view.teams);
    expect(race.rows.some(r => r.isUser)).toBe(true);
    expect(race.rows[0].seed).toBe(1);
    const sched = upcomingSchedule(view.team, view.teams, view.schedule, view.season)!;
    expect(sched.rows.length).toBeGreaterThan(1);
    expect(sched.rows.some(r => !r.result)).toBe(true);
  });

  it("carries a player's headshot onto the show's player card", () => {
    const p = Object.values(league.players).find(pl => pl.id === view.players[0].id)!;
    const withPhoto: BasketballLeagueState = {
      ...league,
      players: { ...league.players, [p.id]: { ...p, sportData: { ...(p.sportData as object), photoUrl: 'https://cdn.test/p.png' } } },
    };
    expect(fromLeague(withPhoto)!.players.find(sp => sp.id === p.id)?.imageUrl).toBe('https://cdn.test/p.png');
  });
});

describe('Hoops video show — script and assets', () => {
  it('composes a themed episode from Hoops clips only', () => {
    expect(themeFor({ phase: 'regular', narrative: 'weekly' }, '6-14')).toBe('panic');
    expect(themeFor({ phase: 'regular', narrative: 'weekly' }, '15-5')).toBe('contender');
    expect(themeFor({ phase: 'regular', narrative: 'weekly' }, '3-2')).toBeNull();
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const plan = planTheme('contender', seed)!;
      expect(plan.opener).not.toBe('contender_open_1');
      const segs = buildShowScript(
        [{ headline: 'Real or not', icon: '🏀', exchanges: [{ speakerId: 'stats', text: 'Their defense is legit.' }, { speakerId: 'hottake', text: 'Contender. No doubt.' }] }],
        'Boston Greens', null, { written: true, theme: plan },
      );
      const wide = segs.filter(s => s.kind === 'phrase' && s.wide).map(s => (s as { phraseId: string }).phraseId);
      expect(wide.length).toBeGreaterThan(0);
      for (const id of wide) expect(WIDE_CLIPS[id.slice('wide:'.length)]).toBeDefined();
    }
  });

  it('ships every clip and sound the show can play', () => {
    const srcs = new Set<string>([
      ...Object.values(SHOW_CLIPS).map(c => c.src),
      ...PHRASES.map(p => p.src),
      ...Object.values(WIDE_CLIPS).map(w => w.src),
      '/show/ots/marcus_listen.mp4', '/show/ots/tony_listen.mp4', '/show/two_shot.jpg',
      ...ALL_SFX.map(id => sfxSrc(id)),
      ...[1, 15, 30].flatMap(n => [ordinalSrc('marcus', n), ordinalSrc('tony', n)]),
    ]);
    const missing = [...srcs].filter(s => !fs.existsSync(path.join(PUBLIC, s)));
    expect(missing).toEqual([]);
    // Every theme opener / verdict / signoff the show can pick exists.
    for (const t of Object.values(THEMES)) for (const id of [...t.openers, ...t.verdictClips.map(v => v.id)]) expect(WIDE_CLIPS[id]).toBeDefined();
    for (const id of SIGNOFFS) expect(WIDE_CLIPS[id]).toBeDefined();
  });
});
