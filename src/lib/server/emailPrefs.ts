import { createServerClient } from '@supabase/ssr';

/**
 * Marketing-email preferences (public.email_prefs). Every marketing email
 * carries a link to /unsubscribe?t=<token>; the token is the only credential,
 * so a player can opt out without signing in.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUnsubToken(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

export type EmailPrefState = 'subscribed' | 'unsubscribed' | 'unknown' | 'unavailable';

/** Current state for a token. 'unknown' = no such token; 'unavailable' = no DB access. */
export async function getEmailPrefState(token: string): Promise<EmailPrefState> {
  if (!isUnsubToken(token)) return 'unknown';
  const service = getServiceClient();
  if (!service) return 'unavailable';
  const { data, error } = await service
    .from('email_prefs')
    .select('marketing_opt_out')
    .eq('token', token)
    .maybeSingle();
  if (error) return 'unavailable';
  if (!data) return 'unknown';
  return data.marketing_opt_out ? 'unsubscribed' : 'subscribed';
}

/** Opt a token's owner out of (or back into) marketing email. */
export async function setEmailOptOut(
  token: string,
  optOut: boolean,
  source: 'page' | 'one_click',
): Promise<'ok' | 'unknown' | 'unavailable'> {
  if (!isUnsubToken(token)) return 'unknown';
  const service = getServiceClient();
  if (!service) return 'unavailable';
  const now = new Date().toISOString();
  const { data, error } = await service
    .from('email_prefs')
    .update({
      marketing_opt_out: optOut,
      opted_out_at: optOut ? now : null,
      opt_out_source: optOut ? source : null,
      updated_at: now,
    })
    .eq('token', token)
    .select('user_id');
  if (error) return 'unavailable';
  return data && data.length > 0 ? 'ok' : 'unknown';
}
