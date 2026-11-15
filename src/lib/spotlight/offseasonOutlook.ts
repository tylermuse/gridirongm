/**
 * The offseason ahead, for the season-wrap episode: who's in the last year
 * of his deal (the re-signing calls), the money coming off the books, the
 * cap, the upcoming draft picks and the weakest starting groups. The season
 * wrap closes on it, so the offseason never needs an episode of its own.
 * Pure (client-safe).
 */
import type { Player, Position, Team } from '@/types';
import { computeTradeNeeds } from './tradeNeeds';
import { ordinal } from './teamStats';

/** The topic the season-wrap episode closes on. */
export const OFFSEASON_PREVIEW_HEADLINE = 'Offseason Preview';

interface PlayerRef { id: string; name: string; pos: Position; ovr: number; age: number }

export interface OffseasonOutlook {
  /** The best players in the last year of their deals (the re-signing calls). */
  expiring: (PlayerRef & { salary: number })[];
  /** Every expiring deal on the roster, and what they pay ($M). */
  expiringCount: number;
  expiringSalary: number;
  /** Cap space ($M) as the game shows it now. */
  capSpace: number;
  /** In re-signing the expiring deals are already off the payroll the game
   *  shows; before it they still count. */
  capCountsExpiring: boolean;
  /** The team's picks in the next draft (null when the draft year is unknown). */
  draft: { year: number; picks: number; firsts: number; ownFirst: boolean } | null;
  /** Starting groups in the bottom half of the league, worst first. */
  needs: { pos: Position; rank: number; of: number; weakest: { name: string; ovr: number; age: number } }[];
  /** Young players to build around. */
  youngCore: PlayerRef[];
  /** Good veterans getting old (not counting the expiring ones). */
  agingStarters: PlayerRef[];
}

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;
const ref = (p: Player): PlayerRef => ({ id: p.id, name: fullName(p), pos: p.position, ovr: p.ratings.overall, age: p.age });
const money = (m: number) => Math.round(m * 10) / 10;

/** In the last year of his deal: the same test the re-signing window uses. */
export function isExpiring(p: Player): boolean {
  if (p.contract.yearsLeft === 1) return true;
  const years = p.contract.contractYears;
  return !!years && years.length > 1 && years.filter(y => !y.isVoidYear).length === 1;
}

export function computeOffseasonOutlook(team: Team, teams: Team[], players: Player[], phase?: string): OffseasonOutlook {
  const roster = players.filter(p => p.teamId === team.id && !p.retired);
  const byOvr = (a: Player, b: Player) => b.ratings.overall - a.ratings.overall;

  const expiringAll = roster.filter(isExpiring).sort(byOvr);
  const expiring = expiringAll.slice(0, 4).map(p => ({ ...ref(p), salary: money(p.contract.salary) }));
  const expiringIds = new Set(expiringAll.map(p => p.id));

  // The next draft is the earliest year anyone still holds an unused pick in.
  const openYears = teams.flatMap(t => (t.draftPicks ?? []).filter(pk => !pk.playerId).map(pk => pk.year));
  const draftYear = openYears.length ? Math.min(...openYears) : null;
  const picks = draftYear == null ? [] : (team.draftPicks ?? []).filter(pk => !pk.playerId && pk.year === draftYear);

  const needs = computeTradeNeeds(team, teams, players, 2, 0).needs
    .filter(n => n.rank > n.of / 2)
    .map(n => ({ pos: n.pos, rank: n.rank, of: n.of, weakest: n.weakest }));

  return {
    expiring,
    expiringCount: expiringAll.length,
    expiringSalary: money(expiringAll.reduce((s, p) => s + p.contract.salary, 0)),
    capSpace: money(team.salaryCap - team.totalPayroll),
    capCountsExpiring: phase !== 'resigning',
    draft: draftYear == null ? null : {
      year: draftYear,
      picks: picks.length,
      firsts: picks.filter(pk => pk.round === 1).length,
      ownFirst: picks.some(pk => pk.round === 1 && pk.originalTeamId === team.id),
    },
    needs,
    youngCore: roster.filter(p => p.age <= 25 && p.potential >= 75).sort((a, b) => b.potential - a.potential).slice(0, 3).map(ref),
    agingStarters: roster.filter(p => p.age >= 32 && p.ratings.overall >= 72 && !expiringIds.has(p.id)).sort(byOvr).slice(0, 2).map(ref),
  };
}

