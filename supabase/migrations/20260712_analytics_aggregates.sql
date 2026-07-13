-- Analytics aggregation, done in Postgres instead of in JS.
--
-- Why: the /api/admin/analytics route used to `select()` raw rows out of
-- analytics_events and tally them in Node. PostgREST caps every row-returning
-- request at `db-max-rows` (1000 on Supabase hosted), so with ~70k page_view
-- rows in a 30d window the route was aggregating an arbitrary ~1000-row slice.
-- That silently under-reported Top Pages, Active Users, Unique Devices and
-- Total Users, while Page Views / Sessions (which used `count: 'exact', head: true`)
-- were correct — hence the "70,819 page views but Top Pages sums to <900" gap.
--
-- Counting in SQL removes the row-transfer entirely, so the caps never apply.

-- ---------------------------------------------------------------------------
-- Indexes to keep the aggregates cheap as the table grows.
-- ---------------------------------------------------------------------------
create index if not exists analytics_events_event_created_idx
  on public.analytics_events (event, created_at desc);

create index if not exists analytics_events_created_idx
  on public.analytics_events (created_at desc);

create index if not exists analytics_events_user_created_idx
  on public.analytics_events (user_id, created_at desc)
  where user_id is not null;

-- Expression index for the device_id we stash inside properties jsonb.
create index if not exists analytics_events_device_idx
  on public.analytics_events ((properties ->> 'device_id'));

-- Expression index for the page path.
create index if not exists analytics_events_path_idx
  on public.analytics_events ((properties ->> 'path'))
  where event = 'page_view';

-- ---------------------------------------------------------------------------
-- One RPC returning every card on the admin analytics page.
-- ---------------------------------------------------------------------------
create or replace function public.admin_analytics_summary(p_since timestamptz)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    -- Distinct users who have ever fired a `signup` event.
    'totalUsers', (
      select count(distinct user_id)
      from analytics_events
      where event = 'signup' and user_id is not null
    ),

    -- Distinct logged-in users with any activity in the window.
    'activeUsers', (
      select count(distinct user_id)
      from analytics_events
      where created_at >= p_since and user_id is not null
    ),

    -- Distinct devices (includes anonymous players) with activity in the window.
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

    -- Denominator for the conversion rate: every signup, all time.
    'totalSignups', (
      select count(*)
      from analytics_events
      where event = 'signup'
    ),

    'signupsByDay', coalesce((
      select json_object_agg(day, n)
      from (
        select to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day,
               count(*) as n
        from analytics_events
        where event = 'signup' and created_at >= p_since
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

-- The API route calls this with the service-role key, which bypasses RLS and
-- needs no explicit grant. Make sure nobody else can reach it.
revoke all on function public.admin_analytics_summary(timestamptz) from public;
revoke all on function public.admin_analytics_summary(timestamptz) from anon;
revoke all on function public.admin_analytics_summary(timestamptz) from authenticated;
