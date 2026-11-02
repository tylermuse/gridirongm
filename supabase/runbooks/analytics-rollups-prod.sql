-- /admin/analytics: rollup pipeline runbook for the PRODUCTION Supabase project.
--
-- Symptom this fixes: the page shows "Some numbers didn't load" with
-- "canceling statement due to statement timeout" for Summary cards, Active
-- users, 3D sim cohorts and Feature usage, at 7d/30d/90d alike, and only the
-- BS Hoops rolling block renders. That is what the reports do when they still
-- scan the raw analytics_events table (653 MB) instead of the rollups from
-- supabase/migrations/20261025_analytics_rollups.sql.
--
-- Run each STEP in the Supabase SQL editor (Dashboard > SQL Editor), in order.
-- Every statement here is idempotent, so re-running a step is safe.
--
-- ===========================================================================
-- STEP 1 — Diagnose. Paste this block; read the one row it returns.
-- ===========================================================================
select
  to_regclass('public.analytics_device_minutes') is not null         as rollup_tables_exist,
  (select started_at from public.analytics_rollup_meta)              as rollup_started_at,
  (select tgenabled from pg_trigger
     where tgname = 'analytics_rollup_event')                         as trigger_enabled,  -- 'O' = on, 'D' = disabled, null = missing
  (select min(minute) from public.analytics_device_minutes)          as earliest_rollup_minute,
  (select max(minute) from public.analytics_device_minutes)          as latest_rollup_minute,
  (select created_at from public.analytics_events
     order by created_at desc limit 1)                               as latest_raw_event,
  (select count(*) from public.analytics_device_minutes
     where minute >= now() - interval '30 days' and src = 'backfill') as backfill_rows_30d,
  (select count(*) from public.analytics_device_minutes
     where minute >= now() - interval '30 days' and src = 'live')     as live_rows_30d,
  (select json_object_agg(proname,
      pg_get_functiondef(oid) ilike '%analytics_device_minutes%'
      or pg_get_functiondef(oid) ilike '%analytics_ui_days%')
     from pg_proc where pronamespace = 'public'::regnamespace
       and proname in ('admin_analytics_summary','admin_active_users',
                       'admin_sim3d_cohorts','admin_interaction_report')) as functions_read_rollups,
  (select json_object_agg(r.rolname, rs.setconfig)
     from pg_roles r left join pg_db_role_setting rs on rs.setrole = r.oid
     where r.rolname in ('anon','authenticated','service_role','authenticator')) as role_settings;
--
-- How to read it:
--   rollup_tables_exist = false, or functions_read_rollups has any false
--     -> 20261025 is not applied. Do STEP 2.
--   earliest_rollup_minute is null, or later than 90 days ago
--     -> backfill never ran / didn't reach far enough. Do STEP 3.
--   trigger_enabled is not 'O'
--     -> live rows aren't being written. STEP 2 recreates the trigger.
--   latest_rollup_minute is more than a few minutes behind latest_raw_event
--     -> trigger is silently failing (it swallows errors by design). STEP 2, then
--        STEP 3 for the gap.
--   role_settings shows statement_timeout for service_role (the role the admin
--     route uses) — 8s is the Supabase default. See STEP 5 only if needed.

-- ===========================================================================
-- STEP 2 — Apply the migrations (idempotent).
-- ===========================================================================
-- Paste the ENTIRE contents of these two files, one file per SQL editor run:
--   supabase/migrations/20261025_analytics_rollups.sql
--   supabase/migrations/20261101_analytics_rollup_health.sql
-- (20261025 creates the tables/trigger/backfill/reports; 20261101 adds
-- admin_analytics_health(), which /admin/analytics calls to show this state.)
--
-- Note: analytics_rollup_meta.started_at is set the FIRST time 20261025 runs
-- and kept on re-runs ("on conflict do nothing"), so the trigger/backfill
-- boundary doesn't move. Check it with STEP 1.

