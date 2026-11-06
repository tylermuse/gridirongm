-- 3D live sim, after the launch experiment (decided 2026-11-06: keep it free for everyone).
--
-- Two follow-up reads for /admin/analytics, in one function:
--
--   conversion  per 3D-on / 3D-off cohort (same split as admin_sim3d_cohorts): of the devices that were
--               free at their first game view in the window, the share that went Premium. A device counts
--               as converted when a later sim3d event says premium = true, or when the account it signed
--               in with now has an active/trialing Premium subscription. Founders/admins/existing
--               subscribers are premium at their first view, so they're left out of the denominator.
--
--   defaultTest the default-on test from 2026-11-06. Devices first seen after it shipped, with no saved
--               3D choice, are randomly put in arm 'on' (3D starts on) or 'off' (starts off); the arm rides
--               on every sim3d event as properties.arm. Per arm (intent-to-treat: everyone assigned,
--               whatever they toggled later): devices, share that had 3D on, share that switched it off,
--               sessions per device, active 2+ days, returned after 7+ days, conversion. Because the arm is
--               random, the gap between arms is what 3D *causes*, unlike the self-selected cohorts.
--
-- Sessions come from analytics_device_minutes (the rollups), like admin_sim3d_cohorts, so this stays fast.

create or replace function public.admin_sim3d_followup(p_since timestamptz)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with raw as (
    select properties ->> 'device_id' as device_id,
           created_at,
           event,
           coalesce((properties ->> 'on')::boolean, false) as on_,
           (properties ->> 'premium')::boolean as premium,
           nullif(properties ->> 'arm', '') as arm
    from analytics_events
    where created_at >= p_since
      and event in ('sim3d_game_view', 'sim3d_toggled')
      and properties ->> 'device_id' is not null
  ),
  watchers as (
    select device_id,
           bool_or(on_) as sim3d_on,
           bool_or(event = 'sim3d_toggled' and not on_) as switched_off,
           min(created_at) as first_view,
           (array_agg(premium order by created_at) filter (where premium is not null))[1] as premium_at_start,
           coalesce(bool_or(premium), false) as premium_seen,
           max(arm) as arm
    from raw
    group by 1
  ),
  device_users as (
    select distinct m.device_id, m.user_id
    from analytics_device_minutes m
    join watchers w on w.device_id = m.device_id
    where m.minute >= date_trunc('minute', p_since)
      and m.user_id is not null
  ),
  subscribed as (
    select distinct du.device_id
    from device_users du
    join subscriptions s on s.user_id = du.user_id
    where s.status in ('active', 'trialing')
      and s.tier = 'premium'
  ),
  dev as (
    select w.*,
           (w.premium_at_start is false) as was_free,
           (w.premium_at_start is false and (w.premium_seen or s.device_id is not null)) as converted
    from watchers w
    left join subscribed s on s.device_id = w.device_id
  ),
  -- sessions per device from active minutes (30-min gap), same definition as admin_sim3d_cohorts
  ev as (
    select m.minute, d.device_id, d.first_view
    from (
      select device_id, minute from analytics_device_minutes
      where minute >= date_trunc('minute', p_since)
      group by 1, 2
    ) m
    join dev d on d.device_id = m.device_id
    where d.arm is not null
  ),
  marked as (
    select *,
           case when lag(minute) over (partition by device_id order by minute) is null
                  or minute - lag(minute) over (partition by device_id order by minute) > interval '30 minutes'
                then 1 else 0 end as new_session
    from ev
  ),
  sess as (
    select device_id, first_view, minute,
           sum(new_session) over (partition by device_id order by minute rows unbounded preceding) as session_no
    from marked
  ),
  sessions as (
    select device_id, first_view, session_no, min(minute) as start_ts
    from sess
    group by 1, 2, 3
  ),
  per_device as (
    select device_id,
           count(*) as sessions,
           count(distinct start_ts::date) as active_days,
           bool_or(start_ts >= first_view + interval '7 days') as returned_7d
    from sessions
    group by 1
  )
  select json_build_object(
    'since', p_since,
    'conversion', coalesce((
      select json_object_agg(case when sim3d_on then 'on' else 'off' end, json_build_object(
        'freeDevices', free_devices,
        'converted', converted,
        'pctConverted', round(100.0 * converted / greatest(free_devices, 1), 2)
      ))
      from (
        select sim3d_on,
               count(*) filter (where was_free) as free_devices,
               count(*) filter (where converted) as converted
        from dev
        group by 1
      ) c
    ), '{}'::json),
    'defaultTest', coalesce((
      select json_object_agg(arm, json_build_object(
        'devices', devices,
        'pctHad3dOn', round(100.0 * had_on / greatest(devices, 1), 1),
        'pctSwitchedOff', round(100.0 * switched_off / greatest(devices, 1), 1),
        'sessionsPerDevice', round(coalesce(sessions, 0)::numeric / greatest(devices, 1), 2),
        'pctMultiDay', round(100.0 * multi_day / greatest(devices, 1), 1),
        'pctReturned7d', round(100.0 * returned / greatest(devices, 1), 1),
        'pctConverted', round(100.0 * converted / greatest(free_devices, 1), 2)
      ))
      from (
        select d.arm,
               count(*) as devices,
               count(*) filter (where d.sim3d_on) as had_on,
               count(*) filter (where d.switched_off) as switched_off,
               sum(p.sessions) as sessions,
               count(*) filter (where p.active_days >= 2) as multi_day,
               count(*) filter (where p.returned_7d) as returned,
               count(*) filter (where d.was_free) as free_devices,
               count(*) filter (where d.converted) as converted
        from dev d
        left join per_device p on p.device_id = d.device_id
        where d.arm in ('on', 'off')
        group by 1
      ) a
    ), '{}'::json)
  );
$$;

revoke all on function public.admin_sim3d_followup(timestamptz) from public;
revoke all on function public.admin_sim3d_followup(timestamptz) from anon;
revoke all on function public.admin_sim3d_followup(timestamptz) from authenticated;

-- Free-tier taste of the live audio broadcast (one drive a day, see /api/game-audio). One row per user per
-- UTC day; the route reserves lines atomically with game_audio_teaser_take() before rendering anything.
create table if not exists public.game_audio_teaser_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  lines int not null default 0,
  primary key (user_id, day)
);
alter table public.game_audio_teaser_usage enable row level security;
-- no policies: only the service role (the API route) reads or writes it

create or replace function public.game_audio_teaser_take(p_user uuid, p_lines int, p_cap int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
begin
  insert into game_audio_teaser_usage (user_id, day, lines)
  values (p_user, (now() at time zone 'utc')::date, 0)
  on conflict (user_id, day) do nothing;

  update game_audio_teaser_usage
     set lines = lines + p_lines
   where user_id = p_user
     and day = (now() at time zone 'utc')::date
     and lines + p_lines <= p_cap
  returning lines into v_used;

  return v_used is not null;
end;
$$;

revoke all on function public.game_audio_teaser_take(uuid, int, int) from public;
revoke all on function public.game_audio_teaser_take(uuid, int, int) from anon;
revoke all on function public.game_audio_teaser_take(uuid, int, int) from authenticated;
