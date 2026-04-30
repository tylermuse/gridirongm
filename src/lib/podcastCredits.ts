// Server-side podcast credit accounting.
// The Spotlight podcast is a Premium feature with a monthly cap; this module
// is the single source of truth for that cap so the consume API and the
// spotlight-audio route apply identical logic.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { PODCAST_CREDITS_PER_MONTH, type Tier } from './subscription';

const FOUNDING_MEMBER_CUTOFF = '2026-05-01T00:00:00Z';

interface ProfileRow {
  is_admin: boolean | null;
  podcast_credits_used: number | null;
  podcast_credits_reset_at: string | null;
}

interface SubscriptionRow {
  tier: Tier | null;
  status: string | null;
}

interface CreditState {
  /** Effective tier — already accounts for founder grandfathering. */
  tier: Tier;
  isAdmin: boolean;
  isFounder: boolean;
  /** Credits remaining this period. -1 means uncapped (admins). */
  remaining: number;
  /** Limit per period for the resolved tier. -1 for admins. */
  limit: number;
  /** ISO timestamp when the period resets. Null if never tracked. */
  resetAt: string | null;
}

export type ConsumeResult =
  | { ok: true; state: CreditState }
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
    .select('is_admin, podcast_credits_used, podcast_credits_reset_at')
    .eq('id', userId)
    .maybeSingle();
  const profile = (data ?? null) as ProfileRow | null;

  const { tier, isAdmin, isFounder } = await resolveTier(service, userId, createdAt, profile);

  if (isAdmin) {
    return { tier, isAdmin, isFounder, remaining: -1, limit: -1, resetAt: null };
  }

  const limit = PODCAST_CREDITS_PER_MONTH[tier];
  const resetAt = profile?.podcast_credits_reset_at ?? null;
  const expired = !resetAt || new Date(resetAt).getTime() <= Date.now();
  const used = expired ? 0 : (profile?.podcast_credits_used ?? 0);
  const remaining = Math.max(0, limit - used);

  return { tier, isAdmin, isFounder, remaining, limit, resetAt };
}

/**
 * Atomically consume one podcast credit for the user. Returns ok:false with
 * a status code when the user is ineligible (free tier) or out of credits.
 *
 * Admins bypass the cap entirely. Founders are charged credits but at the
 * Premium limit (3/month).
 */
export async function consumePodcastCredit(
  service: SupabaseClient,
  userId: string,
  createdAt: string | null | undefined,
): Promise<ConsumeResult> {
  const { data } = await service
    .from('profiles')
    .select('is_admin, podcast_credits_used, podcast_credits_reset_at')
    .eq('id', userId)
    .maybeSingle();
  const profile = (data ?? null) as ProfileRow | null;

  const { tier, isAdmin, isFounder } = await resolveTier(service, userId, createdAt, profile);

  if (isAdmin) {
    // Admins are uncapped — record nothing, return ok.
    return {
      ok: true,
      state: { tier, isAdmin, isFounder, remaining: -1, limit: -1, resetAt: null },
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

  if (used >= limit) {
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
        resetAt: currentResetAt?.toISOString() ?? null,
      },
    };
  }

  const newUsed = used + 1;
  const newResetAt = expired ? nextMonthStartUtc(now) : currentResetAt!;

  const { error: updateErr } = await service
    .from('profiles')
    .update({
      podcast_credits_used: newUsed,
      podcast_credits_reset_at: newResetAt.toISOString(),
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
    state: {
      tier,
      isAdmin,
      isFounder,
      remaining: Math.max(0, limit - newUsed),
      limit,
      resetAt: newResetAt.toISOString(),
    },
  };
}