-- ===========================================================================
-- STEP 3 — Backfill history, one week per run.
-- ===========================================================================
-- analytics_backfill_rollups(from, to) rebuilds [from, to) from the raw table
-- (capped at started_at). It reads a week of the 653 MB table per call, so run
-- ONE call per SQL editor execution (the editor has its own ~2 min limit) and
-- work backwards until it covers 90+ days before today. Each call reports what
-- it wrote; "nothing to do" means that range is after started_at.
--
-- Most recent week first, so the page becomes correct fastest:
select public.analytics_backfill_rollups(now() - interval '7 days',  now());
select public.analytics_backfill_rollups(now() - interval '14 days', now() - interval '7 days');
select public.analytics_backfill_rollups(now() - interval '21 days', now() - interval '14 days');
select public.analytics_backfill_rollups(now() - interval '28 days', now() - interval '21 days');
select public.analytics_backfill_rollups(now() - interval '35 days', now() - interval '28 days');
select public.analytics_backfill_rollups(now() - interval '42 days', now() - interval '35 days');
select public.analytics_backfill_rollups(now() - interval '49 days', now() - interval '42 days');
select public.analytics_backfill_rollups(now() - interval '56 days', now() - interval '49 days');
select public.analytics_backfill_rollups(now() - interval '63 days', now() - interval '56 days');
select public.analytics_backfill_rollups(now() - interval '70 days', now() - interval '63 days');
select public.analytics_backfill_rollups(now() - interval '77 days', now() - interval '70 days');
select public.analytics_backfill_rollups(now() - interval '84 days', now() - interval '77 days');
select public.analytics_backfill_rollups(now() - interval '91 days', now() - interval '84 days');
select public.analytics_backfill_rollups(now() - interval '98 days', now() - interval '91 days');
-- If a week times out in the editor, split it into days:
--   select public.analytics_backfill_rollups(now() - interval '8 days', now() - interval '7 days');

-- ===========================================================================
-- STEP 4 — Verify (same as STEP 1, via the function the page uses).
-- ===========================================================================
select public.admin_analytics_health();
-- Expect: applied true, trigger 'enabled', every functionsOnRollups true,
-- lagSeconds under ~120, earliestMinute >= 90 days ago, backfillRows30d > 0.
-- Then time the four reports; each should be well under a second:
explain (analyze, timing off, summary) select public.admin_analytics_summary(now() - interval '90 days');
explain (analyze, timing off, summary) select public.admin_active_users('bs-football');
explain (analyze, timing off, summary) select public.admin_sim3d_cohorts(now() - interval '90 days');
explain (analyze, timing off, summary) select public.admin_interaction_report(now() - interval '90 days', 'bs-football');
-- Finally load /admin/analytics at 7d, 30d and 90d: no amber banner, no red
-- "rollups need attention" box, Football rolling block above Hoops, Registered
-- Accounts a real count, and the grey "Rollups live · Ns behind" line present.

-- ===========================================================================
-- STEP 5 — Stopgap ONLY if STEP 2/3 can't be done today.
-- ===========================================================================
-- The admin route talks to PostgREST with the service role key, so the role
-- whose statement_timeout applies is service_role. anon / authenticated are
-- untouched. PostgREST must reload its role settings to pick this up.
--
--   alter role service_role set statement_timeout = '60s';
--   notify pgrst, 'reload config';
--
-- Undo once the rollups are in place:
--   alter role service_role reset statement_timeout;
--   notify pgrst, 'reload config';
--
-- (The alternative stopgap, a covering index on analytics_events, would be a
-- multi-GB index on a 653 MB jsonb table built with CREATE INDEX CONCURRENTLY
-- outside a transaction; the rollups make it unnecessary, so it is not here.)

-- ===========================================================================
-- Freshness, for the record
-- ===========================================================================
-- Nothing is scheduled: the AFTER INSERT trigger analytics_rollup_event on
-- analytics_events rolls each event up as it lands, so the rollups are as
-- fresh as ingestion. The backfill is a one-time load of everything before
-- analytics_rollup_meta.started_at. admin_analytics_health() reports the lag
-- between the newest raw event and the newest rollup minute, and the page
-- turns red if that exceeds 10 minutes, so drift is visible instead of silent.

-- ===========================================================================
-- 2026-11-01 prod run, for the record
-- ===========================================================================
-- STEP 1 showed 20261025 already applied (trigger on, all four functions on the
-- rollups) but backfilled only to 2026-09-24. STEP 3 extended it to 2026-07-27.
-- STEP 4 still timed the four reports at 2–15 s: the instance (Micro: 224 MB
-- shared_buffers, 2 MB work_mem) is the limit now, not the raw table. The
-- follow-up is supabase/migrations/20261102_analytics_report_tuning.sql
-- (covering indexes + per-function work_mem + ANALYZE); until it is applied,
-- STEP 5's 60 s service_role timeout keeps the page rendering.
