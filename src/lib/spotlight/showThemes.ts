/**
 * Team Spotlight show themes — a game the hosts play for the whole episode
 * ("Panic Mode", "Buy or Sell", "Contender or Pretender"), picked from where
 * the team is. A themed episode opens on a pre-recorded two-shot of the hosts
 * explaining the rules under the theme's title graphic, frames every topic
 * around the theme's question, and (Panic / Contender) ends on a verdict
 * each host commits to, shown on screen. Pure (client-safe).
 *
 * The two-shots (public/show/wide) are lip-synced per host: each host is
 * rendered on his own crop of the studio two-shot and both are laid back
 * over it (scripts/spotlight-show/wide/compose_wide.py).
 */
import WIDE from './wideClips.json';
import { isOffseason, type EpisodeMoment } from './showMoment';

export type ShowThemeId = 'panic' | 'buysell' | 'contender';

export interface WideLine { host: 'marcus' | 'tony'; text: string; start: number; end: number }
export interface WideClip { src: string; duration: number; speech: { start: number; end: number }; lines: WideLine[] }
export const WIDE_CLIPS = WIDE as Record<string, WideClip>;

/** The line being said `t` seconds into a two-shot. */
export function wideLineAt(id: string, t: number): WideLine | null {
  const w = WIDE_CLIPS[id];
  if (!w) return null;
  return w.lines.find(l => t < l.end) ?? w.lines[w.lines.length - 1];
}

/** Two-shot back-and-forths the writer may drop in anywhere (one per
 *  episode, right after a line by the host who doesn't open it). */
export const WIDE_BANTER: { id: string; when: string }[] = [
  { id: 'banter_1', when: 'right after Tony makes a bold prediction or call of his own (Tony opens: "I\'m writing that down, by the way.")' },
  { id: 'banter_2', when: 'right after Tony makes a big claim Marcus doesn\'t buy (Marcus opens: "See, this is where you lose me.")' },
];
export const SIGNOFFS = ['signoff_1', 'signoff_2'];

export type VerdictKind = 'meter' | 'stamp';
export type Call = 'buy' | 'sell';
/** Each host's verdict: a panic number 1–10, or 'contender' / 'pretender'. */
export type Verdict = { marcus: number | string; tony: number | string };
export type Calls = { marcus: Call; tony: Call };

export interface ShowTheme {
  id: ShowThemeId;
  title: string;
  /** Under the title on the theme card. */
  kicker: string;
  /** Pre-recorded openers (rules explained); one is picked per episode. */
  openers: string[];
  /** Pre-recorded "verdict time" prompts, and who answers first after each. */
  verdictClips: { id: string; first: 'marcus' | 'tony' }[];
  verdict?: VerdictKind;
  /** Per-topic buy/sell calls (Buy or Sell). */
  calls?: boolean;
  /** Told to the writer, after MOMENT. */
  note: string;
}

export const THEMES: Record<ShowThemeId, ShowTheme> = {
  panic: {
    id: 'panic',
    title: 'PANIC MODE',
    kicker: 'Hit the button, or put it down?',
    openers: ['panic_open_1', 'panic_open_2'],
    verdictClips: [{ id: 'panic_verdict_1', first: 'tony' }, { id: 'panic_verdict_2', first: 'marcus' }],
    verdict: 'meter',
    note: 'PANIC MODE. The episode is one argument: is it time to hit the panic button on this team? It opens with a pre-recorded bit where the hosts explain the game, so never explain the rules again. Every topic is evidence for or against panicking — make clear which way each one points. Tony leans toward panic and Marcus toward patience, but either can switch if the facts say so.',
  },
  contender: {
    id: 'contender',
    title: 'CONTENDER OR PRETENDER',
    kicker: 'Is the record telling the truth?',
    openers: ['contender_open_1', 'contender_open_2'],
    verdictClips: [{ id: 'contender_verdict_1', first: 'marcus' }],
    verdict: 'stamp',
    note: 'CONTENDER OR PRETENDER. The episode is one argument: is this team a real contender, or is the record lying? It opens with a pre-recorded bit where the hosts explain the game, so never explain the rules again. Every topic is evidence one way or the other — what is real, what is smoke — and say which way it points.',
  },
  buysell: {
    id: 'buysell',
    title: 'BUY OR SELL',
    kicker: 'Trade deadline edition',
    openers: ['buysell_open_1', 'buysell_open_2'],
    verdictClips: [],
    calls: true,
    note: 'BUY OR SELL. It opens with a pre-recorded bit where the hosts explain the game, so never explain the rules again. Each topic is one item on the board: its first line puts it up as a plain buy-or-sell question ("Buy or sell: they need a receiver more than a corner."), each host makes his call with the word "buy" or "sell" in his first line on it, then they argue it. Before each topic\'s first line, write {"t":<topic>,"calls":{"marcus":"buy"|"sell","tony":"buy"|"sell"}} matching the calls they make. They split on at least one item. No "hold".',
  },
};

