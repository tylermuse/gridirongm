-- Episode packs: "5 more episodes for $2.99" when a Premium subscriber is
-- out of monthly Team Spotlight episodes.
-- Date: 2026-10-16. Idempotent — safe to re-run.

-- Extra episodes bought on top of the monthly allotment. Never expire;
-- consumed only after the month's included episodes are used.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS podcast_bonus_credits INTEGER NOT NULL DEFAULT 0;

-- One row per Stripe Checkout session that bought a pack, so a webhook
-- retry (or the success-page sync racing the webhook) never grants twice.
CREATE TABLE IF NOT EXISTS podcast_credit_purchases (
  session_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE podcast_credit_purchases ENABLE ROW LEVEL SECURITY;
-- Service role only (the webhook / sync routes); users never read this.
