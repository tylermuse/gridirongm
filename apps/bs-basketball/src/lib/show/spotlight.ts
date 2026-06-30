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
import { scoringLeaders, byTheNumbers, teamStar } from '../dashboard/editorial';
import { buildRivalryEvents } from '../rivalries/rivalries';
import type { BasketballLeagueState } from '../persistence/db';
import type { BasketballTeam, BasketballPlayer } from '@bs/sport-basketball';

export type SpotlightVoice = 'analyst' | 'take';

export const SPOTLIGHT_HOSTS: Record<SpotlightVoice, { name: string; avatar: string; tagline: string }> = {
  analyst: { name: 'Marcus Beale', avatar: '🤓', tagline: 'the numbers' },
  take: { name: 'Jax Maddox', avatar: '🔥', tagline: 'the takes' },
};

/** Commentator voices are keyed in SPOTLIGHT_HOSTS; player/fan are bubble
 *  variants (a tweet card / a fan-pulse callout) rendered differently. */
export type ExchangeVoice = SpotlightVoice | 'player' | 'fan';
export interface SpotlightExchange { voice: ExchangeVoice; line: string }
export type StoryCategory =
  | 'Statement' | 'Upset' | 'Breakout' | 'Streak' | 'Discipline' | 'MVP Race' | 'Rivalry'
  | 'Your Team' | 'Record' | 'By the Numbers' | 'Star Watch' | 'Cap' | 'Young Core'
  | 'Playoff Picture' | 'Injury' | 'AI';

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
  /** Cold-open intro and sign-off outro so the episode reads as a segment. */
  intro: SpotlightExchange[];
  outro: SpotlightExchange[];
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

/* ─── Filler Phrases (basketball-flavored ports of the football pools) ─── */

const MARCUS_OPENERS = [
  'Look at the tape, Jax.',
  'Here\'s what the numbers actually say.',
  'From a possessions standpoint,',
  'The advanced metrics are interesting here.',
  'Let me break this down a little.',
  'If you pull the box score,',
  'The efficiency data tells a cleaner story.',
];

const JAX_OPENERS = [
  'Oh, here we go with the spreadsheets.',
  'Hold on, hold on —',
  'Are you WATCHING the same league I am?!',
  'Forget the math for one second.',
  'I don\'t need a calculator to tell me this.',
  'You analytics guys are something else.',
  'Here\'s what your numbers WON\'T tell you —',
];

const MARCUS_CONCESSIONS = [
  'I\'ll give you this much —',
  'Fair point, but here\'s the catch —',
  'You\'re not entirely wrong, Jax —',
  'Even I have to admit it —',
  'The numbers actually back part of that —',
];

const JAX_DISMISSALS = [
  'EXACTLY my point!',
  'THANK you! Finally!',
  'See? Even the numbers guy gets it!',
  'I\'ve been saying this for WEEKS!',
  'That\'s what happens when you actually watch hoops!',
];

/** Deterministically prepend a filler opener to a line. */
function lead(pool: string[], body: string, seed: number): string {
  return `${pick(pool, seed)} ${body}`;
}

type ExchangeFn = (h: string, seed: number) => SpotlightExchange[];

/** Per-category template pools — each a full 4-6 exchange rally. Picked
 *  deterministically off the seed (mirrors football's TEMPLATE_MAP). */
