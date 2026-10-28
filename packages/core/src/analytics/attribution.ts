/**
 * @bs/core/analytics/attribution — where each new account came from.
 *
 *   1. captureAttribution() stores the first visit's referrer, landing path and
 *      UTM tags in localStorage. A no-op once something is stored, so only the
 *      first visit on this device counts.
 *   2. saveAttribution() writes that to `user_attribution` once, on the first
 *      signed-in page load after signup. It can't run at signUp() time: email
 *      signups have no session until the confirmation link is used, and RLS
 *      needs one.
 *   3. attributionMetadata() reads the row back at Stripe Checkout so the
 *      subscription carries it.
 *
 * Best-effort throughout: failures are logged or ignored, never thrown, so
 * attribution can't break signup, login or checkout.
 *
 * No React / Next imports — the checkout routes import this on the server.
 * Table + report view: supabase/migrations/20261028_user_attribution.sql.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AttributionApp = 'bs-football' | 'bs-hoops';

const STORAGE_KEY = 'bs_attrib';
/** User ID whose row this device already wrote, so later loads skip the request. */
const SAVED_KEY = 'bs_attrib_saved';

/**
 * Accounts created before this never get a row, however the clocks line up.
 * Matches the migration's date.
 */
export const ATTRIBUTION_START = '2026-10-28T00:00:00Z';
/**
 * Slack for a device clock running fast: the first visit's (client) timestamp
 * may be up to this far past the account's (server) created_at.
 */
export const CLOCK_TOLERANCE_MS = 10 * 60 * 1000;

/**
 * Our own sites, plus the Supabase auth hop an email confirmation redirects
 * through. A referrer from any of these (or a subdomain) is not a source.
 */
const OWN_DOMAINS = ['bs-football.com', 'bs-basketball.com', 'gmgridiron.com', 'supabase.co'];

/** Stripe metadata values are capped at 500 chars; the table checks the same. */
const MAX_LEN = 500;

const COLUMNS = 'app, first_referrer, landing_path, utm_source, utm_medium, utm_campaign';

interface StoredAttribution {
  first_referrer: string | null;
  landing_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  /** Client clock (ms) at the first visit. */
  captured_at: number;
}

export interface AttributionRow {
  app: string | null;
  first_referrer: string | null;
  landing_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

function clip(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v.slice(0, MAX_LEN) : null;
}

/**
 * Scheme + host + path of an external referrer, or null for none / our own
 * sites. Query string and hash are dropped. Not `URL.origin`: that is "null"
 * for app referrers like android-app://com.google.android.gm/.
 */
export function cleanReferrer(raw: string, currentHost: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host === currentHost.toLowerCase()) return null;
    if (OWN_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return null;
    return clip(`${url.protocol}//${url.host}${url.pathname}`);
  } catch {
    return null;
  }
}

/** Record this device's first visit. Call once at app boot; safe to call again. */
export function captureAttribution() {
  try {
    if (typeof window === 'undefined' || localStorage.getItem(STORAGE_KEY)) return;
    const params = new URLSearchParams(location.search);
    const stored: StoredAttribution = {
      first_referrer: cleanReferrer(document.referrer, location.hostname),
      landing_path: clip(location.pathname),
      utm_source: clip(params.get('utm_source')),
      utm_medium: clip(params.get('utm_medium')),
      utm_campaign: clip(params.get('utm_campaign')),
      captured_at: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch { /* storage unavailable; ignore */ }
}

function readStored(): StoredAttribution | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<StoredAttribution> | null;
    if (!parsed || typeof parsed.captured_at !== 'number') return null;
    const str = (v: unknown) => (typeof v === 'string' ? clip(v) : null);
    return {
      first_referrer: str(parsed.first_referrer),
      landing_path: str(parsed.landing_path),
      utm_source: str(parsed.utm_source),
      utm_medium: str(parsed.utm_medium),
      utm_campaign: str(parsed.utm_campaign),
      captured_at: parsed.captured_at,
    };
  } catch {
    return null;
  }
}

/**
 * True when this device's first visit can be credited with the account: the
 * account is newer than the feature, and the visit came before the account
 * existed (within CLOCK_TOLERANCE_MS). Old accounts on a new device, and a
 * second device that only saw the user after signup, both fail.
 */
export function isNewSignup(capturedAt: number, createdAt: string): boolean {
  const created = Date.parse(createdAt);
  if (!(created >= Date.parse(ATTRIBUTION_START))) return false; // also rejects NaN
  return capturedAt <= created + CLOCK_TOLERANCE_MS;
}

const inFlight = new Set<string>();

/**
 * Write the stored first visit to `user_attribution` for a newly signed-up
 * user. Insert-only (`on conflict do nothing`): an existing row — from a
 * double-fired OAuth callback, another tab, or the other app — is never
 * overwritten. Call whenever the signed-in user changes.
 */
export async function saveAttribution(
  supabase: SupabaseClient,
  user: { id: string; created_at: string },
  app: AttributionApp,
) {
  if (inFlight.has(user.id)) return;
  inFlight.add(user.id);
  try {
    if (localStorage.getItem(SAVED_KEY) === user.id) return;
    const stored = readStored();
    if (!stored || !isNewSignup(stored.captured_at, user.created_at)) return;

    const { error } = await supabase.from('user_attribution').upsert(
      {
        user_id: user.id,
        app,
        first_referrer: stored.first_referrer,
        landing_path: stored.landing_path,
        utm_source: stored.utm_source,
        utm_medium: stored.utm_medium,
        utm_campaign: stored.utm_campaign,
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
    // Not marked saved on error, so the next page load retries.
    if (error) {
      console.warn('[attribution] save failed:', error.message);
      return;
    }
    localStorage.setItem(SAVED_KEY, user.id);
  } catch (err) {
    console.warn('[attribution] save failed:', err);
  } finally {
    inFlight.delete(user.id);
  }
}

/**
 * Stripe metadata for an attribution row. Keys with no value are left out
 * (Stripe drops empty metadata values anyway), so a subscriber with no row
 * gets none of these keys.
 */
export function toStripeMetadata(row: Partial<AttributionRow> | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!row) return out;
  const pairs: [string, string | null | undefined][] = [
    ['signup_app', row.app],
    ['first_referrer', row.first_referrer],
    ['landing_path', row.landing_path],
    ['utm_source', row.utm_source],
    ['utm_medium', row.utm_medium],
    ['utm_campaign', row.utm_campaign],
  ];
  for (const [key, value] of pairs) {
    const v = clip(value);
    if (v) out[key] = v;
  }
  return out;
}

/**
 * The user's attribution as Stripe metadata, read with the caller's
 * (user-session) client. Empty on no row or any error — never blocks checkout.
 */
export async function attributionMetadata(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, string>> {
  try {
    const { data, error } = await supabase
      .from('user_attribution')
      .select(COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[attribution] lookup failed:', error.message);
      return {};
    }
    return toStripeMetadata(data as AttributionRow | null);
  } catch (err) {
    console.warn('[attribution] lookup failed:', err);
    return {};
  }
}
