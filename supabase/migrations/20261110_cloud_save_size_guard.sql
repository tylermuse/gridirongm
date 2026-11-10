-- Cloud save size guard (server side)
--
-- Applied to the live Supabase project 2026-11-10 (21:08 UTC); committed here
-- so the schema is tracked in-repo. CI does not run migrations.
--
-- Why: on 2026-11-10 two Football leagues of 90-108 MB uploaded themselves to
-- public.cloud_saves on every autosave. Each upload ran the instance out of
-- memory and restarted Postgres about 40 seconds later (22 restarts in 2.5 h).
-- The app now refuses to send anything over 20 MB, but a browser tab that
-- loaded before that fix keeps the old code until it is reloaded, so the
-- database has to protect itself too.
--
-- How: PostgREST calls a "pre-request" function at the start of each request's
-- transaction, before it runs the request's own statement. Raising there ends
-- the request without the payload being handed to Postgres. PostgREST itself
-- still has to receive the body, so this lowers the memory hit rather than
-- removing it.
--
-- PostgREST allows one pre-request function. None was configured before this
-- one; anything added later has to go inside it, not replace it:
--   select rolconfig from pg_roles where rolname = 'authenticator';
--
-- To undo:
--   alter role authenticator reset pgrst.db_pre_request;
--   notify pgrst, 'reload config';
--   drop function if exists public.reject_oversized_cloud_save();

create or replace function public.reject_oversized_cloud_save()
returns void
language plpgsql
as $$
declare
  -- The JSON body carries the save as an escaped string, so it runs larger
  -- than the app's 20 MB payload limit; 32 MB leaves room for that.
  max_bytes constant bigint := 32 * 1024 * 1024;
  body_bytes bigint;
begin
  if current_setting('request.method', true) not in ('POST', 'PATCH', 'PUT') then
    return;
  end if;
  if coalesce(current_setting('request.path', true), '') not like '%/cloud_saves' then
    return;
  end if;

  begin
    body_bytes := nullif(current_setting('request.headers', true)::json ->> 'content-length', '')::bigint;
  exception when others then
    return; -- an unreadable header is not a reason to refuse a save
  end;

  if body_bytes > max_bytes then
    -- Reaches the client as an HTTP 500 carrying this message and code 54000
    -- (checked against production with a 33 MB test upload on 2026-11-10).
    raise exception 'Cloud save is too large to sync (% MB, limit % MB)',
      round(body_bytes / 1048576.0), max_bytes / 1048576
      using errcode = '54000';
  end if;
end;
$$;

alter function public.reject_oversized_cloud_save() set search_path = '';
grant execute on function public.reject_oversized_cloud_save() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.reject_oversized_cloud_save';
notify pgrst, 'reload config';