const TEMPLATES: Partial<Record<StoryCategory, ExchangeFn[]>> = {
  Statement: [
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. They won the possession battle and the margins held in three of four quarters — that's the part that travels.`, s) },
      { voice: 'take', line: `REPEATABLE?! That was a STATEMENT, Marcus! Print the playoff tickets right now, because everyone in the building felt it.` },
      { voice: 'analyst', line: `It's one game, Jax. The shot quality was excellent, sure, but they shot a hair above their season clip — let's see it against a winning team before we coronate anybody.` },
      { voice: 'take', line: lead(JAX_DISMISSALS, `A hot night?! No. This is who they ARE now. You build your whole month around a performance like that.`, s) },
    ],
    (h, s) => [
      { voice: 'take', line: `Did you SEE that?! ${h} — and it wasn't even close in the way that matters. They imposed their will from the opening tip.` },
      { voice: 'analyst', line: lead(MARCUS_CONCESSIONS, `it was a clean, two-way performance. The defensive rating was elite and the offense never stalled — genuinely encouraging stuff.`, s) },
      { voice: 'take', line: `ENCOURAGING?! It was DOMINANT! When a team plays like that you stop hedging and you start believing, Marcus.` },
      { voice: 'analyst', line: `I believe in the process. I want to see the half-court offense hold up against a top-five defense before I crown them — but yes, the arrow is pointing up.` },
    ],
  ],
  Upset: [
    (h, s) => [
      { voice: 'take', line: `${h}! Nobody — and I mean NOBODY — saw this coming, and that's exactly why it's so beautiful. The favorite got exposed in front of the whole league.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `the underdog actually graded out as a top-ten defense coming in. The favorite settled for contested jumpers and got punished in transition — less random than it looks on paper.`, s) },
      { voice: 'fan', line: pick([`Did NOT have this on my bingo card 😭🔥`, `WE BEAT THEM?! best night of my life`, `nobody believed in us. NOBODY. now look 🐐`], s >> 6) },
      { voice: 'take', line: `Top-ten defense?! Forget the charts — the "favorite" is a FRAUD and we all knew it. Burn the seedings, chaos reigns, I love this league!` },
      { voice: 'analyst', line: `One result doesn't flip a season, Jax. The favorite is still the better roster on paper — but they got a real wake-up call tonight, and that's a fair takeaway.` },
    ],
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. The point differential said the favorite was due for a correction — they'd been winning the close ones, and tonight the regression finally arrived.`, s) },
      { voice: 'take', line: lead(JAX_OPENERS, `"Due for a correction"?! Listen to yourself! Sometimes a team just gets PUNKED, and your models can't measure heart.`, s) },
      { voice: 'analyst', line: `Heart is hard to chart, I'll grant you. But the matchup data favored the underdog more than the seeding suggested — this was closer to a coin flip than a shock.` },
      { voice: 'take', line: `A coin flip?! Tell that to the fans who just watched their contender quit in the fourth! This is a CRISIS and I'm here for every second of it.` },
    ],
  ],
  Breakout: [
    (h, s) => [
      { voice: 'take', line: `${h} — and you can throw out the "small sample" disclaimer right now. That was a coming-out party, and the kid looked like a franchise centerpiece.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `the usage spiked and the efficiency actually held, which is the real signal. When volume goes up and the percentages don't crater, that's a skill jump, not a fluke.`, s) },
      { voice: 'player', line: pick([`Tonight was special. Blessed to be in this position 🙏 hard work pays off.`, `Just trying to win for my guys. We not done. 💯`, `God is good. On to the next one. 🙏`], s >> 5) },
      { voice: 'take', line: `SUSTAINABLE?! He's a SUPERSTAR now. All-League, MVP shortlist, give him the keys to the franchise. I'd trade my whole roster for that guy and not blink.` },
      { voice: 'analyst', line: lead(MARCUS_CONCESSIONS, `the shot profile was healthy — clean looks, not heat-check threes. But one box score isn't a career; let's see the consistency over ten games before the coronation.`, s) },
    ],
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. The encouraging part is the shot diet — high-value looks at the rim and from the corners, not a lucky night of contested pull-ups.`, s) },
      { voice: 'take', line: `I CALLED this! I said weeks ago this kid was about to break out, and everyone laughed. Who's laughing now, Marcus?!` },
      { voice: 'player', line: pick([`Locked in. Grateful for my teammates and the coaches. 🙏`, `One game at a time. We got bigger goals. 💪`, `Stay humble, stay hungry. 💯`], s >> 5) },
      { voice: 'analyst', line: `You say that about three players a week, Jax. But I'll give you this one — the per-minute numbers were genuinely elite, and the role looks like it's growing.` },
      { voice: 'take', line: lead(JAX_DISMISSALS, `He didn't just beat his defender, he DEMORALIZED him. This is the start of something, mark the date.`, s) },
    ],
  ],
  Streak: [
    (h, s) => [
      { voice: 'take', line: `${h}! This team CANNOT be stopped right now! The chemistry, the swagger, the belief — you can feel it radiating through the screen.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `the streak is real, but the strength of schedule during the run has been below average. The underlying net rating supports part of it — that's the piece that lasts.`, s) },
      { voice: 'take', line: lead(JAX_OPENERS, `Strength of schedule?! A win is a win, Marcus! Good teams win games and this team is WINNING. Cancel the rest of the season.`, s) },
      { voice: 'analyst', line: `Let's check back in three weeks when the schedule stiffens. Streaks end, Jax — but I'll concede they're playing winning basketball at the right time.` },
    ],
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. Long runs like this correlate with postseason positioning — but the margin of victory matters more than the streak length, and theirs has been shrinking.`, s) },
      { voice: 'take', line: `Shrinking margins?! They're finding ways to WIN, which is exactly what champions do. This is a dynasty forming in real time and you're nitpicking the box score.` },
      { voice: 'analyst', line: lead(MARCUS_CONCESSIONS, `winning the close ones is a real skill in February. I just want to see it hold up when the rotation tightens in the playoffs.`, s) },
      { voice: 'take', line: `It'll hold up because this team is DIFFERENT. You're watching history and you're worried about regression to the mean. Unbelievable.` },
    ],
  ],
  Discipline: [
    (h, s) => [
      { voice: 'take', line: `${h}! This changes EVERYTHING. The whole season hinges on this — suspend him longer, actually no, free him, I can't decide but I am FURIOUS about it.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `availability is a skill, Jax, and this is a real cost. Those minutes have to be absorbed somewhere, and the bench wasn't built to carry that load.`, s) },
      { voice: 'take', line: `So you're SAYING it's a disaster! Finally we agree! The rotation is going to crumble and someone in that front office should be losing sleep.` },
      { voice: 'analyst', line: `I'm saying it's a manageable setback if the staff stays disciplined with the workload. One absence isn't a season-ender — but it's not nothing, either.` },
    ],
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. The team's net rating with him off the floor is meaningfully worse, so this isn't just a headline — there's a tangible on-court tax here.`, s) },
      { voice: 'take', line: lead(JAX_OPENERS, `A "tangible tax"?! Just say it'll hurt, Marcus! This is the kind of thing that derails a contender and nobody wants to admit it.`, s) },
      { voice: 'analyst', line: lead(MARCUS_CONCESSIONS, `the timing is bad with the schedule heating up. But teams reshuffle the rotation all the time — let's see how the coach adjusts before we panic.`, s) },
      { voice: 'take', line: `Adjust?! There's no adjusting your way out of this! Mark my words, this is the storyline we look back on at the end of the year.` },
    ],
  ],
  'MVP Race': [
    (h, s) => [
      { voice: 'take', line: `${h}! Race? What race?! It's OVER. Engrave the trophy, everyone else is playing for second, and I won't be taking questions.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `the volume and the efficiency both check out at the top of the ladder, which matters. But the award is a full-season marathon — team record carries serious weight with voters.`, s) },
      { voice: 'take', line: `Team record?! Give the man his flowers! He's MVP, Finals MVP, and mayor of the city. Hand him all of it right now.` },
      { voice: 'analyst', line: lead(MARCUS_CONCESSIONS, `if the team keeps winning, the narrative writes itself and he's the clear front-runner. I just want sixty games before I close the case.`, s) },
    ],
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. He's posting elite numbers on elite volume, and the on/off splits are staggering — when he sits, the offense falls apart.`, s) },
      { voice: 'take', line: lead(JAX_DISMISSALS, `So it's settled! He's the most valuable player by definition — the team can't function without him. Case closed, Marcus.`, s) },
      { voice: 'analyst', line: `It's a strong case, no question. But there's a real field this year — two or three guys with comparable resumes and better records. This is a debate, not a coronation.` },
      { voice: 'take', line: `A debate?! There's no debate! You're overthinking it because that's your whole personality. He's the guy. Write it down.` },
    ],
  ],
  Rivalry: [
    (h, s) => [
      { voice: 'take', line: `${h}! THIS is what it's all about — pure hatred, no love lost, every possession personal. Run it back tomorrow, I don't care, give me more.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `division games do tend to be tighter, statistically — familiarity shrinks the talent gap and these tiebreakers swing seeding in April. This one carried real stakes.`, s) },
      { voice: 'take', line: `For ONCE I don't hate your analysis! These teams know each other's sets cold, and you could feel the tension crackling through the TV.` },
      { voice: 'analyst', line: `Games like this usually come down to a possession or two — less about "wanting it" and more about who executes late. Tonight, one team did and one didn't.` },
    ],
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. The winner now owns the head-to-head tiebreaker, and in a tight playoff race that's the kind of edge that decides home court in the spring.`, s) },
      { voice: 'take', line: `A tiebreaker?! It's bigger than that, Marcus — it's BRAGGING RIGHTS. The benches were standing all night and nobody wanted to be the one who blinked.` },
      { voice: 'analyst', line: lead(MARCUS_CONCESSIONS, `the intensity was a level above a normal night, and that does affect shot-making down the stretch. The atmosphere was a genuine factor.`, s) },
      { voice: 'take', line: `Best rivalry in the league and it's not close! Heat, history, hatred — you can't fake that. I'll be front row for the rematch.` },
    ],
  ],
  'Your Team': [
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. For your club the takeaway is the process — good looks, sound defensive rotations, controlled pace. That's the stuff that holds up over a long season.`, s) },
      { voice: 'take', line: `PROCESS?! Your team is going ALL THE WAY and I will not be hedging. I believe — do you believe? You'd better believe, because this is the year.` },
      { voice: 'analyst', line: `Let's keep it grounded. The trend lines are encouraging if the role players keep hitting open looks — but a deep run takes another level of consistency.` },
      { voice: 'take', line: lead(JAX_DISMISSALS, `I feel it in my bones — ring season. Don't you dare bring me back to earth, Marcus, let me have this one.`, s) },
    ],
    (h, s) => [
      { voice: 'take', line: `${h}! Now THAT'S the energy I want to see from your squad. When they play with that pace they're a problem for anybody on the schedule.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `the encouraging part is the balance — multiple scorers, clean ball movement, and a defense that's getting stops in transition. That's a repeatable identity.`, s) },
      { voice: 'take', line: lead(JAX_OPENERS, `An "identity"?! It's a CONTENDER, Marcus! Stop dressing it up in analytics and just enjoy the ride for once.`, s) },
      { voice: 'analyst', line: `I'm enjoying it. I'd just like to see them string it together on the road before we book the parade route — but the foundation is real.` },
    ],
  ],
  // Record dialogue is record-aware — see RECORD_VARIANTS / recordExchanges.
  // A losing team must not get "this team is for real" copy (the differential
  // and the record agree in the OTHER direction).
  'By the Numbers': [
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. That's the kind of number that tells you more than the standings do — it speaks to how a team actually generates and prevents points.`, s) },
      { voice: 'take', line: `A NUMBER?! You brought a number to a debate show, Marcus, I'm shocked. But fine — even I'll admit that one jumps off the page.` },
      { voice: 'analyst', line: `It should. Context like this is what separates a hot week from a real trend — and this one points to something repeatable, not a mirage.` },
      { voice: 'take', line: lead(JAX_DISMISSALS, `So the eye test AND the math agree for once. Mark the date — Jax and the numbers are on the same side!`, s) },
    ],
    (h, s) => [
      { voice: 'take', line: `${h} — and that's the stat I'm putting on the billboard. You don't put up a number like that by accident.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `it's a striking figure, I'll grant you. The question is always whether it's signal or noise — and the supporting metrics here lean toward signal.`, s) },
      { voice: 'take', line: lead(JAX_OPENERS, `Signal or noise?! It's a SCOREBOARD truth, Marcus! Some things you can just see, no calculator required.`, s) },
      { voice: 'analyst', line: lead(MARCUS_CONCESSIONS, `on this one, the data and the eye test actually agree. That doesn't happen often, so let's both savor it.`, s) },
    ],
  ],
  'Star Watch': [
    (h, s) => [
      { voice: 'take', line: `${h}! That's not a player, that's a PROBLEM for the rest of the league. Build the whole offense around him and never look back.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `the averages back the hype — the scoring is efficient and the supporting numbers are there too, which is what separates a bucket-getter from a true two-way star.`, s) },
      { voice: 'take', line: `EFFICIENT?! He's ELITE, Marcus! Stop qualifying everything! When a guy carries a team like that, you call him what he is — a franchise cornerstone.` },
      { voice: 'analyst', line: lead(MARCUS_CONCESSIONS, `he's the engine, no question. I just want the efficiency to hold as the usage climbs — but the foundation is everything you want in a number-one option.`, s) },
    ],
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. The all-around line is the tell — scoring, rebounding, and playmaking in one package is rare, and it's why the offense runs through him.`, s) },
      { voice: 'take', line: lead(JAX_DISMISSALS, `So he's the guy! That's all I needed to hear. Give him the ball, give him the minutes, give him the city.`, s) },
      { voice: 'take', line: `And before you say "sample size" — I've watched every game. He's the real thing, and the supporting cast is finally good enough to let him shine.` },
      { voice: 'analyst', line: `No argument here. When a star is this productive and the team is winning, the awards conversation takes care of itself. He's earned the spotlight.` },
    ],
  ],
  Cap: [
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. Cap flexibility is the quiet superpower in this league — it's what lets a front office strike when a star shakes loose at the deadline.`, s) },
      { voice: 'take', line: `Nobody's printing a ticket to watch the CAP SHEET, Marcus! Fans want stars, not spreadsheets. Spend the money and chase the ring!` },
      { voice: 'analyst', line: `Spending isn't the same as spending well, Jax. The teams with a plan turn this room into the right addition — the ones without one just buy the wrong contract.` },
      { voice: 'take', line: lead(JAX_DISMISSALS, `So you're saying they've got DRY POWDER for a blockbuster. NOW we're talking. Go get a star and let's win something!`, s) },
    ],
    (h, s) => [
      { voice: 'take', line: `${h}? Boring! Until it isn't. The second a disgruntled superstar hits the market, this becomes the most important number in the building.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `that's exactly right, actually. The cap is a tool, not a trophy — managed well, it's the difference between contending and treading water for a decade.`, s) },
      { voice: 'take', line: lead(JAX_OPENERS, `A "tool"?! It's a WAR CHEST, Marcus! Use it or lose it — windows close fast in this league.`, s) },
      { voice: 'analyst', line: lead(MARCUS_CONCESSIONS, `urgency matters when the core is in its prime. The smart move is to stay flexible and pounce — not to spend just to spend.`, s) },
    ],
  ],
  'Young Core': [
    (h, s) => [
      { voice: 'take', line: `${h}! The future is NOW! These kids are going to grow up together and terrorize this league for the next decade. I've seen the blueprint and it's championship-shaped.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `developmental curves matter here — young teams improve in fits and starts, not a straight line. The talent is there; the consistency takes a couple of seasons.`, s) },
      { voice: 'take', line: lead(JAX_OPENERS, `A "couple of seasons"?! They're ready NOW, Marcus! Talent wins, and this group is loaded. Stop being so cautious.`, s) },
      { voice: 'analyst', line: lead(MARCUS_CONCESSIONS, `the ceiling is genuinely exciting, and that's the part you build around. I just temper the timeline — youth is a marathon, not a sprint.`, s) },
    ],
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. A young core is the most valuable asset in the sport because it's cheap and improving — that combination is how dynasties get started.`, s) },
      { voice: 'take', line: lead(JAX_DISMISSALS, `So you're saying the future is BRIGHT! Finally, some optimism from the numbers desk. These kids are special.`, s) },
      { voice: 'take', line: `And they're only going to get better! Imagine this group with two more years of reps. Other front offices should be terrified.` },
      { voice: 'analyst', line: `Patience is the watchword — but yes, when the talent is this young and this productive, the trajectory points straight up. It's a foundation worth protecting.` },
    ],
  ],
  'Playoff Picture': [
    (h, s) => [
      { voice: 'take', line: `${h}! Every game from here on out is a PLAYOFF game. Seeding decides everything — home court, matchups, the whole road. Treat April like it's life or death!` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `the math is tight, but the tiebreakers and remaining schedule matter as much as the standings right now — a soft stretch run can move a team up two seeds.`, s) },
      { voice: 'take', line: `Two seeds?! That's the difference between a first-round exit and a CONFERENCE FINALS run, Marcus! This is the part of the year that separates pretenders from contenders.` },
      { voice: 'analyst', line: lead(MARCUS_CONCESSIONS, `positioning absolutely matters, and the next few weeks are pivotal. Health and matchups will decide more of this than people want to admit.`, s) },
    ],
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. The bracket is fluid — a single bad week can drop a team out of home-court range, so the margin for error is shrinking fast.`, s) },
      { voice: 'take', line: lead(JAX_OPENERS, `Shrinking margins?! That's what makes it FUN, Marcus! Win-and-you're-in basketball is the best basketball there is.`, s) },
      { voice: 'analyst', line: `It is compelling, I'll admit. The teams that take care of business against the soft part of the schedule are the ones that wake up in April with options.` },
      { voice: 'take', line: lead(JAX_DISMISSALS, `So lock in and stack wins! No excuses, no off nights. The picture clears up real quick when you just win the games you're supposed to.`, s) },
    ],
  ],
  Injury: [
    (h, s) => [
      { voice: 'take', line: `${h} — and this is a GUT PUNCH. You can't lose a rotation piece this time of year and pretend it doesn't matter. The whole equation just changed.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `availability is a skill, and losing a contributor reshuffles the rotation in ways that ripple out — the bench load goes up and the margins get thinner.`, s) },
      { voice: 'take', line: `So you AGREE it's a disaster! See? Some things don't need a model. Next man up sounds great until the next man isn't ready.` },
      { voice: 'analyst', line: lead(MARCUS_CONCESSIONS, `the depth gets stressed, no question. But teams weather these all the time — the good ones reshape the rotation and the season rolls on.`, s) },
    ],
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${h}. The on-court impact depends on the role, but any absence forces minutes onto players who weren't slated for them — and that's where teams get exposed.`, s) },
      { voice: 'take', line: lead(JAX_OPENERS, `Just say it's BAD, Marcus! Injuries derail seasons, full stop. The front office should already be working the phones for depth.`, s) },
      { voice: 'analyst', line: `Overreacting at the first injury is how front offices make bad trades, Jax. The smart move is to stay patient, lean on the depth, and reassess as it clears up.` },
      { voice: 'take', line: `Patient?! There's no time to be patient when the calendar is melting! This is the storyline that decides their whole stretch run, mark it down.` },
    ],
  ],
};

