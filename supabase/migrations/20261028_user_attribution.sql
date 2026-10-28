-- Signup attribution: where each new account came from on its first visit.
-- Date: 2026-10-28. Idempotent — safe to re-run. Paste into the Supabase SQL editor.
--
-- One row per user, shared by both apps (same Supabase project). The browser
-- writes it once, on the first signed-in page load after signup
-- (@bs/core/analytics/attribution), and the Stripe checkout routes copy it onto
-- the subscription's metadata. `app` is the site the account signed up on.
--
-- A standalone table rather than columns on `profiles`: most users have no
-- profiles row, and profiles holds is_admin, so it must never get a client
-- insert policy.

create table if not exists public.user_attribution (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  app            text not null check (app in ('bs-football', 'bs-hoops')),
  first_referrer text check (char_length(first_referrer) <= 500),
  landing_path   text check (char_length(landing_path) <= 500),
  utm_source     text check (char_length(utm_source) <= 500),
  utm_medium     text check (char_length(utm_medium) <= 500),
  utm_campaign   text check (char_length(utm_campaign) <= 500),
  attributed_at  timestamptz not null default now()
);

alter table public.user_attribution enable row level security;

-- Users add and read only their own row. No update or delete policy: the
-- first write wins.
drop policy if exists "own attribution insert" on public.user_attribution;
create policy "own attribution insert" on public.user_attribution
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own attribution select" on public.user_attribution;
create policy "own attribution select" on public.user_attribution
  for select to authenticated using (auth.uid() = user_id);

-- Supabase grants every public table to anon + authenticated by default. Take
-- that back, and let clients insert only the attribution columns so nobody
-- can backdate attributed_at and skew the weekly report.
revoke all on public.user_attribution from anon;
revoke insert, update, delete on public.user_attribution from authenticated;
grant insert (user_id, app, first_referrer, landing_path, utm_source, utm_medium, utm_campaign)
  on public.user_attribution to authenticated;

-- Weekly signups by source. security_invoker makes the view obey the table's
-- RLS (a plain view in public runs as its owner and would expose every row
-- through the API); the revoke keeps it out of the API entirely. Read it from
-- the SQL editor or with the service key.
create or replace view public.signups_by_source
with (security_invoker = true) as
select
  date_trunc('week', attributed_at)::date as week,
  app,
  coalesce(
    nullif(utm_source, ''),
    nullif(regexp_replace(split_part(first_referrer, '/', 3), '^www\.', ''), ''),
    'direct'
  ) as source,
  landing_path,
  count(*) as signups
from public.user_attribution
group by 1, 2, 3, 4;

revoke all on public.signups_by_source from anon, authenticated;
