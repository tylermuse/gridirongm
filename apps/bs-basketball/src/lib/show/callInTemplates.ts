/**
 * Call-In template answers — zero-LLM responses for everyone (BS Football
 * parity: src/lib/engine/callInTemplates.ts, rewritten for basketball).
 *
 * The caller taps a question chip; Marcus & Tony answer from the same teamData
 * payload the Spotlight uses (buildSpotlightTeamData). Every number comes
 * straight from that payload. Pick-from-variants keeps repeat taps fresh.
 */

type P = {
  name: string; pos: string; ovr: number; age: number; potential: number;
  salary: number; yearsLeft: number; howAcquired: string;
  stats: { gamesPlayed: number; ppg: number; rpg: number; apg: number; spg: number; bpg: number; tsPct: number };
};

export interface CallInTeamData {
  team: { name: string; city: string; wins: number; losses: number; record: string; streak: string; ppg: number; oppPpg: number; pointDiff: string; conference: string };
  rankings: { ppgRank: string; defRank: string };
  phase: string; season: number;
  capSpace: string | null; capPct: string | null;
  starPlayer: P | null;
  topPlayers: P[];
  injured: { name: string; pos: string; ovr: number; injury?: string; weeksLeft?: number }[];
  youngStars: { name: string; pos: string; ovr: number; age: number; potential: number }[];
  conferenceStandings?: { seed: number; name: string; record: string; isUser: boolean }[];
  madePlayoffs?: boolean;
  userSeed?: number | null;
  tradesThisSeason?: string[];
}

export interface CallInChip { id: string; label: string }
export interface TemplateReply { speaker: 'marcus' | 'tony'; text: string }

export const CALL_IN_CHIPS: CallInChip[] = [
  { id: 'star', label: 'Grade my best player' },
  { id: 'weakness', label: "What's my biggest weakness?" },
  { id: 'strength', label: "What's my strength?" },
  { id: 'playoffs', label: 'Are we a playoff team?' },
  { id: 'cap', label: 'How is my cap situation?' },
  { id: 'youth', label: 'Who should I build around?' },
  { id: 'injuries', label: 'How bad are the injuries?' },
  { id: 'trades', label: 'Grade my trades' },
  { id: 'tony', label: 'Tony, give me a hot take' },
];

function an(n: number): string { return /^(8|11|18)/.test(String(n)) ? 'an' : 'a'; }
function pick<T>(arr: T[], seed: number): T { return arr[Math.abs(seed) % arr.length]; }
function rankNum(r: string): number { return parseInt(r, 10) || 0; }
function totalTeams(r: string): number { return parseInt(r.split(' of ')[1] ?? '30', 10) || 30; }
function last(name: string): string { return (name.split(' ').pop() ?? name).toUpperCase(); }
function suffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
}
function statLine(p: P): string {
  const s = p.stats;
  return `${s.ppg} points, ${s.rpg} boards and ${s.apg} assists a night on ${s.tsPct}% true shooting`;
}
/** Wins from "W3"/"L2" streak strings (losses negative). */
function streakNum(s: string): number {
  const n = parseInt(s.slice(1), 10) || 0;
  return s.startsWith('W') ? n : s.startsWith('L') ? -n : 0;
}

