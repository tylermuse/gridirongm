/**
 * Call-In template answers — zero-LLM responses for the free tier.
 *
 * The caller taps a question chip; Marcus & Tony answer from the same
 * teamData payload the Spotlight uses (buildSpotlightTeamData). Every
 * number comes straight from that payload. Pick-from-variants keeps it from
 * feeling canned on repeat taps.
 */

type P = {
  name: string; pos: string; ovr: number; age: number; potential: number;
  salary: number; yearsLeft: number; howAcquired: string;
  stats: { passYds: number; passTDs: number; rushYds: number; rushTDs: number; recYds: number; recTDs: number; tackles: number; sacks: number; ints: number };
};

interface TD {
  team: { name: string; city: string; wins: number; losses: number; record: string; streak: number; ppg: number; oppPpg: number; pointDiff: string; conference: string };
  rankings: { ppgRank: string; defRank: string };
  phase: string; week: number; season: number;
  capSpace: string; capPct: string;
  startingQB: (P & { depthChartPosition: string }) | null;
  backupQB: (P & { ovrGap: number; qbCompetition: string | null }) | null;
  topPlayers: P[];
  injured: { name: string; pos: string; ovr: number; injury?: string; weeksLeft?: number }[];
  youngStars: { name: string; pos: string; ovr: number; age: number; potential: number }[];
  trendNarrative?: string | null;
  conferenceStandings?: { seed: number; name: string; record: string; isUser: boolean }[];
  madePlayoffs?: boolean;
  userSeed?: number | null;
  tradesThisSeason?: string[];
  positionGroupStrength?: Record<string, number>;
}

export interface CallInChip { id: string; label: string; }
export interface TemplateReply { speaker: 'marcus' | 'tony'; text: string; }

export const CALL_IN_CHIPS: CallInChip[] = [
  { id: 'qb', label: 'Grade my QB' },
  { id: 'weakness', label: "What's my biggest weakness?" },
  { id: 'strength', label: "What's my strength?" },
  { id: 'playoffs', label: 'Are we a playoff team?' },
  { id: 'cap', label: 'How is my cap situation?' },
  { id: 'youth', label: 'Who should I build around?' },
  { id: 'injuries', label: 'How bad are the injuries?' },
  { id: 'trades', label: 'Grade my trades' },
  { id: 'tony', label: 'Tony, give me a hot take' },
];

function an(n: number): string { return /^8/.test(String(n)) ? 'an' : 'a'; }
function pick<T>(arr: T[], seed: number): T { return arr[Math.abs(seed) % arr.length]; }
function rankNum(r: string): number { return parseInt(r, 10) || 0; }
function totalTeams(r: string): number { return parseInt(r.split(' of ')[1] ?? '32', 10) || 32; }

function qbLine(q: P): string {
  const s = q.stats;
  const ratio = s.ints > 0 ? (s.passTDs / s.ints).toFixed(1) : `${s.passTDs}`;
  return `${s.passYds} yards, ${s.passTDs} TDs, ${s.ints} INTs (${ratio} TD-to-INT)`;
}

