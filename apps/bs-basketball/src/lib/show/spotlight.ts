/**
 * Team Spotlight — a recurring two-persona talk show (spec P1.2 + 2.1).
 *
 * A weekly episode of "Hoops Tonight" hosted by an analytics voice (Marcus
 * Beale) and a hot-take voice (Jax Maddox), built from the same league-moment
 * feed that powers Buzz/News plus the live MVP race. Each storyline gets a
 * short back-and-forth: the analyst cites the numbers, the take overreacts.
 * Fully derived + deterministic (seeded off week + story id) — no persistence,
 * refreshes as the calendar advances.
 */

import { buildFeed, type FeedItem, type FeedKind } from '../feed/buildFeed';
import { scoringLeaders } from '../dashboard/editorial';
import { buildRivalryEvents } from '../rivalries/rivalries';
import type { BasketballLeagueState } from '../persistence/db';
import type { BasketballTeam } from '@bs/sport-basketball';

export type SpotlightVoice = 'analyst' | 'take';

export const SPOTLIGHT_HOSTS: Record<SpotlightVoice, { name: string; avatar: string; tagline: string }> = {
  analyst: { name: 'Marcus Beale', avatar: '🤓', tagline: 'the numbers' },
  take: { name: 'Jax Maddox', avatar: '🔥', tagline: 'the takes' },
};

export interface SpotlightExchange { voice: SpotlightVoice; line: string }
export type StoryCategory = 'Statement' | 'Upset' | 'Breakout' | 'Streak' | 'Discipline' | 'MVP Race' | 'Rivalry' | 'Your Team';

export interface SpotlightStory {
  id: string;
  category: StoryCategory;
  headline: string;
  exchanges: SpotlightExchange[];
  playerId?: string;
  gameId?: string;
}

export interface SpotlightEpisode {
  week: number;
  title: string;
  hosts: typeof SPOTLIGHT_HOSTS;
  stories: SpotlightStory[];
}

const DAYS_PER_WEEK = 7;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pick<T>(arr: T[], seed: number): T { return arr[((seed % arr.length) + arr.length) % arr.length]; }

const CATEGORY_OF: Partial<Record<FeedKind, StoryCategory>> = {
  big_game: 'Statement',
  upset: 'Upset',
  career_night: 'Breakout',
  streak: 'Streak',
  suspension: 'Discipline',
  fine: 'Discipline',
};

