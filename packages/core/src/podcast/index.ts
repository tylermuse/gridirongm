/**
 * @bs/core/podcast — server-side podcast credit accounting.
 *
 * Promoted from apps/web/src/lib/podcastCredits.ts during Sub-phase 1D.
 *
 * The Spotlight podcast is a Premium feature with a monthly cap; this module
 * is the single source of truth for that cap so the consume API and the
 * spotlight-audio route apply identical logic.
 *
 * Server-only. Uses Supabase service role to bypass RLS for the cap-update
 * write inside authenticated routes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { PODCAST_CREDITS_PER_MONTH, type Tier } from '../billing/subscription';

const FOUNDING_MEMBER_CUTOFF = '2026-05-01T00:00:00Z';

interface ProfileRow {
  is_admin: boolean | null;
  podcast_credits_used: number | null;
  podcast_credits_reset_at: string | null;
  /** Bought episode packs (never expire). */
  podcast_bonus_credits: number | null;
}

const PROFILE_COLS = 'is_admin, podcast_credits_used, podcast_credits_reset_at, podcast_bonus_credits';

interface SubscriptionRow {
  tier: Tier | null;
  status: string | null;
}

interface CreditState {
  /** Effective tier — already accounts for founder grandfathering. */
  tier: Tier;
  isAdmin: boolean;
  isFounder: boolean;
  /** Credits remaining: this period's plus any bought. -1 means uncapped (admins). */
  remaining: number;
  /** Limit per period for the resolved tier. -1 for admins. */
  limit: number;
  /** Of `remaining`, the bought (never-expiring) episodes. */
  bonus: number;
  /** ISO timestamp when the period resets. Null if never tracked. */
  resetAt: string | null;
}

export type ConsumeResult =
  /** `charged`: where the episode came from (none for admins) — what a
   *  refund puts back. */
  | { ok: true; state: CreditState; charged?: 'month' | 'bonus' }
  | { ok: false; status: number; error: string; state?: CreditState };

/**
 * Build a Supabase service-role client that bypasses RLS. Used inside
 * authenticated server routes after the user has already been verified.
 */
export function getServiceClient(): SupabaseClient {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  ) as unknown as SupabaseClient;
}

function nextMonthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function isFounderFromCreatedAt(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  return new Date(createdAt) < new Date(FOUNDING_MEMBER_CUTOFF);
}

async function resolveTier(
  service: SupabaseClient,
  userId: string,
  createdAt: string | null | undefined,
  profile: ProfileRow | null,
): Promise<Pick<CreditState, 'tier' | 'isAdmin' | 'isFounder'>> {
  const isAdmin = profile?.is_admin === true;
  const isFounder = isFounderFromCreatedAt(createdAt);

  if (isAdmin || isFounder) {
    return { tier: 'premium', isAdmin, isFounder };
  }

  const { data } = await service
    .from('subscriptions')
    .select('tier, status')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sub = (data ?? null) as SubscriptionRow | null;
  const tier: Tier = sub?.tier === 'premium' ? 'premium' : 'free';
  return { tier, isAdmin, isFounder };
}

/**
 * Read current credit state without mutating anything.
 */
export async function readCredits(
  service: SupabaseClient,
  userId: string,
  createdAt: string | null | undefined,
): Promise<CreditState> {
  const { data } = await service
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('id', userId)
    .maybeSingle();
  const profile = (data ?? null) as ProfileRow | null;

  const { tier, isAdmin, isFounder } = await resolveTier(service, userId, createdAt, profile);

  if (isAdmin) {
    return { tier, isAdmin, isFounder, remaining: -1, limit: -1, bonus: 0, resetAt: null };
  }

  const limit = PODCAST_CREDITS_PER_MONTH[tier];
  const resetAt = profile?.podcast_credits_reset_at ?? null;
  const expired = !resetAt || new Date(resetAt).getTime() <= Date.now();
  const used = expired ? 0 : (profile?.podcast_credits_used ?? 0);
  // Bought episodes only count for Premium (the show itself is Premium).
  const bonus = tier === 'premium' ? Math.max(0, profile?.podcast_bonus_credits ?? 0) : 0;
  const remaining = Math.max(0, limit - used) + bonus;

  return { tier, isAdmin, isFounder, remaining, limit, bonus, resetAt };
}

/**
 * Atomically consume one podcast credit for the user. Returns ok:false with
 * a status code when the user is ineligible (free tier) or out of credits.
 *
 * Admins bypass the cap entirely. Founders are charged credits but at the
 * Premium limit (5/month).
 */
