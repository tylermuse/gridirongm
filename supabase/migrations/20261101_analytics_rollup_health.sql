-- /admin/analytics self-diagnosis for the rollup pipeline (20261025_analytics_rollups).
--
-- On 2026-10-31 the page's Summary / Active users / 3D cohorts / Feature usage
-- reports all died with "canceling statement due to statement timeout" at 7d,
-- 30d and 90d, which is what the raw-table versions of those reports did
-- before 20261025. Nothing on the page said whether the rollup migration was
-- applied, whether the backfill had been run, or whether the trigger was
-- still firing. This function answers those questions so the route can show
-- them in the warning banner instead of leaving a founder to guess.
--
-- Every check here is cheap on purpose: index-backed min/max, catalog lookups,
-- and counts over the small rollup tables. It never scans analytics_events.
--
-- Returned json:
--   applied            rollup tables exist
--   startedAt          analytics_rollup_meta.started_at (live rows begin here)
--   trigger            'enabled' | 'disabled' | 'missing'
--   functionsOnRollups { admin_analytics_summary: bool, ... } — does each
--                      report's current definition read a rollup table?
--   latestEventAt      newest analytics_events.created_at
--   latestMinute       newest analytics_device_minutes.minute
--   lagSeconds         latestEventAt - latestMinute (should be ~0–60)
--   earliestMinute     oldest rollup minute — the page's 90d window needs this
--                      to be >= 90 days before now
--   backfillRows30d / liveRows30d   device-minute rows per src, last 30 days
--   uiDays30d          analytics_ui_days rows, last 30 days
--   timeouts           statement_timeout configured per API role
create or replace function public.admin_analytics_health()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_started timestamptz;
  v_trigger text;
  v_latest_event timestamptz;
  v_latest_minute timestamptz;
  v_earliest_minute timestamptz;
  v_backfill bigint;
  v_live bigint;
  v_ui bigint;
  v_fn json;
  v_timeouts json;
begin
  if to_regclass('public.analytics_device_minutes') is null
     or to_regclass('public.analytics_ui_days') is null
     or to_regclass('public.analytics_rollup_meta') is null then
    return json_build_object('applied', false);
  end if;

  select started_at into v_started from analytics_rollup_meta;

  select case tgenabled when 'D' then 'disabled' else 'enabled' end into v_trigger
  from pg_trigger
  where tgname = 'analytics_rollup_event' and tgrelid = 'public.analytics_events'::regclass;
  v_trigger := coalesce(v_trigger, 'missing');

  -- analytics_events_created_idx (created_at desc) makes this a one-row index read.
  select created_at into v_latest_event from analytics_events order by created_at desc limit 1;
  select max(minute), min(minute) into v_latest_minute, v_earliest_minute from analytics_device_minutes;

  select count(*) filter (where src = 'backfill'), count(*) filter (where src = 'live')
    into v_backfill, v_live
  from analytics_device_minutes
  where minute >= now() - interval '30 days';

  select count(*) into v_ui from analytics_ui_days where day >= (now() - interval '30 days')::date;

  select json_object_agg(p.proname, def ilike '%analytics_device_minutes%' or def ilike '%analytics_ui_days%')
    into v_fn
  from (
    select proname, pg_get_functiondef(oid) as def
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('admin_analytics_summary', 'admin_active_users', 'admin_sim3d_cohorts', 'admin_interaction_report')
  ) p;

  select json_object_agg(r.rolname, coalesce(
    (select split_part(s, '=', 2) from unnest(rs.setconfig) s where s like 'statement_timeout=%'),
    'default'))
    into v_timeouts
  from pg_roles r
  left join pg_db_role_setting rs on rs.setrole = r.oid and rs.setdatabase = 0
  where r.rolname in ('anon', 'authenticated', 'service_role', 'authenticator');

  return json_build_object(
    'applied', true,
    'startedAt', v_started,
    'trigger', v_trigger,
    'functionsOnRollups', coalesce(v_fn, '{}'::json),
    'latestEventAt', v_latest_event,
    'latestMinute', v_latest_minute,
    'lagSeconds', case when v_latest_event is null or v_latest_minute is null then null
                       else round(extract(epoch from (v_latest_event - v_latest_minute))) end,
    'earliestMinute', v_earliest_minute,
    'backfillRows30d', v_backfill,
    'liveRows30d', v_live,
    'uiDays30d', v_ui,
    'timeouts', coalesce(v_timeouts, '{}'::json)
  );
end;
$$;

revoke all on function public.admin_analytics_health() from public;
revoke all on function public.admin_analytics_health() from anon;
revoke all on function public.admin_analytics_health() from authenticated;
