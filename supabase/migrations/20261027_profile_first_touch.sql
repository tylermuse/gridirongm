-- First-touch acquisition attribution on profiles.
-- Date: 2026-10-27. Idempotent — safe to re-run.
--
-- Where a user first came from (referrer host, landing path, UTMs), captured
-- in the browser on their first visit and written here at checkout (and, for
-- email signups, mirrored into auth.users.raw_user_meta_data.first_touch).
-- Only ever set once: see the COALESCE in the checkout route.
--
-- Example value:
--   {"ref":"reddit.com","landing":"/rosters/2026","first_seen":"2026-10-25T17:00:12Z"}

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS first_touch JSONB;

COMMENT ON COLUMN profiles.first_touch IS
  'First-touch attribution: ref (referrer host or direct), landing, utm_*, first_seen. Set once.';
