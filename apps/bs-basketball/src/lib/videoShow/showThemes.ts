/**
 * Team Spotlight show themes (BS Hoops copy of BS Football's) — a game the hosts play for the whole episode
 * ("Panic Mode", "Buy or Sell", "Contender or Pretender"), picked from where
 * the team is. A themed episode opens on a pre-recorded two-shot of the hosts
 * explaining the rules under the theme's title graphic, frames every topic
 * around the theme's question, and (Panic / Contender) ends on a verdict
 * each host commits to, shown on screen. Pure (client-safe).
 *
 * The two-shots (public/show/wide) are lip-synced per host: each host is
 * rendered on his own crop of the studio two-shot and both are laid back
 * over it, cutting between the hosts facing each other and facing the
 * camera line by line (scripts/spotlight-show/wide/compose_shots.py).
 */
import WIDE from './wideClips.json';
import { isOffseason, type EpisodeMoment } from './showMoment';

export type ShowThemeId = 'panic' | 'buysell' | 'contender';

export interface WideLine { host: 'marcus' | 'tony'; text: string; start: number; end: number }
/** `shots`: one letter per line, c = both hosts face the camera, p = they face each other straight-faced, P = face each other grinning (jokes and jabs only; compose_shots.py). */
export interface WideClip { src: string; duration: number; speech: { start: number; end: number }; lines: WideLine[]; shots?: string }
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
  { id: 'banter_3', when: 'right after Marcus rattles off a statistic or a league rank (Tony opens: "Here come the spreadsheets.")' },
  { id: 'banter_4', when: 'right after Tony gets worked up — raises his voice, calls for somebody\'s job (Marcus opens: "Take a breath.")' },
  { id: 'banter_5', when: 'right after Tony calls a player elite on feel, with no numbers behind it (Marcus opens: "You can\'t just say a player is \'him\'.")' },
  { id: 'banter_7', when: 'right before Marcus digs into the numbers on a topic (Marcus opens: "Let\'s look at the numbers.")' },
  { id: 'banter_8', when: 'right after Tony suggests firing a coach, coordinator or GM (Tony opens: "I\'m not saying fire everybody.")' },
];
export const SIGNOFFS = ['signoff_1', 'signoff_2', 'signoff_3', 'signoff_4'];

