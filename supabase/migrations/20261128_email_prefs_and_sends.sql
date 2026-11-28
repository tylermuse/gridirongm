-- Marketing-email preferences (one row per user) and a send log, for the
-- lifecycle emails sent through Resend from mail.bs-football.com.
--
-- Already applied to production on 2026-11-28; this file records it.
-- Both tables are written only by the service role; no client access.

create table if not exists public.email_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,  -- unsubscribe-link key
  marketing_opt_out boolean not null default false,
  opted_out_at timestamptz,
  opt_out_source text,           -- 'page' | 'one_click' | 'admin'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_prefs enable row level security;
-- No policies: anon/authenticated roles get nothing; the service role bypasses RLS.

create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign text not null,        -- e.g. 'winback_v1', 'weekly_2026w13'
  email text not null,
  resend_id text,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  -- One row per (user, campaign) so nobody gets the same email twice.
  constraint email_sends_user_campaign_key unique (user_id, campaign)
);

create index if not exists email_sends_campaign_created_idx on public.email_sends (campaign, created_at);

alter table public.email_sends enable row level security;

-- A prefs row (and unsubscribe token) for every existing account. New accounts
-- get theirs when the sender upserts before a first send, so there is no
-- trigger on auth.users.
insert into public.email_prefs (user_id)
select id from auth.users
on conflict (user_id) do nothing;
