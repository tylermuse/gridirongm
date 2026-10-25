-- Rollup tables so /admin/analytics stops timing out.
--
-- 20261024b cut admin_analytics_summary down to page_view + session_start rows,
-- and it still took 16s for 7 days (PostgREST's limit is 8s). The rows are few
-- (53k) but analytics_events is 653 MB of wide jsonb rows, the visit rows are
-- scattered between ~250k/week of gameplay telemetry, and the instance can't
-- cache the table, so every report reads most of a week of heap from disk.
--
-- The click tracker adds ~650k ui_* rows a week on top of that, so the feature
-- usage report would hit the same wall within days.
--
-- Fix: a trigger keeps three small rollups up to date on every insert, and every
-- admin report reads those instead of the raw table.
--
--   analytics_device_minutes  one row per (app, device, minute) with event,
--                             page-view and session counts (non-UI events)
--   analytics_page_hours      page views per (app, path, hour)
--   analytics_ui_days         click-tracker events per (app, day, device, event,
--                             feature, area, control, choice) with counts and
--                             engagement time
--
-- Live rows are written by the trigger with src = 'live' for events created at or
-- after analytics_rollup_meta.started_at. Older history is loaded by
-- analytics_backfill_rollups(from, to) with src = 'backfill'; each call deletes
-- and rebuilds its range, so it's safe to re-run. Reports sum across src.
--
-- Behaviour changes vs. the raw-table reports:
--   - Window edges are minute-precise (Top Pages: hour; feature usage: UTC day).
--   - 3D cohort session lengths are measured from active minutes, so a session
--     is (last active minute - first active minute); same for both cohorts.

create table if not exists public.analytics_rollup_meta (
  id boolean primary key default true check (id),
  started_at timestamptz not null
);
insert into public.analytics_rollup_meta (started_at) values (now())
on conflict (id) do nothing;

create table if not exists public.analytics_device_minutes (
  app text not null,
  device_id text not null,          -- '' when the event had no device_id
  minute timestamptz not null,
  src text not null,                -- 'live' | 'backfill'
  user_id uuid,                     -- from page_view / session_start rows only
  events int not null default 0,
  page_views int not null default 0,
  sessions int not null default 0,
  primary key (app, device_id, minute, src)
);
create index if not exists analytics_device_minutes_minute_idx
  on public.analytics_device_minutes (minute);

create table if not exists public.analytics_page_hours (
  app text not null,
  path text not null,
  hour timestamptz not null,
  src text not null,
  views int not null default 0,
  primary key (app, path, hour, src)
);
create index if not exists analytics_page_hours_hour_idx
  on public.analytics_page_hours (hour);

create table if not exists public.analytics_ui_days (
  app text not null,
  day date not null,                -- UTC
  device_id text not null,          -- '' when missing
  event text not null,
  feature text not null,
  area text not null,
  target text not null,
  value text not null,              -- ui_change choice; '' otherwise
  src text not null,
  user_id uuid,
  n int not null default 0,
  active_ms bigint not null default 0,
  visible_ms bigint not null default 0,
  primary key (app, day, device_id, event, feature, area, target, value, src)
);
create index if not exists analytics_ui_days_day_idx
  on public.analytics_ui_days (day);

-- Service role only, like analytics_events.
alter table public.analytics_ui_days enable row level security;
alter table public.analytics_rollup_meta enable row level security;
alter table public.analytics_device_minutes enable row level security;
alter table public.analytics_page_hours enable row level security;

-- ---------------------------------------------------------------------------
-- Trigger: roll each new event up. Never lets a rollup error block the insert.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_rollup_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app text := coalesce(new.properties ->> 'app', 'bs-football');
begin
  if new.created_at < (select started_at from analytics_rollup_meta) then
    return new;  -- history is the backfill's job
  end if;
  begin
    if new.event in ('ui_click', 'ui_hover', 'ui_rage_click', 'ui_dead_click', 'ui_change', 'page_engagement') then
      insert into analytics_ui_days as u (app, day, device_id, event, feature, area, target, value, src, user_id, n, active_ms, visible_ms)
      values (
        v_app,
        (new.created_at at time zone 'utc')::date,
        coalesce(new.properties ->> 'device_id', ''),
        new.event,
        coalesce(new.properties ->> 'feature', 'unknown'),
        coalesce(new.properties ->> 'area', 'main'),
        coalesce(new.properties ->> 'target', ''),
        coalesce(new.properties ->> 'value', ''),
        'live',
        new.user_id,
        1,
        coalesce((new.properties ->> 'activeMs')::bigint, 0),
        coalesce((new.properties ->> 'visibleMs')::bigint, 0)
      )
      on conflict (app, day, device_id, event, feature, area, target, value, src) do update set
        user_id = coalesce(excluded.user_id, u.user_id),
        n = u.n + 1,
        active_ms = u.active_ms + excluded.active_ms,
        visible_ms = u.visible_ms + excluded.visible_ms;
      return new;
    end if;

    insert into analytics_device_minutes as m (app, device_id, minute, src, user_id, events, page_views, sessions)
    values (
      v_app,
      coalesce(new.properties ->> 'device_id', ''),
      date_trunc('minute', new.created_at),
      'live',
      case when new.event in ('page_view', 'session_start') then new.user_id end,
      1,
      (new.event = 'page_view')::int,
      (new.event = 'session_start')::int
    )
    on conflict (app, device_id, minute, src) do update set
      user_id = coalesce(excluded.user_id, m.user_id),
      events = m.events + 1,
      page_views = m.page_views + excluded.page_views,
      sessions = m.sessions + excluded.sessions;

    if new.event = 'page_view' and new.properties ->> 'path' is not null then
      insert into analytics_page_hours as p (app, path, hour, src, views)
      values (v_app, new.properties ->> 'path', date_trunc('hour', new.created_at), 'live', 1)
      on conflict (app, path, hour, src) do update set views = p.views + 1;
    end if;
  exception when others then
    -- Analytics ingestion matters more than the rollup; a missed row only
    -- under-counts a report by one event.
    null;
  end;
  return new;
end;
$$;

drop trigger if exists analytics_rollup_event on public.analytics_events;
create trigger analytics_rollup_event
  after insert on public.analytics_events
  for each row execute function public.analytics_rollup_event();

-- ---------------------------------------------------------------------------
-- Backfill: rebuild [p_from, p_to) from the raw table (capped at started_at).
-- Run in chunks from the SQL editor; each call is idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_backfill_rollups(p_from timestamptz, p_to timestamptz default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Snap to whole UTC days so no rollup bucket straddles two chunks; the only
  -- unaligned edge is started_at, which is always the last chunk's end.
  v_from timestamptz := date_trunc('day', p_from, 'UTC');
  v_to timestamptz := least(coalesce(date_trunc('day', p_to, 'UTC'), 'infinity'::timestamptz), (select started_at from analytics_rollup_meta));
  v_minutes bigint;
  v_pages bigint;
  v_ui bigint;
begin
  if v_from >= v_to then
    return 'nothing to do: range is after the rollup start';
  end if;

  delete from analytics_device_minutes where src = 'backfill' and minute >= v_from and minute < v_to;
  delete from analytics_page_hours where src = 'backfill' and hour >= v_from and hour < v_to;
  delete from analytics_ui_days where src = 'backfill' and day >= (v_from at time zone 'utc')::date and day <= (v_to at time zone 'utc')::date
    and (day < (v_to at time zone 'utc')::date or v_to = (select started_at from analytics_rollup_meta));

  insert into analytics_device_minutes (app, device_id, minute, src, user_id, events, page_views, sessions)
  select coalesce(properties ->> 'app', 'bs-football'),
         coalesce(properties ->> 'device_id', ''),
         date_trunc('minute', created_at),
         'backfill',
         (max(user_id::text) filter (where event in ('page_view', 'session_start')))::uuid,
         count(*),
         count(*) filter (where event = 'page_view'),
         count(*) filter (where event = 'session_start')
  from analytics_events
  where created_at >= v_from and created_at < v_to
    and event not in ('ui_click', 'ui_hover', 'ui_rage_click', 'ui_dead_click', 'ui_change', 'page_engagement')
  group by 1, 2, 3;
  get diagnostics v_minutes = row_count;

  insert into analytics_page_hours (app, path, hour, src, views)
  select coalesce(properties ->> 'app', 'bs-football'),
         properties ->> 'path',
         date_trunc('hour', created_at),
         'backfill',
         count(*)
  from analytics_events
  where created_at >= v_from and created_at < v_to
    and event = 'page_view' and properties ->> 'path' is not null
  group by 1, 2, 3;
  get diagnostics v_pages = row_count;

  insert into analytics_ui_days (app, day, device_id, event, feature, area, target, value, src, user_id, n, active_ms, visible_ms)
  select coalesce(properties ->> 'app', 'bs-football'),
         (created_at at time zone 'utc')::date,
         coalesce(properties ->> 'device_id', ''),
         event,
         coalesce(properties ->> 'feature', 'unknown'),
         coalesce(properties ->> 'area', 'main'),
         coalesce(properties ->> 'target', ''),
         coalesce(properties ->> 'value', ''),
         'backfill',
         (max(user_id::text))::uuid,
         count(*),
         coalesce(sum((properties ->> 'activeMs')::bigint), 0),
         coalesce(sum((properties ->> 'visibleMs')::bigint), 0)
  from analytics_events
  where created_at >= v_from and created_at < v_to
    and event in ('ui_click', 'ui_hover', 'ui_rage_click', 'ui_dead_click', 'ui_change', 'page_engagement')
  group by 1, 2, 3, 4, 5, 6, 7, 8;
  get diagnostics v_ui = row_count;

  return format('backfilled %s to %s: %s device-minutes, %s page-hours, %s ui-days', v_from, v_to, v_minutes, v_pages, v_ui);
end;
$$;

revoke all on function public.analytics_backfill_rollups(timestamptz, timestamptz) from public;
revoke all on function public.analytics_backfill_rollups(timestamptz, timestamptz) from anon;
revoke all on function public.analytics_backfill_rollups(timestamptz, timestamptz) from authenticated;

-- ---------------------------------------------------------------------------
-- Reports, now reading the rollups.
-- ---------------------------------------------------------------------------
create or replace function public.admin_analytics_summary(p_since timestamptz)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with founding_cutoff as (select '2026-05-01T00:00:00Z'::timestamptz as ts),
  dm as (
    select device_id, user_id, page_views, sessions
    from analytics_device_minutes
    where app = 'bs-football' and minute >= date_trunc('minute', p_since)
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
    'activeUsers', (select count(distinct user_id) from dm),
    -- Upper bound on humans: device_id lives in localStorage.
    'uniqueDevices', (select count(distinct device_id) from dm where device_id <> '' and page_views + sessions > 0),
    'sessions', (select coalesce(sum(sessions), 0) from dm),
    'pageViews', (select coalesce(sum(page_views), 0) from dm),
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
        select path, sum(views) as n
        from analytics_page_hours
        where app = 'bs-football' and hour >= date_trunc('hour', p_since)
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
    select device_id, minute, (minute at time zone 'America/Chicago')::date as day, events, page_views
    from analytics_device_minutes
    where app = p_app and device_id <> '' and minute >= now() - interval '30 days'
  ),
  dev as (
    select
      device_id,
      sum(events) filter (where minute >= now() - interval '1 day')       as n1,
      sum(events) filter (where minute >= now() - interval '7 days')      as n7,
      sum(page_views) filter (where minute >= now() - interval '1 day')   as pv1,
      sum(page_views) filter (where minute >= now() - interval '7 days')  as pv7,
      sum(page_views)                                                     as pv30,
      count(distinct day)                                                 as days
    from ev
    group by device_id
  ),
  dd as (
    select day, device_id, sum(page_views) as pv
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
    -- the sim3d events are rare, so the (event, created_at) index makes this cheap
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
    select m.minute as created_at, w.device_id, w.sim3d_on, w.first_view
    from (
      select device_id, minute from analytics_device_minutes
      where minute >= date_trunc('minute', p_since)
      group by 1, 2
    ) m
    join watchers w on w.device_id = m.device_id
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

create or replace function public.admin_interaction_report(p_since timestamptz, p_app text default 'bs-football')
returns json
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select day, event, feature, area, target, value, user_id, n, active_ms, visible_ms,
           nullif(device_id, '') as device_id
    from analytics_ui_days
    where app = p_app and day >= (p_since at time zone 'utc')::date
  ),
  feature_days as (
    select feature, device_id, count(distinct day) as days
    from ev
    where device_id is not null
    group by 1, 2
  ),
  features as (
    select e.feature,
           count(distinct e.device_id) as devices,
           count(distinct e.user_id) as users,
           coalesce(sum(e.n) filter (where e.event = 'ui_click'), 0) as clicks,
           coalesce(sum(e.n) filter (where e.event = 'ui_hover'), 0) as hovers,
           coalesce(sum(e.n) filter (where e.event = 'ui_change'), 0) as changes,
           coalesce(sum(e.n) filter (where e.event = 'ui_rage_click'), 0) as rage,
           coalesce(sum(e.n) filter (where e.event = 'ui_dead_click'), 0) as dead,
           coalesce(sum(e.active_ms) filter (where e.event = 'page_engagement'), 0) as active_ms,
           coalesce(sum(e.visible_ms) filter (where e.event = 'page_engagement'), 0) as visible_ms,
           (select count(*) from feature_days d where d.feature = e.feature and d.days >= 2) as returning_devices
    from ev e
    group by 1
  ),
  elements as (
    select feature, area, target,
           coalesce(sum(n) filter (where event = 'ui_click'), 0) as clicks,
           count(distinct device_id) filter (where event = 'ui_click') as click_devices,
           count(distinct device_id) filter (where event = 'ui_hover') as hover_devices,
           coalesce(sum(n) filter (where event = 'ui_rage_click'), 0) as rage,
           coalesce(sum(n) filter (where event = 'ui_dead_click'), 0) as dead
    from ev
    where event in ('ui_click', 'ui_hover', 'ui_rage_click', 'ui_dead_click') and target <> ''
    group by 1, 2, 3
  ),
  hover_only as (
    select feature, target,
           count(*) filter (where hovered) as hovered,
           count(*) filter (where hovered and not clicked) as hovered_only
    from (
      select feature, target, device_id,
             bool_or(event = 'ui_hover') as hovered,
             bool_or(event = 'ui_click') as clicked
      from ev
      where event in ('ui_hover', 'ui_click') and device_id is not null and target <> ''
      group by 1, 2, 3
    ) d
    group by 1, 2
  ),
  changes as (
    select feature, target, case when value = '' then '(edited)' else value end as value,
           sum(n) as n,
           count(distinct device_id) as devices
    from ev
    where event = 'ui_change'
    group by 1, 2, 3
  )
  select json_build_object(
    'totals', (
      select json_build_object(
        'clicks', coalesce(sum(n) filter (where event = 'ui_click'), 0),
        'hovers', coalesce(sum(n) filter (where event = 'ui_hover'), 0),
        'changes', coalesce(sum(n) filter (where event = 'ui_change'), 0),
        'rageClicks', coalesce(sum(n) filter (where event = 'ui_rage_click'), 0),
        'deadClicks', coalesce(sum(n) filter (where event = 'ui_dead_click'), 0),
        'devices', count(distinct device_id),
        'activeHours', round(coalesce(sum(active_ms) filter (where event = 'page_engagement'), 0) / 3600000.0, 1)
      )
      from ev
    ),
    'features', coalesce((
      select json_agg(json_build_object(
        'feature', feature, 'devices', devices, 'users', users, 'clicks', clicks,
        'hovers', hovers, 'changes', changes, 'rage', rage, 'dead', dead,
        'activeMs', active_ms, 'visibleMs', visible_ms, 'returningDevices', returning_devices
      ) order by devices desc, clicks desc)
      from features
    ), '[]'::json),
    'elements', coalesce((
      select json_agg(json_build_object(
        'feature', feature, 'area', area, 'target', target, 'clicks', clicks,
        'clickDevices', click_devices, 'hoverDevices', hover_devices, 'rage', rage, 'dead', dead
      ) order by clicks desc, hover_devices desc)
      from (select * from elements order by clicks desc, hover_devices desc limit 400) t
    ), '[]'::json),
    'frustration', coalesce((
      select json_agg(json_build_object(
        'feature', feature, 'area', area, 'target', target, 'clicks', clicks, 'rage', rage, 'dead', dead
      ) order by rage + dead desc)
      from (select * from elements where rage + dead > 0 order by rage + dead desc limit 25) t
    ), '[]'::json),
    'hoverNoClick', coalesce((
      select json_agg(json_build_object(
        'feature', feature, 'target', target, 'hovered', hovered, 'hoveredOnly', hovered_only
      ) order by hovered_only desc)
      from (select * from hover_only where hovered_only > 0 order by hovered_only desc limit 25) t
    ), '[]'::json),
    'changes', coalesce((
      select json_agg(json_build_object(
        'feature', feature, 'target', target, 'value', value, 'count', n, 'devices', devices
      ) order by n desc)
      from (select * from changes order by n desc limit 60) t
    ), '[]'::json)
  );
$$;

revoke all on function public.admin_interaction_report(timestamptz, text) from public;
revoke all on function public.admin_interaction_report(timestamptz, text) from anon;
revoke all on function public.admin_interaction_report(timestamptz, text) from authenticated;