/** Two-voice dialogue for a storyline — a full multi-exchange rally, picked
 *  deterministically from the per-category template pool. */
function exchangesFor(cat: StoryCategory, headline: string, seed: number): SpotlightExchange[] {
  const pool = TEMPLATES[cat];
  if (!pool || pool.length === 0) {
    // Defensive fallback (e.g. the AI placeholder category) — a tidy two-beat.
    return [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `${headline}. There's a real story underneath the headline if you look at the numbers.`, seed) },
      { voice: 'take', line: `Now THAT'S worth talking about! This league never stops giving us material.` },
    ];
  }
  return pick(pool, seed)(headline, seed);
}

/**
 * Record dialogue, keyed to how good the record actually is. The old copy was
 * hardcoded as a celebration ("this team is for real"), which read as nonsense
 * over a losing record. Tier off win% and let the point-differential sign nuance
 * the analyst's read: a bad team with a negative differential is getting earned,
 * not unlucky; a bad team with a POSITIVE differential has some bad luck hiding
 * in the close games; and vice-versa for a good record.
 */
type RecordTier = 'good' | 'mid' | 'bad';
function recordTier(winPct: number): RecordTier {
  if (winPct >= 0.55) return 'good';
  if (winPct <= 0.45) return 'bad';
  return 'mid';
}

