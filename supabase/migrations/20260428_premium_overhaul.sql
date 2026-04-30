-- Premium tier overhaul
-- Date: 2026-04-28
--
-- Collapses the previous Free / Pro / Elite tier model into Free + Premium
-- ($5.99/mo) and adds monthly podcast credit accounting.
--
-- Idempotent — safe to re-run.

-- 1. Podcast credit columns on profiles ------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS podcast_credits_used INTEGER NOT NULL DEFAULT 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS podcast_credits_reset_at TIMESTAMPTZ;

-- 2. Allow 'premium' as a subscription tier --------------------------------
-- Drop any prior CHECK constraint, then re-add one that accepts both the
-- new value and the legacy values (so historical rows stay valid until they
-- are migrated below).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_tier_check'
  ) THEN
    ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_tier_check;
  END IF;
END $$;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_tier_check
  CHECK (tier IN ('free', 'premium', 'pro', 'elite'));

-- 3. Migrate existing Pro / Elite subscribers up to Premium ----------------
-- These users paid for the previous tiers and must not be downgraded by the
-- collapse. The webhook also maps their legacy price IDs to 'premium' on the
-- next subscription update.
UPDATE subscriptions SET tier = 'premium' WHERE tier IN ('pro', 'elite');
