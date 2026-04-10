-- ════════════════════════════════════════════════════════════════════
-- GM Leaderboard & Awards — Task 1.5 (Session 1)
--
-- Run this in your Supabase SQL editor BEFORE deploying the API routes
-- and engine code that depends on these tables.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- ── gm_career_stats: rolling totals per user ────────────────────────
CREATE TABLE IF NOT EXISTS gm_career_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  team_id TEXT,
  team_name TEXT,
  team_abbreviation TEXT,
  all_time_wins INT NOT NULL DEFAULT 0,
  all_time_losses INT NOT NULL DEFAULT 0,
  championships INT NOT NULL DEFAULT 0,
  playoff_appearances INT NOT NULL DEFAULT 0,
  draft_score_total REAL NOT NULL DEFAULT 0,
  drafts_completed INT NOT NULL DEFAULT 0,
  seasons_played INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── gm_season_history: one row per (user, season) ───────────────────
CREATE TABLE IF NOT EXISTS gm_season_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season INT NOT NULL,
  team_id TEXT,
  team_name TEXT,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  made_playoffs BOOLEAN NOT NULL DEFAULT false,
  won_championship BOOLEAN NOT NULL DEFAULT false,
  draft_grade TEXT,
  draft_score REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, season)
);

-- ── gm_awards: trophy case (badges per season per user) ─────────────
CREATE TABLE IF NOT EXISTS gm_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season INT NOT NULL,
  award_type TEXT NOT NULL CHECK (award_type IN (
    'gm_of_year', 'best_draft', 'best_trade', 'best_rebuild'
  )),
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, season, award_type)
);

-- ── gm_award_votes: vote ledger ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS gm_award_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nominee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season INT NOT NULL,
  award_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (voter_user_id, season, award_type)
);

-- ── Indexes for leaderboard queries ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gm_season_history_season
  ON gm_season_history (season DESC);

CREATE INDEX IF NOT EXISTS idx_gm_career_championships
  ON gm_career_stats (championships DESC, all_time_wins DESC);

CREATE INDEX IF NOT EXISTS idx_gm_awards_season
  ON gm_awards (season, award_type);

-- ── Row Level Security ──────────────────────────────────────────────
-- Public read (it's a leaderboard); write only your own rows.
-- Service-role key bypasses RLS for server-side engine writes.

ALTER TABLE gm_career_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE gm_season_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE gm_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE gm_award_votes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first so the script is idempotent
DROP POLICY IF EXISTS "public read career"  ON gm_career_stats;
DROP POLICY IF EXISTS "public read history" ON gm_season_history;
DROP POLICY IF EXISTS "public read awards"  ON gm_awards;
DROP POLICY IF EXISTS "public read votes"   ON gm_award_votes;
DROP POLICY IF EXISTS "user upsert career"  ON gm_career_stats;
DROP POLICY IF EXISTS "user insert history" ON gm_season_history;
DROP POLICY IF EXISTS "user update history" ON gm_season_history;
DROP POLICY IF EXISTS "user insert awards"  ON gm_awards;
DROP POLICY IF EXISTS "user vote"           ON gm_award_votes;

-- Public read policies
CREATE POLICY "public read career"  ON gm_career_stats   FOR SELECT USING (true);
CREATE POLICY "public read history" ON gm_season_history FOR SELECT USING (true);
CREATE POLICY "public read awards"  ON gm_awards         FOR SELECT USING (true);
CREATE POLICY "public read votes"   ON gm_award_votes    FOR SELECT USING (true);

-- Self-write policies
CREATE POLICY "user upsert career"
  ON gm_career_stats
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user insert history"
  ON gm_season_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user update history"
  ON gm_season_history
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user insert awards"
  ON gm_awards
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user vote"
  ON gm_award_votes
  FOR INSERT
  WITH CHECK (auth.uid() = voter_user_id);