export function answerChip(id: string, d: CallInTeamData, seed = Date.now()): TemplateReply[] {
  const t = d.team;
  const gp = t.wins + t.losses;
  const ppgRank = rankNum(d.rankings.ppgRank);
  const defRank = rankNum(d.rankings.defRank);
  const n = totalTeams(d.rankings.ppgRank);

  switch (id) {
    case 'star': {
      const s = d.starPlayer ?? d.topPlayers[0];
      if (!s) return [
        { speaker: 'marcus', text: `I'd grade your best player if you had a roster to grade. I'm looking at an empty sheet.` },
        { speaker: 'tony', text: `NO PLAYERS? GM, you called a BASKETBALL show. Go sign somebody and call back.` },
      ];
      const grade = s.ovr >= 88 ? 'A' : s.ovr >= 80 ? 'B' : s.ovr >= 72 ? 'C' : 'D';
      const m = s.stats.gamesPlayed > 0
        ? `${s.name} is ${an(s.ovr)} ${s.ovr} overall putting up ${statLine(s)} through ${s.stats.gamesPlayed} games. That's ${grade === 'A' ? 'an' : 'a'} ${grade} on my sheet. ${s.howAcquired === 'on the original roster' ? `He came with the roster, so this one isn't on you either way.` : `You ${s.howAcquired.replace(/^traded for/, 'traded for him').replace(/^signed/, 'signed him').replace(/^drafted/, 'drafted him')}, so this grade is yours too.`}`
        : `${s.name}, ${s.ovr} overall, age ${s.age}. No games yet, so on talent alone that's ${grade === 'A' ? 'an' : 'a'} ${grade}. Check back after a couple of weeks.`;
      const tonyLines = grade === 'A'
        ? [`${s.ovr} overall? GM, that's a FRANCHISE player. Stop asking me questions and go win a ring.`, `${s.name} is the REAL deal. If this team loses, it is NOT his fault. It's YOURS.`]
        : grade === 'B'
        ? [`${s.name} is GOOD, not great. Good gets you a playoff series. Great gets you a parade. Which one are you paying for?`, `I like him. I don't LOVE him. ${s.stats.ppg >= 22 ? `${s.stats.ppg} a night is real, though.` : `Give him a co-star and we'll talk.`}`]
        : [`Your BEST player is ${an(s.ovr)} ${s.ovr}? That's a sixth man wearing a superstar's jersey.`, `GM, I'm begging you. Go get a STAR. Trade, sign, draft, I don't care. ANYTHING.`];
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: pick(tonyLines, seed) }];
    }

    case 'weakness': {
      const offBad = ppgRank > n / 2, defBad = defRank > n / 2;
      const worst = defRank >= ppgRank ? 'defense' : 'offense';
      const m = gp === 0
        ? `No games yet, so I can't rank either end. On paper, ${d.topPlayers[0] ? `everything runs through ${d.topPlayers[0].name}` : 'the roster is thin'}, and that's the risk.`
        : worst === 'defense'
        ? `Defense. You're giving up ${t.oppPpg} a game, ${defRank}${suffix(defRank)} of ${n}. ${d.injured.length ? `Losing ${d.injured[0].name} doesn't help.` : `And that's with a healthy rotation, which is the concerning part.`}`
        : `Offense. ${t.ppg} points a game ranks ${ppgRank}${suffix(ppgRank)} of ${n}. ${d.starPlayer ? `${d.starPlayer.name} is carrying ${d.starPlayer.stats.ppg} of it, so there isn't much help.` : ''}`;
      const tony = gp === 0
        ? `Weakness? Ask me after you've PLAYED somebody, GM.`
        : !offBad && !defBad
        ? `Weakness? You're top half on BOTH ends. Your weakness is CONFIDENCE. Go act like a contender.`
        : worst === 'defense'
        ? `Your defense is a LAYUP LINE. ${t.oppPpg} a night! I could get to the rim on that unit and I have two bad knees.`
        : `${t.ppg} points a game in THIS league? That's not an offense, that's a shot-clock violation waiting to happen.`;
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'strength': {
      const best = ppgRank <= defRank ? 'offense' : 'defense';
      const star = d.starPlayer ?? d.topPlayers[0];
      const m = gp === 0
        ? `Top of the roster. ${star ? `${star.name} at ${star.ovr} overall is the best piece you have.` : ''} Games will tell us the rest.`
        : best === 'offense'
        ? `Offense. ${t.ppg} a game, ${ppgRank}${suffix(ppgRank)} in the league. ${star ? `${star.name} at ${star.ovr} overall is the engine.` : ''}`
        : `Defense. ${t.oppPpg} allowed, ${defRank}${suffix(defRank)} in the league. ${star ? `${star.name} (${star.pos}, ${star.ovr}) is the best player on this roster.` : ''}`;
      const tony = pick([
        `Your strength is ${star ? last(star.name) : 'the roster'}. Run EVERYTHING through him and STOP overthinking it.`,
        `${best === 'offense' ? 'You can SCORE' : 'You can GUARD'}. That's the strength. Now get the other end to match it.`,
      ], seed);
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'playoffs': {
      if (d.madePlayoffs !== undefined && d.phase === 'playoffs') {
        return d.madePlayoffs
          ? [{ speaker: 'marcus', text: `You're in as the ${d.userSeed} seed. The record got you here; a ${t.pointDiff} point differential says whether you'll stay.` },
             { speaker: 'tony', text: `YOU'RE IN, GM! Nobody remembers the seed. They remember who's holding the trophy in June.` }]
          : [{ speaker: 'marcus', text: `No. ${t.record} with a ${t.pointDiff} point differential. The math didn't work this year.` },
             { speaker: 'tony', text: `Watching the playoffs from the COUCH. That should burn, GM. Let it burn all summer.` }];
      }
      const pct = gp > 0 ? t.wins / gp : 0;
      const standing = d.conferenceStandings?.find(s => s.isUser);
      const m = gp === 0
        ? `Zero games played, so I'm not forecasting anything. Ask me after the first couple of weeks.`
        : `${t.record}, ${t.pointDiff} point differential${standing ? `, sitting ${standing.seed}${suffix(standing.seed)} in the ${t.conference}` : ''}. ${pct >= 0.6 ? `That profile is a top-six seed more often than not.` : pct >= 0.45 ? `That's play-in territory, and the point differential will decide which side of it.` : `That is not a playoff team unless something changes fast.`}`;
      const tony = gp === 0 ? `Opening WEEK and you're asking about the playoffs? I love the ambition. Go win a game first.`
        : pct >= 0.6 ? `PLAYOFF TEAM. Say it with me. Now stop smiling and go get home court.`
        : pct >= 0.45 ? `You're a PLAY-IN team, GM. Play-in teams either make a move or make excuses. Which one are you?`
        : `${t.record}? GM, let's talk about the LOTTERY. That's the honest answer.`;
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'cap': {
      if (!d.capSpace || !d.capPct) return [
        { speaker: 'marcus', text: `I don't have your cap sheet in front of me right now. Check Finances for the payroll and the apron lines.` },
        { speaker: 'tony', text: `Money questions? Go ask your ACCOUNTANT, GM. Ask me about BASKETBALL.` },
      ];
      const pct = parseInt(d.capPct, 10) || 0;
      const exp = d.topPlayers.filter(p => p.yearsLeft === 1).slice(0, 2);
      const over = d.capSpace.startsWith('$-');
      const m = `${over ? `You're ${d.capSpace.replace('$-', '$')} over the cap` : `${d.capSpace} under the cap`}, ${d.capPct} of it committed. ${pct >= 120 ? `That's deep into tax territory: every addition costs real money, and the aprons start taking tools away.` : pct >= 100 ? `Over the cap, so you're working with exceptions and salary matching, not cap room.` : 'Real room to be aggressive in free agency.'}${exp.length ? ` Watch ${exp.map(p => p.name).join(' and ')}: ${exp.length > 1 ? 'both are' : 'he is'} in the last year of ${exp.length > 1 ? 'their deals' : 'his deal'}.` : ''}`;
      const tony = pct >= 120
        ? `You spent EVERY DOLLAR and then some. That better be a CHAMPIONSHIP roster, because the luxury tax doesn't hand out rings.`
        : pct < 95
        ? `${d.capSpace} sitting in the bank doing NOTHING? Cap space doesn't win games. PLAYERS win games. Spend it!`
        : `Cap's fine. Boring answer. Next question.`;
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'youth': {
      const ys = d.youngStars;
      if (!ys.length) return [
        { speaker: 'marcus', text: `Honestly? Nobody 24 or under with a high ceiling. This roster is built to win now or not at all.` },
        { speaker: 'tony', text: `No young core? Then you better be WINNING NOW, GM, because there's no tomorrow on this roster.` },
      ];
      const top = ys[0];
      const m = `${top.name}. ${top.pos}, ${top.age} years old, ${top.ovr} now with a ${top.potential} ceiling.${ys[1] ? ` ${ys[1].name} (${ys[1].pos}, ${ys[1].potential} potential) is the other piece.` : ''} That's your core.`;
      const tony = `${last(top.name)}. Lock him up, feed him minutes, and don't you DARE trade him for a 34-year-old rental.`;
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'injuries': {
      const inj = d.injured;
      if (!inj.length) return [
        { speaker: 'marcus', text: `Clean bill of health on the players that matter. Enjoy it, because it never lasts.` },
        { speaker: 'tony', text: `HEALTHY ROSTER! No excuses, GM. None. Go win.` },
      ];
      const m = `${inj.map(i => `${i.name} (${i.pos}, ${i.ovr})${i.weeksLeft != null ? ` out ${i.weeksLeft} more week${i.weeksLeft === 1 ? '' : 's'}` : ''}`).join('; ')}. ${inj[0].ovr >= 80 ? `Losing ${inj[0].name} is the one that moves the needle.` : `Your bench should cover this.`}`;
      const tony = inj[0].ovr >= 80
        ? `${last(inj[0].name)} is down and you're asking ME how bad it is? BAD. Find minutes for somebody YESTERDAY.`
        : `Everybody gets hurt. Next man up. Stop crying about it, GM.`;
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'trades': {
      const tr = d.tradesThisSeason ?? [];
      const acq = d.topPlayers.filter(p => p.howAcquired.startsWith('traded for'));
      if (!tr.length && !acq.length) return [
        { speaker: 'marcus', text: `No trades on the books. Nothing to grade, which is itself a choice.` },
        { speaker: 'tony', text: `ZERO trades? You're a GM, not a librarian! Pick up the phone!` },
      ];
      const m = acq.length
        ? `You traded for ${acq.map(p => `${p.name} (${p.pos}, ${p.ovr})`).join(', ')}. ${acq[0].ovr >= 80 ? `Top-of-the-rotation talent via trade is a win on paper.` : `Solid depth moves, not needle-movers.`}${tr.length ? ` ${tr.length} deal${tr.length > 1 ? 's' : ''} this season total.` : ''}`
        : `${tr.length} trade${tr.length > 1 ? 's' : ''} this season: ${tr.slice(0, 2).join('; ')}. None of the incoming pieces crack your top ten yet.`;
      const tony = acq.length && acq[0].ovr >= 80
        ? `You got ${last(acq[0].name)} in a TRADE? Somebody got fleeced and it wasn't you. A-plus.`
        : `I grade trades on one thing: did it make you SCARIER? ${ppgRank <= n / 3 || defRank <= n / 3 ? 'A little.' : 'Nope. C-minus.'}`;
      return [{ speaker: 'marcus', text: m }, { speaker: 'tony', text: tony }];
    }

    case 'tony':
    default: {
      const star = d.starPlayer ?? d.topPlayers[0];
      const streak = streakNum(t.streak);
      const takes = [
        star && star.salary > 0 ? `${last(star.name)} at $${star.salary}M is a BARGAIN and if you don't extend him somebody else will. HOT TAKE DELIVERED.` : `This roster needs a STAR. Not a good player. A STAR.`,
        streak >= 2 ? `You're on a ${streak}-game heater and you're calling a RADIO SHOW? Go celebrate, GM!` : streak <= -2 ? `${Math.abs(streak)} straight losses. If I were you I'd be in the film room, not on hold with me.` : gp > 0 ? `${t.record}. Mediocre. The most DANGEROUS place to be in this league. Pick a direction!` : `No games yet and I ALREADY know this: somebody on this roster is about to break out.`,
        gp > 0 ? `Defense ranked ${defRank}${suffix(defRank)}, offense ranked ${ppgRank}${suffix(ppgRank)}. You know which one's the problem. FIX IT.` : `Preseason rankings are for COWARDS. Show me what you've got.`,
      ];
      return [
        { speaker: 'tony', text: pick(takes, seed) },
        { speaker: 'marcus', text: pick([`For the record, I did not sign off on that.`, `The data neither confirms nor denies whatever that was.`, `He's not wrong. I hate saying that.`], seed + 1) },
      ];
    }
  }
}
