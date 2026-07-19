/**
 * Debate Engine — "Gridiron Debate"
 *
 * Transforms weekly RecapSegments into a back-and-forth debate transcript
 * between two fictional commentators with distinct personalities.
 *
 * - Marcus Cole 🤓 (stats/analytics)
 * - Tony "The Torch" Blaze 🔥 (hot takes)
 *
 * 100% client-side, template-driven, no LLM/API calls.
 * Uses seeded randomization for deterministic output per week.
 */

import type { RecapSegmentData, Team, Player, Position, PlayoffMatchup, DraftSelection, PlayerStats } from '@/types';

/* ─── Types ─── */

export interface DebateExchange {
  speakerId: 'stats' | 'hottake' | 'fans' | 'player';
  text: string;
  /** Player name for social media posts */
  playerName?: string;
}

export interface DebateTopic {
  headline: string;
  icon: string;
  exchanges: DebateExchange[];
  teamIds: string[];
  playerIds: string[];
  /** Context line from the recap segment (e.g. stat line, score) shown under the headline */
  context?: string;
}

export interface DebateTranscript {
  season: number;
  week: number;
  topics: DebateTopic[];
}

export interface Commentator {
  id: 'stats' | 'hottake';
  name: string;
  title: string;
  avatar: string;
  color: string;
}

export const COMMENTATORS: Record<'stats' | 'hottake', Commentator> = {
  stats: {
    id: 'stats',
    name: 'Marcus Cole',
    title: 'Senior Analytics Correspondent',
    avatar: '🤓',
    color: 'blue',
  },
  hottake: {
    id: 'hottake',
    name: 'Tony Blaze',
    title: 'Lead Hot Take Analyst',
    avatar: '🔥',
    color: 'red',
  },
};

/* ─── Seeded Random ─── */

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 4294967296);
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/* ─── Context Building ─── */

interface TemplateContext {
  segment: RecapSegmentData;
  teams: { id: string; name: string; city: string; fullName: string; abbr: string; record: string; wins: number; losses: number; streak: number }[];
  players: { id: string; name: string; firstName: string; lastName: string; position: string; teamAbbr: string }[];
  /** Numbers extracted from body text */
  numbers: number[];
  rng: () => number;
}

function buildContext(
  segment: RecapSegmentData,
  allTeams: Team[],
  allPlayers: Player[],
  rng: () => number,
): TemplateContext {
  const teams = segment.teamIds.map(id => {
    const t = allTeams.find(tm => tm.id === id);
    return t ? {
      id: t.id,
      name: t.name,
      city: t.city,
      fullName: `${t.city} ${t.name}`,
      abbr: t.abbreviation,
      record: `${t.record.wins}-${t.record.losses}`,
      wins: t.record.wins,
      losses: t.record.losses,
      streak: t.record.streak,
    } : null;
  }).filter(Boolean) as TemplateContext['teams'];

  const players = segment.playerIds.map(id => {
    const p = allPlayers.find(pl => pl.id === id);
    const t = p ? allTeams.find(tm => tm.id === p.teamId) : null;
    return p ? {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position,
      teamAbbr: t?.abbreviation ?? '???',
    } : null;
  }).filter(Boolean) as TemplateContext['players'];

  // Extract all numbers from body text
  const numbers = (segment.body.match(/\d+/g) ?? []).map(Number);

  return { segment, teams, players, numbers, rng };
}

/* ─── Filler Phrases ─── */

const MARCUS_OPENERS = [
  'Look, the data is clear here.',
  'If you look at the numbers...',
  'Let me break this down analytically.',
  'The analytics tell an interesting story.',
  "Here's what the numbers say.",
  'From a statistical standpoint,',
  'The advanced metrics are fascinating here.',
];

const TONY_OPENERS = [
  "Oh come ON, Marcus!",
  'Are you SERIOUS right now?!',
  "I don't need a spreadsheet to tell me that!",
  'Forget the numbers for a second!',
  'You analytics guys crack me up.',
  'Did you even WATCH the game?!',
  "Here's what your numbers DON'T tell you —",
];

const MARCUS_CONCESSIONS = [
  "I'll give you that one, Tony.",
  "Fair point, but consider this —",
  "You're not entirely wrong, but —",
  "Even I have to admit —",
  "The numbers actually support part of your take —",
];

const TONY_DISMISSALS = [
  "That's exactly my point!",
  "THANK you! Finally!",
  "See? Even the stats nerd agrees with me!",
  "I've been saying this for WEEKS!",
  "This is what happens when you actually watch football!",
];

/* ─── Template Pools ─── */

type TemplateFunc = (ctx: TemplateContext) => DebateExchange[];

// --- UPSET templates ---
const upsetTemplates: TemplateFunc[] = [
  (ctx) => {
    const winner = ctx.teams[0];
    const loser = ctx.teams[1];
    const player = ctx.players[0];
    return [
      { speakerId: 'hottake', text: `${winner?.fullName ?? 'That team'} just sent SHOCKWAVES through this league! Nobody — and I mean NOBODY — saw this coming. The ${loser?.fullName ?? 'favorites'} got absolutely EMBARRASSED!` },
      { speakerId: 'stats', text: `${pick(MARCUS_OPENERS, ctx.rng)} The ${winner?.fullName ?? 'winners'} actually had a top-10 defensive efficiency rating coming in. This wasn't as random as it looks on paper.` },
      { speakerId: 'hottake', text: `Paper?! PAPER?! This was a statement game! ${player ? `${player.name} went out there and DOMINATED.` : 'They wanted it more, plain and simple.'} I'm telling you, the ${loser?.name ?? 'losers'} are in SERIOUS trouble.` },
      { speakerId: 'stats', text: `One game doesn't make a trend, Tony. The ${loser?.fullName ?? 'losers'} are still ${loser?.record ?? '?'}. Let's pump the brakes a bit.` },
    ];
  },
  (ctx) => {
    const winner = ctx.teams[0];
    const loser = ctx.teams[1];
    return [
      { speakerId: 'stats', text: `${pick(MARCUS_OPENERS, ctx.rng)} The ${winner?.fullName ?? 'winners'} winning here actually makes sense when you dig into the matchup data. They had scheme advantages on both sides of the ball.` },
      { speakerId: 'hottake', text: `Scheme advantages?! Marcus, the ${loser?.fullName ?? 'favorites'} just got PUNKED on national television! Stop trying to explain everything with your little charts!` },
      { speakerId: 'stats', text: `I understand the emotion, but the ${winner?.name ?? 'winners'} are ${winner?.record ?? '?'} for a reason. They're better than people give them credit for.` },
      { speakerId: 'hottake', text: `You know what? If the ${loser?.name ?? 'losers'} lose next week too, I'm officially calling their season OVER. Mark my words!` },
    ];
  },
  (ctx) => {
    const winner = ctx.teams[0];
    const loser = ctx.teams[1];
    const player = ctx.players[0];
    return [
      { speakerId: 'hottake', text: `I have THREE words for the ${loser?.fullName ?? 'favorites'}: WAKE. UP. CALL. You CANNOT sleepwalk through this league and expect to win!` },
      { speakerId: 'stats', text: `${pick(MARCUS_CONCESSIONS, ctx.rng)} the ${loser?.name ?? 'losers'} did look flat. But let's give credit to ${winner?.city ?? 'the winners'} — ${player ? `${player.name} was incredible` : 'they executed their game plan perfectly'}.` },
      { speakerId: 'hottake', text: `Credit?! I've been POUNDING the table about ${winner?.city ?? 'that team'} being a dark horse. Everyone laughed at me. Who's laughing NOW?!` },
    ];
  },
  (ctx) => {
    const winner = ctx.teams[0];
    const loser = ctx.teams[1];
    return [
      { speakerId: 'stats', text: `This is actually a fascinating result. The ${loser?.fullName ?? 'favorites'} were ${loser?.record ?? '?'} coming in, but their point differential suggested they were due for a correction.` },
      { speakerId: 'hottake', text: `"Due for a correction" — listen to yourself! The ${winner?.fullName ?? 'winners'} just beat the brakes off a supposed contender! Sometimes the eye test is more valuable than your precious models!` },
      { speakerId: 'stats', text: `The matchup data actually favored the ${ctx.teams[0]?.name ?? 'winners'} more than people realized. Sometimes "upsets" are only upsets to those who weren't paying attention.` },
      { speakerId: 'hottake', text: `A COIN FLIP?! Tell that to the ${loser?.name ?? 'losers'} fans who just watched their team quit in the fourth quarter!` },
    ];
  },
];

