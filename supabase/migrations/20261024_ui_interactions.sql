-- Feature usage + interaction report for /admin/analytics.
--
-- Reads the automatic UI events from packages/core/src/analytics/interactions.ts:
--   ui_click, ui_hover, ui_rage_click, ui_dead_click, ui_change, page_engagement
-- Every row carries properties.feature (first path segment, or a data-track-feature
-- override), properties.target (the element's label, digits collapsed to '#'),
-- properties.area (nav / header / aside / dialog / main) and properties.device_id.
--
-- What the report answers:
--   features      which parts of the game people use, how deeply, how long, and
--                 whether they come back to it (device active on that feature on 2+ days)
--   elements      the most-clicked controls, with hover and frustration counts
--   frustration   controls with rage clicks (3+ in 1s) or dead clicks (nothing happened)
--   hoverNoClick  controls people rested on but never clicked
--   changes       which options people pick in selects / toggles
--
-- Device ids live in localStorage, so treat device counts as upper bounds on humans,
-- like the rest of the admin page. Hovers are mouse-only, so touch visitors never
-- appear in hover numbers.

create index if not exists analytics_events_ui_idx
  on public.analytics_events (created_at desc)
  where event in ('ui_click', 'ui_hover', 'ui_rage_click', 'ui_dead_click', 'ui_change', 'page_engagement');

create or replace function public.admin_interaction_report(p_since timestamptz, p_app text default 'bs-football')
returns json
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select event,
           created_at,
           user_id,
           properties,
           coalesce(properties ->> 'feature', 'unknown') as feature,
           coalesce(properties ->> 'target', '') as target,
           coalesce(properties ->> 'area', 'main') as area,
           properties ->> 'device_id' as device_id
    from analytics_events
    where created_at >= p_since
      and event in ('ui_click', 'ui_hover', 'ui_rage_click', 'ui_dead_click', 'ui_change', 'page_engagement')
      and coalesce(properties ->> 'app', 'bs-football') = p_app
  ),
  feature_days as (
    select feature, device_id, count(distinct (created_at at time zone 'utc')::date) as days
    from ev
    where device_id is not null
    group by 1, 2
  ),
  features as (
    select e.feature,
           count(distinct e.device_id) as devices,
           count(distinct e.user_id) as users,
           count(*) filter (where e.event = 'ui_click') as clicks,
           count(*) filter (where e.event = 'ui_hover') as hovers,
           count(*) filter (where e.event = 'ui_change') as changes,
           count(*) filter (where e.event = 'ui_rage_click') as rage,
           count(*) filter (where e.event = 'ui_dead_click') as dead,
           coalesce(sum((e.properties ->> 'activeMs')::bigint) filter (where e.event = 'page_engagement'), 0) as active_ms,
           coalesce(sum((e.properties ->> 'visibleMs')::bigint) filter (where e.event = 'page_engagement'), 0) as visible_ms,
           (select count(*) from feature_days d where d.feature = e.feature and d.days >= 2) as returning_devices
    from ev e
    group by 1
  ),
  elements as (
    select feature, area, target,
           count(*) filter (where event = 'ui_click') as clicks,
           count(distinct device_id) filter (where event = 'ui_click') as click_devices,
           count(distinct device_id) filter (where event = 'ui_hover') as hover_devices,
           count(*) filter (where event = 'ui_rage_click') as rage,
           count(*) filter (where event = 'ui_dead_click') as dead
    from ev
    where event in ('ui_click', 'ui_hover', 'ui_rage_click', 'ui_dead_click') and target <> ''
    group by 1, 2, 3
  ),
  hover_only as (
    -- per device: did they hover this control, did they click it
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
    select feature, target, coalesce(properties ->> 'value', '(edited)') as value,
           count(*) as n,
           count(distinct device_id) as devices
    from ev
    where event = 'ui_change'
    group by 1, 2, 3
  )
  select json_build_object(
    'totals', (
      select json_build_object(
        'clicks', count(*) filter (where event = 'ui_click'),
        'hovers', count(*) filter (where event = 'ui_hover'),
        'changes', count(*) filter (where event = 'ui_change'),
        'rageClicks', count(*) filter (where event = 'ui_rage_click'),
        'deadClicks', count(*) filter (where event = 'ui_dead_click'),
        'devices', count(distinct device_id),
        'activeHours', round(coalesce(sum((properties ->> 'activeMs')::bigint) filter (where event = 'page_engagement'), 0) / 3600000.0, 1)
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
