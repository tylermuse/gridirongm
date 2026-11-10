-- "Feedback & questions" modal (Nov 2026): what kind of message it is, an
-- optional reply email, and light context (season/phase, viewport, UA).
-- Until this runs, @bs/core/feedback/server writes the base columns and puts
-- the kind + reply email inline in the message, so nothing is lost.

alter table public.feedback add column if not exists kind text;      -- 'bug' | 'idea' | 'question' | null (legacy bubble)
alter table public.feedback add column if not exists contact text;   -- reply email, only if the player gave one
alter table public.feedback add column if not exists context jsonb;

create index if not exists feedback_kind_idx on public.feedback (kind);
