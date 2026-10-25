-- Fix: /admin/analytics went blank with "canceling statement due to statement timeout".
--
-- admin_analytics_summary counted Active Users and Unique Devices over EVERY event
-- in the window, re-scanning the table once per card. The click tracker
-- (20261024_ui_interactions) writes a row per click / hover / change / page-time,
-- several per page view, which pushed that scan past PostgREST's statement
-- timeout. The route then returned all zeros and hid every other section.
--
-- - admin_analytics_summary: one pass over page_view + session_start rows, shared
--   by every windowed card. Unique Devices / Active Users now mean "visited a
--   page" instead of "fired any event" — every real visit fires a page_view.
-- - admin_active_users, admin_sim3d_cohorts: skip the ui_* / page_engagement rows
--   so their scans (and the 3D experiment's session lengths) stay what they were.

create or replace function public.admin_analytics_summary(p_since timestamptz)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with founding_cutoff as (select '2026-05-01T00:00:00Z'::timestamptz as ts),
  -- Every windowed number comes from page views + session starts. Every real
  -- visit fires both, and the (event, created_at) index serves them directly.
  visits as (
    select event, user_id, properties ->> 'device_id' as device_id, properties ->> 'path' as path
    from analytics_events
    where event in ('page_view', 'session_start') and created_at >= p_since
      and coalesce(properties ->> 'app', 'bs-football') = 'bs-football'
  )
  select json_build_object(
    'totalUsers', (select count(*) from auth.users),
    'newUsers', (select count(*) from auth.users where created_at >= p_since),
    'grandfatheredUsers', (
      select count(*) from auth.users, founding_cutoff
      where users.created_at < founding_cutoff.ts
    ),
    'convertibleUsers', (
      select count(*) from auth.users, founding_cutoff
      where users.created_at >= founding_cutoff.ts
    ),
    'activeUsers', (select count(distinct user_id) from visits where user_id is not null),
    -- Upper bound on humans: device_id lives in localStorage.
    'uniqueDevices', (select count(distinct device_id) from visits where device_id is not null),
    'sessions', (select count(*) from visits where event = 'session_start'),
    'pageViews', (select count(*) from visits where event = 'page_view'),
    -- Debug only; duplicated ~2.6x per human by the old SIGNED_IN re-fire bug.
    'signupEvents', (
      select count(*) from analytics_events
      where event = 'signup' and coalesce(properties ->> 'app', 'bs-football') = 'bs-football'
    ),
    'signupsByDay', coalesce((
      select json_object_agg(day, n)
      from (
        select to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day, count(*) as n
        from auth.users
        where created_at >= p_since
        group by 1
      ) s
    ), '{}'::json),
    'topPages', coalesce((
      select json_agg(json_build_object('path', path, 'count', n) order by n desc)
      from (
        select path, count(*) as n
        from visits
        where event = 'page_view' and path is not null
        group by 1
        order by 2 desc
        limit 10
      ) p
    ), '[]'::json)
  );
$$;

revoke all on function public.admin_analytics_summary(timestamptz) from public;
revoke all on function public.admin_analytics_summary(timestamptz) from anon;
revoke all on function public.admin_analytics_summary(timestamptz) from authenticated;

create or replace function public.admin_active_users(p_app text default 'bs-football')
returns json
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select
      properties ->> 'device_id' as device_id,
      created_at,
      (created_at at time zone 'America/Chicago')::date as day,
      event = 'page_view' as is_pv
    from analytics_events
    where created_at >= now() - interval '30 days'
      and properties ->> 'device_id' is not null
      and coalesce(properties ->> 'app', 'bs-football') = p_app
      -- per-click/hover rows would multiply the scan; they never add a device that page_view lacks
      and event not in ('ui_click', 'ui_hover', 'ui_rage_click', 'ui_dead_click', 'ui_change', 'page_engagement')
  ),
  -- Per device: page views in each rolling window + distinct active days.
  dev as (
    select
      device_id,
      count(*) filter (where created_at >= now() - interval '1 day')                  as n1,
      count(*) filter (where created_at >= now() - interval '7 days')                 as n7,
      count(*)                                                                        as n30,
      count(*) filter (where is_pv and created_at >= now() - interval '1 day')        as pv1,
      count(*) filter (where is_pv and created_at >= now() - interval '7 days')       as pv7,
      count(*) filter (where is_pv)                                                   as pv30,
      count(distinct day)                                                             as days
    from ev
    group by device_id
  ),
  -- Per device per day, for the daily series.
  dd as (
    select day, device_id, count(*) filter (where is_pv) as pv
    from ev
    group by day, device_id
  )
  select json_build_object(
    'dau',          (select count(*) from dev where n1 > 0),
    'wau',          (select count(*) from dev where n7 > 0),
    'mau',          (select count(*) from dev),
    'engagedDau',   (select count(*) from dev where pv1 >= 2),
    'engagedWau',   (select count(*) from dev where pv7 >= 2),
    'engagedMau',   (select count(*) from dev where pv30 >= 2),
    -- Came back on at least 2 different days in the last 30.
    'returningMau', (select count(*) from dev where days >= 2),
    'dailyActive', coalesce((
      select json_agg(json_build_object('day', day, 'all', a, 'engaged', e) order by day)
      from (
        select to_char(day, 'YYYY-MM-DD') as day,
               count(*) as a,
               count(*) filter (where pv >= 2) as e
        from dd
        group by day
      ) s
    ), '[]'::json)
  );
$$;

revoke all on function public.admin_active_users(text) from public;
revoke all on function public.admin_active_users(text) from anon;
revoke all on function public.admin_active_users(text) from authenticated;

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
      -- keep session gaps measured on the same events as before the click tracker shipped
      and e.event not in ('ui_click', 'ui_hover', 'ui_rage_click', 'ui_dead_click', 'ui_change', 'page_engagement')
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
