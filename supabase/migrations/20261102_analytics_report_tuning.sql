-- /admin/analytics reports still take 2–15 s on the rollups (measured in prod on
-- 2026-11-01, after 20261025 was confirmed applied and backfilled to 2026-07-27).
--
-- Not the raw table any more: every report reads analytics_device_minutes /
-- analytics_ui_days (22 MB and 39 MB). The time goes to the instance, a Micro:
--   shared_buffers 224 MB, work_mem 2 MB, 1 parallel worker, ~1 GB RAM
-- against a 1.24 GB analytics_events that the insert trigger keeps streaming
-- through the cache. explain (analyze, buffers) of admin_active_users's body:
--   Index Scan on analytics_device_minutes_minute_idx: 100k rows, 85k buffer
--   hits (heap is in device/insert order, not minute order), and every
--   GroupAggregate / HashAggregate spilled to temp files at 2 MB work_mem.
--
-- Three cheap, reversible fixes, no behaviour change:
--   1. Covering indexes so the 30/90-day windows are index-only scans in
--      (app, minute) / (app, day) order — no heap visits.
--   2. work_mem raised to 64 MB *only inside the four report functions*
--      (ALTER FUNCTION ... SET; applies per call, not to the role or database),
--      so the aggregates stay in memory instead of temp files.
--   3. ANALYZE on the three tables and on analytics_events, whose planner stats
--      had never been refreshed (n_live_tup 31k vs 2.35 M rows).
--
-- All statements are idempotent. The two CREATE INDEX calls take a few seconds on
-- tables this size and briefly block the rollup trigger's inserts; the trigger
-- swallows errors, so run this in a quiet minute or accept a handful of
-- under-counted live minutes (the backfill can rebuild any range later).
--
-- The real fix for the variance is more compute; this gets the reports under the
-- 8 s PostgREST limit on the current instance.

-- 1. Covering indexes ------------------------------------------------------------
create index if not exists analytics_device_minutes_app_minute_idx
  on public.analytics_device_minutes (app, minute)
  include (device_id, user_id, events, page_views, sessions);

create index if not exists analytics_ui_days_app_day_idx
  on public.analytics_ui_days (app, day)
  include (device_id, event, feature, area, target, value, user_id, n, active_ms, visible_ms);

create index if not exists analytics_page_hours_app_hour_idx
  on public.analytics_page_hours (app, hour)
  include (path, views);

-- 2. Per-function work_mem ------------------------------------------------------
alter function public.admin_analytics_summary(timestamptz) set work_mem = '64MB';
alter function public.admin_active_users(text) set work_mem = '64MB';
alter function public.admin_sim3d_cohorts(timestamptz) set work_mem = '64MB';
alter function public.admin_interaction_report(timestamptz, text) set work_mem = '64MB';

-- 3. Fresh planner stats --------------------------------------------------------
analyze public.analytics_device_minutes;
analyze public.analytics_page_hours;
analyze public.analytics_ui_days;
analyze public.analytics_events;

-- Verify afterwards (each should drop well under the 8 s limit; aim for < 1 s):
--   explain (analyze, buffers, timing off, summary) select public.admin_analytics_summary(now() - interval '90 days');
--   explain (analyze, buffers, timing off, summary) select public.admin_active_users('bs-football');
--   explain (analyze, buffers, timing off, summary) select public.admin_sim3d_cohorts(now() - interval '90 days');
--   explain (analyze, buffers, timing off, summary) select public.admin_interaction_report(now() - interval '90 days', 'bs-football');
-- Expect "Index Only Scan using analytics_device_minutes_app_minute_idx" and no
-- "temp read/written" lines in the buffers output.
--
-- Undo:
--   drop index if exists public.analytics_device_minutes_app_minute_idx;
--   drop index if exists public.analytics_ui_days_app_day_idx;
--   drop index if exists public.analytics_page_hours_app_hour_idx;
--   alter function public.admin_analytics_summary(timestamptz) reset work_mem;
--   alter function public.admin_active_users(text) reset work_mem;
--   alter function public.admin_sim3d_cohorts(timestamptz) reset work_mem;
--   alter function public.admin_interaction_report(timestamptz, text) reset work_mem;