/** Two-voice dialogue for a feed-derived storyline. */
function exchangesFor(cat: StoryCategory, headline: string, seed: number): SpotlightExchange[] {
  const a = (lines: string[]) => ({ voice: 'analyst' as const, line: pick(lines, seed) });
  const t = (lines: string[]) => ({ voice: 'take' as const, line: pick(lines, seed >> 3) });
  switch (cat) {
    case 'Statement':
      return [
        a([`${headline}. The margins tell the story — they won every quarter but the third.`, `${headline}. Efficient on both ends, that's a repeatable formula.`]),
        t([`REPEATABLE?? THAT WAS A STATEMENT. PRINT THE PLAYOFF TICKETS RIGHT NOW.`, `I'VE SEEN ENOUGH. THIS IS THE BEST TEAM IN THE LEAGUE AND IT'S NOT CLOSE.`]),
        a([`It's one game, Jax. Let's see it against a winning team.`, `Sample size of one. But yes — encouraging.`]),
      ];
    case 'Upset':
      return [
        a([`${headline}. The favorite settled for jumpers and got punished in transition.`, `${headline}. Upsets like this usually trace to one bad shot-selection night.`]),
        t([`UPSET?! NO SUCH THING. THE \"FAVORITE\" IS A FRAUD AND WE ALL KNEW IT.`, `BURN THE SEEDINGS. CHAOS REIGNS. I LOVE THIS LEAGUE.`]),
      ];
    case 'Breakout':
      return [
        a([`${headline}. The usage spiked and the efficiency held — that's the real signal.`, `${headline}. Career night, but the shot profile says it's sustainable.`]),
        t([`SUSTAINABLE?! HE'S A SUPERSTAR NOW. ALL-NBA. MVP. GIVE HIM THE KEYS.`, `I'M TRADING MY WHOLE TEAM FOR THIS GUY. WRITE IT DOWN.`]),
        a([`Let's pump the brakes — one box score isn't a career.`, `He's good. Let's not coronate him in November.`]),
      ];
    case 'Streak':
      return [
        a([`${headline}. Streaks are fragile — schedule strength matters more than momentum.`, `${headline}. The underlying net rating supports it, which is the part that lasts.`]),
        t([`MOMENTUM IS REAL AND THEY ARE UNSTOPPABLE. CANCEL THE REST OF THE SEASON.`, `THIS IS A DYNASTY FORMING IN REAL TIME. YOU'RE WATCHING HISTORY.`]),
      ];
    case 'Discipline':
      return [
        a([`${headline}. Availability is a skill — that's a real cost to the rotation.`, `${headline}. The team has to absorb those minutes elsewhere now.`]),
        t([`SUSPEND HIM LONGER! ACTUALLY NO — FREE HIM. I CAN'T DECIDE BUT I'M FURIOUS.`, `THIS CHANGES EVERYTHING. THE WHOLE SEASON HINGES ON THIS. PROBABLY.`]),
      ];
    case 'MVP Race':
      return [
        a([`${headline} — the efficiency and volume both check out at the top of the ladder.`, `${headline}. If the team keeps winning, the narrative writes itself.`]),
        t([`RACE? IT'S OVER. ENGRAVE THE TROPHY. EVERYONE ELSE IS PLAYING FOR SECOND.`, `MVP, FINALS MVP, MAYOR OF THE CITY. GIVE HIM ALL OF IT.`]),
      ];
    case 'Your Team':
      return [
        a([`${headline}. For your club, the takeaway is the process — good looks, sound defense.`, `${headline}. Trends in the right direction if the role players hold up.`]),
        t([`YOUR TEAM IS GOING ALL THE WAY. I BELIEVE. DO YOU BELIEVE? BELIEVE.`, `THIS IS THE YEAR. I FEEL IT IN MY BONES. RING SZN.`]),
      ];
    case 'Rivalry':
      return [
        a([`${headline}. Division games carry extra weight — they swing tiebreakers and seeding.`, `${headline}. Familiarity breeds intensity; both benches were standing all night.`]),
        t([`THIS IS WHAT IT'S ALL ABOUT. PURE HATRED. I LOVE IT. RUN IT BACK TOMORROW.`, `THEY DON'T LIKE EACH OTHER AND IT SHOWS. BEST RIVALRY IN THE LEAGUE.`]),
      ];
  }
}

