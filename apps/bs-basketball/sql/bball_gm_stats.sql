-- ════════════════════════════════════════════════════════════════════
-- BS Hoops — Global GM Leaderboard & Awards (Roadmap 3.3, Phase A)
--
-- Separate bball_gm_* tables (decision D1=B) so the live football GM board
-- is untouched. Same shared Supabase project + auth.users identity.
--
-- Run this in the Supabase SQL editor BEFORE the /api/gm/* routes go live.
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- ── bball_gm_career_stats: rolling totals per user ──────────────────
CREATE TABLE IF NOT EXISTS bball_gm_career_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  team_id TEXT,
  team_name TEXT,
  team_abbreviation TEXT,
  all_time_wins INT NOT NULL DEFAULT 0,
  all_time_losses INT NOT NULL DEFAULT 0,
  championships INT NOT NULL DEFAULT 0,
  playoff_appearances INT NOT NULL DEFAULT 0,
  seasons_played INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── bball_gm_season_history: one row per (user, season) ─────────────
CREATE TABLE IF NOT EXISTS bball_gm_season_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season INT NOT NULL,
  team_id TEXT,
  team_name TEXT,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  made_playoffs BOOLEAN NOT NULL DEFAULT false,
  won_championship BOOLEAN NOT NULL DEFAULT false,
  draft_score REAL,
  draft_grade TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, season)
);
-- Back-compat: add the draft columns to a table created before Best Draft.
ALTER TABLE bball_gm_season_history ADD COLUMN IF NOT EXISTS draft_score REAL;
ALTER TABLE bball_gm_season_history ADD COLUMN IF NOT EXISTS draft_grade TEXT;

-- ── bball_gm_awards: trophy case ────────────────────────────────────
CREATE TABLE IF NOT EXISTS bball_gm_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season INT NOT NULL,
  award_type TEXT NOT NULL CHECK (award_type IN (
    'gm_of_year', 'best_draft', 'best_rebuild'
  )),
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, season, award_type)
);

-- ── bball_gm_award_votes: vote ledger (Phase B) ─────────────────────
CREATE TABLE IF NOT EXISTS bball_gm_award_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nominee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season INT NOT NULL,
  award_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (voter_user_id, season, award_type)
);

-- ── Indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bball_gm_season_history_season
  ON bball_gm_season_history (season DESC);
CREATE INDEX IF NOT EXISTS idx_bball_gm_career_champs
  ON bball_gm_career_stats (championships DESC, all_time_wins DESC);
CREATE INDEX IF NOT EXISTS idx_bball_gm_awards_season
  ON bball_gm_awards (season, award_type);

-- ── Row Level Security: public read, self-write, service-role bypass ─
ALTER TABLE bball_gm_career_stats  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bball_gm_season_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bball_gm_awards         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bball_gm_award_votes    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bball public read career"  ON bball_gm_career_stats;
DROP POLICY IF EXISTS "bball public read history" ON bball_gm_season_history;
DROP POLICY IF EXISTS "bball public read awards"  ON bball_gm_awards;
DROP POLICY IF EXISTS "bball public read votes"   ON bball_gm_award_votes;
DROP POLICY IF EXISTS "bball user upsert career"  ON bball_gm_career_stats;
DROP POLICY IF EXISTS "bball user insert history" ON bball_gm_season_history;
DROP POLICY IF EXISTS "bball user update history" ON bball_gm_season_history;
DROP POLICY IF EXISTS "bball user insert awards"  ON bball_gm_awards;
DROP POLICY IF EXISTS "bball user vote"           ON bball_gm_award_votes;

CREATE POLICY "bball public read career"  ON bball_gm_career_stats   FOR SELECT USING (true);
CREATE POLICY "bball public read history" ON bball_gm_season_history FOR SELECT USING (true);
CREATE POLICY "bball public read awards"  ON bball_gm_awards         FOR SELECT USING (true);
CREATE POLICY "bball public read votes"   ON bball_gm_award_votes    FOR SELECT USING (true);

CREATE POLICY "bball user upsert career"
  ON bball_gm_career_stats FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bball user insert history"
  ON bball_gm_season_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bball user update history"
  ON bball_gm_season_history FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bball user insert awards"
  ON bball_gm_awards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bball user vote"
  ON bball_gm_award_votes FOR INSERT WITH CHECK (auth.uid() = voter_user_id);
