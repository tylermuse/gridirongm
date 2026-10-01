-- Cloud Saves — account-linked cross-device save storage (idempotent)
-- Applied to the live Supabase project 2026-09-20; committed here so the
-- schema is tracked in-repo. CI does not run migrations.
create table if not exists public.cloud_saves (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  slot       text        not null,
  payload    text        not null,
  device_id  text,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table public.cloud_saves enable row level security;
drop policy if exists cloud_saves_rw_own on public.cloud_saves;
create policy cloud_saves_rw_own on public.cloud_saves
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists cloud_saves_user_updated_idx
  on public.cloud_saves (user_id, updated_at desc);