const recordOf = (record?: string | null): [number, number] | null => {
  const m = record?.match(/^(\d+)-(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

/** The theme for this point of the season and this team, if any. */
export function themeFor(moment?: EpisodeMoment, record?: string | null): ShowThemeId | null {
  if (!moment || isOffseason(moment.phase) || moment.phase === 'preseason') return null;
  if (moment.narrative === 'seasonOver') return null;
  if (moment.narrative === 'tradeDeadline') return 'buysell';
  if (moment.phase === 'playoffs') return 'contender';
  const r = recordOf(record);
  if (!r || r[0] + r[1] < 3) return null;
  const diff = r[0] - r[1];
  if (diff <= 0) return 'panic';
  if (diff >= 2) return 'contender';
  return null;
}

/** Stable per-episode choice (same team + record → same pick). */
export function pick<T>(items: T[], seed: string): T {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return items[(h >>> 0) % items.length];
}

/** The episode's theme choices: which opener and verdict prompt it uses. */
export interface ThemePlan {
  id: ShowThemeId;
  opener: string;
  verdictClip: { id: string; first: 'marcus' | 'tony' } | null;
  signoff: string;
}

export function planTheme(id: ShowThemeId | null, seed: string): ThemePlan | null {
  if (!id) return null;
  const t = THEMES[id];
  return {
    id,
    opener: pick(t.openers, `${seed}|open`),
    verdictClip: t.verdictClips.length ? pick(t.verdictClips, `${seed}|verdict`) : null,
    signoff: pick(SIGNOFFS, `${seed}|signoff`),
  };
}

/** The topic the writer closes a verdict episode with. */
export const VERDICT_HEADLINE = 'The verdict';

export function verdictTopicNotes(plan: ThemePlan): string[] {
  const t = THEMES[plan.id];
  if (!t.verdict || !plan.verdictClip) return [];
  const clip = WIDE_CLIPS[plan.verdictClip.id];
  const said = clip.lines.map(l => `${l.host === 'marcus' ? 'MARCUS' : 'TONY'}: ${l.text}`).join(' / ');
  const first = plan.verdictClip.first === 'marcus' ? 'Marcus' : 'Tony';
  const what = t.verdict === 'meter'
    ? 'his panic number from 1 (totally fine) to 10 (hit the button), said as a number, and one or two sentences why'
    : 'his stamp — "contender" or "pretender", said in those words — and one or two sentences why';
  const json = t.verdict === 'meter' ? '{"t":<this topic>,"verdict":{"marcus":<1-10>,"tony":<1-10>}}' : '{"t":<this topic>,"verdict":{"marcus":"contender"|"pretender","tony":"contender"|"pretender"}}';
  return [
    `Marcus: This topic plays right after a pre-recorded exchange (${said}). ${first} answers first. Each host gives ${what}; the other reacts. Three to five lines, ending on a jab or a shrug, not a summary.`,
    `Tony: Before the first line of this topic, write ${json} with exactly what they say.`,
  ];
}

const METER = new Set(Array.from({ length: 10 }, (_, i) => i + 1));

/** A verdict line from the writer, checked against the theme. */
export function parseVerdict(id: ShowThemeId, raw: unknown): Verdict | null {
  const t = THEMES[id];
  if (!t.verdict || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ok = (v: unknown) => (t.verdict === 'meter' ? typeof v === 'number' && METER.has(v) : v === 'contender' || v === 'pretender');
  return ok(r.marcus) && ok(r.tony) ? { marcus: r.marcus as number | string, tony: r.tony as number | string } : null;
}

export function parseCalls(id: ShowThemeId, raw: unknown): Calls | null {
  if (!THEMES[id].calls || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ok = (v: unknown): v is Call => v === 'buy' || v === 'sell';
  return ok(r.marcus) && ok(r.tony) ? { marcus: r.marcus, tony: r.tony } : null;
}
