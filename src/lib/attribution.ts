/**
 * First-touch acquisition attribution.
 *
 * On a visitor's first page load we record where they came from (referrer
 * hostname, landing path, UTM tags) in localStorage and never overwrite it.
 * At signup and checkout the snapshot is sent along so the Supabase profile
 * and the Stripe subscription both say how that user found the game.
 *
 * Client-only helpers live here; `sanitizeAttribution` is safe on the server.
 */

export const ATTRIBUTION_STORAGE_KEY = 'bsf_first_touch';

export const ATTRIBUTION_KEYS = [
  'ref',          // referrer hostname, or 'direct'
  'landing',      // first path seen, e.g. /rosters/2026
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'first_seen',   // ISO timestamp
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
export type Attribution = Partial<Record<AttributionKey, string>>;

// Stripe metadata values max out at 500 chars; keep ours short and plain.
const MAX_LEN = 200;

/**
 * Keep only known keys with short string values. Used on both sides: the
 * client before storing, the server before trusting anything from the body.
 */
export function sanitizeAttribution(input: unknown): Attribution | null {
  if (!input || typeof input !== 'object') return null;
  const out: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v !== 'string') continue;
    const clean = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_LEN);
    if (clean) out[key] = clean;
  }
  return Object.keys(out).length ? out : null;
}

/** Stripe metadata keys are namespaced so they can't collide with ours. */
export function attributionToStripeMetadata(attr: Attribution | null): Record<string, string> {
  if (!attr) return {};
  const meta: Record<string, string> = {};
  for (const [k, v] of Object.entries(attr)) meta[`attr_${k}`] = v;
  return meta;
}

function referrerHost(): string {
  try {
    if (!document.referrer) return 'direct';
    const host = new URL(document.referrer).hostname.replace(/^www\./, '');
    // Same-site navigation isn't a referral.
    if (host === window.location.hostname.replace(/^www\./, '')) return 'direct';
    return host || 'direct';
  } catch {
    return 'direct';
  }
}

/**
 * Record the first touch if none is stored yet. Call once per page load on
 * the client; later calls are no-ops, so the original source survives
 * however many visits happen before the user signs up.
 */
export function captureFirstTouch(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const raw: Attribution = {
      ref: referrerHost(),
      landing: window.location.pathname,
      first_seen: new Date().toISOString(),
    };
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const) {
      const v = params.get(key);
      if (v) raw[key] = v;
    }
    // A fresh visit with no referrer and no UTMs is 'direct' — still worth
    // recording, since that's a real answer (bookmark, typed URL, app link).
    const clean = sanitizeAttribution(raw);
    if (clean) window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // localStorage unavailable (private mode, blocked) — attribution is best-effort.
  }
}

/** The stored first touch, or null. Safe to call anywhere on the client. */
export function getAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    return raw ? sanitizeAttribution(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
