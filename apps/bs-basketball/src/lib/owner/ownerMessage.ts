/**
 * Owner message generator (FEAT-4).
 *
 * Every offseason the user gets a short note from the team's owner reacting to
 * the season just played. Pure function — given the league state at the moment
 * the playoffs end, returns a structured message the awards page renders above
 * the trophies. Tone is keyed off four levers:
 *
 *   1. Playoff result (champion → first-round → missed)
 *   2. Wins vs. the baseline expectation (41 for a .500 push)
 *   3. Owner approval tier (safe / warm / hot / final warning)
 *   4. GM tenure length — first-year hires get latitude, vets get the heat
 *
 * Deterministic across reloads: every pool is keyed off a tiny hash of
 * (teamId, season, lever) so the same save always produces the same quote.
 * That keeps the message stable while the user toggles between pages.
 */

import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats, BasketballTeam } from '@bs/sport-basketball';
import { userPlayoffResult, type PlayoffResult } from '@/lib/approval/approval';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface OwnerMessage {
  /** "From the Owner's Desk — Mark Cuban" style header. */
  headline: string;
  /** Two short paragraphs reacting to the season. */
  body: string[];
  /** A one-line marching order for next year. */
  directive: string;
  /** Tone driver — used by the renderer to color the card. */
  tone: 'celebrate' | 'encourage' | 'level' | 'concern' | 'warning';
  /** True when the owner specifically calls out the job is at risk. */
  hotSeat: boolean;
}

// ============================================================================
// Deterministic seeding
// ============================================================================

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length];
}

// ============================================================================
// Owner name pool (made-up — generic but evocative)
// ============================================================================

const OWNER_NAMES: readonly string[] = [
  'Marcus Reeve', 'Allison Brody', 'Dean Whitfield', 'Vincent Patel', 'Greer Holcomb',
  'Sasha Lindgren', 'Theo Kasmar', 'Eleanor Whit', 'Davis Calloway', 'Margot Ostrov',
  'Rashid Ellis', 'Henry Blackwood', 'Tomás Riviera', 'Kira Sundberg', 'Wren Whitley',
];

function ownerNameFor(team: BasketballTeam, season: number): string {
  // Same owner sticks around per team across seasons — anchor on team id only.
  return pick(OWNER_NAMES, hash(`owner-${team.id}-${season > 0 ? 'v1' : 'v0'}`));
}

// ============================================================================
// Tone resolution
// ============================================================================

interface Context {
  team: BasketballTeam;
  ownerName: string;
  wins: number;
  losses: number;
  winsAboveLine: number;
  result: PlayoffResult;
  jobSecurity: BasketballTeam['approval']['jobSecurity'];
  tenureSeasons: number;
}

function toneFor(ctx: Context): OwnerMessage['tone'] {
  if (ctx.result === 'champion') return 'celebrate';
  if (ctx.jobSecurity === 'final_warning') return 'warning';
  if (ctx.jobSecurity === 'hot') return 'concern';
  if (ctx.result === 'finals') return 'celebrate';
  if (ctx.result === 'conf_finals' && ctx.winsAboveLine >= 0) return 'encourage';
  if (ctx.winsAboveLine >= 10) return 'encourage';
  if (ctx.winsAboveLine >= 0) return 'level';
  return 'concern';
}

// ============================================================================
// Phrase pools — each takes {team} for inline interpolation
// ============================================================================

const OPENERS: Record<OwnerMessage['tone'], readonly string[]> = {
  celebrate: [
    `What a ride. From day one of camp to the last horn of the Finals, this was the year {team} delivered.`,
    `I keep replaying that championship moment in my head. You earned every bit of it.`,
    `Banner season. The fans, the staff, the players — and you, the GM — pulled this off.`,
  ],
  encourage: [
    `Real progress this year. The arrow is pointing up and the building knows it.`,
    `That was a step forward — I felt it in the arena every night.`,
    `You moved the needle. Now we need to push through the next ceiling.`,
  ],
  level: [
    `Solid year. Not the year we want to write a book about, but a respectable one.`,
    `We held serve. That's worth something — but it isn't a banner.`,
    `A middle-of-the-pack season. Better than missed expectations, short of pleasing me.`,
  ],
  concern: [
    `I expected more than what we got. The numbers don't reflect this front office's ambition.`,
    `This wasn't the year we promised the fans. We need an honest look in the mirror.`,
    `You and I both know that wasn't good enough. Let's not pretend otherwise.`,
  ],
  warning: [
    `I'm going to be blunt: another year like this and we're going to be having a different conversation.`,
    `My patience is not infinite. This roster underperformed and you know it.`,
    `I respect you, but I answer to the fans and the books. We have to do better — or we won't.`,
  ],
};

