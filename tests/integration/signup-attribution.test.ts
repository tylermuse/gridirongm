/**
 * Signup attribution (@bs/core/analytics/attribution): first-visit capture,
 * the new-signup gate, the once-per-user save, and the Stripe metadata.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ATTRIBUTION_START,
  CLOCK_TOLERANCE_MS,
  attributionMetadata,
  captureAttribution,
  cleanReferrer,
  isNewSignup,
  saveAttribution,
  toStripeMetadata,
} from '@bs/core/analytics/attribution';

const START = Date.parse(ATTRIBUTION_START);
const MIN = 60_000;

/** _setup.ts replaces window.location with a reload() stub, so stand in a real URL. */
function visit(pathAndQuery: string, referrer: string) {
  vi.stubGlobal('location', new URL(pathAndQuery, 'https://bs-football.com'));
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
}

function stored() {
  return JSON.parse(localStorage.getItem('bs_attrib') || 'null');
}

function fakeClient(result: { error: { message: string } | null } = { error: null }) {
  const upsert = vi.fn(async () => result);
  const client = { from: vi.fn(() => ({ upsert })) } as unknown as SupabaseClient;
  return { client, upsert };
}

const newUser = (createdAt: number, id = 'user-1') => ({ id, created_at: new Date(createdAt).toISOString() });