const RECORD_VARIANTS: Record<RecordTier, (diffPositive: boolean) => ExchangeFn[]> = {
  good: (diffPos) => [
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, diffPos
        ? `${h}. The point differential lines up with the record, which is the healthy sign — they're not living and dying by close games or luck in the clutch.`
        : `${h}. The record's strong, but I'll be honest — the point differential is actually negative, which says they've been winning the close ones. Enjoy it, but that's the part I'd watch.`, s) },
      { voice: 'take', line: `The RECORD is the record, Marcus! Wins are wins! Stop trying to find a "but" in a good start and let the fans enjoy it.` },
      { voice: 'analyst', line: diffPos
        ? `I'm not finding a but — I'm saying it's sustainable, which is the compliment. A team whose differential matches its record tends to hold its level into the spring.`
        : `I'm not raining on it — I'm saying don't be shocked if the record drifts back toward the margins. The wins are banked either way.` },
      { voice: 'take', line: lead(JAX_DISMISSALS, `So you're telling me it's LEGIT?! Then say it louder for the doubters in the back. This team is for real.`, s) },
    ],
    (h, s) => [
      { voice: 'take', line: `${h}! That's the kind of stretch that defines a season. You can feel the confidence building, and confidence is half the battle in this league.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `the record is what it is, but the schedule matters — the next stretch is a real test, and that's where we find out how high the ceiling is.`, s) },
      { voice: 'take', line: lead(JAX_OPENERS, `A "test"?! They'll pass it with flying colors! Good teams handle business, and this is a good team. Next question.`, s) },
      { voice: 'analyst', line: `That's the bet I'd make too, honestly. If they keep the differential where it is, the record is no fluke — it's a reflection of how they play.` },
    ],
  ],
  mid: (diffPos) => [
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, diffPos
        ? `${h}. The differential's a hair on the right side of the ledger — this is a roughly average team that could tip either way over the next month.`
        : `${h}. The differential's slightly underwater, which tracks — this is a middle-of-the-pack team right now, no more, no less.`, s) },
      { voice: 'take', line: `Middle of the pack?! That's a PLAYOFF team if the bracket started today, Marcus! A couple of bounces and they're a top-six seed.` },
      { voice: 'analyst', line: `That's fair — at .500 a soft stretch of schedule and one hot week decide everything. The margin between the six seed and the lottery is razor thin here.` },
      { voice: 'take', line: lead(JAX_DISMISSALS, `So it's all to play for?! THAT'S the energy. This is the part of the year where the good teams separate from the pretenders.`, s) },
    ],
    (h, s) => [
      { voice: 'take', line: `${h}! A .500 team nobody wants to draw, Marcus. They've got the talent to ruin somebody's spring.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, `there's something to that — an even differential means they're not getting blown out and they're not blowing teams out. The next ten games tell us which way they break.`, s) },
      { voice: 'take', line: lead(JAX_OPENERS, `Which way they break?! UP, obviously! You don't sit at .500 with this roster and stay there. The ceiling's a lot higher than the floor.`, s) },
      { voice: 'analyst', line: `Could go either way, honestly. But you're right that the talent says there's another gear if they find some consistency.` },
    ],
  ],
  bad: (diffPos) => [
    (h, s) => [
      { voice: 'analyst', line: lead(MARCUS_OPENERS, diffPos
        ? `${h}. Here's the odd part — the record's rough, but the point differential is actually positive. There's real bad luck in the close games hiding in that record.`
        : `${h}. The point differential lines up with the record, and that's the uncomfortable read — this isn't a clutch-luck blip, they're getting outplayed over 48 minutes.`, s) },
      { voice: 'take', line: `Outplayed?! It's a rough patch, Marcus, every team hits one! Don't you dare write off the whole season in the dead of winter.` },
      { voice: 'analyst', line: diffPos
        ? `I'm not writing it off — if anything the math says they're better than the record, and some of those close losses should start going the other way.`
        : `I'm not writing it off — I'm saying the math and the record agree, and that's a harder hole to climb out of than a few late-game collapses.` },
      { voice: 'take', line: lead(JAX_OPENERS, `One trade, one hot streak, and we're right back in it! That's what the front office is FOR. Have a little faith.`, s) },
    ],
    (h, s) => [
      { voice: 'take', line: `${h}! Alright — it's not pretty, I'll say it out loud. But records turn in a hurry in this league, Marcus, you KNOW that.` },
      { voice: 'analyst', line: lead(MARCUS_OPENERS, diffPos
        ? `they can, and the underlying numbers actually give you a thread to pull — the differential says they've been better than the record. That's the optimistic case.`
        : `they can, but turnarounds usually start with the underlying numbers improving first — and right now the differential says this is closer to who they are than a fluke.`, s) },
      { voice: 'take', line: lead(JAX_OPENERS, `"Who they are"?! Nobody is who they are in the dead of winter! Talent wins out, and there's talent on this roster. Book the turnaround.`, s) },
      { voice: 'analyst', line: `I'd love to be wrong. But hope isn't a plan — the margins have to tighten before the record starts to mean something different.` },
    ],
  ],
};