export function answerChip(id: string, d: TD, seed = Date.now()): TemplateReply[] {
  const t = d.team;
  const gp = t.wins + t.losses;
  const ppgRank = rankNum(d.rankings.ppgRank);
  const defRank = rankNum(d.rankings.defRank);
  const n = totalTeams(d.rankings.ppgRank);

  switch (id) {
    case 'qb': {
      const q = d.startingQB;
      if (!q) return [
        { speaker: 'marcus', text: `I'd grade your quarterback if you had one on the depth chart. Right now I'm looking at an empty QB1 slot.` },
        { speaker: 'tony', text: `NO QUARTERBACK? GM, you called a FOOTBALL show. Go find one and call back.` },
      ];
      const grade = q.ovr >= 85 ? 'A' : q.ovr >= 78 ? 'B' : q.ovr >= 70 ? 'C' : 'D';
      const m = gp > 0
        ? `${q.name} is ${an(q.ovr)} ${q.ovr} overall with ${qbLine(q)} through ${gp} games. That's a ${grade} on my sheet. ${q.howAcquired === 'original roster' ? `He came with the roster, so this one isn't on you either way.` : `You ${q.howAcquired}, so this grade is yours too.`}`
        : `${q.name}, ${q.ovr} overall, age ${q.age}. No game data yet, so on talent alone that's a ${grade}. Check back after a few weeks.`;
      const tonyLines = grade === 'A'
        ? [`${an(q.ovr) === 'an' ? 'An' : 'A'} ${q.ovr} overall at quarterback? GM, you've got a FRANCHISE guy. Stop asking me questions and go win something.`, `${q.name} is the real deal. If this team loses, it is NOT the quarterback's fault, it's YOURS.`]
        : grade === 'B'
        ? [`${q.name} is GOOD, not great. Good gets you to January. Great gets you a parade. Decide which one you're paying for.`, `I like him. I don't LOVE him. ${q.stats.ints >= 8 ? `${q.stats.ints} picks says he's got a gambling problem.` : `Give him weapons and we'll talk.`}`]
        : [`${q.ovr} overall is a BACKUP wearing a starter's helmet. You know it, I know it, the fans know it.`, `GM, I'm begging you. ${d.backupQB?.qbCompetition ? `${d.backupQB.name} is RIGHT THERE on your bench.` : `Draft one. Trade for one. Sign one off the street. ANYTHING.`}`];
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: pick(tonyLines, seed) }];
    }

    case 'weakness': {
      const offBad = ppgRank > n / 2, defBad = defRank > n / 2;
      const worst = defRank >= ppgRank ? 'defense' : 'offense';
      const m = worst === 'defense'
        ? `Defense. You're giving up ${t.oppPpg} points a game, ${defRank}${suffix(defRank)} of ${n}. ${d.injured.length ? `Losing ${d.injured[0].name} doesn't help.` : `And that's with a healthy lineup, which is the concerning part.`}`
        : `Offense. ${t.ppg} points a game ranks ${ppgRank}${suffix(ppgRank)} of ${n}. ${d.startingQB ? `${d.startingQB.name} has ${d.startingQB.stats.passTDs} touchdown passes, which tells you most of the story.` : ''}`;
      const tony = !offBad && !defBad
        ? `Weakness? You're top half on BOTH sides of the ball. Your weakness is CONFIDENCE, GM. Go act like a contender.`
        : worst === 'defense'
        ? `Your defense is a TURNSTILE. ${t.oppPpg} a game! I could score on that unit and I haven't run a 40 since college.`
        : `${t.ppg} points a game is NOT football, it's a punt-fest. Somebody on that offense needs to get FIRED UP or get fired.`;
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'strength': {
      const best = ppgRank <= defRank ? 'offense' : 'defense';
      const star = d.topPlayers[0];
      const m = best === 'offense'
        ? `Offense. ${t.ppg} a game, ${ppgRank}${suffix(ppgRank)} in the league. ${star ? `${star.name} at ${star.ovr} overall is the engine.` : ''}`
        : `Defense. ${t.oppPpg} allowed, ${defRank}${suffix(defRank)} in the league. ${star ? `${star.name} (${star.pos}, ${star.ovr}) is the best player on this roster.` : ''}`;
      const tony = pick([
        `Your strength is ${star ? star.name.split(' ').pop()!.toUpperCase() : 'the roster'}. Build the whole game plan around him and STOP overthinking it.`,
        `${best === 'offense' ? 'You can SCORE' : 'You can HIT'}. That's the strength. Now get the other side of the ball to match it.`,
      ], seed);
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'playoffs': {
      if (d.madePlayoffs !== undefined && d.phase === 'playoffs') {
        return d.madePlayoffs
          ? [{ speaker: 'marcus', text: `You're in — the ${d.userSeed} seed. The record got you here; the point differential of ${t.pointDiff} says whether you'll stay.` },
             { speaker: 'tony', text: `YOU'RE IN THE DANCE, GM! Nobody remembers the seed. They remember who's holding the trophy.` }]
          : [{ speaker: 'marcus', text: `No. ${t.record} with a ${t.pointDiff} point differential — the math didn't work this year.` },
             { speaker: 'tony', text: `Watching the playoffs from the COUCH. That should burn, GM. Let it burn all offseason.` }];
      }
      const pct = gp > 0 ? t.wins / gp : 0;
      const standing = d.conferenceStandings?.find(s => s.isUser);
      const m = gp === 0
        ? `Zero games played, so I'm not forecasting anything. Ask me in week six.`
        : `${t.record}, ${t.pointDiff} point differential${standing ? `, sitting ${standing.seed}${suffix(standing.seed)} in the ${t.conference}` : ''}. ${pct >= 0.6 ? `That profile makes the playoffs more often than not.` : pct >= 0.45 ? `That is a coin flip, and the point differential will decide it.` : `That is not a playoff team unless something changes fast.`}`;
      const tony = gp === 0 ? `Week ONE and you're asking about January? I love the ambition. Go win a game first.`
        : pct >= 0.6 ? `PLAYOFF TEAM. Say it with me. Now stop being happy about it and go get a bye.`
        : pct >= 0.45 ? `You're on the BUBBLE, GM. Bubble teams either make a move or make excuses. Which one are you?`
        : `${t.record}? GM, let's talk about the DRAFT. That's the honest answer.`;
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'cap': {
      const pct = parseInt(d.capPct, 10) || 0;
      const exp = d.topPlayers.filter(p => p.yearsLeft <= 1).slice(0, 2);
      const m = `${d.capSpace} in space, ${d.capPct} of the cap committed. ${pct >= 95 ? `You are capped out — any addition means a subtraction.` : pct >= 85 ? 'Tight but workable.' : 'Plenty of room to be aggressive.'}${exp.length ? ` Watch ${exp.map(p => p.name).join(' and ')} — ${exp.length > 1 ? 'both are' : 'he is'} in a contract year.` : ''}`;
      const tony = pct >= 95
        ? `You spent EVERY DOLLAR. That better be a Super Bowl roster, because there's no plan B in that checkbook.`
        : pct < 80
        ? `${d.capSpace} sitting in the bank doing NOTHING? GM, cap space doesn't win games. PLAYERS win games. Spend it!`
        : `Cap's fine. Boring answer. Next question.`;
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'youth': {
      const ys = d.youngStars;
      if (!ys.length) return [
        { speaker: 'marcus', text: `Honestly? Nobody under 25 with a 75-plus ceiling. This roster is built to win now or not at all.` },
        { speaker: 'tony', text: `No young core? Then you better be WINNING NOW, GM, because there's no tomorrow on this roster.` },
      ];
      const top = ys[0];
      const m = `${top.name}. ${top.pos}, ${top.age} years old, ${top.ovr} now with a ${top.potential} ceiling.${ys[1] ? ` ${ys[1].name} (${ys[1].pos}, ${ys[1].potential} potential) is the other piece.` : ''} That's your core.`;
      const tony = `${top.name.split(' ').pop()!.toUpperCase()}. Lock him up, feed him, and don't you DARE trade him for a 34-year-old rental.`;
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'injuries': {
      const inj = d.injured;
      if (!inj.length) return [
        { speaker: 'marcus', text: `Clean bill of health on the players that matter. Enjoy it — it never lasts.` },
        { speaker: 'tony', text: `HEALTHY ROSTER! No excuses, GM. None. Go win.` },
      ];
      const m = `${inj.map(i => `${i.name} (${i.pos}, ${i.ovr})${i.weeksLeft != null ? ` out ${i.weeksLeft} more week${i.weeksLeft === 1 ? '' : 's'}` : ''}`).join('; ')}. ${inj[0].ovr >= 80 ? `Losing ${inj[0].name} is the one that moves the needle.` : `Depth should cover this.`}`;
      const tony = inj[0].ovr >= 80
        ? `${inj[0].name.split(' ').pop()!.toUpperCase()} is down and you're asking ME how bad it is? BAD. Find a replacement YESTERDAY.`
        : `Everybody gets hurt. Next man up. Stop crying about it, GM.`;
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'trades': {
      const tr = d.tradesThisSeason ?? [];
      const acq = d.topPlayers.filter(p => p.howAcquired.startsWith('traded for'));
      if (!tr.length && !acq.length) return [
        { speaker: 'marcus', text: `No trades on the books this season. Nothing to grade — which is itself a choice.` },
        { speaker: 'tony', text: `ZERO trades? You're a GM, not a librarian! Pick up the phone!` },
      ];
      const m = acq.length
        ? `You traded for ${acq.map(p => `${p.name} (${p.pos}, ${p.ovr})`).join(', ')}. ${acq[0].ovr >= 80 ? `Top-ten-on-the-roster talent via trade is a win on paper.` : `Solid depth moves, not needle-movers.`}${tr.length ? ` ${tr.length} deal${tr.length > 1 ? 's' : ''} this season total.` : ''}`
        : `${tr.length} trade${tr.length > 1 ? 's' : ''} this season: ${tr.slice(0, 2).join('; ')}. None of the incoming pieces crack your top ten yet.`;
      const tony = acq.length && acq[0].ovr >= 80
        ? `You got ${acq[0].name.split(' ').pop()!.toUpperCase()} in a TRADE? Somebody got fleeced and it wasn't you. A-plus.`
        : `I grade trades on one thing: did it make you SCARIER? ${ppgRank <= n / 3 || defRank <= n / 3 ? 'A little.' : 'Nope. C-minus.'}`;
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'tony':
    default: {
      const star = d.topPlayers[0];
      const takes = [
        star ? `${star.name.split(' ').pop()!.toUpperCase()} is UNDERPAID at $${star.salary}M and if you don't extend him somebody else will. HOT TAKE DELIVERED.` : `This roster needs a STAR. Not a good player. A STAR.`,
        t.streak >= 2 ? `You're on a ${t.streak}-game heater and you're calling a RADIO SHOW? Go celebrate, GM!` : t.streak <= -2 ? `${Math.abs(t.streak)} straight losses. If I were you I'd be in the film room, not on hold with me.` : `${t.record}. Mediocre. The most DANGEROUS place to be. Pick a direction!`,
        d.startingQB && d.startingQB.stats.ints >= 8 ? `${d.startingQB.name.split(' ').pop()!.toUpperCase()} has thrown ${d.startingQB.stats.ints} interceptions. The other team's DBs should send him a thank-you card.` : `Defense ranked ${defRank}${suffix(defRank)}, offense ranked ${ppgRank}${suffix(ppgRank)}. You know which one's the problem. Fix it.`,
      ];
      return [
        { speaker: 'tony', text: pick(takes, seed) },
        { speaker: 'marcus', text: pick([`For the record, I did not sign off on that.`, `The data neither confirms nor denies whatever that was.`, `He's not wrong. I hate saying that.`], seed + 1) },
      ];
    }
  }
}

function suffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
}