const ACKS: Record<PlayoffResult, readonly string[]> = {
  champion: [
    `The Finals were a clinic — that close-out game in particular.`,
    `That coronation series will live in this town forever.`,
  ],
  finals: [
    `Going the distance to the Finals is no small thing.`,
    `We were two wins from a banner. That's a baseline now, not a peak.`,
  ],
  conf_finals: [
    `The Conference Finals run woke this fanbase up.`,
    `We took it to within a series of the Finals — that's the kind of season people remember.`,
  ],
  second_round: [
    `Surviving round one mattered, and you got that done.`,
    `The second-round exit stings, but advancing was progress.`,
  ],
  first_round: [
    `A first-round exit isn't where we want to be in late spring.`,
    `One-and-done in the playoffs isn't the headline I wanted in May.`,
  ],
  missed: [
    `Missing the playoffs entirely is hard to swallow at this payroll.`,
    `The lottery is not a destination — it's a detour.`,
  ],
};

const DIRECTIVES_BY_RESULT: Record<PlayoffResult, readonly string[]> = {
  champion: [
    'Repeat. Don\'t let this team get satisfied.',
    'Defend the title — and find one more piece while you\'re at it.',
  ],
  finals: [
    'Get us over the top. Identify the gap and close it this offseason.',
    'You were a series away from a parade. Find the difference.',
  ],
  conf_finals: [
    'Conference Finals is the floor now, not the ceiling. Push us through.',
    'Find the player who turns the Conference Finals into a Finals.',
  ],
  second_round: [
    'I want a top-4 seed and a Conference Finals appearance.',
    'Make the leap. Round two isn\'t a destination.',
  ],
  first_round: [
    'I want to see a playoff series win next year. Plain and simple.',
    'Get past the first round. No excuses.',
  ],
  missed: [
    'I want this team in the postseason next year. Period.',
    'End the lottery streak. We are not a development project.',
  ],
};

const DIRECTIVES_WARNING: readonly string[] = [
  'I\'m giving you one more swing at this. Make it count.',
  'You\'ve got one offseason to convince me this works.',
  'Show me a plan and a result — soon.',
];

const ROOKIE_GM_AKNOWLEDGE: readonly string[] = [
  `It's your first season in this chair and I know that matters. I'll give you the runway.`,
  `Year one is for finding the room and the rhythm. You did that.`,
];

// ============================================================================
// Build the message
// ============================================================================

export function buildOwnerMessage(league: LeagueState, season: number): OwnerMessage | null {
  const teamId = league.userTeamId as TeamId | null;
  if (!teamId) return null;
  const team = (league.teams.find(t => t.id === teamId) as BasketballTeam | undefined);
  if (!team) return null;

  const wins = team.record.wins;
  const losses = team.record.losses;
  const winsAboveLine = wins - 41; // matches EXPECTED_WINS in approval.ts
  const result = userPlayoffResult(league, teamId);
  const jobSecurity = team.approval.jobSecurity;
  // Tenure length — defaults to current season if missing on old saves.
  const sd = league.sportData as { gmTenureStartSeason?: number };
  const tenureStart = sd.gmTenureStartSeason ?? season;
  const tenureSeasons = season - tenureStart + 1;

  const ownerName = ownerNameFor(team, season);
  const ctx: Context = { team, ownerName, wins, losses, winsAboveLine, result, jobSecurity, tenureSeasons };
  const tone = toneFor(ctx);

  // Seeds — distinct per pool so phrases vary independently
  const seed = (suffix: string) => hash(`${team.id}-${season}-${suffix}`);

  const openerPool = OPENERS[tone];
  const ackPool = ACKS[result];
  const directivePool = tone === 'warning' ? DIRECTIVES_WARNING : DIRECTIVES_BY_RESULT[result];

  const opener = pick(openerPool, seed('open')).replace('{team}', team.name);
  const ack = pick(ackPool, seed('ack'));

  const body: string[] = [opener, ack];

  // Rookie-GM grace pad: insert an acknowledgment in mid-tone messages
  if (tenureSeasons <= 1 && (tone === 'concern' || tone === 'level')) {
    body.push(pick(ROOKIE_GM_AKNOWLEDGE, seed('rookie')));
  }

  // Record context — gives the message numeric grounding
  const recordLine =
    winsAboveLine >= 15 ? `${wins}-${losses} is the kind of regular season we plan around.`
    : winsAboveLine >= 0 ? `${wins}-${losses} is respectable, but I'm planning around bigger.`
    : winsAboveLine >= -8 ? `${wins}-${losses} is below where I want this franchise to live.`
    : `${wins}-${losses} cannot become the norm.`;
  body.push(recordLine);

  const directive = pick(directivePool, seed('dir'));

  const headline = `From the Owner's Desk — ${ownerName}`;
  const hotSeat = tone === 'warning' || jobSecurity === 'final_warning';

  return { headline, body, directive, tone, hotSeat };
}