/** A panic number, a contender/pretender stamp, or (Buy or Sell) each host's one move. */
export type VerdictKind = 'meter' | 'stamp' | 'move';
export type Call = 'buy' | 'sell';
/** Each host's verdict: a panic number 1–10, 'contender' / 'pretender', or his one move. */
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
  /** The closing topic's headline (verdict themes). */
  verdictTitle?: string;
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
    openers: ['panic_open_1', 'panic_open_2', 'panic_open_3'],
    verdictClips: [{ id: 'panic_verdict_1', first: 'tony' }, { id: 'panic_verdict_2', first: 'marcus' }],
    verdict: 'meter',
    verdictTitle: 'The verdict',
    note: 'PANIC MODE. The episode is one argument: is it time to hit the panic button on this team? It opens with a pre-recorded bit where the hosts explain the game, so never explain the rules again. Every topic is evidence for or against panicking — make clear which way each one points. Tony leans toward panic and Marcus toward patience, but either can switch if the facts say so.',
  },
  contender: {
    id: 'contender',
    title: 'CONTENDER OR PRETENDER',
    kicker: 'Is the record telling the truth?',
    // contender_open_1 ("when it's January and the weather turns") is football-only.
    openers: ['contender_open_2', 'contender_open_3'],
    verdictClips: [{ id: 'contender_verdict_1', first: 'marcus' }, { id: 'contender_verdict_2', first: 'tony' }],
    verdict: 'stamp',
    verdictTitle: 'The verdict',
    note: 'CONTENDER OR PRETENDER. The episode is one argument: is this team a real contender, or is the record lying? It opens with a pre-recorded bit where the hosts explain the game, so never explain the rules again. Every topic is evidence one way or the other — what is real, what is smoke — and say which way it points.',
  },
  buysell: {
    id: 'buysell',
    title: 'BUY OR SELL',
    kicker: 'Trade deadline edition',
    openers: ['buysell_open_1', 'buysell_open_2', 'buysell_open_3'],
    verdictClips: [{ id: 'buysell_final_1', first: 'tony' }],
    verdict: 'move',
    verdictTitle: 'The one move',
    calls: true,
    note: 'BUY OR SELL. It opens with a pre-recorded bit where the hosts explain the game, so never explain the rules again. Each topic is one item on the board: its first line puts it up as a plain buy-or-sell question ("Buy or sell: they need a big more than a wing."), each host makes his call with the word "buy" or "sell" in his first line on it, then they argue it. Before each topic\'s first line, write {"t":<topic>,"calls":{"marcus":"buy"|"sell","tony":"buy"|"sell"}} matching the calls they make. They split on at least one item. No "hold". The closing topic is not an item on the board: it\'s each host\'s one move.',
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
  // 82 games: judge by win percentage once there's a real sample.
  const r = recordOf(record);
  if (!r || r[0] + r[1] < 8) return null;
  const pct = r[0] / (r[0] + r[1]);
  if (pct < 0.5) return 'panic';
  if (pct >= 0.58) return 'contender';
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
export const verdictHeadline = (id: ShowThemeId) => THEMES[id].verdictTitle ?? VERDICT_HEADLINE;

export function verdictTopicNotes(plan: ThemePlan): string[] {
  const t = THEMES[plan.id];
  if (!t.verdict || !plan.verdictClip) return [];
  const clip = WIDE_CLIPS[plan.verdictClip.id];
  const said = clip.lines.map(l => `${l.host === 'marcus' ? 'MARCUS' : 'TONY'}: ${l.text}`).join(' / ');
  const first = plan.verdictClip.first === 'marcus' ? 'Marcus' : 'Tony';
  const what = {
    meter: 'his panic number from 1 (totally fine) to 10 (hit the button), said as a number, and one or two sentences why',
    stamp: 'his stamp — "contender" or "pretender", said in those words — and one or two sentences why',
    move: 'the one move he makes before the deadline (a position to go get, a player type to trade for, or who to sell high on — one move, not a list), and one or two sentences why',
  }[t.verdict];
  const json = {
    meter: '{"t":<this topic>,"verdict":{"marcus":<1-10>,"tony":<1-10>}}',
    stamp: '{"t":<this topic>,"verdict":{"marcus":"contender"|"pretender","tony":"contender"|"pretender"}}',
    move: '{"t":<this topic>,"verdict":{"marcus":"<his move, under six words>","tony":"<his move, under six words>"}}',
  }[t.verdict];
  // The stamps are pre-recorded: the show cuts to each host saying his to
  // camera (the second one reacting to the first), then voices the rest.
  const stampNote = t.verdict === 'stamp'
    ? ' Each host\'s first line here opens with his stamp alone as its own sentence ("Contender." or "Pretender.") and then his why. The show plays that stamp as a pre-recorded shot of him saying it, and the second host\'s shot reacts to the first stamp for him ("You sound like you agree with me. Contender." or "Pretender? I don\'t see it. Contender."), so after his stamp each host goes straight to his reason: no "I agree", no "I\'m going with", no repeating the other\'s stamp.'
    : '';
  return [
    `Marcus: This topic plays right after a pre-recorded exchange (${said}). ${first} answers first. Each host gives ${what}; the other reacts. Three to five lines, ending on a jab or a shrug, not a summary.${stampNote}`,
    `Tony: Before the first line of this topic, write ${json} with exactly what they say.`,
  ];
}

const METER = new Set(Array.from({ length: 10 }, (_, i) => i + 1));

/** A verdict line from the writer, checked against the theme. */
export function parseVerdict(id: ShowThemeId, raw: unknown): Verdict | null {
  const t = THEMES[id];
  if (!t.verdict || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ok = (v: unknown) => (t.verdict === 'meter' ? typeof v === 'number' && METER.has(v)
    : t.verdict === 'stamp' ? v === 'contender' || v === 'pretender'
    : typeof v === 'string' && v.trim().length >= 3 && v.trim().length <= 40);
  const norm = (v: unknown) => (typeof v === 'string' ? v.trim() : v) as number | string;
  return ok(r.marcus) && ok(r.tony) ? { marcus: norm(r.marcus), tony: norm(r.tony) } : null;
}

export function parseCalls(id: ShowThemeId, raw: unknown): Calls | null {
  if (!THEMES[id].calls || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ok = (v: unknown): v is Call => v === 'buy' || v === 'sell';
  return ok(r.marcus) && ok(r.tony) ? { marcus: r.marcus, tony: r.tony } : null;
}
