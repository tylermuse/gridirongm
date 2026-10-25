-- In-game feedback from both apps (FeedbackWidget → /api/feedback).
--
-- The widget shipped in Mar 2026 (b68f417) writing to `feedback`, but this
-- table was never created and the route ignored the insert error, so every
-- message was dropped. Until this runs, @bs/core/feedback/server falls back to
-- analytics_events (event = 'feedback'); the admin view reads both.
--
-- Written only by the service role from the API route; no client access.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  app text,                      -- 'bs-football' | 'bs-hoops'
  page text,
  message text not null check (char_length(message) <= 2000)
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
-- No policies: anon/authenticated roles get nothing; the service role bypasses RLS.