/** Node 25's own (unconfigured) localStorage global shadows happy-dom's here. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (k: string) => items.get(k) ?? null,
    key: (i: number) => [...items.keys()][i] ?? null,
    removeItem: (k: string) => { items.delete(k); },
    setItem: (k: string, v: string) => { items.set(k, String(v)); },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('cleanReferrer', () => {
  it('keeps scheme + host + path, dropping query and hash', () => {
    expect(cleanReferrer('https://www.reddit.com/r/nfl/comments/abc?utm=x#top', 'bs-football.com'))
      .toBe('https://www.reddit.com/r/nfl/comments/abc');
    expect(cleanReferrer('android-app://com.google.android.gm/', 'bs-football.com'))
      .toBe('android-app://com.google.android.gm/');
  });

  it('treats our own sites, their subdomains, the current host and the auth hop as no referrer', () => {
    for (const ref of [
      'https://bs-football.com/pricing',
      'https://www.bs-basketball.com/',
      'https://gmgridiron.com/',
      'https://abcxyz.supabase.co/auth/v1/verify?token=secret',
      'http://localhost:3001/login',
    ]) {
      expect(cleanReferrer(ref, 'localhost')).toBeNull();
    }
    expect(cleanReferrer('', 'bs-football.com')).toBeNull();
    expect(cleanReferrer('not a url', 'bs-football.com')).toBeNull();
  });

  it('does not treat look-alike domains as ours', () => {
    expect(cleanReferrer('https://notbs-football.com/', 'bs-football.com')).toBe('https://notbs-football.com/');
  });
});

describe('captureAttribution', () => {
  it('stores the first visit: path only, UTM tags, cleaned referrer', () => {
    visit('/rosters/chiefs?utm_source=reddit&utm_medium=social&utm_campaign=launch&email=a@b.c', 'https://www.reddit.com/r/nfl?x=1');
    captureAttribution();
    expect(stored()).toMatchObject({
      first_referrer: 'https://www.reddit.com/r/nfl',
      landing_path: '/rosters/chiefs',
      utm_source: 'reddit',
      utm_medium: 'social',
      utm_campaign: 'launch',
    });
    expect(JSON.stringify(stored())).not.toContain('email');
    expect(typeof stored().captured_at).toBe('number');
  });

  it('never overwrites an earlier visit', () => {
    visit('/?utm_source=twitter', 'https://t.co/abc');
    captureAttribution();
    const first = stored();
    visit('/draft?utm_source=google', 'https://www.google.com/');
    captureAttribution();
    expect(stored()).toEqual(first);
  });

  it('stores nulls for a direct visit with no tags', () => {
    visit('/', '');
    captureAttribution();
    expect(stored()).toMatchObject({ first_referrer: null, landing_path: '/', utm_source: null });
  });

  it('swallows storage errors', () => {
    vi.stubGlobal('localStorage', { ...memoryStorage(), getItem: () => { throw new Error('blocked'); } });
    expect(() => captureAttribution()).not.toThrow();
  });
});

describe('isNewSignup', () => {
  const created = START + 30 * 24 * 60 * MIN;
  const iso = new Date(created).toISOString();

  it('credits a visit before the account was created', () => {
    expect(isNewSignup(created - 3 * MIN, iso)).toBe(true);
  });

  it('allows a device clock up to the tolerance fast', () => {
    expect(isNewSignup(created + 2 * MIN, iso)).toBe(true);
    expect(isNewSignup(created + CLOCK_TOLERANCE_MS, iso)).toBe(true);
    expect(isNewSignup(created + CLOCK_TOLERANCE_MS + 1, iso)).toBe(false);
  });

  it('never credits an account created before the feature, whatever the clocks say', () => {
    const old = new Date(START - 1).toISOString();
    expect(isNewSignup(START - 365 * 24 * 60 * MIN, old)).toBe(false);
  });

  it('rejects an unparseable created_at', () => {
    expect(isNewSignup(0, 'garbage')).toBe(false);
  });
});

describe('saveAttribution', () => {
  const created = START + 30 * 24 * 60 * MIN;

  function seed(capturedAt: number) {
    localStorage.setItem('bs_attrib', JSON.stringify({
      first_referrer: 'https://www.reddit.com/r/nfl',
      landing_path: '/',
      utm_source: 'reddit',
      utm_medium: null,
      utm_campaign: null,
      captured_at: capturedAt,
    }));
  }

  it('writes one insert-only row for a new signup, then stops', async () => {
    seed(created - MIN);
    const { client, upsert } = fakeClient();
    await saveAttribution(client, newUser(created), 'bs-football');
    await saveAttribution(client, newUser(created), 'bs-football');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: 'user-1',
        app: 'bs-football',
        first_referrer: 'https://www.reddit.com/r/nfl',
        landing_path: '/',
        utm_source: 'reddit',
        utm_medium: null,
        utm_campaign: null,
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
  });

  it('sends one request when the auth listener and getUser fire together', async () => {
    seed(created - MIN);
    const { client, upsert } = fakeClient();
    await Promise.all([
      saveAttribution(client, newUser(created), 'bs-hoops'),
      saveAttribution(client, newUser(created), 'bs-hoops'),
    ]);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('skips accounts that existed before this device first visited', async () => {
    seed(created + CLOCK_TOLERANCE_MS + MIN);
    const { client, upsert } = fakeClient();
    await saveAttribution(client, newUser(created), 'bs-football');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('skips accounts from before the feature', async () => {
    seed(START - 2 * MIN);
    const { client, upsert } = fakeClient();
    await saveAttribution(client, newUser(START - MIN), 'bs-football');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('skips when nothing was captured', async () => {
    const { client, upsert } = fakeClient();
    await saveAttribution(client, newUser(created), 'bs-football');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('retries on the next load after an error, without throwing', async () => {
    seed(created - MIN);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = fakeClient({ error: { message: 'relation "user_attribution" does not exist' } });
    await expect(saveAttribution(failing.client, newUser(created), 'bs-football')).resolves.toBeUndefined();
    const ok = fakeClient();
    await saveAttribution(ok.client, newUser(created), 'bs-football');
    expect(ok.upsert).toHaveBeenCalledTimes(1);
  });

  it('swallows a client that throws', async () => {
    seed(created - MIN);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = { from: () => { throw new Error('network'); } } as unknown as SupabaseClient;
    await expect(saveAttribution(client, newUser(created), 'bs-football')).resolves.toBeUndefined();
  });

  it('writes again for a different user on the same device', async () => {
    seed(created - MIN);
    const { client, upsert } = fakeClient();
    await saveAttribution(client, newUser(created, 'user-1'), 'bs-football');
    await saveAttribution(client, newUser(created, 'user-2'), 'bs-football');
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});

describe('Stripe metadata', () => {
  it('maps the row to the subscription keys, leaving out empty values', () => {
    expect(toStripeMetadata({
      app: 'bs-hoops',
      first_referrer: 'https://www.reddit.com/r/nba',
      landing_path: '/',
      utm_source: '',
      utm_medium: null,
      utm_campaign: 'launch',
    })).toEqual({
      signup_app: 'bs-hoops',
      first_referrer: 'https://www.reddit.com/r/nba',
      landing_path: '/',
      utm_campaign: 'launch',
    });
    expect(toStripeMetadata(null)).toEqual({});
  });

  it('clips every value to 500 chars', () => {
    const long = `https://example.com/${'a'.repeat(900)}`;
    const meta = toStripeMetadata({ first_referrer: long, landing_path: `/${'b'.repeat(900)}` });
    expect(meta.first_referrer).toHaveLength(500);
    expect(meta.landing_path).toHaveLength(500);
  });

  it('reads the row with the given client and never throws', async () => {
    const row = { app: 'bs-football', first_referrer: null, landing_path: '/', utm_source: 'reddit', utm_medium: null, utm_campaign: null };
    const chain = (result: unknown) => ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }),
    }) as unknown as SupabaseClient;
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await attributionMetadata(chain({ data: row, error: null }), 'u'))
      .toEqual({ signup_app: 'bs-football', landing_path: '/', utm_source: 'reddit' });
    expect(await attributionMetadata(chain({ data: null, error: null }), 'u')).toEqual({});
    expect(await attributionMetadata(chain({ data: null, error: { message: 'boom' } }), 'u')).toEqual({});
    const throwing = { from: () => { throw new Error('down'); } } as unknown as SupabaseClient;
    expect(await attributionMetadata(throwing, 'u')).toEqual({});
  });
});