function dayOf(item: FeedItem): number { return Math.floor(item.day); }
function gameDay(g: BasketballLeagueState['games'][number]): number {
  return (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;
}

/**
 * Always-on "Your Team" storyline built straight from the user's last result +
 * recent form — so the spotlight leads with the user's club even on a routine
 * night the news feed didn't flag. Null only before the user has played.
 */
function userTeamStory(league: BasketballLeagueState, userId: string): SpotlightStory | null {
  const teamById = new Map((league.teams as BasketballTeam[]).map(t => [t.id as string, t]));
  const team = teamById.get(userId);
  if (!team) return null;

  const games = league.games
    .filter(g => g.status === 'played' && g.finalScore && (g.homeTeamId === userId || g.awayTeamId === userId))
    .sort((a, b) => gameDay(b) - gameDay(a));
  if (games.length === 0) return null;

  const resultOf = (g: typeof games[number]) => {
    const home = g.homeTeamId === userId;
    const us = home ? g.finalScore!.home : g.finalScore!.away;
    const them = home ? g.finalScore!.away : g.finalScore!.home;
    return { home, us, them, won: us > them, oppId: home ? g.awayTeamId : g.homeTeamId };
  };

  const last = games[0];
  const r = resultOf(last);
  const opp = teamById.get(r.oppId);
  const oppName = opp ? `${opp.city} ${opp.name}` : 'their opponent';

  // Current streak + last-5 form, newest-first.
  let streak = 0;
  for (const g of games) { if (resultOf(g).won === r.won) streak++; else break; }
  const last5 = games.slice(0, 5);
  const w5 = last5.filter(g => resultOf(g).won).length;

  const verb = r.won
    ? pick(['took down', 'beat', 'handled', 'knocked off'], hash(last.id))
    : pick(['fell to', 'dropped one to', 'lost to', 'came up short against'], hash(last.id));
  const form = streak >= 3
    ? ` — ${streak} straight ${r.won ? 'wins' : 'losses'}`
    : ` — ${w5}-${last5.length - w5} over their last ${last5.length}`;
  const headline = `${team.city} ${verb} the ${oppName} ${r.us}–${r.them}${form}`;

  return {
    id: `your-team-${last.id}`,
    category: 'Your Team',
    headline,
    exchanges: exchangesFor('Your Team', headline, hash(last.id)),
    gameId: last.id,
  };
}

/** Build the current week's episode, or null before any games are played. */
export function buildSpotlight(league: BasketballLeagueState | null): SpotlightEpisode | null {
  if (!league) return null;
  const feed = buildFeed(league).filter(i => i.kind !== 'schedule_notice');
  const today = league.currentTick;
  const week = Math.max(1, Math.floor(today / DAYS_PER_WEEK));
  const weekStart = (week - 1) * DAYS_PER_WEEK;

  // Storylines from this week's moments (fall back to the most recent if a
  // quiet week), newest first, de-duplicated by kind so the show stays varied.
  const thisWeek = feed.filter(i => dayOf(i) >= weekStart);
  const pool = (thisWeek.length ? thisWeek : feed).sort((a, b) => b.day - a.day);

  const stories: SpotlightStory[] = [];
  const seenCats = new Set<StoryCategory>();
  const userId = league.userTeamId;

  // Always lead with the user team. Prefer a flagged moment about them (a
  // career night / blowout the feed surfaced); otherwise synthesize from their
  // last result so the user's club still headlines on a quiet night.
  if (userId) {
    const mine = pool.find(i => i.gameId && league.games.some(g => g.id === i.gameId && (g.homeTeamId === userId || g.awayTeamId === userId)));
    if (mine) {
      stories.push({ id: `your-${mine.id}`, category: 'Your Team', headline: mine.headline, exchanges: exchangesFor('Your Team', mine.headline, hash(mine.id)), playerId: mine.playerId, gameId: mine.gameId });
    } else {
      const synth = userTeamStory(league, userId);
      if (synth) stories.push(synth);
    }
  }

  for (const item of pool) {
    if (stories.length >= 5) break;
    const cat = CATEGORY_OF[item.kind];
    if (!cat || seenCats.has(cat)) continue;
    seenCats.add(cat);
    stories.push({ id: item.id, category: cat, headline: item.headline, exchanges: exchangesFor(cat, item.headline, hash(item.id)), playerId: item.playerId, gameId: item.gameId });
  }

  // A rivalry beat — prefer one involving the user's team.
  if (stories.length < 5) {
    const rivalries = buildRivalryEvents(league);
    const riv = (userId && rivalries.find(r => r.homeTeamId === userId || r.awayTeamId === userId)) || rivalries[0];
    if (riv) {
      stories.push({ id: `riv-${riv.id}`, category: 'Rivalry', headline: riv.headline, exchanges: exchangesFor('Rivalry', riv.headline, hash(riv.id)), gameId: riv.gameId });
    }
  }

  // Always close on the MVP race if we have leaders.
  const leaders = scoringLeaders(league, 1);
  if (leaders.length && stories.length < 6) {
    const l = leaders[0];
    const headline = `${l.name} (${l.teamAbbr}) leads the MVP conversation at ${l.ppg.toFixed(1)} a night`;
    stories.push({ id: `mvp-${week}-${l.id}`, category: 'MVP Race', headline, exchanges: exchangesFor('MVP Race', headline, hash(`mvp-${l.id}`)), playerId: l.id });
  }

  if (stories.length === 0) return null;
  return { week, title: `Hoops Tonight · Week ${week}`, hosts: SPOTLIGHT_HOSTS, stories };
}
