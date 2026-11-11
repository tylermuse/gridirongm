-- Daily active devices for any range, for the chart on /admin/analytics.
--
-- admin_active_users() has "30 days" written into it, because its headline
-- numbers (today / this week / this month) are fixed windows. The daily chart
-- was fed by the same call, so it stayed at 30 days whatever range was picked.
--
-- This returns only the per-day series, for every app in one pass, from p_since:
--
--   { "bs-football": [{ "day": "2026-08-01", "all": 210, "engaged": 140 }, ...],
--     "bs-hoops":    [...] }
--
-- Same definitions as admin_active_users: a day is a US Central day, "all" is
-- devices with any event that day, "engaged" is devices with 2+ page views that
-- day. p_since is moved back to the start of its Central day so the first bar
-- is a whole day, not a partial one.
--
-- The page calls this only for ranges longer than 30 days; shorter ranges keep
-- using the series admin_active_users already returns. Until this is applied,
-- those longer ranges show the 30-day chart with a note.
--
-- Reads analytics_device_minutes only (the rollup table), never analytics_events.
-- Safe to re-run.

create or replace function public.admin_daily_active(p_since timestamptz)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with dd as (
    select app, (minute at time zone 'America/Chicago')::date as day, device_id, sum(page_views) as pv
    from analytics_device_minutes
    where device_id <> ''
      and minute >= date_trunc('day', p_since at time zone 'America/Chicago') at time zone 'America/Chicago'
    group by 1, 2, 3
  ),
  d as (
    select app, day, count(*) as a, count(*) filter (where pv >= 2) as e
    from dd
    group by 1, 2
  )
  select coalesce(json_object_agg(app, series), '{}'::json)
  from (
    select app,
           json_agg(json_build_object('day', to_char(day, 'YYYY-MM-DD'), 'all', a, 'engaged', e) order by day) as series
    from d
    group by app
  ) s;
$$;

revoke all on function public.admin_daily_active(timestamptz) from public;
revoke all on function public.admin_daily_active(timestamptz) from anon;
revoke all on function public.admin_daily_active(timestamptz) from authenticated;