function recordExchanges(headline: string, seed: number, winPct: number, diffPositive: boolean): SpotlightExchange[] {
  const variants = RECORD_VARIANTS[recordTier(winPct)](diffPositive);
  return pick(variants, seed)(headline, seed);
}

/* ─── Episode cold-open / sign-off pools (mirror football's intros/outros) ─── */

const SHOW_INTROS: SpotlightExchange[][] = [
  [
    { voice: 'take', line: `Welcome to Hoops Tonight! I'm Jax Maddox, and my guy Marcus over here is about to bury you in numbers while I bring you the REAL story.` },
    { voice: 'analyst', line: `And I'm Marcus Beale. Jax, the numbers ARE the real story — but let's get into it, we've got a loaded week to break down.` },
  ],
  [
    { voice: 'analyst', line: `Good evening, everyone — Marcus Beale alongside the always-combustible Jax Maddox. Big slate of basketball to unpack tonight.` },
    { voice: 'take', line: `COMBUSTIBLE?! I'm the voice of the PEOPLE, Marcus! Enough with the pleasantries — let's get to the good stuff.` },
  ],
  [
    { voice: 'take', line: `What a WEEK of hoops! I've got takes so hot they might trip the smoke alarm. Let's GO!` },
    { voice: 'analyst', line: `And I've got the data to keep us honest. Welcome to Hoops Tonight, everybody — let's dig in.` },
  ],
];

