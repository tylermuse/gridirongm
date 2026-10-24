import { describe, it, expect } from 'vitest';
import { consumePodcastCredit, grantEpisodePack, readCredits } from '@bs/core/podcast';
import { PODCAST_CREDITS_PER_MONTH } from '@bs/core/billing';

/**
 * A fake Supabase service client with one profile and an active Premium
 * subscription: enough to exercise the credit math (monthly first, bought
 * packs after) and the once-only pack grant.
 */
function fakeDb(profile: Record<string, unknown>) {
  const purchases = new Set<string>();
  const client = {
    profile,
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      return {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle: async () => ({ data: table === 'profiles' ? { ...self.profile } : table === 'subscriptions' ? { tier: 'premium', status: 'active' } : null }),
        update: (patch: Record<string, unknown>) => ({ eq: async () => { Object.assign(self.profile, patch); return { error: null }; } }),
        insert: async (row: { session_id: string }) => {
          if (purchases.has(row.session_id)) return { error: { code: '23505', message: 'dup' } };
          purchases.add(row.session_id);
          return { error: null };
        },
      };
    },
  };
  return client;
}
const future = new Date(Date.now() + 10 * 86400e3).toISOString();
const LIMIT = PODCAST_CREDITS_PER_MONTH.premium;

describe('episode packs', () => {
  it('bought episodes count toward remaining, after the month\'s included ones', async () => {
    const db = fakeDb({ is_admin: false, podcast_credits_used: LIMIT, podcast_credits_reset_at: future, podcast_bonus_credits: 2 });
    const before = await readCredits(db as never, 'u1', '2026-09-01T00:00:00Z');
    expect(before).toMatchObject({ tier: 'premium', remaining: 2, bonus: 2, limit: LIMIT });

    const r = await consumePodcastCredit(db as never, 'u1', '2026-09-01T00:00:00Z');
    expect(r.ok).toBe(true);
    expect(r.state).toMatchObject({ remaining: 1, bonus: 1 });
    expect(db.profile.podcast_bonus_credits).toBe(1);
    expect(db.profile.podcast_credits_used).toBe(LIMIT); // the month's count is untouched

    await consumePodcastCredit(db as never, 'u1', '2026-09-01T00:00:00Z');
    const out = await consumePodcastCredit(db as never, 'u1', '2026-09-01T00:00:00Z');
    expect(out.ok).toBe(false);
    expect(out.ok ? 0 : out.status).toBe(402);
  });

  it('uses the month\'s episodes first and leaves the pack alone', async () => {
    const db = fakeDb({ is_admin: false, podcast_credits_used: 0, podcast_credits_reset_at: future, podcast_bonus_credits: 5 });
    const r = await consumePodcastCredit(db as never, 'u1', '2026-09-01T00:00:00Z');
    expect(r.state).toMatchObject({ remaining: LIMIT - 1 + 5, bonus: 5 });
    expect(db.profile.podcast_credits_used).toBe(1);
    expect(db.profile.podcast_bonus_credits).toBe(5);
  });

  it('grants a pack once per checkout session (webhook retries and the sync race are safe)', async () => {
    const db = fakeDb({ is_admin: false, podcast_credits_used: 0, podcast_credits_reset_at: null, podcast_bonus_credits: 0 });
    expect(await grantEpisodePack(db as never, 'u1', 'cs_1', 5)).toBe(true);
    expect(await grantEpisodePack(db as never, 'u1', 'cs_1', 5)).toBe(false);
    expect(await grantEpisodePack(db as never, 'u1', 'cs_2', 5)).toBe(true);
    expect(db.profile.podcast_bonus_credits).toBe(10);
    expect(await grantEpisodePack(db as never, 'u1', 'cs_3', 0)).toBe(false);
  });

  it('bought episodes do nothing for a lapsed (free) account', async () => {
    const db = fakeDb({ is_admin: false, podcast_credits_used: 0, podcast_credits_reset_at: null, podcast_bonus_credits: 5 });
    db.from = ((orig) => function (this: typeof db, table: string) {
      const q = orig.call(this, table);
      if (table === 'subscriptions') q.maybeSingle = async () => ({ data: null });
      return q;
    })(db.from) as typeof db.from;
    const c = await readCredits(db as never, 'u1', '2026-09-01T00:00:00Z');
    expect(c).toMatchObject({ tier: 'free', remaining: 0, bonus: 0 });
  });
});
