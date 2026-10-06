/**
 * Headshots for generated (fictional) players.
 *
 * Real players carry a `photoUrl`. Everyone else used to get a DiceBear
 * cartoon; now they get one of ~1,000 photoreal studio headshots of
 * fictional players (public/players/heads), picked by position group so a
 * lineman looks like a lineman. The pick is a stable hash of the player's
 * portrait seed (id, or the re-rolled override), so a player keeps his face
 * across sessions and seasons.
 */
import pool from './portraitPool.json';

type Group = 'qb' | 'rb' | 'wr' | 'te' | 'ol' | 'dl' | 'lb' | 'db' | 'k';

/** file → position group, from the generation prompts. */
const POOL = pool as { file: string; pos: Group }[];

const GROUP: Record<string, Group> = {
  QB: 'qb', RB: 'rb', FB: 'rb', WR: 'wr', TE: 'te',
  OL: 'ol', OT: 'ol', OG: 'ol', C: 'ol', T: 'ol', G: 'ol',
  DL: 'dl', DE: 'dl', DT: 'dl', NT: 'dl', EDGE: 'dl',
  LB: 'lb', OLB: 'lb', ILB: 'lb', MLB: 'lb',
  CB: 'db', S: 'db', FS: 'db', SS: 'db', DB: 'db',
  K: 'k', P: 'k', LS: 'k',
};

const byGroup = new Map<Group, string[]>();
for (const h of POOL) {
  const list = byGroup.get(h.pos) ?? [];
  list.push(h.file);
  byGroup.set(h.pos, list);
}

/** FNV-1a: small, stable string hash. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The headshot for a fictional player (null if the pool is empty). */
export function portraitFor(seed: string, position: string): string | null {
  const list = byGroup.get(GROUP[position?.toUpperCase()] ?? 'lb') ?? POOL.map(h => h.file);
  if (!list.length) return null;
  return `/players/heads/${list[hash(seed) % list.length]}`;
}