export async function consumePodcastCredit(
  service: SupabaseClient,
  userId: string,
  createdAt: string | null | undefined,
): Promise<ConsumeResult> {
  const { data } = await service
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('id', userId)
    .maybeSingle();
  const profile = (data ?? null) as ProfileRow | null;

  const { tier, isAdmin, isFounder } = await resolveTier(service, userId, createdAt, profile);

  if (isAdmin) {
    // Admins are uncapped — record nothing, return ok.
    return {
      ok: true,
      state: { tier, isAdmin, isFounder, remaining: -1, limit: -1, bonus: 0, resetAt: null },
    };
  }

  if (tier !== 'premium') {
    return {
      ok: false,
      status: 403,
      error: 'Premium subscription required',
      state: {
        tier,
        isAdmin,
        isFounder,
        remaining: 0,
        limit: PODCAST_CREDITS_PER_MONTH[tier],
        bonus: 0,
        resetAt: profile?.podcast_credits_reset_at ?? null,
      },
    };
  }

  const limit = PODCAST_CREDITS_PER_MONTH.premium;
  const now = new Date();
  const currentResetAt = profile?.podcast_credits_reset_at
    ? new Date(profile.podcast_credits_reset_at)
    : null;
  const expired = !currentResetAt || currentResetAt.getTime() <= now.getTime();
  const used = expired ? 0 : (profile?.podcast_credits_used ?? 0);
  const bonus = Math.max(0, profile?.podcast_bonus_credits ?? 0);

  if (used >= limit && bonus <= 0) {
    return {
      ok: false,
      status: 402,
      error: 'Monthly podcast credits exhausted',
      state: {
        tier,
        isAdmin,
        isFounder,
        remaining: 0,
        limit,
        bonus: 0,
        resetAt: currentResetAt?.toISOString() ?? null,
      },
    };
  }

  // The month's included episodes first; bought ones once those are gone.
  const fromBonus = used >= limit;
  const newUsed = fromBonus ? used : used + 1;
  const newBonus = fromBonus ? bonus - 1 : bonus;
  const newResetAt = expired ? nextMonthStartUtc(now) : currentResetAt!;

  const { error: updateErr } = await service
    .from('profiles')
    .update({
      podcast_credits_used: newUsed,
      podcast_credits_reset_at: newResetAt.toISOString(),
      podcast_bonus_credits: newBonus,
    })
    .eq('id', userId);

  if (updateErr) {
    return {
      ok: false,
      status: 500,
      error: 'Failed to record credit consumption',
    };
  }

  return {
    ok: true,
    charged: fromBonus ? 'bonus' : 'month',
    state: {
      tier,
      isAdmin,
      isFounder,
      remaining: Math.max(0, limit - newUsed) + newBonus,
      limit,
      bonus: newBonus,
      resetAt: newResetAt.toISOString(),
    },
  };
}

/**
 * Grant a bought episode pack, exactly once per Stripe Checkout session:
 * the purchase row is the idempotency key, so the webhook, its retries and
 * the success-page sync can all call this safely. Returns whether this call
 * was the one that granted it.
 */
export async function grantEpisodePack(
  service: SupabaseClient,
  userId: string,
  sessionId: string,
  credits: number,
): Promise<boolean> {
  if (!Number.isInteger(credits) || credits <= 0) return false;
  const { error: insertErr } = await service
    .from('podcast_credit_purchases')
    .insert({ session_id: sessionId, user_id: userId, credits });
  if (insertErr) {
    // 23505 = unique violation: already granted.
    if ((insertErr as { code?: string }).code === '23505') return false;
    throw new Error(`episode pack purchase insert failed: ${insertErr.message}`);
  }
  const { data } = await service.from('profiles').select('podcast_bonus_credits').eq('id', userId).maybeSingle();
  const current = Math.max(0, (data as { podcast_bonus_credits: number | null } | null)?.podcast_bonus_credits ?? 0);
  const { error: updateErr } = await service
    .from('profiles')
    .update({ podcast_bonus_credits: current + credits })
    .eq('id', userId);
  if (updateErr) throw new Error(`episode pack grant failed: ${updateErr.message}`);
  return true;
}

/**
 * Give back an episode credit that was charged for a show that couldn't be
 * made (the script writer was down). `charged` is what consumePodcastCredit
 * reported. Best effort: a failure is logged, never thrown.
 */
export async function refundPodcastCredit(
  service: SupabaseClient,
  userId: string,
  charged: 'month' | 'bonus' | undefined,
): Promise<void> {
  if (!charged) return;
  try {
    const { data } = await service
      .from('profiles')
      .select('podcast_credits_used, podcast_bonus_credits')
      .eq('id', userId)
      .maybeSingle();
    const row = (data ?? {}) as { podcast_credits_used?: number | null; podcast_bonus_credits?: number | null };
    const patch = charged === 'bonus'
      ? { podcast_bonus_credits: Math.max(0, row.podcast_bonus_credits ?? 0) + 1 }
      : { podcast_credits_used: Math.max(0, (row.podcast_credits_used ?? 0) - 1) };
    const { error } = await service.from('profiles').update(patch).eq('id', userId);
    if (error) console.error('[podcast] refund failed:', error.message);
  } catch (err) {
    console.error('[podcast] refund failed:', err);
  }
}