// --- COMEBACK templates ---
const comebackTemplates: TemplateFunc[] = [
  (ctx) => {
    const winner = ctx.teams[0];
    const loser = ctx.teams[1];
    const player = ctx.players[0];
    return [
      { speakerId: 'hottake', text: `THAT was the GREATEST comeback I've seen in YEARS! The ${winner?.fullName ?? 'winners'} were DEAD. Buried. And they came ROARING back!` },
      { speakerId: 'stats', text: `It was impressive, I'll admit. ${player ? `${player.name} was phenomenal in the second half.` : 'Their second-half adjustments were textbook.'} Teams rarely come back from deficits like that — it takes a special kind of resilience.` },
      { speakerId: 'hottake', text: `5%?! That's because most teams don't have HEART like the ${winner?.name ?? 'winners'}! You can't measure heart with analytics, Marcus!` },
      { speakerId: 'stats', text: `Actually, second-half scoring efficiency IS measurable, and theirs was elite today.` },
    ];
  },
  (ctx) => {
    const winner = ctx.teams[0];
    const loser = ctx.teams[1];
    const player = ctx.players[0];
    return [
      { speakerId: 'stats', text: `What a game. The ${winner?.fullName ?? 'winners'} completely flipped the script in the second half. ${player ? `${player.name} was the catalyst — his numbers after halftime were off the charts.` : 'Their adjustments were remarkable.'}` },
      { speakerId: 'hottake', text: `You wanna know what happened at halftime? Someone in that locker room said "ENOUGH." That's leadership. That's culture. That's something your spreadsheets will NEVER capture!` },
      { speakerId: 'stats', text: `${pick(MARCUS_CONCESSIONS, ctx.rng)} momentum is real. The win probability chart for this game was a rollercoaster.` },
    ];
  },
  (ctx) => {
    const winner = ctx.teams[0];
    const loser = ctx.teams[1];
    return [
      { speakerId: 'hottake', text: `I need to talk about the ${loser?.fullName ?? 'losers'} choking this game away. You're up BIG at the half and you let it slip?! That's a coaching problem. Period.` },
      { speakerId: 'stats', text: `That's harsh. The ${winner?.fullName ?? 'winners'} made adjustments and executed. Sometimes it's not about one team failing — it's about the other team being great.` },
      { speakerId: 'hottake', text: `Great?! They were losing by multiple scores! The ${loser?.name ?? 'losers'} had this game WRAPPED UP and they let them walk right back in. Inexcusable!` },
      { speakerId: 'stats', text: `Late-game collapses often correlate with depth issues. I'd look at their snap counts before pointing fingers at coaching.` },
    ];
  },
  (ctx) => {
    const winner = ctx.teams[0];
    const player = ctx.players[0];
    return [
      { speakerId: 'hottake', text: `${player ? `${player.name}` : `The ${winner?.name ?? 'winners'} quarterback`} is a STONE COLD KILLER. Down huge at the half and he never flinched. That's a franchise player right there!` },
      { speakerId: 'stats', text: `${pick(MARCUS_OPENERS, ctx.rng)} ${player ? `${player.name}'s` : "Their"} second-half passer rating was probably off the charts. That kind of performance under pressure is genuinely rare.` },
      { speakerId: 'hottake', text: `${pick(TONY_DISMISSALS, ctx.rng)} Sometimes greatness doesn't need a stat line to explain it!` },
    ];
  },
];

// --- BLOWOUT templates ---
const blowoutTemplates: TemplateFunc[] = [
  (ctx) => {
    const winner = ctx.teams[0];
    const loser = ctx.teams[1];
    return [
      { speakerId: 'hottake', text: `The ${winner?.fullName ?? 'winners'} absolutely DESTROYED the ${loser?.name ?? 'opponents'}! That wasn't a football game — that was a CRIME SCENE!` },
      { speakerId: 'stats', text: `It was a complete mismatch. The ${winner?.name ?? 'winners'} dominated time of possession, turnover margin, and third-down conversion rate. A clean sweep of every key metric.` },
      { speakerId: 'hottake', text: `Key metrics? How about the SCOREBOARD! That's the only metric I need!` },
    ];
  },
  (ctx) => {
    const winner = ctx.teams[0];
    const loser = ctx.teams[1];
    return [
      { speakerId: 'stats', text: `This game was effectively over by the second quarter. The ${winner?.fullName ?? 'winners'} controlled every phase of the game from the opening whistle.` },
      { speakerId: 'hottake', text: `I'm actually worried about the ${loser?.fullName ?? 'losers'}. Getting blown out like that does something to a team's SOUL. They might not recover from this for weeks.` },
      { speakerId: 'stats', text: `Blowout losses can go either way. Some teams use them as a wake-up call, others spiral. It depends on the locker room culture and the coaching staff's ability to refocus.` },
      { speakerId: 'hottake', text: `And based on what I saw out there?! That team does NOT have the culture to bounce back! They QUIT!` },
    ];
  },
  (ctx) => {
    const winner = ctx.teams[0];
    const loser = ctx.teams[1];
    return [
      { speakerId: 'hottake', text: `If I'm the ${loser?.fullName ?? 'losing team'}, I'm looking in the mirror after that embarrassment. That was flat-out UNACCEPTABLE.` },
      { speakerId: 'stats', text: `${pick(MARCUS_OPENERS, ctx.rng)} the ${winner?.name ?? 'winners'} are ${winner?.record ?? '?'} now and their point differential is elite. This is a legitimate contender.` },
      { speakerId: 'hottake', text: `Legitimate?! They're a JUGGERNAUT! Book them for the playoffs RIGHT NOW!` },
    ];
  },
];

// --- SHOOTOUT templates ---
const shootoutTemplates: TemplateFunc[] = [
  (ctx) => {
    const t0 = ctx.teams[0];
    const t1 = ctx.teams[1];
    const player = ctx.players[0];
    const player2 = ctx.players[1];
    return [
      { speakerId: 'hottake', text: `WHAT A GAME! That was ELECTRIC! ${player ? `${player.name}` : t0?.city ?? 'One quarterback'} vs ${player2 ? `${player2.name}` : t1?.city ?? 'the other'} was appointment television!` },
      { speakerId: 'stats', text: `Incredible entertainment, terrible defense. Combined, these two offenses put up a ridiculous number of points. Neither defense could get a stop when it mattered.` },
      { speakerId: 'hottake', text: `Who CARES about defense?! Fans want TOUCHDOWNS! That's what makes this sport great!` },
      { speakerId: 'stats', text: `Sure, but neither of these teams is winning a championship with defense that porous. You need balance to win in the postseason.` },
    ];
  },
  (ctx) => {
    const player = ctx.players[0];
    const player2 = ctx.players[1];
    return [
      { speakerId: 'stats', text: `${pick(MARCUS_OPENERS, ctx.rng)} Both quarterbacks were exceptional today. ${player ? `${player.name}` : 'The home QB'} and ${player2 ? `${player2.name}` : 'the road QB'} combined for some absurd yardage totals.` },
      { speakerId: 'hottake', text: `This is what happens when two GUNSLINGERS go head to head! No fear, no holding back, just PURE FOOTBALL!` },
      { speakerId: 'stats', text: `${pick(MARCUS_CONCESSIONS, ctx.rng)} it was entertaining. But from an efficiency standpoint, both defenses need serious evaluation.` },
    ];
  },
  (ctx) => {
    const t0 = ctx.teams[0];
    const t1 = ctx.teams[1];
    return [
      { speakerId: 'hottake', text: `If you turned off the ${t0?.city ?? 'home team'}-${t1?.city ?? 'away team'} game early, you MISSED OUT. That was an instant classic!` },
      { speakerId: 'stats', text: `It was high-scoring, no question. But games like this are often more about defensive breakdowns than offensive brilliance. The turnover battle told the real story.` },
      { speakerId: 'hottake', text: `You are IMPOSSIBLE to watch games with, you know that?! Just enjoy the show for once!` },
    ];
  },
];

// --- DEFENSIVE templates ---
const defensiveTemplates: TemplateFunc[] = [
  (ctx) => {
    const t0 = ctx.teams[0];
    const player = ctx.players[0];
    return [
      { speakerId: 'stats', text: `Now THIS is the kind of game I love. Low-scoring, physical, every yard earned. ${player ? `${player.name} was an absolute force on defense.` : 'Both defenses were suffocating.'}` },
      { speakerId: 'hottake', text: `Marcus, nobody wants to watch a 10-6 game. This was PAINFUL. I almost fell asleep in my chair!` },
      { speakerId: 'stats', text: `This is championship-caliber football, Tony. Playoff games are won by defenses. The ${t0?.fullName ?? 'winners'} showed they can win a grind-it-out battle.` },
      { speakerId: 'hottake', text: `Championship? If this is what the championship looks like, I'm watching basketball!` },
    ];
  },
  (ctx) => {
    const player = ctx.players[0];
    return [
      { speakerId: 'hottake', text: `I need to apologize to anyone who sat through that entire game. That was BRUTAL to watch. Where was the offense?!` },
      { speakerId: 'stats', text: `${pick(MARCUS_OPENERS, ctx.rng)} that was elite-level defensive football. ${player ? `${player.name}'s impact was undeniable —` : 'Both teams'} made it impossible for the opposing offense to get anything going.` },
      { speakerId: 'hottake', text: `I respect defense, I really do. But you've gotta score points to WIN GAMES!` },
    ];
  },
  (ctx) => {
    const t0 = ctx.teams[0];
    const player = ctx.players[0];
    return [
      { speakerId: 'stats', text: `Defensive efficiency at its finest. The ${t0?.fullName ?? 'winning team'} held the opponent to one of the lowest point totals we've seen all season. ${player ? `${player.name} was everywhere.` : ''}` },
      { speakerId: 'hottake', text: `You know what, I'll give credit where it's due. That was a DOMINANT defensive performance. ${player ? `${player.name} is a MONSTER.` : 'Those guys were flying around.'}` },
      { speakerId: 'stats', text: `${pick(TONY_DISMISSALS, ctx.rng).replace('stats nerd', 'hot take artist')} Wait — did you just agree with me?` },
      { speakerId: 'hottake', text: `Don't get used to it!` },
    ];
  },
];

// --- PERFORMANCE templates ---
const performanceTemplates: TemplateFunc[] = [
  (ctx) => {
    const player = ctx.players[0];
    const team = ctx.teams[0];
    return [
      { speakerId: 'hottake', text: `${player?.name ?? 'That player'} just put on a MASTERCLASS. If you're not talking about ${player?.lastName ?? 'him'} as an MVP candidate, you're not paying attention!` },
      { speakerId: 'stats', text: `It was an elite performance, no doubt. ${player?.name ?? 'He'} was efficient in every metric that matters. ${team ? `The ${team.name} offense ran through ${player?.lastName ?? 'him'} all game.` : ''}` },
      { speakerId: 'hottake', text: `MVP! MVP! MVP! I don't want to hear any other names. Lock it in right now!` },
      { speakerId: 'stats', text: `It's one game, Tony. The MVP race is a full-season award. But yes — this was a top-tier outing.` },
    ];
  },
  (ctx) => {
    const player = ctx.players[0];
    const team = ctx.teams[0];
    return [
      { speakerId: 'stats', text: `${pick(MARCUS_OPENERS, ctx.rng)} ${player?.name ?? 'This player'} was absolutely surgical today. Every key efficiency metric was off the charts.` },
      { speakerId: 'hottake', text: `SURGICAL! I love that word! ${player?.name ?? 'He'} didn't just beat the defense — he DEMORALIZED them. ${team ? `The ${team.fullName} have a bonafide SUPERSTAR.` : ''}` },
      { speakerId: 'stats', text: `${pick(MARCUS_CONCESSIONS, ctx.rng)} when you combine the volume with the efficiency, performances like this are truly rare.` },
    ];
  },
  (ctx) => {
    const player = ctx.players[0];
    return [
      { speakerId: 'hottake', text: `I called it. I CALLED IT. I said ${player?.name ?? 'this guy'} was going to break out and here we are. You heard it here first!` },
      { speakerId: 'stats', text: `Tony, you say that about three players every week. But I'll give you this one — ${player?.name ?? 'this'} was a truly dominant outing.` },
      { speakerId: 'hottake', text: `Dominant doesn't even BEGIN to cover it! That was an ALL-TIME performance!` },
      { speakerId: 'stats', text: `Let's not get carried away. It was very good. Let's see if the consistency holds.` },
    ];
  },
  (ctx) => {
    const player = ctx.players[0];
    const team = ctx.teams[0];
    return [
      { speakerId: 'stats', text: `${player?.name ?? 'The featured player'} had an absolutely ridiculous stat line today. ${team ? `If ${team.city} gets this from ${player?.lastName ?? 'him'} consistently, they're a playoff team.` : 'That kind of production is game-changing.'}` },
      { speakerId: 'hottake', text: `Playoff team?! They're a CHAMPIONSHIP team! When you have a weapon like ${player?.lastName ?? 'that'}, ANYTHING is possible!` },
      { speakerId: 'stats', text: `Championship teams need more than one great player. But ${player?.lastName ?? 'he'} is making a compelling case for the awards conversation.` },
    ];
  },
  (ctx) => {
    const player = ctx.players[0];
    return [
      { speakerId: 'hottake', text: `Can we just take a moment to appreciate what ${player?.name ?? 'this player'} did today? Because THAT was special. You don't see performances like that very often.` },
      { speakerId: 'stats', text: `${pick(MARCUS_OPENERS, ctx.rng)} It really was remarkable. The combination of explosiveness and consistency — that's what separates the great from the elite.` },
      { speakerId: 'hottake', text: `${pick(TONY_DISMISSALS, ctx.rng)} Mark this day on your calendar. We're witnessing something SPECIAL.` },
    ];
  },
];

// --- STREAK templates ---
const streakTemplates: TemplateFunc[] = [
  (ctx) => {
    const team = ctx.teams[0];
    const isWinStreak = (team?.streak ?? 0) > 0;
    return isWinStreak ? [
      { speakerId: 'hottake', text: `The ${team?.fullName ?? 'hot team'} CANNOT be stopped! ${team?.streak ?? '?'} straight wins! This team is on a MISSION!` },
      { speakerId: 'stats', text: `It's an impressive streak, but their strength of schedule during this run has been below average. Let's see them sustain it against tougher opponents.` },
      { speakerId: 'hottake', text: `Strength of schedule?! A WIN is a WIN, Marcus! Good teams WIN, and the ${team?.name ?? 'team'} are WINNING!` },
    ] : [
      { speakerId: 'hottake', text: `The ${team?.fullName ?? 'struggling team'} are in FREEFALL. ${Math.abs(team?.streak ?? 0)} straight losses! Something has to CHANGE!` },
      { speakerId: 'stats', text: `The numbers paint a concerning picture. Their point differential has gotten progressively worse each week. This isn't just bad luck — there are fundamental issues.` },
      { speakerId: 'hottake', text: `Fundamental issues? Just say it, Marcus — they STINK right now! Time to shake up the roster!` },
    ];
  },
  (ctx) => {
    const team = ctx.teams[0];
    const isWinStreak = (team?.streak ?? 0) > 0;
    return isWinStreak ? [
      { speakerId: 'stats', text: `The ${team?.fullName ?? 'winners'} are ${team?.record ?? '?'} and riding a ${team?.streak ?? '?'}-game win streak. Long streaks like this strongly correlate with postseason success — they're playing winning football at the right time.` },
      { speakerId: 'hottake', text: `Correlate?! I'd say it's a GUARANTEE! This team has IT. The chemistry, the swagger, the belief — you can FEEL it!` },
      { speakerId: 'stats', text: `Let's see where they are in three weeks. Streaks end, Tony.` },
      { speakerId: 'hottake', text: `Not THIS one! This team is DIFFERENT!` },
    ] : [
      { speakerId: 'stats', text: `The ${team?.fullName ?? 'struggling team'} are now ${team?.record ?? '?'} with ${Math.abs(team?.streak ?? 0)} consecutive losses. Their playoff odds are plummeting with each loss.` },
      { speakerId: 'hottake', text: `Playoff odds?! They should be thinking about NEXT YEAR at this point! Tank for a top draft pick!` },
      { speakerId: 'stats', text: `That's a bit premature. The schedule gets easier, and mathematically they're not eliminated.` },
      { speakerId: 'hottake', text: `Mathematically?! Their season is OVER in every way that matters!` },
    ];
  },
  (ctx) => {
    const team = ctx.teams[0];
    const isWinStreak = (team?.streak ?? 0) > 0;
    return isWinStreak ? [
      { speakerId: 'hottake', text: `Everyone who doubted the ${team?.fullName ?? 'winners'} needs to apologize. ${team?.streak ?? '?'} wins in a row? That's not luck — that's GREATNESS!` },
      { speakerId: 'stats', text: `${pick(MARCUS_CONCESSIONS, ctx.rng)} they've been playing well. The question is sustainability. I'd like to see their performance in close games.` },
      { speakerId: 'hottake', text: `Close games?! They're BLOWING PEOPLE OUT! Wake up, Marcus!` },
    ] : [
      { speakerId: 'hottake', text: `I feel BAD for ${team?.fullName ?? 'the team'} fans right now. ${Math.abs(team?.streak ?? 0)} losses in a row is absolutely gut-wrenching. Someone needs to be held accountable.` },
      { speakerId: 'stats', text: `Losing streaks are often about compounding issues — injuries, confidence, fatigue. It's rarely just one thing.` },
      { speakerId: 'hottake', text: `It IS one thing — they're not good enough! Time for changes!` },
    ];
  },
];

// --- RIVALRY templates ---
const rivalryTemplates: TemplateFunc[] = [
  (ctx) => {
    const winner = ctx.teams[0];
    const loser = ctx.teams[1];
    return [
      { speakerId: 'hottake', text: `Division games just HIT DIFFERENT! The ${winner?.fullName ?? 'winners'} gutting out a close one against the ${loser?.name ?? 'rivals'} — THAT'S what this sport is about!` },
      { speakerId: 'stats', text: `Division games do tend to be closer, statistically. Home field advantage shrinks and familiarity breeds tight contests. This one was no exception.` },
      { speakerId: 'hottake', text: `For once, I don't hate your analysis. These teams KNOW each other. Every snap is personal!` },
    ];
  },
  (ctx) => {
    const winner = ctx.teams[0];
    const loser = ctx.teams[1];
    return [
      { speakerId: 'stats', text: `A classic division slugfest between ${winner?.city ?? 'the home team'} and ${loser?.city ?? 'the road team'}. Tight game, playoff implications — this is what late-season football is all about.` },
      { speakerId: 'hottake', text: `This rivalry is HEATED! You could feel the tension through the TV! The ${winner?.name ?? 'winners'} wanted it just a LITTLE bit more.` },
      { speakerId: 'stats', text: `Margin games like this often come down to one or two plays. It's less about "wanting it" and more about execution in key moments.` },
      { speakerId: 'hottake', text: `Execution, heart, desire — call it whatever you want. The ${winner?.name ?? 'winners'} had it and the ${loser?.name ?? 'losers'} didn't!` },
    ];
  },
  (ctx) => {
    const winner = ctx.teams[0];
    const loser = ctx.teams[1];
    return [
      { speakerId: 'hottake', text: `The ${winner?.fullName ?? 'winners'} now own the tiebreaker in the division! That's HUGE! If this comes down to a playoff race, today's game will be the reason why!` },
      { speakerId: 'stats', text: `That's actually a great point. Division wins are the first tiebreaker, so this result could have major implications come playoff time.` },
      { speakerId: 'hottake', text: `Did you just... agree with me? Somebody mark the date! Marcus Cole agrees with Tony Blaze!` },
    ];
  },
];

// --- SUMMARY templates ---
const summaryTemplates: TemplateFunc[] = [
  (ctx) => {
    const topTeams = ctx.teams.slice(0, 3);
    const lines = topTeams.map(t => `${t.abbr} (${t.record})`).join(', ');
    return [
      { speakerId: 'stats', text: `Wrapping up the week — ${ctx.segment.body.includes('games played') ? ctx.segment.body.split('.')[0] + '.' : 'A full slate of games.'} League leaders: ${lines}.` },
      { speakerId: 'hottake', text: `Another wild week in the books! This league is WIDE OPEN. Any team can beat any team on any given Sunday!` },
      { speakerId: 'stats', text: `Well, some teams are statistically much more likely to beat other teams. But I appreciate your enthusiasm.` },
    ];
  },
  (ctx) => {
    return [
      { speakerId: 'hottake', text: `What a week! I'm EXHAUSTED from all the drama! This league never disappoints!` },
      { speakerId: 'stats', text: `It was an eventful week, no doubt. The standings are starting to take shape, and the playoff picture is getting clearer with each passing week.` },
      { speakerId: 'hottake', text: `Clearer?! It's a MESS! And I LOVE it! See you all next week!` },
    ];
  },
];

// --- MILESTONE & HEADLINE templates (catch-all) ---
const genericTemplates: TemplateFunc[] = [
  (ctx) => {
    return [
      { speakerId: 'stats', text: `${ctx.segment.title} — ${ctx.segment.body}` },
      { speakerId: 'hottake', text: `Now THAT is a story worth talking about! This league never stops giving us material!` },
    ];
  },
  (ctx) => {
    return [
      { speakerId: 'hottake', text: `Can we talk about this?! ${ctx.segment.title}! This is HUGE!` },
      { speakerId: 'stats', text: `It's noteworthy for sure. Let's see how it plays out in the bigger picture.` },
    ];
  },
];

/* ─── Template Lookup ─── */

const TEMPLATE_MAP: Record<RecapSegmentData['type'], TemplateFunc[]> = {
  upset: upsetTemplates,
  comeback: comebackTemplates,
  blowout: blowoutTemplates,
  shootout: shootoutTemplates,
  defensive: defensiveTemplates,
  performance: performanceTemplates,
  streak: streakTemplates,
  rivalry: rivalryTemplates,
  summary: summaryTemplates,
  headline: genericTemplates,
  milestone: genericTemplates,
  trade: genericTemplates,
};

/* ─── Intro / Outro Templates ─── */

const SHOW_INTROS: DebateExchange[][] = [
  [
    { speakerId: 'hottake', text: "Welcome to Gridiron Debate! I'm Tony Blaze, and as usual, my guy Marcus over here is about to bore you with numbers while I give you the REAL story!" },
    { speakerId: 'stats', text: "And I'm Marcus Cole. Tony, the numbers ARE the real story. But let's get into it — we've got a lot to cover this week." },
  ],
  [
    { speakerId: 'stats', text: "Good evening, everyone. I'm Marcus Cole alongside the always-entertaining Tony Blaze. Big week of football to break down." },
    { speakerId: 'hottake', text: "ENTERTAINING?! I'm the voice of the PEOPLE, Marcus! Let's get to the good stuff!" },
  ],
  [
    { speakerId: 'hottake', text: "WHAT a week of football! I've got takes so hot they might set off the fire alarm! Let's GO!" },
    { speakerId: 'stats', text: "And I've got data to keep things grounded. Welcome to Gridiron Debate, everyone." },
  ],
];

const SHOW_OUTROS: DebateExchange[][] = [
  [
    { speakerId: 'stats', text: "That's all the time we have this week. Thanks for watching Gridiron Debate. We'll see you after next week's games." },
    { speakerId: 'hottake', text: "Remember — I called it first! See you next week!" },
  ],
  [
    { speakerId: 'hottake', text: "Another INCREDIBLE week! If you missed any of these games, I feel sorry for you. Until next time — Tony Blaze OUT!" },
    { speakerId: 'stats', text: "And as always, check the numbers before you make your bold predictions. Good night, everyone." },
  ],
];

/* ─── Main Generator ─── */

export function generateDebateTranscript(
  recap: { season: number; week: number; segments: RecapSegmentData[] },
  teams: Team[],
  players: Player[],
): DebateTranscript {
  const rng = seededRandom(recap.season * 1000 + recap.week);

  if (recap.segments.length === 0) {
    return {
      season: recap.season,
      week: recap.week,
      topics: [{
        headline: 'Slow Week',
        icon: '😴',
        exchanges: [
          { speakerId: 'hottake', text: "I got NOTHING this week, Marcus. Nothing! That might be a first." },
          { speakerId: 'stats', text: "Even the data was boring. Let's hope next week gives us more to work with." },
        ],
        teamIds: [],
        playerIds: [],
      }],
    };
  }

  // Top 6 segments for a concise show
  const topSegments = recap.segments
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);

  const topics: DebateTopic[] = [];

  // Intro
  const intro = SHOW_INTROS[Math.floor(rng() * SHOW_INTROS.length)];
  topics.push({
    headline: 'Welcome to Gridiron Debate',
    icon: '🎙️',
    exchanges: intro,
    teamIds: [],
    playerIds: [],
  });

  // Topics from segments
  for (let i = 0; i < topSegments.length; i++) {
    const segment = topSegments[i];
    const pool = TEMPLATE_MAP[segment.type] ?? genericTemplates;
    const templateIdx = Math.floor(rng() * pool.length);
    const template = pool[templateIdx];

    const ctx = buildContext(segment, teams, players, rng);
    const exchanges = template(ctx);

    topics.push({
      headline: segment.title,
      icon: segment.icon,
      exchanges,
      teamIds: segment.teamIds,
      playerIds: segment.playerIds,
      context: segment.body,
    });
  }

  // Outro
  const outro = SHOW_OUTROS[Math.floor(rng() * SHOW_OUTROS.length)];
  topics.push({
    headline: "That's a Wrap",
    icon: '👋',
    exchanges: outro,
    teamIds: [],
    playerIds: [],
  });

  return {
    season: recap.season,
    week: recap.week,
    topics,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Team Spotlight — In-depth analysis of the user's team
 *
 * Generates 6-10 debate topics about the user's team: record, roster,
 * cap situation, star players, young core, injuries, draft picks, etc.
 * ═══════════════════════════════════════════════════════════════════════════ */

const POSITION_GROUPS: Record<string, Position[]> = {
  'Offensive Line': ['OL'],
  'Defensive Line': ['DL'],
  'Linebackers': ['LB'],
  'Secondary': ['CB', 'S'],
  'Receivers': ['WR', 'TE'],
  'Backfield': ['QB', 'RB'],
};

function posGroupAvgOvr(roster: Player[], positions: Position[]): number {
  const group = roster.filter(p => positions.includes(p.position) && !p.retired);
  if (group.length === 0) return 0;
  return Math.round(group.reduce((s, p) => s + p.ratings.overall, 0) / group.length);
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

/* ─── Stats-Ranking Helpers ─── */

interface TeamStatLine {
  id: string;
  ppg: number;
  oppPpg: number;
  passYpg: number;
  rushYpg: number;
  totalYpg: number;
  sacks: number;
  interceptions: number;
  takeaways: number;
}

function computeTeamStats(t: Team, rosterPlayers: Player[]): TeamStatLine {
  const gp = Math.max(1, t.record.wins + t.record.losses);
  const passYds = rosterPlayers.reduce((s, p) => s + p.stats.passYards, 0);
  const rushYds = rosterPlayers.reduce((s, p) => s + p.stats.rushYards, 0);
  const sacks = rosterPlayers.reduce((s, p) => s + p.stats.sacks, 0);
  const ints = rosterPlayers.reduce((s, p) => s + p.stats.interceptions, 0);
  return {
    id: t.id,
    ppg: Math.round(t.record.pointsFor / gp * 10) / 10,
    oppPpg: Math.round(t.record.pointsAgainst / gp * 10) / 10,
    passYpg: Math.round(passYds / gp * 10) / 10,
    rushYpg: Math.round(rushYds / gp * 10) / 10,
    totalYpg: Math.round((passYds + rushYds) / gp * 10) / 10,
    sacks,
    interceptions: ints,
    takeaways: ints, // simplified
  };
}

function leagueRankOf(all: TeamStatLine[], teamId: string, key: keyof TeamStatLine, ascending = false): number {
  const sorted = [...all].sort((a, b) => ascending ? (a[key] as number) - (b[key] as number) : (b[key] as number) - (a[key] as number));
  return sorted.findIndex(t => t.id === teamId) + 1;
}

interface PlayerLeagueStat {
  playerId: string;
  name: string;
  position: string;
  value: number;
}

function playerLeagueRank(allActive: Player[], playerId: string, statFn: (p: Player) => number): { rank: number; value: number } {
  const sorted = [...allActive].sort((a, b) => statFn(b) - statFn(a));
  const rank = sorted.findIndex(p => p.id === playerId) + 1;
  return { rank, value: statFn(sorted.find(p => p.id === playerId)!) };
}

function getPlayerStatLine(p: Player): string {
  if (p.position === 'QB') {
    return `${p.stats.passYards} pass yds, ${p.stats.passTDs} TD, ${p.stats.interceptions} INT`;
  } else if (p.position === 'RB') {
    return `${p.stats.rushYards} rush yds, ${p.stats.rushTDs} TD`;
  } else if (['WR', 'TE'].includes(p.position)) {
    return `${p.stats.receivingYards} rec yds, ${p.stats.receivingTDs} TD`;
  } else if (['DL', 'LB'].includes(p.position)) {
    return `${p.stats.tackles} tkl, ${p.stats.sacks} sacks`;
  } else if (['CB', 'S'].includes(p.position)) {
    return `${p.stats.tackles} tkl, ${p.stats.interceptions} INT`;
  }
  return `${p.stats.tackles} tkl`;
}

function primaryStatForPosition(p: Player): (q: Player) => number {
  if (p.position === 'QB') return q => q.stats.passYards;
  if (p.position === 'RB') return q => q.stats.rushYards;
  if (['WR', 'TE'].includes(p.position)) return q => q.stats.receivingYards;
  if (['DL', 'LB'].includes(p.position)) return q => q.stats.sacks;
  if (['CB', 'S'].includes(p.position)) return q => q.stats.interceptions;
  return q => q.stats.tackles;
}

/** Fallback topics when myStats is unavailable or during draft/FA phases */
function generateOffseasonTopics(
  team: Team, roster: Player[], allTeams: Team[], allPlayers: Player[],
  season: number, week: number, ctx: SpotlightContext,
  rng: () => number, capSpace: number, capPct: number,
): DebateTopic[] {
  const topics: DebateTopic[] = [];
  const phase = ctx.phase ?? 'preseason';
  const activeRoster = roster.filter(p => !p.retired);

  if ((phase === 'draft' || phase === 'freeAgency') && ctx.draftResults && ctx.draftResults.length > 0) {
    const teamPicks = ctx.draftResults.filter(dr => dr.teamId === team.id);
    if (teamPicks.length > 0) {
      const draftedPlayers = teamPicks
        .map(dr => allPlayers.find(p => p.id === dr.playerId))
        .filter((p): p is Player => !!p);
      const bestPick = draftedPlayers.sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
      const positionsCovered = [...new Set(draftedPlayers.map(p => p.position))];
      topics.push({
        headline: 'Draft Recap',
        icon: '🎓',
        exchanges: [
          { speakerId: 'stats', text: `The ${team.city} ${team.name} made ${teamPicks.length} selection${teamPicks.length > 1 ? 's' : ''} in this year's draft, addressing ${positionsCovered.join(', ')}. ${bestPick ? `Their top pick was ${bestPick.firstName} ${bestPick.lastName} (${bestPick.position}, ${bestPick.ratings.overall} OVR) — ${bestPick.ratings.overall >= 70 ? 'an immediate impact player' : bestPick.ratings.overall >= 60 ? 'a solid contributor' : 'a developmental prospect'}.` : ''}` },
          { speakerId: 'hottake', text: `${bestPick && bestPick.ratings.overall >= 70 ? `STEAL! ${bestPick.lastName} is going to be a STAR! This front office NAILED IT!` : bestPick && bestPick.ratings.overall >= 60 ? `Decent haul. ${bestPick.lastName} can contribute right away, but where's the home run pick?!` : `I'm not impressed. This draft class needs time to develop — and time is a LUXURY in this league!`}` },
          { speakerId: 'stats', text: `With $${capSpace}M in cap space and ${activeRoster.length} players on the roster, they still have work to do in free agency to finalize this roster.` },
        ],
        teamIds: [team.id],
        playerIds: draftedPlayers.slice(0, 3).map(p => p.id),
      });
    }
  }

  if (phase === 'freeAgency') {
    const topFAs = allPlayers
      .filter(p => !p.teamId && !p.retired && p.ratings.overall >= 65)
      .sort((a, b) => b.ratings.overall - a.ratings.overall)
      .slice(0, 3);
    if (topFAs.length > 0) {
      topics.push({
        headline: 'Free Agency Watch',
        icon: '🏷️',
        exchanges: [
          { speakerId: 'hottake', text: `The free agent market is OPEN and there are some BIG names available! ${topFAs[0].firstName} ${topFAs[0].lastName} (${topFAs[0].position}, ${topFAs[0].ratings.overall} OVR) should be the TOP priority!` },
          { speakerId: 'stats', text: `With $${capSpace}M in cap space${capPct > 85 ? " — that's tight" : ''}, the ${team.name} need to be selective. ${topFAs[0].lastName} would fill a need, but they can't overspend.` },
        ],
        teamIds: [team.id],
        playerIds: topFAs.map(p => p.id),
      });
    }
  }

  // Roster strength fallback
  const topPlayers = activeRoster.sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 3);
  if (topPlayers.length > 0 && topics.length === 0) {
    topics.push({
      headline: 'Roster Outlook',
      icon: '📋',
      exchanges: [
        { speakerId: 'stats', text: `The ${team.name} roster is led by ${topPlayers[0].firstName} ${topPlayers[0].lastName} (${topPlayers[0].position}, ${topPlayers[0].ratings.overall} OVR). The core looks ${topPlayers[0].ratings.overall >= 80 ? 'championship-caliber' : topPlayers[0].ratings.overall >= 70 ? 'competitive' : 'like it needs upgrades'}.` },
        { speakerId: 'hottake', text: `${topPlayers[0].ratings.overall >= 80 ? 'They have a SUPERSTAR! Build around them and WIN NOW!' : 'They need more talent around the top of this roster. Time to make some MOVES!'}` },
      ],
      teamIds: [team.id],
      playerIds: topPlayers.map(p => p.id),
    });
  }

  return topics;
}

export interface SpotlightContext {
  phase?: string;
  playoffBracket?: PlayoffMatchup[] | null;
  playoffSeeds?: { AC: string[]; NC: string[] } | null;
  champions?: { season: number; teamId: string }[];
  finalsMvpPlayerId?: string | null;
  draftResults?: DraftSelection[];
  freeAgents?: string[];
  faDay?: number;
  schedule?: { week: number; homeTeamId: string; awayTeamId: string; played: boolean }[];
  /** Recent news (used to surface re-injury callouts in commentary). */
  newsItems?: { type: string; teamId?: string; season: number; headline: string; body?: string; playerIds?: string[] }[];
}

export function generateTeamSpotlight(
  team: Team,
  roster: Player[],
  allTeams: Team[],
  allPlayers: Player[],
  season: number,
  week: number,
  ctx: SpotlightContext = {},
): DebateTopic[] {
  const rng = seededRandom(season * 10000 + week * 100 + (team.id.charCodeAt(0) ?? 0));
  const topics: DebateTopic[] = [];
  const gamesPlayed = team.record.wins + team.record.losses;
  const winPct = gamesPlayed > 0 ? team.record.wins / gamesPlayed : 0;
  const activeRoster = roster.filter(p => !p.retired);
  const capSpace = Math.round((team.salaryCap - team.totalPayroll) * 10) / 10;
  const capPct = Math.round(team.totalPayroll / team.salaryCap * 100);

  // ─── Compute league-wide team stats for rankings ───
  const allActive = allPlayers.filter(p => p.teamId && !p.retired);
  const allTeamStats: TeamStatLine[] = allTeams.map(t => {
    const tRoster = allActive.filter(p => p.teamId === t.id);
    return computeTeamStats(t, tRoster);
  });
  const myStats = allTeamStats.find(s => s.id === team.id);
  if (!myStats) {
    // During phase transitions (draft/FA), stats may be stale — return draft/FA topics only
    return generateOffseasonTopics(team, roster, allTeams, allPlayers, season, week, ctx, rng, capSpace, capPct);
  }
  const ppgRank = leagueRankOf(allTeamStats, team.id, 'ppg');
  const defRank = leagueRankOf(allTeamStats, team.id, 'oppPpg', true); // lower is better
  const passOffRank = leagueRankOf(allTeamStats, team.id, 'passYpg');
  const rushOffRank = leagueRankOf(allTeamStats, team.id, 'rushYpg');
  const totalOffRank = leagueRankOf(allTeamStats, team.id, 'totalYpg');
  const sackRank = leagueRankOf(allTeamStats, team.id, 'sacks');
  const totalTeams = allTeams.length;

  const pointDiff = team.record.pointsFor - team.record.pointsAgainst;

  // ─── Injury context (used across multiple topics) ───
  const injuredPlayers = activeRoster.filter(p => p.injury && p.ratings.overall >= 65)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);
  const topInjured = injuredPlayers[0] ?? null;

  // ─── Next opponent (from schedule context) ───
  const nextGame = ctx.schedule?.find(g => !g.played && g.week >= week &&
    (g.homeTeamId === team.id || g.awayTeamId === team.id));
  const nextOpponentId = nextGame
    ? (nextGame.homeTeamId === team.id ? nextGame.awayTeamId : nextGame.homeTeamId)
    : null;
  const nextOpponent = nextOpponentId ? allTeams.find(t => t.id === nextOpponentId) : null;
  const nextOpponentRoster = nextOpponent ? allPlayers.filter(p => p.teamId === nextOpponent.id && !p.retired) : [];

  // League rank by wins
  const sortedByWins = [...allTeams].sort((a, b) => {
    const wa = a.record.wins / Math.max(1, a.record.wins + a.record.losses);
    const wb = b.record.wins / Math.max(1, b.record.wins + b.record.losses);
    return wb - wa;
  });
  const leagueRank = sortedByWins.findIndex(t => t.id === team.id) + 1;

  // Conference rank
  const confTeams = allTeams.filter(t => t.conference === team.conference);
  const confSorted = [...confTeams].sort((a, b) => {
    const wa = a.record.wins / Math.max(1, a.record.wins + a.record.losses);
    const wb = b.record.wins / Math.max(1, b.record.wins + b.record.losses);
    return wb - wa;
  });
  const confRank = confSorted.findIndex(t => t.id === team.id) + 1;

  // ─── 1. Team Overview / Record Reaction (stats-heavy) ───
  if (gamesPlayed > 0) {
    const offenseTier = ppgRank <= 8 ? 'top-tier' : ppgRank <= 16 ? 'middle-of-the-pack' : 'bottom-third';
    const defenseTier = defRank <= 8 ? 'elite' : defRank <= 16 ? 'average' : 'struggling';

    const recordTemplates: (() => DebateExchange[])[] = winPct >= 0.6 ? [
      () => [
        { speakerId: 'stats' as const, text: `The ${team.city} ${team.name} are ${team.record.wins}-${team.record.losses}, ${ordinal(leagueRank)} overall. They're scoring ${myStats.ppg} PPG (${ordinal(ppgRank)} in the league) and allowing just ${myStats.oppPpg} (${ordinal(defRank)} in defense). That's a +${pointDiff} point differential. The offense is ${offenseTier}, the defense is ${defenseTier} — this is a complete football team.` },
        { speakerId: 'hottake' as const, text: `COMPLETE?! They're DOMINANT, Marcus! ${ordinal(ppgRank)} in scoring AND ${ordinal(defRank)} in defense?! Name a more balanced team in this league — I'll WAIT!` },
        { speakerId: 'stats' as const, text: `They're averaging ${myStats.totalYpg} yards per game (${ordinal(totalOffRank)}), with ${myStats.passYpg} through the air (${ordinal(passOffRank)}) and ${myStats.rushYpg} on the ground (${ordinal(rushOffRank)}). The balance is what makes them dangerous.` },
      ],
      () => [
        { speakerId: 'hottake' as const, text: `${team.record.wins}-${team.record.losses}! The ${team.name} are ROLLING! ${ordinal(ppgRank)} in scoring at ${myStats.ppg} PPG — this offense is a MACHINE!` },
        { speakerId: 'stats' as const, text: `And the defense ranks ${ordinal(defRank)}, allowing ${myStats.oppPpg} per game. The point differential of +${pointDiff} is ${pointDiff > 50 ? 'historically dominant' : 'very strong'}. ${ordinal(confRank)} in the ${team.conference}.` },
        { speakerId: 'hottake' as const, text: `This is a CHAMPIONSHIP caliber team! The numbers don't lie — even YOU have to admit it!` },
      ],
    ] : winPct <= 0.35 ? [
      () => [
        { speakerId: 'stats' as const, text: `The ${team.name} are ${team.record.wins}-${team.record.losses}, and the stats tell the story. Their offense ranks ${ordinal(ppgRank)} at ${myStats.ppg} PPG. The defense is ${ordinal(defRank)}, giving up ${myStats.oppPpg}. They're gaining ${myStats.totalYpg} yards per game — ${ordinal(totalOffRank)} in the league. There's no way to sugarcoat it.` },
        { speakerId: 'hottake' as const, text: `${ordinal(ppgRank)} in offense?! ${ordinal(defRank)} in defense?! BOTH sides of the ball are broken! This isn't a one-problem team — it's a WRECK!` },
        { speakerId: 'stats' as const, text: `The ${myStats.rushYpg} rushing yards per game (${ordinal(rushOffRank)}) is particularly concerning. You can't sustain drives when you can't run the ball.` },
      ],
      () => [
        { speakerId: 'hottake' as const, text: `${team.record.wins}-${team.record.losses}. The ${team.name} are ${ordinal(ppgRank)} in scoring. DEAD LAST tier! I can't even watch this anymore!` },
        { speakerId: 'stats' as const, text: `It's a struggle on both sides. ${myStats.ppg} PPG offense, ${myStats.oppPpg} PPG allowed (${ordinal(defRank)}). Point differential of ${pointDiff}. These games aren't even competitive in many cases.` },
        { speakerId: 'hottake' as const, text: `Tank for the #1 pick! That's the only hope here!` },
      ],
    ] : [
      () => [
        { speakerId: 'stats' as const, text: `The ${team.name} sit at ${team.record.wins}-${team.record.losses}, ${ordinal(confRank)} in the ${team.conference}. Scoring ${myStats.ppg} per game (${ordinal(ppgRank)}), allowing ${myStats.oppPpg} (${ordinal(defRank)}). They're gaining ${myStats.totalYpg} total yards per game (${ordinal(totalOffRank)}). Textbook middle-of-the-road.` },
        { speakerId: 'hottake' as const, text: `And that's the WORST place to be! ${ordinal(ppgRank)} in offense, ${ordinal(defRank)} in defense — nothing elite, nothing terrible. They're stuck in PURGATORY!` },
        { speakerId: 'stats' as const, text: `Their passing game at ${myStats.passYpg} YPG (${ordinal(passOffRank)}) is ${passOffRank <= 12 ? 'actually decent — if they can shore up the run game' : 'not giving them enough pop downfield'}. A few improvements could tip the scales.` },
      ],
      () => [
        { speakerId: 'hottake' as const, text: `The ${team.name} are ${team.record.wins}-${team.record.losses} and I have NO IDEA what to make of them! ${ordinal(ppgRank)} in scoring, ${ordinal(defRank)} in defense — pick a lane!` },
        { speakerId: 'stats' as const, text: `The inconsistency shows in the numbers. ${myStats.passYpg} pass yards per game (${ordinal(passOffRank)}) but only ${myStats.rushYpg} rushing (${ordinal(rushOffRank)}). The imbalance is making them predictable.` },
        { speakerId: 'hottake' as const, text: `Average doesn't win championships! Make a move! DO something!` },
      ],
    ];
    const recordExchanges = pick(recordTemplates, rng)();
    // Weave injury context into the record discussion when significant injuries exist
    if (topInjured && topInjured.ratings.overall >= 75) {
      const topInjStatLine = getPlayerStatLine(topInjured);
      const isDefPlayer = ['DL', 'LB', 'CB', 'S'].includes(topInjured.position);
      if (winPct >= 0.6) {
        recordExchanges.push({ speakerId: 'hottake' as const, text: `BUT — and this is a BIG but — they're doing this WITHOUT ${topInjured.firstName} ${topInjured.lastName}! ${topInjured.ratings.overall} OVR, ${topInjStatLine}! Imagine when he comes back in ${topInjured.injury?.weeksLeft ?? '?'} weeks!` });
      } else if (winPct <= 0.35) {
        recordExchanges.push({ speakerId: 'hottake' as const, text: `And let's be honest, losing ${topInjured.firstName} ${topInjured.lastName} (${topInjured.position}, ${topInjStatLine}) hasn't helped! He's the ${isDefPlayer ? 'anchor of the defense' : 'engine of the offense'} and they've been ${topInjured.injury?.weeksLeft ?? '?'} weeks without him!` });
      } else {
        recordExchanges.push({ speakerId: 'stats' as const, text: `Worth noting: ${topInjured.firstName} ${topInjured.lastName} (${topInjured.position}, ${topInjured.ratings.overall} OVR, ${topInjStatLine}) has been out. That's ${isDefPlayer ? 'a defensive impact' : 'an offensive loss'} that doesn't show up cleanly in the W-L column, but getting him back could be the boost they need.` });
      }
    }
    topics.push({
      headline: `${team.city} ${team.name}: ${team.record.wins}-${team.record.losses}`,
      icon: winPct >= 0.6 ? '🏆' : winPct <= 0.35 ? '😰' : '🤔',
      exchanges: recordExchanges,
      teamIds: [team.id],
      playerIds: topInjured ? [topInjured.id] : [],
    });
  }

  // ─── 2. Offensive / Defensive Deep Dive (stats-first) ───
  if (gamesPlayed > 0) {
    const offenseGood = ppgRank <= totalTeams / 2;
    const defenseGood = defRank <= totalTeams / 2;
    // Find team's stat leaders for context
    // Use depth chart for QB1 if available, fall back to most pass yards
    const qbDepth = team.depthChart?.QB ?? [];
    const teamQB = qbDepth.length > 0
      ? activeRoster.find(p => p.id === qbDepth[0]) ?? activeRoster.filter(p => p.position === 'QB').sort((a, b) => b.stats.passYards - a.stats.passYards)[0]
      : activeRoster.filter(p => p.position === 'QB').sort((a, b) => b.stats.passYards - a.stats.passYards)[0];
    const teamRusher = activeRoster.sort((a, b) => b.stats.rushYards - a.stats.rushYards)[0];
    const teamReceiver = activeRoster.filter(p => ['WR', 'TE'].includes(p.position)).sort((a, b) => b.stats.receivingYards - a.stats.receivingYards)[0];
    const teamSacker = activeRoster.filter(p => ['DL', 'LB'].includes(p.position)).sort((a, b) => b.stats.sacks - a.stats.sacks)[0];

    const qbLeagueRank = teamQB ? playerLeagueRank(allActive.filter(p => p.position === 'QB'), teamQB.id, p => p.stats.passYards) : null;
    const rusherLeagueRank = teamRusher ? playerLeagueRank(allActive, teamRusher.id, p => p.stats.rushYards) : null;
    const receiverLeagueRank = teamReceiver ? playerLeagueRank(allActive.filter(p => ['WR', 'TE'].includes(p.position)), teamReceiver.id, p => p.stats.receivingYards) : null;
    const sackerLeagueRank = teamSacker ? playerLeagueRank(allActive.filter(p => ['DL', 'LB'].includes(p.position)), teamSacker.id, p => p.stats.sacks) : null;

    const playerIds: string[] = [];
    if (teamQB) playerIds.push(teamQB.id);
    if (teamRusher && !playerIds.includes(teamRusher.id)) playerIds.push(teamRusher.id);
    if (teamReceiver && !playerIds.includes(teamReceiver.id)) playerIds.push(teamReceiver.id);
    if (teamSacker && !playerIds.includes(teamSacker.id)) playerIds.push(teamSacker.id);

    const statTemplates: (() => DebateExchange[])[] = [
      () => {
        const exchanges: DebateExchange[] = [];
        // Offense breakdown
        exchanges.push({ speakerId: 'stats' as const, text: `Let's dig into the numbers. This offense is ${ordinal(ppgRank)} in scoring (${myStats.ppg} PPG), ${ordinal(passOffRank)} passing (${myStats.passYpg} YPG), ${ordinal(rushOffRank)} rushing (${myStats.rushYpg} YPG).${teamQB ? ` ${teamQB.firstName} ${teamQB.lastName} has thrown for ${teamQB.stats.passYards} yards and ${teamQB.stats.passTDs} TDs — ${ordinal(qbLeagueRank!.rank)} among all QBs.` : ''}` });
        // Hot take reacts to the strength/weakness
        if (offenseGood) {
          exchanges.push({ speakerId: 'hottake' as const, text: `${teamQB ? `${teamQB.lastName} is BALLING!` : 'The offense is clicking!'} ${rushOffRank <= 10 ? `And ${teamRusher?.lastName ?? 'their rusher'} is ${ordinal(rusherLeagueRank?.rank ?? 99)} in rushing at ${teamRusher?.stats.rushYards ?? 0} yards — the ground game is LEGIT!` : `But they NEED to run the ball better — ${ordinal(rushOffRank)} in rushing isn't going to cut it in January!`}` });
        } else {
          exchanges.push({ speakerId: 'hottake' as const, text: `${ordinal(ppgRank)} in scoring?! That's UNACCEPTABLE! ${teamQB ? `${teamQB.lastName} is ${ordinal(qbLeagueRank!.rank)} in passing — ` + (qbLeagueRank!.rank <= 10 ? "he's doing his part but he needs HELP!" : "and THAT is a big part of the problem!") : "They don't even have a QB putting up numbers!"}` });
        }
        // Defense angle
        exchanges.push({ speakerId: 'stats' as const, text: `On defense, they're ${ordinal(defRank)} allowing ${myStats.oppPpg} PPG.${teamSacker ? ` ${teamSacker.firstName} ${teamSacker.lastName} leads the pass rush with ${teamSacker.stats.sacks} sacks (${ordinal(sackerLeagueRank!.rank)} in the league).` : ''} The defensive unit is ${defenseGood ? 'keeping them in games' : 'a liability that needs addressing'}.` });
        return exchanges;
      },
      () => {
        const exchanges: DebateExchange[] = [];
        exchanges.push({ speakerId: 'hottake' as const, text: `OK let me break this down — ${ordinal(passOffRank)} in passing, ${ordinal(rushOffRank)} in rushing, ${ordinal(defRank)} in defense. ${passOffRank <= 10 && rushOffRank > 16 ? "They can throw it but CAN'T RUN!" : rushOffRank <= 10 && passOffRank > 16 ? "They can run it but CAN'T THROW!" : passOffRank <= 10 && rushOffRank <= 10 ? "BOTH sides of the offense are clicking!" : "NEITHER running nor passing is working!"} That tells you EVERYTHING!` });
        if (teamReceiver) {
          exchanges.push({ speakerId: 'stats' as const, text: `${teamReceiver.firstName} ${teamReceiver.lastName} is ${ordinal(receiverLeagueRank!.rank)} in receiving with ${teamReceiver.stats.receivingYards} yards and ${teamReceiver.stats.receivingTDs} TDs. ${receiverLeagueRank!.rank <= 5 ? "That's a genuine weapon." : receiverLeagueRank!.rank <= 15 ? "Solid production but not elite." : "They need more production from the pass-catchers."}` });
        }
        exchanges.push({ speakerId: 'hottake' as const, text: `${defenseGood ? `At least the defense is holding up — ${ordinal(defRank)} is respectable. ${teamSacker && sackerLeagueRank!.rank <= 10 ? `${teamSacker.lastName} with ${teamSacker.stats.sacks} sacks is a MONSTER!` : 'But they need a pass rusher who can take over games!'}` : `And the defense at ${ordinal(defRank)}?! Giving up ${myStats.oppPpg} per game?! FIRE THE DEFENSIVE COORDINATOR!`}` });
        return exchanges;
      },
    ];
    topics.push({
      headline: 'By the Numbers',
      icon: '📊',
      exchanges: pick(statTemplates, rng)(),
      teamIds: [team.id],
      playerIds,
    });

    // ─── QB Trend Topic (INT struggles, streaks, TD:INT ratio) ───
    if (teamQB && gamesPlayed >= 6) {
    const qbGP = teamQB.stats.gamesPlayed || 1;
    const intRate = teamQB.stats.interceptions / qbGP;
    const tdRate = teamQB.stats.passTDs / qbGP;
    const ratio = teamQB.stats.interceptions > 0 ? teamQB.stats.passTDs / teamQB.stats.interceptions : teamQB.stats.passTDs;
    const qbName = `${teamQB.firstName} ${teamQB.lastName}`;

    if (intRate >= 1.5) {
      topics.push({
        headline: `${teamQB.lastName}'s Turnover Problem`,
        icon: '⚠️',
        exchanges: [
          { speakerId: 'stats' as const, text: `We need to address the elephant in the room. ${qbName} has ${teamQB.stats.interceptions} interceptions in ${qbGP} games — that's ${intRate.toFixed(1)} per game. His TD-to-INT ratio is ${ratio.toFixed(1)}. At some point the coaching staff has to simplify the playbook or make a change.` },
          { speakerId: 'hottake' as const, text: `${intRate >= 2 ? `${intRate.toFixed(1)} INTs per game?! He's literally GIVING games away! At what point do they sit him down and go to the backup?!` : `The turnovers are KILLING this team! You can't win in this league turning the ball over every game! ${qbName} has to clean it up or this season is OVER!`}` },
          { speakerId: 'stats' as const, text: `To be fair, ${teamQB.stats.passYards} passing yards shows he CAN move the ball. But ${teamQB.stats.interceptions} picks is a decision-making problem, not a talent problem. The question is whether he can correct it.` },
        ],
        teamIds: [team.id],
        playerIds: [teamQB.id],
      });
    } else if (ratio >= 3.0 && tdRate >= 2.0) {
      topics.push({
        headline: `${teamQB.lastName} Playing at Elite Level`,
        icon: '🔥',
        exchanges: [
          { speakerId: 'hottake' as const, text: `Can we talk about ${qbName}?! ${teamQB.stats.passTDs} TDs and only ${teamQB.stats.interceptions} INTs — that's a ${ratio.toFixed(1)} ratio! That's MVP-caliber ball! He is BALLING and I don't want to hear anyone say otherwise!` },
          { speakerId: 'stats' as const, text: `The numbers back it up. ${tdRate.toFixed(1)} touchdowns per game with ${intRate.toFixed(1)} interceptions. That kind of efficiency puts him among the best in the league. ${qbName} has taken a real step forward.` },
          { speakerId: 'hottake' as const, text: `This is a DIFFERENT quarterback than what they started with! The growth, the poise, the decision-making — they've got their franchise guy and it's TIME to build around him!` },
        ],
        teamIds: [team.id],
        playerIds: [teamQB.id],
      });
    }

    // Winning/losing streak narrative
    if (team.record.streak >= 4) {
      topics.push({
        headline: `${team.record.streak}-Game Win Streak`,
        icon: '🔥',
        exchanges: [
          { speakerId: 'hottake' as const, text: `${team.record.streak} STRAIGHT WINS! The ${team.name} are the HOTTEST team in football right now! Nobody wants to play them in January!` },
          { speakerId: 'stats' as const, text: `${team.record.streak} consecutive victories. The ${team.name} have completely turned their season around. If they keep this up, they're a legitimate contender.` },
        ],
        teamIds: [team.id],
        playerIds: teamQB ? [teamQB.id] : [],
      });
    } else if (team.record.streak <= -4) {
      topics.push({
        headline: `${Math.abs(team.record.streak)}-Game Losing Skid`,
        icon: '📉',
        exchanges: [
          { speakerId: 'hottake' as const, text: `${Math.abs(team.record.streak)} straight losses! This team has QUIT! The body language, the effort — it's OVER! Something drastic needs to happen!` },
          { speakerId: 'stats' as const, text: `A ${Math.abs(team.record.streak)}-game losing streak is concerning at any point, but at this stage of the season it could be fatal to their playoff hopes. The coaching staff needs to find a spark.` },
        ],
        teamIds: [team.id],
        playerIds: [],
      });
    }
  }
  } // end if (gamesPlayed > 0)

  // ─── 3. Star Player Spotlight (stats-driven) ───
  const star = [...activeRoster].sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
  if (star && gamesPlayed > 0) {
    const statFn = primaryStatForPosition(star);
    const posFilter = star.position === 'QB' ? allActive.filter(p => p.position === 'QB')
      : ['WR', 'TE'].includes(star.position) ? allActive.filter(p => ['WR', 'TE'].includes(p.position))
      : ['DL', 'LB'].includes(star.position) ? allActive.filter(p => ['DL', 'LB'].includes(p.position))
      : ['CB', 'S'].includes(star.position) ? allActive.filter(p => ['CB', 'S'].includes(p.position))
      : allActive;
    const starRank = playerLeagueRank(posFilter, star.id, statFn);
    const starStatLine = getPlayerStatLine(star);

    const starTemplates: (() => DebateExchange[])[] = [
      () => [
        { speakerId: 'hottake' as const, text: `Can we talk about ${star.firstName} ${star.lastName}?! This ${star.age}-year-old ${star.position} is putting up NUMBERS — ${starStatLine}. That's ${ordinal(starRank.rank)} at his position in the ENTIRE LEAGUE! ${star.age <= 26 ? "And he's only getting BETTER!" : "ELITE production!"}` },
        { speakerId: 'stats' as const, text: `${star.lastName} is the engine. ${starStatLine}, ranking ${ordinal(starRank.rank)} among ${star.position}s. ${star.contract.yearsLeft > 1 ? `Locked up for ${star.contract.yearsLeft} more years at $${star.contract.salary}M — great value.` : `Contract expiring — and with these numbers, he'll command top dollar.`}` },
        { speakerId: 'hottake' as const, text: `${star.contract.yearsLeft <= 1 ? `PAY THIS MAN! ${ordinal(starRank.rank)} at his position and you're going to let him WALK?! Insanity!` : `You build the ENTIRE franchise around production like that! ${star.lastName} IS the ${team.name}!`}` },
      ],
      () => [
        { speakerId: 'stats' as const, text: `${star.firstName} ${star.lastName}: ${starStatLine}. That ranks ${ordinal(starRank.rank)} among all ${star.position}s. He's ${star.ratings.overall} OVR, age ${star.age}${star.potential > star.ratings.overall ? `, with room to grow to ${star.potential}` : ''}.` },
        { speakerId: 'hottake' as const, text: `${starRank.rank <= 5 ? `TOP 5 at his position?! ${star.lastName} is a SUPERSTAR and everyone needs to recognize it!` : starRank.rank <= 15 ? `${ordinal(starRank.rank)} is solid but I want to see him break into that TOP 5! He's got the talent!` : `The talent is there at ${star.ratings.overall} OVR but the stats need to catch up. Put better pieces around him!`}` },
        { speakerId: 'stats' as const, text: `The surrounding cast matters. ${star.lastName}'s production is a function of both his talent and the system. ${starRank.rank <= 10 ? "He's maximizing his opportunities." : "There's untapped potential if the team improves around him."}` },
      ],
    ];
    topics.push({
      headline: `Star Watch: ${star.firstName} ${star.lastName}`,
      icon: '⭐',
      exchanges: pick(starTemplates, rng)(),
      teamIds: [team.id],
      playerIds: [star.id],
    });
  }

  // ─── 4. Cap Situation ───
  const expiringContracts = activeRoster.filter(p => p.contract.yearsLeft <= 1).length;
  const deadCapTotal = team.deadCap?.reduce((s, d) => s + d.amount, 0) ?? 0;
  const capTemplates: (() => DebateExchange[])[] = capSpace > 30 ? [
    () => [
      { speakerId: 'stats' as const, text: `Cap situation: $${capSpace}M in space on a $${team.salaryCap}M cap (${capPct}% used). That's significant flexibility. ${expiringContracts} contracts expiring${deadCapTotal > 0 ? `, $${Math.round(deadCapTotal * 10) / 10}M in dead cap` : ''}.` },
      { speakerId: 'hottake' as const, text: `$${capSpace}M to spend?! Go GET somebody! ${defRank > totalTeams / 2 ? `The defense is ${ordinal(defRank)} — spend it on a pass rusher or corner!` : ppgRank > totalTeams / 2 ? `The offense is ${ordinal(ppgRank)} in scoring — go get a playmaker!` : `This team could be a SUPER TEAM with the right signing!`}` },
      { speakerId: 'stats' as const, text: `Flexibility is valuable, but overspending on the wrong player can set a franchise back years. Targeted spending on the weak spots makes more sense.` },
    ],
  ] : capSpace > 10 ? [
    () => [
      { speakerId: 'stats' as const, text: `The cap is at ${capPct}% utilization — $${capSpace}M remaining. Not a lot of room, but enough for a mid-tier signing. ${expiringContracts} contracts expire after this season.` },
      { speakerId: 'hottake' as const, text: `$${capSpace}M isn't going to move the needle! They need to get CREATIVE — restructure some deals, make space for a real impact player!` },
    ],
  ] : [
    () => [
      { speakerId: 'hottake' as const, text: `$${capSpace}M in cap space?! They're basically BROKE! One bad contract away from cap HELL!` },
      { speakerId: 'stats' as const, text: `It's tight — ${capPct}% of the cap committed. ${expiringContracts} expiring contracts provide some relief next season${deadCapTotal > 0 ? `, though $${Math.round(deadCapTotal * 10) / 10}M in dead cap hurts` : ''}. They'll need to be strategic.` },
      { speakerId: 'hottake' as const, text: `Strategic?! They need a MIRACLE! Start cutting some of those overpaid guys and free up space!` },
    ],
  ];
  topics.push({
    headline: 'Cap Room',
    icon: '💰',
    exchanges: pick(capTemplates, rng)(),
    teamIds: [team.id],
    playerIds: [],
  });

  // ─── 5. Young Core / Development Watch ───
  const youngStars = activeRoster
    .filter(p => p.age <= 25 && p.potential >= 75)
    .sort((a, b) => b.potential - a.potential);
  if (youngStars.length > 0) {
    const top = youngStars[0];
    const topStatLine = gamesPlayed > 0 ? getPlayerStatLine(top) : '';
    const topStatFn = primaryStatForPosition(top);
    const topPosPool = top.position === 'QB' ? allActive.filter(p => p.position === 'QB')
      : ['WR', 'TE'].includes(top.position) ? allActive.filter(p => ['WR', 'TE'].includes(p.position))
      : ['DL', 'LB'].includes(top.position) ? allActive.filter(p => ['DL', 'LB'].includes(p.position))
      : allActive;
    const topRank = gamesPlayed > 0 ? playerLeagueRank(topPosPool, top.id, topStatFn) : null;

    const youngTemplates: (() => DebateExchange[])[] = [
      () => [
        { speakerId: 'hottake' as const, text: `The future is BRIGHT! ${top.firstName} ${top.lastName} — ${top.age} years old, already putting up ${topStatLine}${topRank ? ` (${ordinal(topRank.rank)} at ${top.position})` : ''}! This kid is a FRANCHISE PLAYER in the making!${youngStars.length > 1 ? ` And there's ${youngStars.length - 1} more young studs behind him!` : ''}` },
        { speakerId: 'stats' as const, text: `${top.lastName}'s development curve is promising — ${top.ratings.overall} OVR with a ceiling of ${top.potential}. ${topRank && topRank.rank <= 15 ? `Already ranking ${ordinal(topRank.rank)} at his position as a ${top.age}-year-old is remarkable.` : 'The key is patience and playing time.'}${youngStars.length > 1 ? ` With ${youngStars.length} high-ceiling players under 25, the pipeline is strong.` : ''}` },
        { speakerId: 'hottake' as const, text: `Patience?! Give ${top.lastName} the keys and let him COOK! You don't develop stars by holding them back!` },
      ],
      () => [
        { speakerId: 'stats' as const, text: `The youth movement is real. ${youngStars.length} player${youngStars.length > 1 ? 's' : ''} under 25 with 75+ potential: ${youngStars.slice(0, 3).map(p => `${p.firstName} ${p.lastName} (${p.position}, ${getPlayerStatLine(p)})`).join('; ')}${youngStars.length > 3 ? `; plus ${youngStars.length - 3} more` : ''}.` },
        { speakerId: 'hottake' as const, text: `DYNASTY! I see a DYNASTY forming! These kids are putting up REAL stats already — imagine them in two years!` },
        { speakerId: 'stats' as const, text: `Potential doesn't always translate. But the production at this age is encouraging — it's about sustained growth.` },
      ],
    ];
    topics.push({
      headline: 'Young Core Watch',
      icon: '🌟',
      exchanges: pick(youngTemplates, rng)(),
      teamIds: [team.id],
      playerIds: youngStars.slice(0, 3).map(p => p.id),
    });
  }

  // ─── 6. Playoff Outlook (regular season, week 4+) ───
  if (gamesPlayed >= 4) {
    const confLeader = confSorted[0];
    const gamesBack = confLeader && confLeader.id !== team.id
      ? ((confLeader.record.wins - team.record.wins) + (team.record.losses - confLeader.record.losses)) / 2
      : 0;
    const playoffExchanges: DebateExchange[] = confRank <= 7 ? [
      { speakerId: 'stats' as const, text: `Playoff picture: ${ordinal(confRank)} in the ${team.conference}${gamesBack > 0 ? `, ${gamesBack} games back of ${confLeader?.city ?? 'the leader'}` : ' — leading the conference'}. They're ${ordinal(ppgRank)} in scoring and ${ordinal(defRank)} in defense — ${ppgRank <= 10 && defRank <= 10 ? 'both sides can carry them in the postseason' : ppgRank <= 10 ? 'the offense can carry them but the defense is a concern' : defRank <= 10 ? 'the defense can win playoff games but they need more offensive firepower' : 'they need to elevate on both sides of the ball'}.` },
      { speakerId: 'hottake' as const, text: `${confRank <= 4 ? "They're IN! Book it! This team has PLAYOFF TEAM written all over them!" : "They're on the BUBBLE and every game is WIN OR GO HOME!"}` },
      { speakerId: 'stats' as const, text: `${confRank <= 4 ? `Division record of ${team.record.divisionWins}-${team.record.divisionLosses} is key for tiebreakers.` : `They need to close the gap. ${gamesBack > 0 ? gamesBack + ' games back is doable but no margin for error.' : 'The race is tight.'}`}` },
    ] : [
      { speakerId: 'stats' as const, text: `At ${ordinal(confRank)} in the ${team.conference}${gamesBack > 0 ? `, ${gamesBack} games back` : ''}, the playoff math is getting difficult. The ${ordinal(ppgRank)}-ranked offense and ${ordinal(defRank)}-ranked defense just haven't been enough.` },
      { speakerId: 'hottake' as const, text: `It's not IMPOSSIBLE! But when you're ${ordinal(ppgRank)} in scoring... yeah, it's tough to make a late-season push.` },
      { speakerId: 'stats' as const, text: `The smart move is evaluating young talent and positioning for next season rather than forcing a run.` },
    ];
    // Weave injury context into playoff outlook
    if (topInjured && topInjured.ratings.overall >= 75) {
      const isDefPlayer = ['DL', 'LB', 'CB', 'S'].includes(topInjured.position);
      const weeksOut = topInjured.injury?.weeksLeft ?? 0;
      if (confRank <= 7) {
        playoffExchanges.push({ speakerId: 'hottake' as const, text: `The X-FACTOR is ${topInjured.firstName} ${topInjured.lastName}'s health! ${weeksOut} more week${weeksOut !== 1 ? 's' : ''} without ${isDefPlayer ? 'your best defender' : 'your best offensive weapon'} is SCARY for a playoff push! ${getPlayerStatLine(topInjured)} on the year — that's production you NEED in January!` });
      } else {
        playoffExchanges.push({ speakerId: 'stats' as const, text: `The ${topInjured.lastName} injury (${weeksOut} weeks remaining) only compounds the problem. You lose ${getPlayerStatLine(topInjured)} worth of production when you can least afford it.` });
      }
    }
    if (injuredPlayers.length >= 3) {
      playoffExchanges.push({ speakerId: 'hottake' as const, text: `And with ${injuredPlayers.length} key players on the injury list, this team is literally LIMPING into the stretch run! You can't make a playoff push with your roster in a hospital bed!` });
    }
    topics.push({
      headline: 'Playoff Picture',
      icon: '🏈',
      exchanges: playoffExchanges,
      teamIds: [team.id],
      playerIds: topInjured ? [topInjured.id] : [],
    });
  }

  // ─── 7. Injury Report ───
  if (injuredPlayers.length > 0) {
    const worst = injuredPlayers[0];
    const worstStatLine = getPlayerStatLine(worst);
    const weeksOut = worst.injury?.weeksLeft ?? 0;
    const injuryType = worst.injury?.type ?? 'injury';

    // Find the backup at the injured player's position
    const backups = activeRoster
      .filter(p => p.position === worst.position && !p.injury && p.id !== worst.id)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);
    const backup = backups[0];
    const ovrDrop = backup ? worst.ratings.overall - backup.ratings.overall : 0;

    // Check if injured player is a key position vs the next opponent
    const isDefensivePlayer = ['DL', 'LB', 'CB', 'S'].includes(worst.position);
    const oppQB = nextOpponentRoster.filter(p => p.position === 'QB').sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
    const oppRusher = nextOpponentRoster.sort((a, b) => b.stats.rushYards - a.stats.rushYards)[0];
    const oppReceiver = nextOpponentRoster.filter(p => ['WR', 'TE'].includes(p.position)).sort((a, b) => b.stats.receivingYards - a.stats.receivingYards)[0];

    // Second most injured player for multi-injury discussions
    const secondInjured = injuredPlayers.length > 1 ? injuredPlayers[1] : null;

    const injuryTemplates: (() => DebateExchange[])[] = [
      // Template 1: General injury impact with depth chart concern
      () => [
        { speakerId: 'stats' as const, text: `Injury front: ${injuredPlayers.length} key player${injuredPlayers.length > 1 ? 's' : ''} down. ${worst.firstName} ${worst.lastName} (${worst.position}, ${worst.ratings.overall} OVR) out with a ${injuryType} — ${weeksOut} week${weeksOut !== 1 ? 's' : ''} remaining. He's been producing ${worstStatLine} this season.${secondInjured ? ` ${secondInjured.firstName} ${secondInjured.lastName} (${secondInjured.position}) is also out with a ${secondInjured.injury?.type ?? 'injury'}.` : ''}` },
        { speakerId: 'hottake' as const, text: `I don't know if they can win without ${worst.lastName}! ${worstStatLine} on the year — he is the heart of ${isDefensivePlayer ? 'their defense' : 'that offense'}! ${backup ? `${backup.firstName} ${backup.lastName} is a ${ovrDrop}-point OVR drop-off at ${worst.position}. That's a MASSIVE downgrade!` : `They have NOBODY to replace him!`}` },
        { speakerId: 'stats' as const, text: `${backup ? `${backup.lastName} steps in at ${backup.ratings.overall} OVR — that's a ${ovrDrop > 15 ? 'significant' : ovrDrop > 8 ? 'noticeable' : 'manageable'} drop-off.` : 'The depth simply isn\'t there.'} ${weeksOut <= 2 ? `The silver lining: ${worst.lastName} could be back in ${weeksOut} week${weeksOut !== 1 ? 's' : ''}.` : `${weeksOut} weeks is a long time to survive without your ${worst.ratings.overall >= 85 ? 'best player' : 'key contributor'}.`}` },
      ],
      // Template 2: Next opponent matchup concern
      () => {
        const exchanges: DebateExchange[] = [];
        if (nextOpponent && isDefensivePlayer) {
          exchanges.push({ speakerId: 'hottake' as const, text: `The timing could NOT be worse! ${worst.firstName} ${worst.lastName} is out with a ${injuryType} and they're going up against ${nextOpponent.city} ${nextOpponent.name} next!${oppQB ? ` ${oppQB.firstName} ${oppQB.lastName} is going to FEAST without ${worst.lastName} out there!` : ''} ${worstStatLine} on the year — they will STRUGGLE to ${worst.position === 'DL' || worst.position === 'LB' ? `put pressure on ${nextOpponent.abbreviation}` : `cover ${nextOpponent.abbreviation}'s receivers`} without him!` });
          exchanges.push({ speakerId: 'stats' as const, text: `It's a legitimate matchup concern. ${worst.lastName}'s ${worstStatLine} can't be replicated. ${backup ? `${backup.firstName} ${backup.lastName} (${backup.ratings.overall} OVR) will need to step up, but ${ovrDrop > 10 ? 'the gap is significant' : 'he\'s shown flashes'}.` : 'The depth chart is thin at that position.'} ${weeksOut <= 2 ? `Hoping for a quick return — ${weeksOut} week${weeksOut !== 1 ? 's' : ''} left.` : `At ${weeksOut} weeks out, they need a plan beyond just surviving.`}` });
          exchanges.push({ speakerId: 'hottake' as const, text: `${weeksOut <= 2 ? `They just need to hold on for ${weeksOut} more week${weeksOut !== 1 ? 's' : ''}! Get him back and this team is DIFFERENT!` : `${weeksOut} WEEKS! That's basically ${Math.ceil(weeksOut / 4)} months! The season could be OVER by then!`}` });
        } else if (nextOpponent && !isDefensivePlayer) {
          exchanges.push({ speakerId: 'hottake' as const, text: `Without ${worst.firstName} ${worst.lastName} (${worstStatLine}), how do they move the ball against ${nextOpponent.city}?! He's out ${weeksOut} more week${weeksOut !== 1 ? 's' : ''} with a ${injuryType}! That offense is NOT the same without him!` });
          exchanges.push({ speakerId: 'stats' as const, text: `${worst.position === 'QB' ? 'Losing your quarterback changes everything.' : worst.position === 'OL' ? 'The pass protection takes a hit without him.' : `${worst.lastName} accounted for ${worstStatLine}.`} ${backup ? `${backup.lastName} (${backup.ratings.overall} OVR) gets the nod but the ${ovrDrop > 10 ? 'talent gap is real' : 'transition should be manageable'}.` : 'No clear replacement on the roster.'} The game plan against ${nextOpponent.abbreviation} will have to adapt.` });
          exchanges.push({ speakerId: 'hottake' as const, text: `Adapt?! They need a MIRACLE! ${worst.lastName} IS that offense!${secondInjured ? ` And ${secondInjured.lastName} is ALSO out! This team is falling apart!` : ''}` });
        } else {
          // No next opponent context — generic
          exchanges.push({ speakerId: 'stats' as const, text: `${worst.firstName} ${worst.lastName} (${worst.position}, ${worst.ratings.overall} OVR): out ${weeksOut} week${weeksOut !== 1 ? 's' : ''} with a ${injuryType}. Season stats: ${worstStatLine}. ${injuredPlayers.length > 1 ? `${injuredPlayers.length} key players total on the injury list.` : ''}` });
          exchanges.push({ speakerId: 'hottake' as const, text: `${worst.lastName} was having a ${worst.ratings.overall >= 85 ? 'MONSTER' : worst.ratings.overall >= 75 ? 'fantastic' : 'solid'} season! ${worstStatLine}! You CAN'T lose a guy like that and expect to keep winning!` });
          exchanges.push({ speakerId: 'stats' as const, text: `${backup ? `The backup, ${backup.firstName} ${backup.lastName}, is ${backup.ratings.overall} OVR — ${ovrDrop > 15 ? 'a steep cliff' : ovrDrop > 8 ? 'a downgrade but workable' : 'actually not a bad fill-in'}.` : 'Depth is a real problem at this position.'} ${weeksOut <= 3 ? 'At least the timeline for return is short.' : 'This is a long-term absence that could derail the season.'}` });
        }
        return exchanges;
      },
      // Template 3: Multiple injuries focus
      () => {
        if (injuredPlayers.length >= 2 && secondInjured) {
          const secondStatLine = getPlayerStatLine(secondInjured);
          return [
            { speakerId: 'hottake' as const, text: `The injury bug is DESTROYING this team! ${worst.firstName} ${worst.lastName} out ${weeksOut} weeks (${injuryType}) — ${worstStatLine}. ${secondInjured.firstName} ${secondInjured.lastName} ALSO down with a ${secondInjured.injury?.type ?? 'injury'}! That's ${injuredPlayers.length} key players on the shelf!` },
            { speakerId: 'stats' as const, text: `It's a significant hit. ${worst.lastName} (${worst.ratings.overall} OVR, ${worst.position}) and ${secondInjured.lastName} (${secondInjured.ratings.overall} OVR, ${secondInjured.position}) combine for ${worstStatLine} and ${secondStatLine}. That's production you can't just manufacture from the bench.${nextOpponent ? ` Facing ${nextOpponent.city} without both of them is concerning.` : ''}` },
            { speakerId: 'hottake' as const, text: `${injuredPlayers.length >= 3 ? `${injuredPlayers.length} guys down?! At what point do you just call the season?!` : `Two of your best players OUT! This is where you find out what the rest of the roster is made of!`}${nextOpponent ? ` ${nextOpponent.abbreviation} has to be LICKING THEIR CHOPS right now!` : ''}` },
          ];
        }
        // Fallback for single injury
        return [
          { speakerId: 'stats' as const, text: `Key injury: ${worst.firstName} ${worst.lastName} (${worst.position}, ${worst.ratings.overall} OVR) — ${injuryType}, ${weeksOut} week${weeksOut !== 1 ? 's' : ''} out. Season line: ${worstStatLine}.` },
          { speakerId: 'hottake' as const, text: `${worst.lastName} was putting up ${worstStatLine}! He's the ${worst.ratings.overall >= 85 ? 'MVP of this team' : 'backbone of the roster'}! Without him${nextOpponent ? ` against ${nextOpponent.abbreviation}` : ''}, I'm worried!` },
          { speakerId: 'stats' as const, text: `${backup ? `${backup.lastName} at ${backup.ratings.overall} OVR is the next man up — ${ovrDrop > 12 ? 'a significant step down' : 'capable of holding the fort'}.` : 'No ready replacement.'} Watch this closely.` },
        ];
      },
    ];
    topics.push({
      headline: `Injury Report${injuredPlayers.length >= 3 ? ` (${injuredPlayers.length} Key Players Out)` : topInjured ? `: ${topInjured.firstName} ${topInjured.lastName}` : ''}`,
      icon: '🏥',
      exchanges: pick(injuryTemplates, rng)(),
      teamIds: [team.id],
      playerIds: injuredPlayers.slice(0, 3).map(p => p.id),
    });
  }

  // ─── 7b. Playing Through Injury ───
  // When the user elects to start an injured player, it's a strategic risk
  // worth debating — the reduced ceiling + elevated re-injury chance.
  const playThroughPlayers = activeRoster.filter(p => p.playingThroughInjury && p.injury && p.injury.weeksLeft > 0);
  if (playThroughPlayers.length > 0) {
    const top = playThroughPlayers.sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
    const w = top.injury!.weeksLeft;
    const penalty = w >= 3 ? 20 : w === 2 ? 12 : 5;
    const reinjPct = w >= 3 ? 25 : w === 2 ? 15 : 8;
    const otherCount = playThroughPlayers.length - 1;
    topics.push({
      headline: `${top.firstName} ${top.lastName} Playing Through ${top.injury!.type}`,
      icon: '⚠️',
      exchanges: pick<() => DebateExchange[]>([
        () => [
          { speakerId: 'hottake' as const, text: `Tony's take: this is a GUTSY call. ${top.firstName} ${top.lastName} suiting up with ${w} week${w === 1 ? '' : 's'} left on a ${top.injury!.type} — that's championship mentality RIGHT THERE! Sometimes you've got to send your horse out there!` },
          { speakerId: 'stats' as const, text: `Gutsy or reckless, Tony. Playing through cuts ${top.lastName}'s effective OVR by ~${penalty} points and carries a ${reinjPct}% re-injury risk per game. If he aggravates that ${top.injury!.type}, you're looking at a severity tier up — potentially ending his playoff run entirely.` },
          { speakerId: 'hottake' as const, text: `Risk?! That's WHY you hired a GM, Marcus! To make the tough calls! You don't win rings being CAUTIOUS!${otherCount > 0 ? ` And he's not alone — ${otherCount} more player${otherCount > 1 ? 's are' : ' is'} gutting it out!` : ''}` },
        ],
        () => [
          { speakerId: 'stats' as const, text: `${top.firstName} ${top.lastName} is active despite ${w} week${w === 1 ? '' : 's'} remaining on a ${top.injury!.type}. He'll play diminished — expect ~${Math.max(30, top.ratings.overall - penalty)} OVR — and the re-injury math is ugly: ${reinjPct}% per game, with the next injury guaranteed to be worse and longer.` },
          { speakerId: 'hottake' as const, text: `The NUMBERS don't know what it means to be a WARRIOR, Marcus! ${top.lastName} wants the ball! That's what matters! HEART can't be quantified!` },
          { speakerId: 'stats' as const, text: `Heart gets him on the field. The ${top.injury!.type} decides whether he stays there. It's a bet on short-term upside against a meaningful long-term downside.` },
        ],
      ], rng)(),
      teamIds: [team.id],
      playerIds: playThroughPlayers.slice(0, 3).map(p => p.id),
    });
  }

  // ─── 7c. Re-injury Fallout ───
  // When a player recently re-injured while playing through, the news item
  // surfaces it — but the commentary should treat it as an indictment of the
  // front-office decision, not just a health update.
  const recentReInjNews = (ctx.newsItems ?? []).filter(n =>
    n.type === 'injury' &&
    n.teamId === team.id &&
    n.season === season &&
    n.headline.includes('re-injured playing through')
  );
  if (recentReInjNews.length > 0) {
    const reInj = recentReInjNews[0];
    const player = reInj.playerIds && reInj.playerIds.length > 0
      ? allPlayers.find(p => p.id === reInj.playerIds![0])
      : undefined;
    const name = player ? `${player.firstName} ${player.lastName}` : 'the player';
    topics.push({
      headline: `${name} Re-Injured — Was It the Right Call?`,
      icon: '🚑',
      exchanges: [
        { speakerId: 'hottake' as const, text: `THIS is what I was afraid of! ${name} goes out there banged up and comes back MORE banged up! That's a front-office DISASTER, Marcus! Who signed off on this?!` },
        { speakerId: 'stats' as const, text: `The math warned us, Tony. Starting a player with 3 or fewer weeks on an injury carries a re-injury probability north of 15%. When it hits, the next injury is categorically worse. ${reInj.body ?? ''}` },
        { speakerId: 'hottake' as const, text: `You don't get to play the "I told you so" card when a PLAYER gets HURT, Marcus! But yeah — the ${team.city} front office has some SOUL-SEARCHING to do after this one!` },
      ],
      teamIds: [team.id],
      playerIds: player ? [player.id] : [],
    });
  }

  // ─── 8. Draft Capital ───
  // Only count picks for the NEXT upcoming draft — future-year picks are
  // their own story (not "I have 2 first-rounders" this year).
  const hasThisYearsPicks = team.draftPicks?.some(pk => pk.year === season && !pk.playerId) ?? false;
  const nextDraftYear = hasThisYearsPicks ? season : season + 1;
  const picks = team.draftPicks?.filter(pk => pk.year === nextDraftYear && !pk.playerId) ?? [];
  const futurePicks = team.draftPicks?.filter(pk => pk.year > nextDraftYear && !pk.playerId) ?? [];
  const firstRounders = picks.filter(pk => pk.round === 1).length;
  const secondRounders = picks.filter(pk => pk.round === 2).length;
  const futureFirsts = futurePicks.filter(pk => pk.round === 1).length;
  if (picks.length > 0 && (firstRounders >= 2 || picks.length >= 8)) {
    const needArea = defRank > totalTeams / 2 ? 'defense' : ppgRank > totalTeams / 2 ? 'offense' : 'depth';
    const futureNote = futureFirsts > 0 ? ` Also sitting on ${futureFirsts} future first${futureFirsts > 1 ? 's' : ''} beyond ${nextDraftYear}.` : '';
    topics.push({
      headline: 'Draft Capital',
      icon: '📋',
      exchanges: [
        { speakerId: 'stats', text: `For the ${nextDraftYear} draft: ${picks.length} picks — ${firstRounders} first-rounder${firstRounders !== 1 ? 's' : ''} and ${secondRounders} second-rounder${secondRounders !== 1 ? 's' : ''}.${futureNote} Given the ${ordinal(defRank)}-ranked defense and ${ordinal(ppgRank)}-ranked offense, ${needArea} should be the priority.` },
        { speakerId: 'hottake', text: `${firstRounders >= 2 ? `Two firsts in ${nextDraftYear}?! Package them for a BLOCKBUSTER trade or draft a GAME-CHANGER for that ${needArea}!` : "Use those picks WISELY! Every pick matters when you need to improve!"}` },
        { speakerId: 'stats', text: `Best player available, then address ${needArea} needs in free agency. That's how sustainable winners are built.` },
      ],
      teamIds: [team.id],
      playerIds: [],
    });
  }

  // ─── 9. Streak / Momentum ───
  const streak = team.record.streak;
  if (streak >= 3 || streak <= -3) {
    const isWin = streak > 0;
    topics.push({
      headline: isWin ? `${streak}-Game Win Streak` : `${Math.abs(streak)}-Game Losing Streak`,
      icon: isWin ? '📈' : '📉',
      exchanges: isWin ? [
        { speakerId: 'hottake', text: `${streak} straight WINS! During this streak, the ${ordinal(ppgRank)}-ranked offense has been UNSTOPPABLE! Nobody wants to play this team right now!` },
        { speakerId: 'stats', text: `Streaks like this build on themselves. The ${ordinal(defRank)}-ranked defense has been holding up its end too — ${myStats.oppPpg} PPG allowed. Confidence is real and measurable.` },
        { speakerId: 'hottake', text: `RIDE THE WAVE! This team is PEAKING at the perfect time!` },
      ] : [
        { speakerId: 'hottake', text: `${Math.abs(streak)} straight losses! The offense is ${ordinal(ppgRank)} in scoring and the defense is ${ordinal(defRank)} — BOTH sides have been terrible during this skid!` },
        { speakerId: 'stats', text: `Losing streaks compound. At ${myStats.ppg} PPG and allowing ${myStats.oppPpg}, the margins aren't there. They need to simplify and find a way to stop the bleeding.` },
        { speakerId: 'hottake', text: `Or maybe just some players who actually WANT TO WIN!` },
      ],
      teamIds: [team.id],
      playerIds: [],
    });
  }

  // ─── 10. Burning Question (always last) ───
  const groupStats = Object.entries(POSITION_GROUPS).map(([name, positions]) => ({
    name,
    avg: posGroupAvgOvr(activeRoster, positions),
    count: activeRoster.filter(p => positions.includes(p.position)).length,
  })).filter(g => g.count > 0).sort((a, b) => b.avg - a.avg);

  // Build injury context for the burning question
  const injuryNote = topInjured
    ? ` And don't forget — ${topInjured.firstName} ${topInjured.lastName} (${topInjured.position}, ${getPlayerStatLine(topInjured)}) is still out ${topInjured.injury?.weeksLeft ?? '?'} more week${(topInjured.injury?.weeksLeft ?? 0) !== 1 ? 's' : ''}.`
    : '';
  const injuryImpact = injuredPlayers.length >= 2
    ? ` With ${injuredPlayers.length} key players injured, the margin for error is razor-thin.`
    : topInjured
    ? ` Getting ${topInjured.lastName} back healthy would change the calculus.`
    : '';

  const burningQs: (() => DebateExchange[])[] = winPct >= 0.6 ? [
    () => [
      { speakerId: 'hottake' as const, text: `Here's the BIG question: can the ${team.name} keep this up? ${ordinal(ppgRank)} in scoring, ${ordinal(defRank)} in defense — are they for REAL or a mirage?${injuryNote}` },
      { speakerId: 'stats' as const, text: `Point differential of ${pointDiff > 0 ? '+' : ''}${pointDiff}, balanced attack at ${myStats.passYpg} pass and ${myStats.rushYpg} rush yards per game — the metrics say they're genuine.${topInjured ? ` ${topInjured.lastName}'s return in ${topInjured.injury?.weeksLeft ?? '?'} weeks could make them even more dangerous.` : ' Barring major injuries, no reason for collapse.'}` },
      { speakerId: 'hottake' as const, text: `I BELIEVE! Championship or BUST!${topInjured ? ` And when ${topInjured.lastName} comes back?! WATCH OUT!` : ''}` },
    ],
  ] : winPct <= 0.35 ? [
    () => [
      { speakerId: 'hottake' as const, text: `Is it time to blow it up and REBUILD? ${ordinal(ppgRank)} in offense, ${ordinal(defRank)} in defense — this isn't working!${injuryNote}` },
      { speakerId: 'stats' as const, text: `The stats don't lie — ${myStats.ppg} PPG and ${myStats.oppPpg} allowed.${injuryImpact} But if the young talent is developing, a retool makes more sense than a full teardown.` },
      { speakerId: 'hottake' as const, text: `Trade anyone over 28 and stockpile picks! That's my plan!` },
      { speakerId: 'stats' as const, text: `That's... actually not the worst strategy.${topInjured ? ` And getting ${topInjured.lastName} healthy gives you a foundation to build around.` : ' But keep a few vets for development.'}` },
    ],
  ] : [
    () => [
      { speakerId: 'hottake' as const, text: `So what's the move? The ${team.name} are RIGHT THERE — ${ordinal(ppgRank)} offense, ${ordinal(defRank)} defense. One piece away or one bad break from disaster?${injuryNote}` },
      { speakerId: 'stats' as const, text: `The data says they're on the cusp.${injuryImpact} A difference-maker at ${groupStats[groupStats.length - 1]?.name ?? 'their weakest position'} could tip the scales. ${rushOffRank > 16 ? 'Improving the run game would open everything up.' : passOffRank > 16 ? 'A better passing attack changes the equation.' : 'Consistency is the key.'}` },
      { speakerId: 'hottake' as const, text: `Make a TRADE! Be AGGRESSIVE! You don't win championships by playing it safe!${topInjured ? ` Or at least get ${topInjured.lastName} back and pray!` : ''}` },
      { speakerId: 'stats' as const, text: `But you don't win them by mortgaging your future either. Balance.` },
    ],
  ];
  topics.push({
    headline: 'The Burning Question',
    icon: '🔥',
    exchanges: pick(burningQs, rng)(),
    teamIds: [team.id],
    playerIds: topInjured ? [topInjured.id] : [],
  });

  // ─── Phase-specific topics ───
  const phase = ctx.phase ?? 'regular';

  // ─── PLAYOFFS: bracket status, matchup previews, championship ───
  if ((phase === 'playoffs' || phase === 'resigning' || phase === 'draft' || phase === 'freeAgency') && ctx.playoffBracket) {
    const bracket = ctx.playoffBracket;
    const championship = bracket.find(m => m.id === 'championship');
    const champWon = championship?.winnerId === team.id;
    const champLost = championship?.winnerId && championship.winnerId !== team.id
      && (championship.homeTeamId === team.id || championship.awayTeamId === team.id);

    // Find user's seed
    const seeds = ctx.playoffSeeds;
    const userSeed = seeds ? (seeds.AC.indexOf(team.id) + 1 || seeds.NC.indexOf(team.id) + 1) : 0;
    const madePlayoffs = userSeed > 0 && userSeed <= 7;

    // User's playoff games (wins/losses)
    const userGames = bracket.filter(m =>
      m.winnerId && (m.homeTeamId === team.id || m.awayTeamId === team.id));
    const userWins = userGames.filter(m => m.winnerId === team.id).length;
    const userLosses = userGames.filter(m => m.winnerId && m.winnerId !== team.id).length;

    if (champWon) {
      // Championship celebration!
      const mvp = ctx.finalsMvpPlayerId ? allPlayers.find(p => p.id === ctx.finalsMvpPlayerId) : null;
      const opponent = championship!.homeTeamId === team.id
        ? allTeams.find(t => t.id === championship!.awayTeamId)
        : allTeams.find(t => t.id === championship!.homeTeamId);
      const champCount = (ctx.champions ?? []).filter(c => c.teamId === team.id).length;

      const champTemplates: (() => DebateExchange[])[] = [
        () => [
          { speakerId: 'hottake', text: `CHAMPIONS!!! THE ${team.name.toUpperCase()} ARE CHAMPIONS! ${champCount > 1 ? `That's ${champCount} titles now — we're witnessing a DYNASTY!` : `Their FIRST championship — this franchise has ARRIVED!`} I'M LOSING MY MIND!` },
          { speakerId: 'stats', text: `What a run. ${userWins}-${userLosses} in the playoffs${opponent ? `, defeating ${opponent.city} ${opponent.name} in the championship` : ''}.${mvp ? ` ${mvp.firstName} ${mvp.lastName} was named Finals MVP — he was absolutely dominant.` : ''} The ${team.record.wins}-${team.record.losses} regular season record translated perfectly.` },
          { speakerId: 'hottake', text: `${mvp ? `${mvp.lastName} is a LEGEND! Finals MVP and he EARNED every bit of it!` : 'Every single player on this roster contributed!'} CHAMPIONSHIP PARADE — book it!` },
        ],
        () => [
          { speakerId: 'stats', text: `The ${team.city} ${team.name} are champions. ${userWins}-${userLosses} playoff record, capping a ${team.record.wins}-${team.record.losses} season.${mvp ? ` ${mvp.firstName} ${mvp.lastName} (${mvp.position}) took home Finals MVP honors.` : ''} This was built through smart roster construction and execution when it mattered most.` },
          { speakerId: 'hottake', text: `Smart roster construction?! SMART?! This was DOMINANCE! ${champCount > 1 ? `${champCount} championships and counting — who's going to stop them?!` : "From underdogs to CHAMPIONS — what a story!"} THIS is what we live for!` },
          { speakerId: 'stats', text: `Credit where it's due. The coaching, the player development, the in-game adjustments — all elite. This championship was earned.` },
        ],
      ];
      // Insert championship topic at the top
      topics.unshift({
        headline: `🏆 CHAMPIONS! ${team.city} ${team.name} Win It All!`,
        icon: '🏆',
        exchanges: pick(champTemplates, rng)(),
        teamIds: [team.id, ...(opponent ? [opponent.id] : [])],
        playerIds: mvp ? [mvp.id] : [],
      });
    } else if (champLost) {
      // Runner-up
      const opponent = championship!.winnerId ? allTeams.find(t => t.id === championship!.winnerId) : null;
      topics.unshift({
        headline: 'Championship Heartbreak',
        icon: '💔',
        exchanges: [
          { speakerId: 'hottake', text: `SO close! The ${team.name} made it to the championship and came up SHORT! ${opponent ? `${opponent.city} ${opponent.name} took it from them` : 'They couldn\'t close it out'}! That HURTS!` },
          { speakerId: 'stats', text: `Making the championship is an achievement — only 2 of ${allTeams.length} teams get there. But ${userWins}-${userLosses} in the playoffs shows this team is built for the postseason. They'll be motivated next year.` },
          { speakerId: 'hottake', text: `Motivation doesn't win trophies! They need to make MOVES this offseason to get over the hump!` },
        ],
        teamIds: [team.id],
        playerIds: [],
      });
    } else if (madePlayoffs && userLosses > 0) {
      // Eliminated in earlier round
      const roundNames = ['', 'Wild Card', 'Divisional', 'Conference Championship', 'Championship'];
      const eliminationGame = userGames.find(m => m.winnerId !== team.id);
      const roundEliminated = eliminationGame ? roundNames[eliminationGame.round] ?? 'the playoffs' : 'the playoffs';
      const eliminatedBy = eliminationGame?.winnerId ? allTeams.find(t => t.id === eliminationGame.winnerId) : null;

      topics.unshift({
        headline: `Playoff Exit: ${roundEliminated}`,
        icon: '😤',
        exchanges: [
          { speakerId: 'hottake', text: `OUT in the ${roundEliminated}! ${eliminatedBy ? `${eliminatedBy.city} ${eliminatedBy.name} sent the ${team.name} home!` : `The ${team.name} couldn't get it done!`} A ${team.record.wins}-${team.record.losses} season ends in DISAPPOINTMENT!` },
          { speakerId: 'stats', text: `As a ${ordinal(userSeed)} seed, ${userWins > 0 ? `they did win ${userWins} playoff game${userWins > 1 ? 's' : ''}` : 'the expectations were there'} — but the season ends earlier than hoped. The question now is what changes do they make this offseason?` },
          { speakerId: 'hottake', text: `${userSeed <= 3 ? "With that seed they should've gone FURTHER! Something needs to change!" : "They made the playoffs, now they need to learn how to WIN in the playoffs!"}` },
        ],
        teamIds: [team.id, ...(eliminatedBy ? [eliminatedBy.id] : [])],
        playerIds: [],
      });
    } else if (phase === 'playoffs' && madePlayoffs && userLosses === 0 && userWins > 0) {
      // Currently alive in playoffs
      const nextGame = bracket.find(m =>
        !m.winnerId && (m.homeTeamId === team.id || m.awayTeamId === team.id));
      const roundNames = ['', 'Wild Card', 'Divisional', 'Conference Championship', 'Championship'];
      if (nextGame) {
        const opponentId = nextGame.homeTeamId === team.id ? nextGame.awayTeamId : nextGame.homeTeamId;
        const opponent = opponentId ? allTeams.find(t => t.id === opponentId) : null;
        const roundName = roundNames[nextGame.round] ?? 'the next round';
        topics.unshift({
          headline: `${roundName} Preview`,
          icon: '🏈',
          exchanges: [
            { speakerId: 'hottake', text: `${roundName} time! The ${team.name} are ${userWins}-0 in the playoffs and ${opponent ? `facing the ${opponent.city} ${opponent.name}` : 'the opponent is TBD'}! ${userWins >= 2 ? "They're on a ROLL!" : "One win under their belt — time to build on it!"}` },
            { speakerId: 'stats', text: `${opponent ? `${opponent.city} went ${opponent.record.wins}-${opponent.record.losses} this season.` : 'Opponent still being determined.'} The ${team.name}'s playoff experience through ${userWins} game${userWins > 1 ? 's' : ''} should help. ${ordinal(ppgRank)} offense vs their opponent's defense will be the key matchup.` },
            { speakerId: 'hottake', text: `They can go ALL THE WAY! I BELIEVE!` },
          ],
          teamIds: [team.id, ...(opponent ? [opponent.id] : [])],
          playerIds: [],
        });
      }
    } else if (!madePlayoffs && phase !== 'playoffs') {
      // Missed playoffs — offseason
      topics.unshift({
        headline: 'Missed the Playoffs',
        icon: '😞',
        exchanges: [
          { speakerId: 'stats', text: `The ${team.name} finished ${team.record.wins}-${team.record.losses} — not enough to make the postseason. ${ordinal(confRank)} in the ${team.conference}. The offense was ${ordinal(ppgRank)} in scoring and the defense ${ordinal(defRank)}. Changes are needed.` },
          { speakerId: 'hottake', text: `${team.record.wins} wins?! This team needs a COMPLETE overhaul! The draft and free agency are going to be CRUCIAL!` },
          { speakerId: 'stats', text: `The focus should be on addressing the ${ppgRank > totalTeams / 2 ? 'offense' : defRank > totalTeams / 2 ? 'defense' : 'roster depth'}. Targeted improvements can turn things around quickly.` },
        ],
        teamIds: [team.id],
        playerIds: [],
      });
    }
  }

  // ─── DRAFT RECAP: commentary on draft picks ───
  if ((phase === 'draft' || phase === 'freeAgency') && ctx.draftResults && ctx.draftResults.length > 0) {
    const userPicks = ctx.draftResults.filter(d => d.teamId === team.id);
    if (userPicks.length > 0) {
      const draftedPlayers = userPicks
        .map(pk => allPlayers.find(p => p.id === pk.playerId))
        .filter(Boolean) as Player[];
      const topPick = draftedPlayers.sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
      const avgOvr = draftedPlayers.length > 0
        ? Math.round(draftedPlayers.reduce((s, p) => s + p.ratings.overall, 0) / draftedPlayers.length)
        : 0;
      const positions = [...new Set(draftedPlayers.map(p => p.position))];
      const firstPick = userPicks.sort((a, b) => a.overallPick - b.overallPick)[0];

      const draftTemplates: (() => DebateExchange[])[] = [
        () => [
          { speakerId: 'stats', text: `Draft recap: ${userPicks.length} picks made. ${topPick ? `${topPick.firstName} ${topPick.lastName} (${topPick.position}, ${topPick.ratings.overall} OVR) was the crown jewel, selected ${ordinal(firstPick.overallPick)} overall.` : ''} Average OVR of the class: ${avgOvr}. Positions addressed: ${positions.join(', ')}.` },
          { speakerId: 'hottake', text: `${topPick && topPick.ratings.overall >= 70 ? `${topPick.lastName} is a DAY ONE STARTER! That's a HOME RUN pick!` : topPick && topPick.potential >= 80 ? `${topPick.lastName}'s ceiling is THROUGH THE ROOF! Give him time and he's going to be SPECIAL!` : "Not the flashiest draft class, but role players win championships too!"}` },
          { speakerId: 'stats', text: `${draftedPlayers.length >= 3 ? `${draftedPlayers.length} new rookies gives them depth at key positions.` : 'A smaller class, but sometimes quality over quantity.'} The development staff will be critical for this group.` },
        ],
        () => [
          { speakerId: 'hottake', text: `Let's talk about this draft class! ${userPicks.length} picks and the headliner is ${topPick ? `${topPick.firstName} ${topPick.lastName} — a ${topPick.position} with ${topPick.ratings.overall} OVR${topPick.potential >= 80 ? ' and ELITE potential!' : '!'}` : 'a group of players ready to compete!'} ${avgOvr >= 60 ? "This class has JUICE!" : "These guys need development time!"}` },
          { speakerId: 'stats', text: `The picks addressed ${positions.length} position group${positions.length > 1 ? 's' : ''}: ${positions.join(', ')}. ${positions.includes('QB') ? "Getting a quarterback is a franchise-altering move." : "No QB, so they're committed to the current starter."} Average class OVR of ${avgOvr} is ${avgOvr >= 65 ? 'above average' : avgOvr >= 55 ? 'about league average' : 'a development-heavy class'}.` },
          { speakerId: 'hottake', text: `${topPick && firstPick.overallPick <= 10 ? "A top-10 pick is a STATEMENT!" : "Every pick is a chance to change the franchise!"} I can't WAIT to see these guys in action!` },
        ],
      ];
      topics.push({
        headline: `Draft Class Review: ${userPicks.length} Picks`,
        icon: '🎯',
        exchanges: pick(draftTemplates, rng)(),
        teamIds: [team.id],
        playerIds: draftedPlayers.slice(0, 3).map(p => p.id),
      });
    }
  }

  // ─── FREE AGENCY: cap situation and moves ───
  if (phase === 'freeAgency' && ctx.faDay !== undefined) {
    const faCount = (ctx.freeAgents ?? []).length;
    const expiringCount = roster.filter(p => p.contract.yearsLeft <= 0).length;
    // Find recently signed FAs (players on team drafted in different year or with contract starting now)
    const newSignings = roster.filter(p =>
      p.draftYear === season && (p.draftPick ?? 999) > 200 // Not drafted, so FA signing
    );

    const faTemplates: (() => DebateExchange[])[] = [
      () => [
        { speakerId: 'stats', text: `Free agency update: Day ${ctx.faDay} of 30. The ${team.name} have $${capSpace}M in cap space. ${faCount} free agents remain on the market. ${expiringCount > 0 ? `They lost ${expiringCount} player${expiringCount > 1 ? 's' : ''} to expiring contracts.` : 'All key players were retained.'}` },
        { speakerId: 'hottake', text: `${capSpace > 30 ? `$${capSpace}M to spend and free agents are AVAILABLE! GO SHOPPING! Fill those holes!` : capSpace > 10 ? "They've got some space — be surgical, find the right fits!" : "Not much cap room — better hope the draft class can contribute!"}` },
        { speakerId: 'stats', text: `The priority should be ${defRank > totalTeams / 2 ? 'defensive upgrades' : ppgRank > totalTeams / 2 ? 'offensive weapons' : 'depth pieces that can contribute immediately'}. Smart spending now sets up the next season.` },
      ],
    ];
    topics.push({
      headline: `Free Agency: Day ${ctx.faDay}`,
      icon: '🖊️',
      exchanges: pick(faTemplates, rng)(),
      teamIds: [team.id],
      playerIds: [],
    });
  }

  // ─── RE-SIGNING: contract decisions ───
  if (phase === 'resigning') {
    const expiringStars = roster
      .filter(p => p.contract.yearsLeft <= 0 && p.ratings.overall >= 70)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);

    if (expiringStars.length > 0) {
      const top = expiringStars[0];
      topics.push({
        headline: 'Re-signing Window',
        icon: '✍️',
        exchanges: [
          { speakerId: 'hottake', text: `It's decision time! ${expiringStars.length} key player${expiringStars.length > 1 ? 's' : ''} ${expiringStars.length > 1 ? 'are' : 'is'} up for new deals. ${top.firstName} ${top.lastName} (${top.position}, ${top.ratings.overall} OVR) is the BIG one — you CANNOT let ${top.ratings.overall >= 80 ? 'a superstar' : 'a starter'} like that walk!` },
          { speakerId: 'stats', text: `${top.lastName}'s market value will be significant. At ${top.age}, he's ${top.age <= 28 ? 'still in his prime — worth the investment' : top.age <= 31 ? 'entering the back end of his prime — be careful with the term' : 'aging — a short-term deal makes the most sense'}. With $${capSpace}M in cap space, they need to be strategic about who gets paid.` },
          { speakerId: 'hottake', text: `${expiringStars.length > 2 ? "They can't keep EVERYONE! Tough choices ahead!" : `PAY THE MAN! ${top.lastName} has earned it!`}` },
        ],
        teamIds: [team.id],
        playerIds: expiringStars.slice(0, 3).map(p => p.id),
      });
    }
  }

  // Draft/FA phase topics (appended after stat-based topics)
  if (phase === 'draft' || phase === 'freeAgency') {
    const offseasonTopics = generateOffseasonTopics(team, roster, allTeams, allPlayers, season, week, ctx, rng, capSpace, capPct);
    for (const t of offseasonTopics) {
      if (!topics.some(existing => existing.headline === t.headline)) {
        topics.push(t);
      }
    }
  }

  // ─── Cap topics to 3, prioritizing key storylines ───
  const MAX_TOPICS = 3;
  if (topics.length > MAX_TOPICS) {
    const priority = ['Trade Deadline', 'QB', 'Draft', 'Playoff'];
    const first = topics[0];
    const rest = topics.slice(1).sort((a, b) => {
      const aScore = priority.findIndex(p => a.headline.includes(p));
      const bScore = priority.findIndex(p => b.headline.includes(p));
      return (aScore === -1 ? 99 : aScore) - (bScore === -1 ? 99 : bScore);
    });
    topics.length = 0;
    topics.push(first, ...rest.slice(0, MAX_TOPICS - 1));
  }

  // ─── Add fan reactions and player social media posts to topics ───
  const FAN_REACTIONS = [
    (t: Team, wp: number) => wp >= 0.6 ? `${t.city} fans are ELECTRIC right now. This team is for real.` : `${t.city} faithful are getting restless. They need a win badly.`,
    (t: Team, wp: number) => wp >= 0.7 ? `The bandwagon is FULL. ${t.city} is the hottest ticket in football.` : wp <= 0.35 ? `Paper bags spotted in the stands. ${t.city} fans are losing patience.` : `The fanbase is cautiously optimistic. A few more wins and this city will be buzzing.`,
    (t: Team, wp: number) => wp >= 0.5 ? `Social media is blowing up with ${t.name} highlights. The vibes are immaculate.` : `${t.name} Twitter is in full meltdown mode. The hot takes are flying.`,
  ];

  const PLAYER_POSTS = [
    (p: Player, t: Team, wp: number) => wp >= 0.6 ? `We're just getting started. This team is special. #${t.name}` : `Tough stretch but we're locked in. Trust the process.`,
    (p: Player, _t: Team, _wp: number) => p.ratings.overall >= 80 ? `Blessed to be in this position. Best is yet to come.` : `Working every day to earn my spot. Grateful for the opportunity.`,
    (p: Player, t: Team, wp: number) => wp >= 0.7 ? `${t.city} let's GOOO!! This crowd is unreal` : `Real ones stick around through the tough times. We coming.`,
  ];

  for (const topic of topics) {
    if (rng() < 0.6) {
      const fanText = pick(FAN_REACTIONS, rng)(team, winPct);
      topic.exchanges.push({ speakerId: 'fans', text: fanText });
    }
    if (rng() < 0.4 && activeRoster.length > 0) {
      const starPlayer = [...activeRoster].sort((a, b) => b.ratings.overall - a.ratings.overall)[Math.floor(rng() * Math.min(5, activeRoster.length))];
      if (starPlayer) {
        const postText = pick(PLAYER_POSTS, rng)(starPlayer, team, winPct);
        topic.exchanges.push({
          speakerId: 'player',
          text: postText,
          playerName: `${starPlayer.firstName} ${starPlayer.lastName}`,
        });
      }
    }
  }

  return topics;
}

/* ─── Halftime Breakdown ───────────────────────────────────────────────
 * A user-opened "Halftime Report" for a live game: first-half score, the
 * standout performers, and a short Cole/Blaze take. Same template-driven,
 * deterministic, no-LLM approach as the debate engine. Audio is a later
 * add-on — this returns text the game page renders in a modal.
 */

export interface HalftimeLeader {
  playerId: string;
  name: string;
  teamAbbr: string;
  category: 'Passing' | 'Rushing' | 'Receiving';
  statLine: string;
}

export interface HalftimeBreakdown {
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  /** One-line situation summary (who leads, how much, or tied). */
  summary: string;
  leaders: HalftimeLeader[];
  exchanges: DebateExchange[];
}

export function generateHalftimeBreakdown(args: {
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  /** Cumulative first-half stats keyed by player id (from livePlayerStatsAtEvent). */
  stats: Record<string, Partial<PlayerStats>>;
  /** Both teams' players, for name + team lookup. */
  players: Player[];
}): HalftimeBreakdown {
  const { homeTeam, awayTeam, homeScore, awayScore, stats, players } = args;
  const byId = new Map(players.map(p => [p.id, p]));
  const abbrFor = (pid: string): string => {
    const p = byId.get(pid);
    return p?.teamId === homeTeam.id ? homeTeam.abbreviation
      : p?.teamId === awayTeam.id ? awayTeam.abbreviation : '';
  };
  const nameFor = (pid: string): string => {
    const p = byId.get(pid);
    return p ? `${p.firstName} ${p.lastName}` : 'Unknown';
  };

  const entries = Object.entries(stats);
  const leaders: HalftimeLeader[] = [];

  const topPass = entries
    .filter(([, s]) => (s.passYards ?? 0) > 0)
    .sort((a, b) => (b[1].passYards ?? 0) - (a[1].passYards ?? 0))[0];
  if (topPass) {
    const s = topPass[1];
    leaders.push({
      playerId: topPass[0], name: nameFor(topPass[0]), teamAbbr: abbrFor(topPass[0]),
      category: 'Passing',
      statLine: `${s.passCompletions ?? 0}/${s.passAttempts ?? 0}, ${s.passYards ?? 0} yds, ${s.passTDs ?? 0} TD${(s.interceptions ?? 0) > 0 ? `, ${s.interceptions} INT` : ''}`,
    });
  }

  const topRush = entries
    .filter(([, s]) => (s.rushYards ?? 0) > 0)
    .sort((a, b) => (b[1].rushYards ?? 0) - (a[1].rushYards ?? 0))[0];
  if (topRush) {
    const s = topRush[1];
    leaders.push({
      playerId: topRush[0], name: nameFor(topRush[0]), teamAbbr: abbrFor(topRush[0]),
      category: 'Rushing',
      statLine: `${s.rushAttempts ?? 0} car, ${s.rushYards ?? 0} yds, ${s.rushTDs ?? 0} TD`,
    });
  }

  const topRec = entries
    .filter(([, s]) => (s.receivingYards ?? 0) > 0)
    .sort((a, b) => (b[1].receivingYards ?? 0) - (a[1].receivingYards ?? 0))[0];
  if (topRec) {
    const s = topRec[1];
    leaders.push({
      playerId: topRec[0], name: nameFor(topRec[0]), teamAbbr: abbrFor(topRec[0]),
      category: 'Receiving',
      statLine: `${s.receptions ?? 0} rec, ${s.receivingYards ?? 0} yds, ${s.receivingTDs ?? 0} TD`,
    });
  }

  const margin = Math.abs(homeScore - awayScore);
  const leaderAbbr = homeScore === awayScore ? null
    : homeScore > awayScore ? homeTeam.abbreviation : awayTeam.abbreviation;
  const summary = leaderAbbr === null
    ? `All square at ${homeScore}–${awayScore} heading into the break.`
    : `${leaderAbbr} takes a ${margin}-point lead into halftime, ${Math.max(homeScore, awayScore)}–${Math.min(homeScore, awayScore)}.`;

  // Name the teams by city in the prose takes (the stat header/leaders stay
  // abbreviated). leadCity/trailCity are null on a tie.
  const leadCity = homeScore === awayScore ? null : homeScore > awayScore ? homeTeam.city : awayTeam.city;
  const trailCity = homeScore === awayScore ? null : homeScore > awayScore ? awayTeam.city : homeTeam.city;

  // A short two-beat take: Cole frames the numbers, Blaze reacts to the game state.
  const star = leaders[0];
  const starCity = star ? (star.teamAbbr === homeTeam.abbreviation ? homeTeam.city : awayTeam.city) : '';
  const exchanges: DebateExchange[] = [];
  if (star) {
    exchanges.push({
      speakerId: 'stats',
      text: `Through two quarters the story is ${star.name} — ${star.statLine.toLowerCase()}. That's the engine of the ${starCity} offense right now.`,
    });
  } else {
    exchanges.push({
      speakerId: 'stats',
      text: `Defenses are winning this one, Tony. Nobody's cracked the stat sheet open through two quarters.`,
    });
  }
  if (leadCity === null) {
    exchanges.push({
      speakerId: 'hottake',
      text: `Deadlocked at the half! I LOVE it. Whoever blinks first in the third quarter loses this game — mark my words.`,
    });
  } else if (margin >= 17) {
    exchanges.push({
      speakerId: 'hottake',
      text: `${leadCity} is running away with it! If ${trailCity} doesn't come out of that locker room on FIRE, this one's already over.`,
    });
  } else if (margin <= 7) {
    exchanges.push({
      speakerId: 'hottake',
      text: `One score game, baby! This is a coin flip and the second half is gonna be a STREET FIGHT. I can't look away.`,
    });
  } else {
    exchanges.push({
      speakerId: 'hottake',
      text: `${leadCity} has the edge, but two scores is nothing. One stop, one big play, and we've got ourselves a brand new game.`,
    });
  }

  return {
    homeAbbr: homeTeam.abbreviation,
    awayAbbr: awayTeam.abbreviation,
    homeScore,
    awayScore,
    summary,
    leaders,
    exchanges,
  };
}

/* ─── Premium: in-depth spoken halftime breakdown ──────────────────────
 * A longer Marcus/Tony script (returned as TTS lines) that breaks down BOTH
 * teams — who's carrying the offense, who's struggling, the defensive story —
 * and prescribes second-half adjustments. Spoken via /api/game-audio for
 * premium users; the text Halftime Report stays the free-tier version.
 * Uses full city names (not abbreviations) since it's read aloud.
 */

interface HalftimeAudioLine { speaker: 'marcus' | 'tony'; text: string }

interface TeamHalf {
  passer?: [string, Partial<PlayerStats>];
  rusher?: [string, Partial<PlayerStats>];
  receiver?: [string, Partial<PlayerStats>];
  defender?: [string, Partial<PlayerStats>];
  rushYds: number;
  ints: number;
  sacks: number;
}

export function generateHalftimeAudioBreakdown(args: {
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  stats: Record<string, Partial<PlayerStats>>;
  players: Player[];
}): HalftimeAudioLine[] {
  const { homeTeam, awayTeam, homeScore, awayScore, stats, players } = args;
  const byId = new Map(players.map(p => [p.id, p]));
  const last = (pid: string) => byId.get(pid)?.lastName ?? 'someone';

  function analyze(teamId: string): TeamHalf {
    const es = Object.entries(stats).filter(([pid]) => byId.get(pid)?.teamId === teamId);
    const top = (key: keyof PlayerStats) =>
      es.filter(([, s]) => ((s[key] as number) ?? 0) > 0)
        .sort((a, b) => ((b[1][key] as number) ?? 0) - ((a[1][key] as number) ?? 0))[0] as [string, Partial<PlayerStats>] | undefined;
    const defender = es
      .filter(([, s]) => (s.sacks ?? 0) + (s.defensiveINTs ?? 0) > 0)
      .sort((a, b) => ((b[1].sacks ?? 0) + (b[1].defensiveINTs ?? 0)) - ((a[1].sacks ?? 0) + (a[1].defensiveINTs ?? 0)))[0] as [string, Partial<PlayerStats>] | undefined;
    const passer = top('passYards');
    return {
      passer, rusher: top('rushYards'), receiver: top('receivingYards'), defender,
      rushYds: es.reduce((n, [, s]) => n + (s.rushYards ?? 0), 0),
      ints: passer ? (passer[1].interceptions ?? 0) : 0,
      sacks: es.reduce((n, [, s]) => n + (s.sacks ?? 0), 0),
    };
  }

  const POS_WORD: Record<string, string> = {
    QB: 'quarterback', RB: 'running back', WR: 'receiver', TE: 'tight end',
    OL: 'lineman', DL: 'pass rusher', LB: 'linebacker', CB: 'cornerback',
    S: 'safety', K: 'kicker', P: 'punter',
  };

  // Stars (high OVR) whose first-half production is missing — the guys who have
  // to step up for the team to have a chance. Returns a name + spoken reason.
  function underperformers(teamId: string): { player: Player; reason: string }[] {
    const roster = players.filter(p => p.teamId === teamId);
    const starAt = (positions: string[]) =>
      roster.filter(p => positions.includes(p.position)).sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
    const s = (pid: string): Partial<PlayerStats> => stats[pid] ?? {};
    const out: { player: Player; reason: string }[] = [];

    const wr = starAt(['WR']);
    if (wr && wr.ratings.overall >= 75) {
      const st = s(wr.id);
      const yds = st.receivingYards ?? 0, tgt = st.targets ?? 0, rec = st.receptions ?? 0;
      if (yds < 30) {
        out.push({ player: wr, reason: tgt >= 3 && rec <= 1
          ? `has been targeted ${tgt} times but reeled in just ${rec} — he's leaving catches on the field and has to hang on to it`
          : `has been a total non-factor — just ${yds} yards. They can't win with their number-one option invisible` });
      }
    }
    const rb = starAt(['RB']);
    if (rb && rb.ratings.overall >= 78 && (s(rb.id).rushYards ?? 0) < 25) {
      out.push({ player: rb, reason: `has been bottled up for ${s(rb.id).rushYards ?? 0} yards on the ground — they need him running downhill` });
    }
    const rush = starAt(['DL', 'LB']);
    if (rush && rush.ratings.overall >= 78 && (s(rush.id).sacks ?? 0) === 0) {
      out.push({ player: rush, reason: `hasn't gotten home a single time — zero pressures on the quarterback. He has to start wrecking that pocket` });
    }
    const db = starAt(['CB', 'S']);
    if (db && db.ratings.overall >= 79 && (s(db.id).defensiveINTs ?? 0) === 0) {
      out.push({ player: db, reason: `has to make a play on the football — the back end needs a stop or this gets away from them` });
    }
    return out;
  }

  const homeA = analyze(homeTeam.id);
  const awayA = analyze(awayTeam.id);
  const homeCity = homeTeam.city;
  const awayCity = awayTeam.city;
  const margin = Math.abs(homeScore - awayScore);
  const homeLeads = homeScore > awayScore;
  const tied = homeScore === awayScore;
  const leadCity = tied ? homeCity : homeLeads ? homeCity : awayCity;
  const trailCity = tied ? awayCity : homeLeads ? awayCity : homeCity;
  const leadA = tied ? homeA : homeLeads ? homeA : awayA;
  const trailA = tied ? awayA : homeLeads ? awayA : homeA;

  const lines: HalftimeAudioLine[] = [];
  const M = (t: string) => lines.push({ speaker: 'marcus', text: t });
  const T = (t: string) => lines.push({ speaker: 'tony', text: t });

  // Intro
  M(`We're at the half. ${awayCity} ${awayScore}, ${homeCity} ${homeScore}. Tony, let's break down both sides.`);

  // Leading team's engine
  if (leadA.passer) {
    const s = leadA.passer[1];
    M(`${tied ? homeCity : leadCity} has leaned on ${last(leadA.passer[0])} — ${s.passCompletions ?? 0} of ${s.passAttempts ?? 0}, ${s.passYards ?? 0} yards and ${s.passTDs ?? 0} touchdowns through the air.`);
  } else if (leadA.rusher) {
    M(`${tied ? homeCity : leadCity} is running it down their throat — ${last(leadA.rusher[0])} already has ${leadA.rusher[1].rushYards ?? 0} yards on the ground.`);
  } else {
    M(`Neither offense has found much rhythm yet, but ${tied ? homeCity : leadCity} has done just enough.`);
  }
  if (leadA.receiver && (leadA.receiver[1].receivingYards ?? 0) >= 40) {
    T(`And ${last(leadA.receiver[0])} is a problem — ${leadA.receiver[1].receptions ?? 0} grabs for ${leadA.receiver[1].receivingYards} yards. The other side has NO answer for him!`);
  } else {
    T(`They're in control and they know it. But a lead at the half means NOTHING if they let off the gas!`);
  }

  // Trailing team's bright spot + what's wrong
  const bright = trailA.passer ?? trailA.rusher ?? trailA.receiver;
  if (!tied && bright) {
    M(`For ${trailCity}, the bright spot has been ${last(bright[0])} — but they're chasing the game now.`);
  } else if (!tied) {
    M(`${trailCity} has been held in check across the board — they need a spark.`);
  }
  // Adjustment for the trailing (or, if tied, the home) team
  const fixTeam = tied ? homeA : trailA;
  const fixCity = tied ? homeCity : trailCity;
  if (fixTeam.ints >= 1 && fixTeam.passer) {
    T(`Here's the adjustment: ${fixCity} has to protect the football. ${last(fixTeam.passer[0])} already has ${fixTeam.ints} pick${fixTeam.ints === 1 ? '' : 's'} — you can't win throwing it to the other team!`);
  } else if (fixTeam.rushYds < 40) {
    T(`${fixCity}'s got to establish the run — only ${fixTeam.rushYds} yards on the ground. Get one-dimensional and they're done.`);
  } else {
    T(`${fixCity} is moving it but leaving points out there. Finish the drives — that's the whole ballgame in the second half.`);
  }

  // Name the stars who have to step up for the team chasing the game.
  const fixTeamId = tied ? homeTeam.id : (homeLeads ? awayTeam.id : homeTeam.id);
  const need = underperformers(fixTeamId);
  if (need.length > 0) {
    M(`And if ${fixCity} wants a real chance in this thing, a couple of names have to show up in the second half.`);
    const u0 = need[0];
    T(`Start with ${u0.player.firstName} ${u0.player.lastName} — a ${u0.player.ratings.overall}-overall ${POS_WORD[u0.player.position] ?? 'player'} who ${u0.reason}. He's got to be a different guy after the break!`);
    if (need[1]) {
      const u1 = need[1];
      M(`${u1.player.firstName} ${u1.player.lastName} is the other one — he ${u1.reason}. ${fixCity} needs a lot more from him.`);
    }
  }

  // Defensive story
  const topDef = (homeA.defender && awayA.defender)
    ? (((homeA.defender[1].sacks ?? 0) + (homeA.defender[1].defensiveINTs ?? 0)) >= ((awayA.defender[1].sacks ?? 0) + (awayA.defender[1].defensiveINTs ?? 0)) ? homeA.defender : awayA.defender)
    : (homeA.defender ?? awayA.defender);
  if (topDef) {
    const d = topDef[1];
    const bits: string[] = [];
    if ((d.sacks ?? 0) > 0) bits.push(`${d.sacks} sack${d.sacks === 1 ? '' : 's'}`);
    if ((d.defensiveINTs ?? 0) > 0) bits.push(`an interception`);
    M(`Defensively, ${last(topDef[0])} has been all over it — ${bits.join(' and ') || 'making plays'}.`);
  }

  // Close / second-half outlook
  if (tied) {
    T(`Dead even. Whoever makes the better halftime adjustment walks out of here with it. I can't wait!`);
  } else if (margin <= 7) {
    M(`One-score game. Second half comes down to who tightens up first.`);
  } else if (margin >= 17) {
    T(`${leadCity} is in the driver's seat — but if ${trailCity} scores first out of the break, we've got a whole new game!`);
  } else {
    M(`${leadCity} has the edge, but two scores is nothing in this league. Big third quarter coming.`);
  }

  return lines;
}
