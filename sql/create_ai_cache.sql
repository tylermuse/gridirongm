-- AI commentary cache table
-- Run this in your Supabase SQL editor to enable persistent caching
-- of AI-generated spotlight and recap commentary.

CREATE TABLE IF NOT EXISTS ai_cache (
  key TEXT PRIMARY KEY,
  topics JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for TTL cleanup queries
CREATE INDEX IF NOT EXISTS idx_ai_cache_created_at ON ai_cache (created_at);

-- Optional: auto-cleanup entries older than 30 days via pg_cron
-- (uncomment if you have pg_cron enabled)
-- SELECT cron.schedule('cleanup-ai-cache', '0 3 * * *', $$
--   DELETE FROM ai_cache WHERE created_at < now() - interval '30 days';
-- $$);
