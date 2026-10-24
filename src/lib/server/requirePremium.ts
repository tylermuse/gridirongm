import { NextResponse } from 'next/server';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';
import { readCredits, getServiceClient } from '@bs/core/podcast';

/**
 * Server gate for paid AI routes. Returns a 401/403 response to send back,
 * or null when the caller is Premium (founders + admins resolve to premium).
 * Enforced whenever Supabase is configured; local dev without it stays open.
 * Same rule as /api/pregame.
 */
export async function requirePremium(featureLabel: string): Promise<NextResponse | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const authClient = await createSupabaseServer();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated', code: 'auth_required' }, { status: 401 });
  }
  const { tier } = await readCredits(getServiceClient(), user.id, user.created_at);
  if (tier !== 'premium') {
    return NextResponse.json(
      { error: `${featureLabel} is a Premium feature.`, code: 'premium_required' },
      { status: 403 },
    );
  }
  return null;
}
