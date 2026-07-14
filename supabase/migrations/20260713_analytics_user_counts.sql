-- Fixes two ways the admin analytics cards were misrepresenting user counts.
--
-- 1. "Total Users" was `count(distinct user_id) from analytics_events where
--    event = 'signup'` — i.e. derived from telemetry, not from the actual user
--    table. The old signup/login heuristic ("account created <60s ago") misfired
--    on slow first sessions, so ~47 real accounts never got a `signup` row.
--    Result: the card read 209 when auth.users actually held 256. Now we count
--    the source of truth.
--
-- 2. The cards mixed time windows without saying so — "Total Users" was all-time
--    while "Unique Devices" was 30d, sat side by side, and invited exactly the
--    wrong comparison (209 users vs 799 devices). We now return the all-time and
--    in-window counts as separate, explicitly named fields so the UI can label them.
--
-- Also splits the user base by the Founding Member cutoff. Anyone who signed up
-- before 2026-05-01 is granted Premium free forever (see FOUNDING_MEMBER_CUTOFF
-- in SubscriptionProvider.tsx), so they can never convert. Dividing subscriptions
-- by ALL users understates conversion by folding in a cohort that is structurally
-- incapable of subscribing. `convertibleUsers` is the only honest denominator.

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
      where created_at >= p_since and user_id is not null
    ),

    -- Distinct devices (incl. anonymous players) active in the window.
    -- NOTE: device_id lives in localStorage, so one human can generate several
    -- (new browser, incognito, cleared storage, phone + laptop). Treat this as
    -- an UPPER BOUND on distinct humans, not a headcount.
    'uniqueDevices', (
      select count(distinct properties ->> 'device_id')
      from analytics_events
      where created_at >= p_since
        and properties ->> 'device_id' is not null
    ),

    'sessions', (
      select count(*)
      from analytics_events
      where event = 'session_start' and created_at >= p_since
    ),

    'pageViews', (
      select count(*)
      from analytics_events
      where event = 'page_view' and created_at >= p_since
    ),

    -- Raw `signup` row count. Kept for debugging only — do NOT use as a
    -- denominator. Historical rows are duplicated ~2.6x per human by the old
    -- supabase SIGNED_IN re-fire bug (544 rows / 207 people as of Jul 2026).
    'signupEvents', (
      select count(*) from analytics_events where event = 'signup'
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
        where event = 'page_view'
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
