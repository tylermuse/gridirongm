-- 3D live sim launch experiment (free for everyone from 2026-10-23; review ~2026-11-06).
--
-- Compares two cohorts of game-watching devices in a window:
--   on  = the device had the 3D sim on for at least one game (sim3d_game_view / sim3d_toggled with on=true)
--   off = the device watched games but never turned the 3D sim on
-- and reports, per cohort: devices, sessions, sessions per device, median and mean
-- session length (minutes), the share of devices active on 2+ distinct days, and the
-- share that came back 7+ days after their first game view in the window.
--
-- A "session" here is gap-based: consecutive events from one device less than 30 minutes
-- apart. Session length is last event minus first event of the session, so a session with
-- one event is 0 minutes — the comparison between cohorts is still fair, the absolute
-- numbers are a floor. Device ids come from localStorage, so one person can be several
-- devices; treat counts as upper bounds on humans, like the rest of the admin page.

create index if not exists analytics_events_sim3d_idx
  on public.analytics_events (created_at desc)
  where event in ('sim3d_game_view', 'sim3d_toggled');

create or replace function public.admin_sim3d_cohorts(p_since timestamptz)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with watchers as (
    -- every device that opened a game page in the window, and whether it ever had 3D on
    select properties ->> 'device_id' as device_id,
           bool_or(coalesce((properties ->> 'on')::boolean, false)) as sim3d_on,
           min(created_at) as first_view
    from analytics_events
    where created_at >= p_since
      and event in ('sim3d_game_view', 'sim3d_toggled')
      and properties ->> 'device_id' is not null
    group by 1
  ),
  ev as (
    select e.created_at, w.device_id, w.sim3d_on, w.first_view
    from analytics_events e
    join watchers w on w.device_id = e.properties ->> 'device_id'
    where e.created_at >= p_since
  ),
  marked as (
    select *,
           case when lag(created_at) over (partition by device_id order by created_at) is null
                  or created_at - lag(created_at) over (partition by device_id order by created_at) > interval '30 minutes'
                then 1 else 0 end as new_session
    from ev
  ),
  sess as (
    select device_id, sim3d_on, first_view,
           sum(new_session) over (partition by device_id order by created_at rows unbounded preceding) as session_no,
           created_at
    from marked
  ),
  sessions as (
    select device_id, sim3d_on, first_view, session_no,
           extract(epoch from (max(created_at) - min(created_at))) / 60.0 as minutes,
           min(created_at) as start_ts,
           min(created_at)::date as day
    from sess
    group by 1, 2, 3, 4
  ),
  per_device as (
    select device_id, sim3d_on,
           count(*) as sessions,
           count(distinct day) as active_days,
           bool_or(start_ts >= first_view + interval '7 days') as returned_7d
    from sessions
    group by 1, 2
  ),
  cohort as (
    select sim3d_on,
           (select count(*) from per_device d where d.sim3d_on = c.sim3d_on) as devices,
           count(*) as sessions,
           percentile_cont(0.5) within group (order by minutes) as median_minutes,
           avg(minutes) as mean_minutes
    from sessions c
    group by 1
  )
  select json_build_object(
    'since', p_since,
    'cohorts', coalesce((
      select json_object_agg(case when c.sim3d_on then 'on' else 'off' end, json_build_object(
        'devices', c.devices,
        'sessions', c.sessions,
        'sessionsPerDevice', case when c.devices > 0 then round(c.sessions::numeric / c.devices, 2) else 0 end,
        'medianMinutes', round(coalesce(c.median_minutes, 0)::numeric, 1),
        'meanMinutes', round(coalesce(c.mean_minutes, 0)::numeric, 1),
        'pctMultiDay', (select round(100.0 * count(*) filter (where active_days >= 2) / greatest(count(*), 1), 1) from per_device d where d.sim3d_on = c.sim3d_on),
        'pctReturned7d', (select round(100.0 * count(*) filter (where returned_7d) / greatest(count(*), 1), 1) from per_device d where d.sim3d_on = c.sim3d_on)
      ))
      from cohort c
    ), '{}'::json),
    'toggles', json_build_object(
      'on', (select count(*) from analytics_events where created_at >= p_since and event = 'sim3d_toggled' and (properties ->> 'on')::boolean),
      'off', (select count(*) from analytics_events where created_at >= p_since and event = 'sim3d_toggled' and not (properties ->> 'on')::boolean)
    )
  );
$$;

revoke all on function public.admin_sim3d_cohorts(timestamptz) from public;
revoke all on function public.admin_sim3d_cohorts(timestamptz) from anon;
revoke all on function public.admin_sim3d_cohorts(timestamptz) from authenticated;
