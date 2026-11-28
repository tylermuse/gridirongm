-- Audience for the win-back email: players who finished at least one season
-- in BS Football and have not been seen for 14+ days. Excludes opt-outs,
-- unconfirmed addresses and anyone already sent (or queued for) this campaign.
-- A failed send is retried on the next run.
--
-- Already applied to production on 2026-11-28; this file records it.
-- Service role only. Depends on 20261128_email_prefs_and_sends.sql.

create or replace function public.email_audience_winback(p_campaign text, p_limit integer default 80)
returns table (
  user_id uuid,
  email text,
  token uuid,
  team_name text,
  wins integer,
  losses integer,
  championships integer,
  seasons_played integer
)
language sql
volatile
security definer
set search_path = ''
as $$
  -- Accounts created after the backfill get their prefs row (and token) here.
  insert into public.email_prefs (user_id)
  select u.id from auth.users u
  where not exists (select 1 from public.email_prefs p where p.user_id = u.id)
  on conflict (user_id) do nothing;

  with last_act as (
    select m.user_id, max(m.minute) as last_seen
    from public.analytics_device_minutes m
    where m.user_id is not null
    group by m.user_id
  )
  select u.id, u.email::text, p.token, c.team_name,
         c.all_time_wins, c.all_time_losses, c.championships, c.seasons_played
  from auth.users u
  join public.gm_career_stats c on c.user_id = u.id
  join public.email_prefs p on p.user_id = u.id
  left join last_act a on a.user_id = u.id
  where u.email is not null
    and u.email_confirmed_at is not null
    and coalesce(u.is_anonymous, false) = false
    and p.marketing_opt_out = false
    and greatest(
          coalesce(a.last_seen, u.created_at),
          coalesce(u.last_sign_in_at, u.created_at)
        ) < now() - interval '14 days'
    and not exists (
          select 1 from public.email_sends s
          where s.user_id = u.id and s.campaign = p_campaign and s.status <> 'failed'
        )
  order by c.seasons_played desc, u.created_at
  limit greatest(p_limit, 0);
$$;

revoke all on function public.email_audience_winback(text, integer) from public, anon, authenticated;
grant execute on function public.email_audience_winback(text, integer) to service_role;
