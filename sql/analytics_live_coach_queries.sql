-- Ad-hoc queries for the Live Coach + onboarding events added in
-- feat/analytics-batching-livecoach. Run in the Supabase SQL editor.
-- All football rows: coalesce(properties->>'app','bs-football') = 'bs-football'.

-- 1. Live Coach usage per game (last 30 days):
--    how many managed games started it, how many plays users actually called,
--    and how the game ended (played out / auto-sim / toggled off / End Game / abandoned).
with started as (
  select properties->>'device_id' as device_id, properties->>'game_id' as game_id, min(created_at) as started_at
  from analytics_events
  where event = 'live_coach_started' and created_at > now() - interval '30 days'
  group by 1, 2
),
calls as (
  select properties->>'device_id' as device_id, properties->>'game_id' as game_id, count(*) as plays_called
  from analytics_events
  where event = 'live_coach_play_called' and created_at > now() - interval '30 days'
  group by 1, 2
),
finished as (
  select distinct on (properties->>'device_id', properties->>'game_id')
    properties->>'device_id' as device_id, properties->>'game_id' as game_id, properties->>'ended_by' as ended_by
  from analytics_events
  where event = 'live_coach_game_finished' and created_at > now() - interval '30 days'
  order by properties->>'device_id', properties->>'game_id', created_at desc
)
select
  count(*)                                                        as games_started,
  count(*) filter (where coalesce(c.plays_called, 0) = 0)         as games_zero_calls,
  count(*) filter (where c.plays_called between 1 and 9)          as games_1_to_9_calls,
  count(*) filter (where c.plays_called >= 10)                    as games_10plus_calls,
  round(avg(coalesce(c.plays_called, 0)), 1)                      as avg_calls_per_game,
  percentile_cont(0.5) within group (order by coalesce(c.plays_called, 0)) as median_calls,
  count(*) filter (where f.ended_by = 'played')                   as ended_played_out,
  count(*) filter (where f.ended_by = 'auto_sim')                 as ended_auto_sim,
  count(*) filter (where f.ended_by = 'off')                      as ended_toggled_off,
  count(*) filter (where f.ended_by = 'end_game')                 as ended_end_game,
  count(*) filter (where f.game_id is null)                       as left_mid_game
from started s
left join calls c using (device_id, game_id)
left join finished f using (device_id, game_id);

-- 2. Share of devices that called at least one play (last 30 days).
select
  count(distinct properties->>'device_id') filter (where event = 'live_coach_started')     as devices_started,
  count(distinct properties->>'device_id') filter (where event = 'live_coach_play_called') as devices_called_a_play
from analytics_events
where event in ('live_coach_started', 'live_coach_play_called')
  and created_at > now() - interval '30 days';

-- 3. Most-called plays.
select properties->>'play' as play, count(*) as n
from analytics_events
where event = 'live_coach_play_called' and created_at > now() - interval '30 days'
group by 1 order by 2 desc;

-- 4. Onboarding funnel by device (last 30 days):
--    created a league -> simmed a week -> finished a season -> finished 2+ seasons.
with d as (
  select properties->>'device_id' as device_id,
    bool_or(event = 'league_created')                                              as created,
    bool_or(event = 'week_simmed')                                                 as simmed,
    bool_or(event = 'season_completed')                                            as season1,
    bool_or(event = 'season_completed' and (properties->>'seasons_completed')::int >= 2) as season2
  from analytics_events
  where event in ('league_created', 'week_simmed', 'season_completed')
    and created_at > now() - interval '30 days'
    and coalesce(properties->>'app', 'bs-football') = 'bs-football'
  group by 1
)
select
  count(*) filter (where created)            as created_league,
  count(*) filter (where created and simmed) as simmed_a_week,
  count(*) filter (where created and season1) as finished_season_1,
  count(*) filter (where created and season2) as finished_season_2
from d;
