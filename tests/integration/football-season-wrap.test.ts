/**
 * One end-of-season Team Spotlight episode. The playoff exit and the
 * offseason used to be two episodes, and the offseason one re-recapped the
 * same last game. Now the season wrap is the only one: it recaps the game
 * that ended the season and closes on an offseason preview, and re-signing,
 * the draft and free agency replay it instead of making another.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { boothEpisodeKey } from '@/lib/engine/boothStore';
import { buildSpotlightTeamData, detectNarrativeMoment } from '@/lib/engine/aiSpotlight';
import { generateTeamSpotlight } from '@/lib/engine/debate';
import { useGameStore } from '@/lib/engine/store';
import { computeOffseasonOutlook, offseasonPreviewTopic, OFFSEASON_PREVIEW_HEADLINE } from '@/lib/spotlight/offseasonOutlook';
import { seasonWrapFor, wrapShowFrozen, wrapTextFrozen, type SeasonWrapEpisode } from '@/lib/spotlight/seasonWrap';
import { capShowTopics, SHOW_MAX_STORYLINES, type ShowTopicInput } from '@/lib/spotlight/showScript';
import { parseEpisode } from '@/lib/spotlight/showRequest';
import { hookLine, momentNote } from '@/lib/spotlight/showMoment';
import { emptyStats, type DraftPick, type Player, type PlayoffMatchup, type Position, type Team } from '@/types';

const POS: Position[] = ['QB', 'RB', 'WR', 'WR', 'WR', 'TE', 'OL', 'OL', 'OL', 'OL', 'OL', 'DL', 'DL', 'DL', 'DL', 'LB', 'LB', 'LB', 'CB', 'CB', 'CB', 'S', 'S', 'K'];

function team(id: string, i: number, draftPicks: DraftPick[] = []): Team {
  return {
    id, city: `City${i}`, name: `Club${i}`, abbreviation: id, conference: i % 2 ? 'NC' : 'AC', division: 'North',
    record: { wins: 10 - i, losses: 7 + i, ties: 0, pointsFor: 400 - i, pointsAgainst: 350 + i, streak: 0 },
    depthChart: {}, salaryCap: 255, totalPayroll: 230, roster: [], draftPicks, deadCap: [],
  } as unknown as Team;
}

let n = 0;
function player(teamId: string, position: Position, ovr: number, extra: Partial<Player> = {}): Player {
  n++;
  return {
    id: `p${n}`, firstName: 'Pat', lastName: `${position}${n}`, position, teamId, age: 27, potential: 70, retired: false, injury: null,
    ratings: { overall: ovr }, contract: { salary: 8, yearsLeft: 3, guaranteed: 0 }, stats: emptyStats(), experience: 4,
    ...extra,
  } as unknown as Player;
}

// 8 teams; ours ('US') has a weak offensive line and three deals expiring.
const pick = (year: number, round: number, owner: string, original = owner): DraftPick =>
  ({ id: `${owner}-${original}-${year}-${round}`, year, round, ownerTeamId: owner, originalTeamId: original });
const teams = ['US', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((id, i) =>
  team(id, i, id === 'US' ? [pick(2027, 1, 'US'), pick(2027, 2, 'US'), pick(2027, 3, 'US', 'B'), pick(2028, 1, 'US')] : [pick(2027, 1, id), pick(2027, 2, id)]));
const players: Player[] = [];
for (const t of teams) for (const pos of POS) players.push(player(t.id, pos, t.id === 'US' && pos === 'OL' ? 55 : 75));
const star = player('US', 'QB', 88, { age: 30, contract: { salary: 40, yearsLeft: 1, guaranteed: 0 } } as Partial<Player>);
const wr = player('US', 'WR', 79, { age: 26, contract: { salary: 12, yearsLeft: 1, guaranteed: 0 } } as Partial<Player>);
const lb = player('US', 'LB', 70, { age: 31, contract: { salary: 6, yearsLeft: 1, guaranteed: 0 } } as Partial<Player>);
const kid = player('US', 'CB', 74, { age: 23, potential: 86 } as Partial<Player>);
players.push(star, wr, lb, kid);
const us = teams[0];
const roster = players.filter(p => p.teamId === 'US');

// US (seed 3) lost its wild card game to B.
const seeds = { AC: ['C', 'E', 'US', 'G', 'A1', 'A2', 'A3'], NC: ['B', 'D', 'F', 'H', 'N1', 'N2', 'N3'] };
const bracket = [
  { id: 'wc1', round: 1, homeTeamId: 'B', awayTeamId: 'US', homeScore: 27, awayScore: 20, winnerId: 'B' },
  { id: 'championship', round: 4, homeTeamId: null, awayTeamId: null },
] as unknown as PlayoffMatchup[];

describe('one episode for the end of the season', () => {
  it('keeps one episode key from the playoff exit through the whole offseason', () => {
    const keys = (['playoffs', 'resigning', 'draft', 'freeAgency'] as const).map(phase => {
      const narrative = detectNarrativeMoment(phase, 19, 12, bracket, 'US', seeds);
      expect(narrative).toBe('seasonOver');
      return boothEpisodeKey(2026, 19, phase, bracket, 'US', narrative);
    });
    expect(new Set(keys).size).toBe(1);
    // A new season is a new episode, and the season wrap is per team.
    expect(boothEpisodeKey(2027, 1, 'preseason', null, 'US', 'preseason')).not.toBe(keys[0]);
    expect(boothEpisodeKey(2026, 19, 'resigning', bracket, 'B', 'seasonOver')).not.toBe(keys[0]);
  });

  it('still makes each playoff game a new episode while the team is alive', () => {
    const before = boothEpisodeKey(2026, 19, 'playoffs', [], 'US', 'playoffsStart');
    const after = boothEpisodeKey(2026, 19, 'playoffs', [{ winnerId: 'US', homeTeamId: 'US', awayTeamId: 'B' }], 'US', 'playoffsStart');
    expect(before).not.toBe(after);
  });
});

describe('the offseason preview', () => {
  const o = computeOffseasonOutlook(us, teams, players, 'playoffs');

  it('finds the re-signing calls, the money, the draft and the holes', () => {
    expect(o.expiring.map(p => p.name)).toEqual([star, wr, lb].map(p => `${p.firstName} ${p.lastName}`));
    expect(o.expiringCount).toBe(3);
    expect(o.expiringSalary).toBe(58);
    expect(o.capSpace).toBe(25);
    expect(o.draft).toEqual({ year: 2027, picks: 3, firsts: 1, ownFirst: true });
    expect(o.needs[0]).toMatchObject({ pos: 'OL', rank: 8, of: 8 });
    expect(o.youngCore.map(p => p.id)).toEqual([kid.id]);
  });

  it('becomes the topic the season wrap closes on', () => {
    const t = offseasonPreviewTopic(us, o);
    expect(t.headline).toBe(OFFSEASON_PREVIEW_HEADLINE);
    const text = t.exchanges.map(e => e.text).join('\n');
    expect(text).toContain(`${star.firstName} ${star.lastName} (QB, 88 OVR, age 30)`);
    expect(text).toContain('$58M comes off the books');
    expect(text).toContain('$25M in cap space');
    expect(text).toMatch(/OL \(the starters rank 8th of 8/);
    expect(text).toContain('3 picks in the 2027 draft, including their own first-rounder');
    expect(text).toContain("If there's an OL worth it on the board");
    // Marcus and Tony both have notes, so the writer voices it.
    expect(new Set(t.exchanges.map(e => e.speakerId))).toEqual(new Set(['stats', 'hottake']));
  });

  it("doesn't count expiring money twice in re-signing (the payroll already left it out)", () => {
    const text = offseasonPreviewTopic(us, computeOffseasonOutlook(us, teams, players, 'resigning')).exchanges.map(e => e.text).join('\n');
    expect(text).not.toContain('comes off the books');
    expect(text).toContain('before they re-sign anybody');
  });

  it('is in the AI writer\'s data for the season-over episode', () => {
    const data = buildSpotlightTeamData({ team: us, roster, allTeams: teams, allPlayers: players, season: 2026, week: 19, phase: 'playoffs', narrative: 'seasonOver', playoffBracket: bracket, playoffSeeds: seeds });
    const outlook = data.offseasonOutlook as { expiringContracts: { name: string }[]; moneyComingOffBooks: string; biggestHoles: { pos: string }[] };
    expect(outlook.expiringContracts).toHaveLength(3);
    expect(outlook.moneyComingOffBooks).toBe('$58M');
    expect(outlook.biggestHoles[0].pos).toBe('OL');
  });

  it('closes the written season wrap after a playoff exit', () => {
    const topics = generateTeamSpotlight(us, roster, teams, players, 2026, 19, { phase: 'playoffs', playoffBracket: bracket, playoffSeeds: seeds });
    expect(topics[0].headline).toBe('Playoff Exit: Wild Card');
    expect(topics.at(-1)?.headline).toBe(OFFSEASON_PREVIEW_HEADLINE);
    // No in-season fan reactions ("they need a win") tacked onto the offseason.
    expect(topics.at(-1)?.exchanges.every(e => e.speakerId === 'stats' || e.speakerId === 'hottake')).toBe(true);
  });

  it('closes it for a team that missed the playoffs too', () => {
    const missed = { AC: seeds.AC.filter(id => id !== 'US'), NC: seeds.NC };
    const topics = generateTeamSpotlight(us, roster, teams, players, 2026, 19, { phase: 'playoffs', playoffBracket: bracket.slice(1), playoffSeeds: missed });
    expect(topics[0].headline).toBe('Missed the Playoffs');
    expect(topics.at(-1)?.headline).toBe(OFFSEASON_PREVIEW_HEADLINE);
  });
});

describe('the season-wrap video', () => {
  const topic = (headline: string, extra: Partial<ShowTopicInput> = {}): ShowTopicInput => ({
    headline, icon: '🏈', ...extra,
    exchanges: [{ speakerId: 'stats', text: `${headline}: the numbers.` }, { speakerId: 'hottake', text: `${headline}: the take.` }],
  });
  const game = [topic('Wild Card: US 20, B 27', { depth: 'deep' }), topic('Who showed up', { depth: 'deep' })];
  const stories = Array.from({ length: 5 }, (_, k) => topic(`Story ${k + 1}`));
  const preview = topic(OFFSEASON_PREVIEW_HEADLINE);

  it('recaps the last game, then the season, and ends on the offseason, no longer than any episode', () => {
    const capped = capShowTopics([...game, ...stories], [preview]);
    expect(capped.map(t => t.headline)).toEqual(['Wild Card: US 20, B 27', 'Who showed up', 'Story 1', 'Story 2', OFFSEASON_PREVIEW_HEADLINE]);
    expect(capped.filter(t => t.depth !== 'deep')).toHaveLength(SHOW_MAX_STORYLINES);
  });

  it('survives the server-side cap unchanged (same topics, same cached episode)', async () => {
    const topics = capShowTopics([...game, ...stories], [preview]);
    const ep = await parseEpisode(new Request('http://x/api/spotlight-show', { method: 'POST', body: JSON.stringify({ topics, teamName: 'City0 Club0' }) }));
    expect(ep?.topics.map(t => t.headline)).toEqual(topics.map(t => t.headline));
  });

  it('tells the writer it is the last episode and to close on the offseason', () => {
    const note = momentNote({ phase: 'playoffs', narrative: 'seasonOver' }, '9-8');
    expect(note).toMatch(/last episode/);
    expect(note).toContain(`"${OFFSEASON_PREVIEW_HEADLINE}"`);
    expect(note).toMatch(/no separate offseason show/);
    expect(hookLine('City0 Club0', '9-8', { phase: 'playoffs', narrative: 'seasonOver' }))
      .toBe("The season's in the books at nine and eight, and the offseason starts now. Today, the City0 Club0.");
  });
});

describe('the saved season wrap', () => {
  const wrap = (over: Partial<SeasonWrapEpisode> = {}): SeasonWrapEpisode => ({
    season: 2026, teamId: 'US', phase: 'playoffs', narrative: 'seasonOver', label: 'Season Wrap',
    topics: [], showTopics: [], game: [], closing: [], stats: null, ...over,
  });
  const st = () => useGameStore.getState();
  const t = (headline: string) => ({ headline, icon: '🏈', exchanges: [{ speakerId: 'stats' as const, text: headline }], teamIds: [], playerIds: [] });

  beforeEach(() => { useGameStore.setState({ season: 2026, userTeamId: 'US', seasonWrapEpisode: null }); });

  it('replays in the offseason, and the video stays fixed once watched', () => {
    const saved = wrap();
    expect(seasonWrapFor(saved, 2026, 'US')).toBe(saved);
    expect(seasonWrapFor(saved, 2027, 'US')).toBeNull();
    expect(seasonWrapFor(saved, 2026, 'B')).toBeNull();
    expect(wrapTextFrozen(saved, 'playoffs')).toBe(false);
    expect(wrapShowFrozen(saved, 'playoffs')).toBe(false);
    expect(wrapTextFrozen(saved, 'resigning')).toBe(true);
    expect(wrapShowFrozen(saved, 'draft')).toBe(true);
    expect(wrapShowFrozen(wrap({ watched: true }), 'playoffs')).toBe(true);
    expect(wrapTextFrozen(wrap({ watched: true }), 'playoffs')).toBe(false);
  });

  it('keeps what the viewer watched while the written recap fills in', () => {
    st().saveSeasonWrapEpisode(wrap({ topics: [t('Template')], showTopics: [t('Template')], watched: true }));
    st().saveSeasonWrapEpisode(wrap({ topics: [t('AI 1'), t('AI 2')], showTopics: [t('AI 1'), t('AI 2')] }));
    const saved = st().seasonWrapEpisode!;
    expect(saved.watched).toBe(true);
    expect(saved.showTopics.map(x => x.headline)).toEqual(['Template']);
    expect(saved.topics.map(x => x.headline)).toEqual(['AI 1', 'AI 2']);
  });

  it('only saves for the league as it is now', () => {
    st().saveSeasonWrapEpisode(wrap({ season: 2025 }));
    st().saveSeasonWrapEpisode(wrap({ teamId: 'B' }));
    expect(st().seasonWrapEpisode).toBeNull();
  });
});