const listOf = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const lastName = (name: string) => name.split(' ').slice(1).join(' ') || name;

/**
 * The season wrap's closing topic, as Marcus/Tony notes grounded in the
 * outlook: the re-signing calls, the cap, the holes, the draft. It reads as
 * the written recap's last topic and as the writer's notes for the show.
 */
export function offseasonPreviewTopic(team: Team, o: OffseasonOutlook) {
  const lines: { speakerId: 'stats' | 'hottake'; text: string }[] = [];
  const top = o.expiring[0];

  if (top) {
    const named = o.expiring.map(p => `${p.name} (${p.pos}, ${p.ovr} OVR, age ${p.age})`);
    const more = o.expiringCount - o.expiring.length;
    const offBooks = o.capCountsExpiring ? ` About $${o.expiringSalary}M comes off the books if they all walk.` : '';
    lines.push({ speakerId: 'stats', text: `First up for the ${team.name} is re-signing. ${listOf(named)} ${o.expiring.length === 1 ? 'is' : 'are'} in the last year of ${o.expiring.length === 1 ? 'his deal' : 'their deals'}${more > 0 ? `, with ${more} more behind them` : ''}.${offBooks}` });
    lines.push({ speakerId: 'hottake', text: top.ovr >= 80
      ? `You pay ${lastName(top.name)}. ${top.age >= 31 ? `He's ${top.age}, so keep it short, but you don't let a player like that walk.` : `That's not a debate.`}`
      : top.age >= 31
      ? `${lastName(top.name)} is ${top.age}. I'm not handing out long deals to guys on the way down.`
      : `Nobody on that list is untouchable. Keep the ones who fit the price and move on.` });
  } else {
    lines.push({ speakerId: 'stats', text: `No key contracts are up for the ${team.name}: the core is signed through next season.` });
    lines.push({ speakerId: 'hottake', text: `Then every dollar goes to getting better, not keeping the band together.` });
  }

  const cap = o.capCountsExpiring
    ? `They have $${o.capSpace}M in cap space right now.`
    : `They have $${o.capSpace}M in cap space before they re-sign anybody.`;
  const holes = o.needs.length
    ? ` The holes: ${listOf(o.needs.map(n => `${n.pos} (the starters rank ${ordinal(n.rank)} of ${n.of}; ${n.weakest.name} is the weak link at ${n.weakest.ovr} OVR)`))}.`
    : ' No glaring holes: every starting group ranks in the top half of the league.';
  lines.push({ speakerId: 'stats', text: cap + holes });

  const need = o.needs[0]?.pos;
  if (o.draft && o.draft.picks > 0) {
    const firsts = o.draft.ownFirst
      ? o.draft.firsts > 1 ? `, with ${o.draft.firsts} first-rounders` : ', including their own first-rounder'
      : o.draft.firsts > 0 ? `, with a first-rounder from somebody else` : ', but no first-rounder';
    // "an OL", "a QB": the article goes by how the letter is said.
    const article = need && /^[AEFHILMNORSX]/.test(need) ? 'an' : 'a';
    lines.push({ speakerId: 'hottake', text: `They have ${o.draft.picks} pick${o.draft.picks === 1 ? '' : 's'} in the ${o.draft.year} draft${firsts}. ${need ? `If there's ${article} ${need} worth it on the board, that's the pick.` : 'Best player available, every time.'}` });
  } else if (o.draft) {
    lines.push({ speakerId: 'hottake', text: `No picks in the ${o.draft.year} draft, so any fix has to come through free agency or a trade.` });
  }

  const young = o.youngCore.map(p => `${p.name} (${p.pos}, ${p.age})`);
  const aging = o.agingStarters.map(p => `${p.name} (${p.pos}, ${p.age})`);
  if (young.length || aging.length) {
    lines.push({ speakerId: 'stats', text: [
      young.length ? `The young pieces to build around: ${listOf(young)}.` : '',
      aging.length ? `And the clock is running on ${listOf(aging)}.` : '',
    ].filter(Boolean).join(' ') });
  }

  return {
    headline: OFFSEASON_PREVIEW_HEADLINE,
    icon: '🔮',
    exchanges: lines,
    teamIds: [team.id],
    playerIds: [...o.expiring, ...o.youngCore, ...o.agingStarters].map(p => p.id),
  };
}
