-- Active-user metrics (DAU / WAU / MAU) for the admin analytics page.
--
-- Why: "Unique Devices" counts every device_id that fired any event, which for
-- the 30d ending 2026-09-30 was 4,758. But ~74% of those devices fired <=2
-- events (a session_start + one landing page, heavily /rosters/2026/* and /),
-- which is the signature of JS-rendering crawlers (Googlebot renders the SSR
-- roster pages with a fresh localStorage each time) and one-page bounces. That
-- number is not MAU.
--
-- "Engaged" = the device fired >= 2 page_view events inside the window. It is
-- the honest headcount: 1,192 for the same 30d (417 came back on >= 2 days).
-- Raw counts are still returned so the gap stays visible.
--
-- Rolling windows ending now(), independent of the page's period selector.
-- Day buckets are America/Chicago.
--
-- BS Hoops shares this Supabase project and (as of this migration) writes to
-- the same analytics_events table, tagged properties.app = 'bs-hoops'. Rows
-- with no app tag are football (everything written before today).

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

-- ---------------------------------------------------------------------------
-- Keep the existing football summary football-only now that Hoops writes to
-- the same table. Body identical to 20260713_analytics_user_counts.sql plus
-- the app filter on every analytics_events subquery.
-- ---------------------------------------------------------------------------
create or replace function public.admin_analytics_summary(p_since timestamptz)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with founding_cutoff as (select '2026-05-01T00:00:00Z'::timestamptz as ts)
  select json_build_object(
    -- Source of truth: the user table, not telemetry. All-time.
    'totalUsers', (select count(*) from auth.users),

    -- New accounts created inside the window.
    'newUsers', (
      select count(*) from auth.users where created_at >= p_since
    ),

    -- Grandfathered Founders: Premium free forever, can never subscribe.
    'grandfatheredUsers', (
      select count(*) from auth.users, founding_cutoff
      where users.created_at < founding_cutoff.ts
    ),

    -- The only users who can actually buy a subscription.
    'convertibleUsers', (
      select count(*) from auth.users, founding_cutoff
      where users.created_at >= founding_cutoff.ts
    ),

    -- Distinct logged-in users with any activity in the window.
    'activeUsers', (
      select count(distinct user_id)
      from analytics_events
      where coalesce(properties ->> 'app', 'bs-football') = 'bs-football'
        and created_at >= p_since and user_id is not null
    ),

    -- Distinct devices (incl. anonymous players) active in the window.
    -- NOTE: device_id lives in localStorage, so one human can generate several
    -- (new browser, incognito, cleared storage, phone + laptop). Treat this as
    -- an UPPER BOUND on distinct humans, not a headcount.
    'uniqueDevices', (
      select count(distinct properties ->> 'device_id')
      from analytics_events
      where coalesce(properties ->> 'app', 'bs-football') = 'bs-football'
        and created_at >= p_since
        and properties ->> 'device_id' is not null
    ),

    'sessions', (
      select count(*)
      from analytics_events
      where coalesce(properties ->> 'app', 'bs-football') = 'bs-football'
        and event = 'session_start' and created_at >= p_since
    ),

    'pageViews', (
      select count(*)
      from analytics_events
      where coalesce(properties ->> 'app', 'bs-football') = 'bs-football'
        and event = 'page_view' and created_at >= p_since
    ),

    -- Raw `signup` row count. Kept for debugging only — do NOT use as a
    -- denominator. Historical rows are duplicated ~2.6x per human by the old
    -- supabase SIGNED_IN re-fire bug (544 rows / 207 people as of Jul 2026).
    'signupEvents', (
      select count(*) from analytics_events where event = 'signup' and coalesce(properties ->> 'app', 'bs-football') = 'bs-football'
    ),

    'signupsByDay', coalesce((
      select json_object_agg(day, n)
      from (
        select to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day,
               count(*) as n
        from auth.users
        where created_at >= p_since
        group by 1
      ) s
    ), '{}'::json),

    'topPages', coalesce((
      select json_agg(json_build_object('path', path, 'count', n) order by n desc)
      from (
        select properties ->> 'path' as path, count(*) as n
        from analytics_events
        where coalesce(properties ->> 'app', 'bs-football') = 'bs-football'
          and event = 'page_view'
          and created_at >= p_since
          and properties ->> 'path' is not null
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
