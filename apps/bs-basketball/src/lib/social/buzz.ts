/**
 * Social-media simulation (parity audit #14).
 *
 * "Hoops Buzz" — a derived social timeline. Reuses the league-moment engine
 * (buildFeed) and the transaction log as event sources, then voices each event
 * through a rotating cast of fictional accounts (insiders, beat writers, homers,
 * haters, analysts, fans). Everything is deterministic — persona, phrasing, and
 * engagement counts are all hashed off the source event id, so the timeline is
 * stable across renders and reloads and never touches persisted state.
 */

import { buildFeed, type FeedItem, type FeedKind } from '../feed/buildFeed';
import { getTransactions, type TransactionEntry } from '../transactions/transactions';
import type { BasketballLeagueState } from '../persistence/db';

export interface BuzzPost {
  id: string;
  handle: string;
  author: string;
  avatar: string;
  /** Stable accent color for the avatar. */
  accent: string;
  /** True for "verified" insider/beat accounts. */
  verified: boolean;
  body: string;
  day: number;
  likes: number;
  reposts: number;
  playerId?: string;
  gameId?: string;
}

type PersonaKind = 'insider' | 'beat' | 'homer' | 'hater' | 'analyst' | 'casual';

interface Persona { handle: string; author: string; avatar: string; kind: PersonaKind }

const PERSONAS: Persona[] = [
  { handle: '@WojBombHoops', author: 'Hoops Insider', avatar: '🗞️', kind: 'insider' },
  { handle: '@TheRealBeat', author: 'Marcus Beale', avatar: '🎙️', kind: 'beat' },
  { handle: '@CourtsideCarl', author: 'Courtside Carl', avatar: '🏟️', kind: 'beat' },
  { handle: '@RingChaser216', author: 'Bandwagon Brian', avatar: '🔔', kind: 'homer' },
  { handle: '@FireTheGM', author: 'Disgruntled Dan', avatar: '🤬', kind: 'hater' },
  { handle: '@HoopMetrics', author: 'Advanced Stats', avatar: '📊', kind: 'analyst' },
  { handle: '@SectionGuy12', author: 'Section 112', avatar: '🍿', kind: 'casual' },
  { handle: '@DailyDimes', author: 'Daily Dimes', avatar: '🏀', kind: 'casual' },
];

const ACCENTS = ['#06b6d4', '#10b981', '#f59e0b', '#f97316', '#8b5cf6', '#ec4899', '#ef4444', '#3b82f6'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: number): T {
  // seed may be negative (signed 32-bit shifts); normalize to a valid index.
  return arr[((seed % arr.length) + arr.length) % arr.length];
}

/** Persona pools weighted to the event flavor. */
const KIND_POOL: Record<FeedKind | 'trade' | 'signing' | 'release' | 'draft', PersonaKind[]> = {
  big_game: ['homer', 'beat', 'casual'],
  career_night: ['beat', 'analyst', 'homer'],
  streak: ['homer', 'casual', 'analyst'],
  upset: ['hater', 'casual', 'beat'],
  injury: ['beat', 'insider', 'casual'],
  suspension: ['insider', 'hater', 'casual'],
  fine: ['casual', 'analyst', 'beat'],
  rivalry: ['homer', 'hater', 'beat'],
  schedule_notice: ['casual', 'beat'],
  trade: ['insider', 'beat', 'analyst'],
  signing: ['insider', 'homer', 'casual'],
  release: ['insider', 'hater', 'casual'],
  draft: ['insider', 'analyst', 'beat'],
};

function personaFor(poolKinds: PersonaKind[], seed: number): Persona {
  const wanted = pick(poolKinds, seed);
  const matches = PERSONAS.filter(p => p.kind === wanted);
  return pick(matches.length ? matches : PERSONAS, seed >> 3);
}

function voiceMoment(item: FeedItem, p: Persona): string {
  const h = item.headline;
  switch (p.kind) {
    case 'homer': return `THIS is the team I fell in love with. ${h} 🙌`;
    case 'hater': return `${h}. Cool. Wake me up in the playoffs. 🥱`;
    case 'analyst': return `${h} — and the underlying numbers backed it up all night.`;
    case 'beat': return `${h}. More in tonight's notebook.`;
    case 'casual': return `did NOT have this on my bingo card lol — ${h.toLowerCase()}`;
    default: return h;
  }
}

function voiceTxn(t: TransactionEntry, p: Persona): string {
  switch (p.kind) {
    case 'insider': return `Sources: ${t.summary}. ${t.detail}`;
    case 'analyst': return `${t.summary} — a move with real cap and rotation ripple effects. ${t.detail}`;
    case 'hater': return `${t.summary}?? Front office is asleep at the wheel. 🤦`;
    case 'homer': return `LOVE this for us. ${t.summary} 🔥`;
    default: return `${t.summary} — ${t.detail}`;
  }
}

function engagement(seed: number, weight: number): { likes: number; reposts: number } {
  const base = 40 + (seed % 1800);
  const likes = Math.round(base * weight);
  return { likes, reposts: Math.round(likes * (0.12 + (seed % 20) / 100)) };
}

const WEIGHT: Record<string, number> = {
  trade: 3.2, career_night: 2.6, upset: 2.4, suspension: 2.2, draft: 2.0, big_game: 1.6,
  streak: 1.3, injury: 1.25, signing: 1.2, release: 1.1, fine: 0.9, schedule_notice: 0.5,
};

/** Build the social timeline, newest-first. */
export function buildBuzz(league: BasketballLeagueState | null, max = 40): BuzzPost[] {
  if (!league) return [];
  const posts: BuzzPost[] = [];

  for (const item of buildFeed(league)) {
    if (item.kind === 'schedule_notice') continue; // not worth a post
    const seed = hash(item.id);
    const persona = personaFor(KIND_POOL[item.kind], seed);
    const eng = engagement(seed, WEIGHT[item.kind] ?? 1);
    posts.push({
      id: `buzz-${item.id}`,
      handle: persona.handle,
      author: persona.author,
      avatar: persona.avatar,
      accent: pick(ACCENTS, hash(persona.handle)),
      verified: persona.kind === 'insider' || persona.kind === 'beat',
      body: voiceMoment(item, persona),
      day: item.day,
      likes: eng.likes,
      reposts: eng.reposts,
      playerId: item.playerId,
      gameId: item.gameId,
    });
  }

  const txns = getTransactions(league);
  txns.slice(0, 24).forEach((t, i) => {
    const seed = hash(`${t.kind}-${t.summary}-${i}`);
    const persona = personaFor(KIND_POOL[t.kind], seed);
    const eng = engagement(seed, WEIGHT[t.kind] ?? 1);
    posts.push({
      id: `buzz-txn-${i}-${seed}`,
      handle: persona.handle,
      author: persona.author,
      avatar: persona.avatar,
      accent: pick(ACCENTS, hash(persona.handle)),
      verified: persona.kind === 'insider' || persona.kind === 'beat',
      body: voiceTxn(t, persona),
      // Transactions carry no day; anchor them at the current day so the freshest
      // moves sit at the top, lightly staggered to preserve their own order.
      day: Math.max(0, league.currentTick - i * 0.01),
      likes: eng.likes,
      reposts: eng.reposts,
    });
  });

  return posts.sort((a, b) => b.day - a.day).slice(0, max);
}
