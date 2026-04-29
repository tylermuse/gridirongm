# Premium tier setup

The codebase ships with a Free + Premium ($4.99/mo) subscription model wired
through Stripe + Supabase. This file is the runbook for finishing the
configuration on the dashboard side. None of these steps are blocking for
local dev (Founders + admins always pass entitlement checks regardless of
Stripe state) — but production needs all of them.

## 1. Stripe dashboard

1. Reuse the existing `$4.99 / month` Pro Monthly price (price_1T8WqYC87PsOiVCS72XaASn0).
   Already configured. No new price needed; the codebase maps it to 'premium' via LEGACY_PAID_PRICE_IDS.
   Premium product.
2. Copy the price ID (`price_…`).
3. Confirm the Customer Portal is enabled at
   https://dashboard.stripe.com/settings/billing/portal — you already are,
   per project setup notes.
4. The webhook endpoint should already be live at `/api/stripe/webhook`. If
   you need to re-create it, configure it for these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`

## 2. Environment variables

Add to `.env.local`:

```
NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID=price_xxxxxxxxxxxxxx   # from step 1.2
```

These should already be set; confirm they exist:

```
STRIPE_SECRET_KEY=sk_…
STRIPE_WEBHOOK_SECRET=whsec_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_…
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…
NEXT_PUBLIC_APP_URL=https://… (or http://localhost:3001)
```

## 3. Supabase migration

Run the SQL in `supabase/migrations/20260428_premium_overhaul.sql` against
your Supabase project. It's idempotent. It:

- Adds `podcast_credits_used` and `podcast_credits_reset_at` columns to
  `profiles`
- Allows `tier='premium'` on `subscriptions`
- Promotes any existing `tier IN ('pro','elite')` rows to `'premium'` so
  legacy subscribers are not downgraded

## 4. Founder grandfathering (already wired)

Anyone whose `auth.users.created_at` is **before 2026-07-01 UTC** is
automatically treated as a Premium subscriber for free, with the same
3 podcast credits / month allotment. The cutoff lives in
`src/components/providers/SubscriptionProvider.tsx` and
`src/lib/podcastCredits.ts`. To change it, update both files.

## 5. Surfaces to know about

- `useSubscription()` — React hook returning `{ user, tier, isAdmin,
  isFoundingMember, hasFeature, hasScouting, podcastCredits,
  refreshPodcastCredits, signOut }`. `hasScouting` is the binary
  premium gate for the draft + free-agency surfaces (Premium and
  Founder = full prospect/FA info; Free = name + position + age +
  college + coarse OVR bucket via `coarseOvrBucket()`).
- `<PremiumGate feature="…">…</PremiumGate>` — wrap any feature that
  should be locked behind Premium. `mode="soft"` overlays an upsell
  instead of hiding children.
- `<AdSlot size="leaderboard" />` — renders nothing for Premium, renders
  a placeholder for Free. Drop in wherever you want ad inventory; the real
  ad provider integration goes inside this component when ready.
- `/api/podcast/consume` — POST consumes 1 credit, GET returns current
  state. The Spotlight audio route also calls the same helper internally
  so cache hits are free but fresh generations cost a credit.

## 6. Tester / production rollback

If the Premium price needs to be temporarily disabled, unset
`NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID`. The pricing page will show "Premium
plan is not yet configured" and the checkout API will return 503. Founders
and admins continue to have full access; Free users see the placeholder
ads and locked features as designed.