const SHOW_OUTROS: SpotlightExchange[][] = [
  [
    { voice: 'analyst', line: `That's all the time we've got this week. Thanks for watching Hoops Tonight — we'll see you after the next slate of games.` },
    { voice: 'take', line: `And remember — I called it FIRST. Every single time. See you next week!` },
  ],
  [
    { voice: 'take', line: `Another INCREDIBLE week of basketball! If you missed any of it, I feel sorry for you. Until next time — Jax Maddox, OUT!` },
    { voice: 'analyst', line: `And as always, check the numbers before you make your bold predictions. Good night, everybody.` },
  ],
];

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

/**
 * User-team deep-dive topics — Record → By the Numbers → Star Watch → Cap →
 * Young Core → Playoff Picture → Injury — built strictly from data the editorial
 * helpers + team/roster already expose. Each returns null when its data isn't
 * available, so a quiet save simply produces fewer (never invented) beats.
 */
function userTeamTopics(league: BasketballLeagueState, userId: string): SpotlightStory[] {
  const team = (league.teams as BasketballTeam[]).find(t => t.id === userId);
  if (!team) return [];
  const players = league.players as Record<string, BasketballPlayer>;
  const out: SpotlightStory[] = [];
  const cityName = `${team.city} ${team.name}`;

  // Record — wins/losses + point differential.
  const { wins, losses, pointsFor, pointsAgainst } = team.record;
  if (wins + losses > 0) {
    const diff = pointsFor - pointsAgainst;
    const per = (wins + losses) ? (diff / (wins + losses)) : 0;
    const sign = per >= 0 ? '+' : '−';
    const winPct = wins / (wins + losses);
    const headline = `${cityName} sit at ${wins}–${losses}, ${sign}${Math.abs(per).toFixed(1)} per night on the season`;
    out.push({ id: `rec-${userId}-${wins}-${losses}`, category: 'Record', headline, exchanges: recordExchanges(headline, hash(`rec-${userId}-${wins}-${losses}`), winPct, per >= 0) });
  }

  // By the Numbers — first callout that's about the user team's run.
  const callouts = byTheNumbers(league, team);
  if (callouts.length) {
    const c = callouts[0];
    const headline = `By the numbers: ${c.value} — ${c.label}`;
    out.push({ id: `btn-${userId}-${c.label}`, category: 'By the Numbers', headline, exchanges: exchangesFor('By the Numbers', headline, hash(`btn-${userId}-${c.value}-${c.label}`)) });
  }

  // Star Watch — the user team's leading scorer + full averages line.
  const star = teamStar(league, team);
  if (star) {
    const headline = `${star.name} is carrying ${team.city}: ${star.ppg.toFixed(1)} / ${star.rpg.toFixed(1)} / ${star.apg.toFixed(1)} a night`;
    out.push({ id: `star-${star.id}`, category: 'Star Watch', headline, exchanges: exchangesFor('Star Watch', headline, hash(`star-${star.id}`)), playerId: star.id });
  }

  // Cap — flexibility from the team's cap state (skip if the save has none).
  if (team.capState) {
    const room = team.capState.salaryCap - team.capState.currentPayroll;
    const fmt = (n: number) => `$${(Math.abs(n) / 1_000_000).toFixed(1)}M`;
    const headline = room >= 0
      ? `${team.city} carry ${fmt(room)} in cap room — flexibility for a deadline swing`
      : `${team.city} are ${fmt(room)} over the cap — every move is a balancing act`;
    out.push({ id: `cap-${userId}`, category: 'Cap', headline, exchanges: exchangesFor('Cap', headline, hash(`cap-${userId}-${room}`)) });
  }

  // Young Core — count of rotation-age 23-and-under players on the roster.
  const young = team.playerIds.map(id => players[id]).filter(p => p && p.age <= 23);
  if (young.length >= 3) {
    const headline = `${team.city}'s young core is ${young.length} deep at 23-and-under — the future is taking shape`;
    out.push({ id: `young-${userId}`, category: 'Young Core', headline, exchanges: exchangesFor('Young Core', headline, hash(`young-${userId}-${young.length}`)) });
  }

  // Playoff Picture — where they sit in their conference by win pct.
  const conf = (league.teams as BasketballTeam[])
    .filter(t => t.sportData.conference === team.sportData.conference && (t.record.wins + t.record.losses) > 0)
    .sort((a, b) => (b.record.wins / Math.max(1, b.record.wins + b.record.losses)) - (a.record.wins / Math.max(1, a.record.wins + a.record.losses)));
  const seed = conf.findIndex(t => t.id === userId) + 1;
  if (seed > 0 && conf.length > 1) {
    const inField = seed <= 8;
    const headline = inField
      ? `${team.city} hold the ${ordinal(seed)} seed in the ${team.sportData.conference} — in the field for now`
      : `${team.city} sit ${ordinal(seed)} in the ${team.sportData.conference} — on the outside looking in`;
    out.push({ id: `po-${userId}-${seed}`, category: 'Playoff Picture', headline, exchanges: exchangesFor('Playoff Picture', headline, hash(`po-${userId}-${seed}`)) });
  }

  // Injury — only if someone on the roster is currently hurt.
  const hurt = team.playerIds.map(id => players[id]).filter(p => p && p.injury);
  if (hurt.length) {
    const p = hurt[0];
    const headline = hurt.length > 1
      ? `${team.city} are down ${hurt.length} to injury, including ${p.firstName} ${p.lastName}`
      : `${team.city} are without ${p.firstName} ${p.lastName} (injury) for now`;
    out.push({ id: `inj-${userId}-${p.id}`, category: 'Injury', headline, exchanges: exchangesFor('Injury', headline, hash(`inj-${userId}-${p.id}`)), playerId: p.id });
  }

  return out;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
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
  const seenIds = new Set<string>();
  const userId = league.userTeamId;
  const push = (s: SpotlightStory) => { if (!seenIds.has(s.id)) { seenIds.add(s.id); stories.push(s); } };

  // 1) Always lead with the user team. Prefer a flagged moment about them (a
  // career night / blowout the feed surfaced); otherwise synthesize from their
  // last result so the user's club still headlines on a quiet night.
  if (userId) {
    const mine = pool.find(i => i.gameId && league.games.some(g => g.id === i.gameId && (g.homeTeamId === userId || g.awayTeamId === userId)));
    if (mine) {
      push({ id: `your-${mine.id}`, category: 'Your Team', headline: mine.headline, exchanges: exchangesFor('Your Team', mine.headline, hash(mine.id)), playerId: mine.playerId, gameId: mine.gameId });
    } else {
      const synth = userTeamStory(league, userId);
      if (synth) push(synth);
    }
  }

  // 2) The user-team deep-dive set — Record → By the Numbers → Star Watch →
  // Cap → Young Core → Playoff Picture → Injury (each present only when its
  // underlying data exists, so nothing is invented).
  if (userId) for (const s of userTeamTopics(league, userId)) push(s);

  // 3) League moments from the feed, de-duplicated by category for variety.
  const seenCats = new Set<StoryCategory>();
  for (const item of pool) {
    if (stories.length >= 8) break;
    const cat = CATEGORY_OF[item.kind];
    if (!cat || seenCats.has(cat)) continue;
    seenCats.add(cat);
    push({ id: item.id, category: cat, headline: item.headline, exchanges: exchangesFor(cat, item.headline, hash(item.id)), playerId: item.playerId, gameId: item.gameId });
  }

  // 4) A rivalry beat — prefer one involving the user's team.
  if (stories.length < 8) {
    const rivalries = buildRivalryEvents(league);
    const riv = (userId && rivalries.find(r => r.homeTeamId === userId || r.awayTeamId === userId)) || rivalries[0];
    if (riv) {
      push({ id: `riv-${riv.id}`, category: 'Rivalry', headline: riv.headline, exchanges: exchangesFor('Rivalry', riv.headline, hash(riv.id)), gameId: riv.gameId });
    }
  }

  // 5) Always close on the MVP race if we have leaders.
  const leaders = scoringLeaders(league, 1);
  if (leaders.length) {
    const l = leaders[0];
    const headline = `${l.name} (${l.teamAbbr}) leads the MVP conversation at ${l.ppg.toFixed(1)} a night`;
    push({ id: `mvp-${week}-${l.id}`, category: 'MVP Race', headline, exchanges: exchangesFor('MVP Race', headline, hash(`mvp-${l.id}`)), playerId: l.id });
  }

  if (stories.length === 0) return null;
  const intro = pick(SHOW_INTROS, week);
  const outro = pick(SHOW_OUTROS, week >> 1);
  return { week, title: `Hoops Tonight · Week ${week}`, hosts: SPOTLIGHT_HOSTS, stories, intro, outro };
}
