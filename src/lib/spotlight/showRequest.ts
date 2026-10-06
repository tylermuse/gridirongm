/** Request helpers shared by the Spotlight show routes (server-only). */
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import type { EpisodeInput } from './showEpisode';
import type { ShowTopicInput } from './showScript';
import type { ShowStatLine } from './teamStats';
import { sanitizeMoment } from './showMoment';

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key);
}

/** Client-supplied stat line only steers phrase choice + rank slots, but it
 *  builds asset paths (/show/ordinals/<host>/<rank>.mp3), so validate it. */
export function sanitizeStats(raw: unknown): ShowStatLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { record?: unknown; stats?: unknown };
  if (typeof r.record !== 'string' || !/^\d{1,2}-\d{1,2}(-\d{1,2})?$/.test(r.record) || !Array.isArray(r.stats)) return null;
  const keys = new Set(['ppg', 'pag', 'pass', 'rush', 'yds']);
  const stats = r.stats.flatMap((s: unknown) => {
    const x = s as { key?: unknown; label?: unknown; value?: unknown; rank?: unknown; of?: unknown };
    const ok = typeof x.key === 'string' && keys.has(x.key)
      && Number.isInteger(x.rank) && Number.isInteger(x.of)
      && (x.of as number) >= 2 && (x.of as number) <= 32
      && (x.rank as number) >= 1 && (x.rank as number) <= (x.of as number);
    return ok ? [{ key: x.key, label: String(x.label ?? ''), value: String(x.value ?? ''), rank: x.rank, of: x.of }] : [];
  });
  return { record: r.record, stats } as ShowStatLine;
}

export async function parseEpisode(request: Request): Promise<EpisodeInput | null> {
  const input = (await request.json()) as { topics?: ShowTopicInput[]; teamName?: string; stats?: unknown; moment?: unknown };
  if (!input.topics || !Array.isArray(input.topics) || !input.teamName) return null;
  return { topics: input.topics, teamName: input.teamName, stats: sanitizeStats(input.stats), moment: sanitizeMoment(input.moment) };
}


/**
 * Vercel preview deployments let anyone watch the show — no sign-in, premium
 * or podcast credit — so builds can be tested on a phone. Production is
 * unaffected (VERCEL_ENV is 'production' there, unset locally).
 */
export const openPreview = (): boolean => process.env.VERCEL_ENV === 'preview';
