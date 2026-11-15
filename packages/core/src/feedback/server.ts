/**
 * @bs/core/feedback/server — shared /api/feedback handlers for both apps.
 *
 *   export const { POST, GET } = createFeedbackHandlers('bs-hoops');
 *
 * Feedback goes to the `feedback` table (supabase/migrations/20261025_feedback.sql).
 * That table was never created when the widget first shipped (Mar 2026), and the
 * old route ignored the insert error, so every message was silently dropped while
 * the user saw "Thanks!". Until the migration is applied, POST falls back to an
 * `analytics_events` row (event 'feedback'), and GET reads from both, so nothing
 * is lost either way. POST now reports a real failure instead of a fake ok.
 *
 * Instant answers (opt-in per app): pass `{ answer }` and POST will, after the
 * message is safely stored, ask that function to classify the message and
 * answer it if it is a how-to question. The result rides back in the response
 * so the modal can show it. Each call is logged as an `analytics_events` row
 * ('feedback_ai'), which is also what the rate limits count; the player's
 * "did this help?" click (PATCH) is a 'feedback_rating' row. Nothing here
 * needs a migration, and a slow or failing answer never blocks the save.
 */

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '../supabase/server';

const MAX_MESSAGE = 2000;
const KINDS = new Set(['bug', 'idea', 'question']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Instant answers ──────────────────────────────────────────────────────────
const AI_KINDS = new Set(['question', 'bug', 'idea', 'other']);
const MAX_ANSWER = 700;
/** The answer must never hold up "your message was sent". */
const ANSWER_TIMEOUT_MS = 7000;
/** /api/feedback is open to anonymous players, so cap what one address and the whole app can spend. */
const ANSWERS_PER_IP_PER_HOUR = 8;
const ANSWERS_PER_DAY = 1500;
const AI_EVENT = 'feedback_ai';
const RATING_EVENT = 'feedback_rating';
const ROW_ID_RE = /^(ev-)?[0-9a-f-]{1,64}$/i;

export interface FeedbackAnswerInput {
  message: string;
  /** What the player picked in the modal, if anything. */
  kind: string | null;
  page: string | null;
  context: Record<string, string | number | boolean> | null;
}

export interface FeedbackAnswer {
  /** What the message actually is, which is often not what the player picked. */
  kind: 'question' | 'bug' | 'idea' | 'other';
  /** A short answer, only when the message is a question the app can answer for sure. */
  answer: string | null;
}

export type FeedbackAnswerFn = (input: FeedbackAnswerInput) => Promise<FeedbackAnswer | null>;

export interface FeedbackHandlerOptions {
  answer?: FeedbackAnswerFn;
}

function clientIpHash(request: Request): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Keep client context small and flat: scalar values only, capped. */
function cleanContext(raw: unknown): Record<string, string | number | boolean> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 20)) {
    if (typeof v === 'string') out[k.slice(0, 40)] = v.slice(0, 200);
    else if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean') out[k.slice(0, 40)] = v;
  }
  return Object.keys(out).length ? out : null;
}

export interface FeedbackRow {
  id: string;
  message: string;
  page: string | null;
  created_at: string;
  user_id: string | null;
  app: string | null;
  kind?: string | null;
  contact?: string | null;
  context?: Record<string, unknown> | null;
  /** Instant-answer result, when one was attempted. */
  ai_kind?: string | null;
  ai_answer?: string | null;
  /** The player's "did this help?" click on that answer. */
  ai_helpful?: boolean | null;
}

function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null; // Anonymous feedback is fine
  }
}

type ServiceClient = NonNullable<ReturnType<typeof getServiceClient>>;

/** True while both this address and the app as a whole are under their answer caps. */
async function underAnswerLimits(service: ServiceClient, ipHash: string): Promise<boolean> {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [mine, all] = await Promise.all([
    service.from('analytics_events').select('id', { count: 'exact', head: true })
      .eq('event', AI_EVENT).gte('created_at', hourAgo).eq('properties->>ip', ipHash),
    service.from('analytics_events').select('id', { count: 'exact', head: true })
      .eq('event', AI_EVENT).gte('created_at', dayAgo),
  ]);
  // If the count itself fails, don't answer: an unmetered open endpoint is the worse failure.
  if (mine.error || all.error) return false;
  return (mine.count ?? 0) < ANSWERS_PER_IP_PER_HOUR && (all.count ?? 0) < ANSWERS_PER_DAY;
}

export function createFeedbackHandlers(app: string, options: FeedbackHandlerOptions = {}) {
  /** Classify + maybe answer a stored message. Never throws; null means "no answer to show". */
  async function instantAnswer(
    service: ServiceClient,
    request: Request,
    rowId: string | null,
    input: FeedbackAnswerInput,
  ): Promise<FeedbackAnswer | null> {
    if (!options.answer) return null;
    try {
      const ipHash = clientIpHash(request);
      if (!(await underAnswerLimits(service, ipHash))) return null;

      const raw = await withTimeout(options.answer(input).catch(() => null), ANSWER_TIMEOUT_MS);
      const kind = raw && AI_KINDS.has(raw.kind) ? raw.kind : null;
      const answer = raw && kind === 'question' && typeof raw.answer === 'string' && raw.answer.trim()
        ? raw.answer.trim().slice(0, MAX_ANSWER)
        : null;

      // Logged even when there is no answer: this row is what the caps count.
      await service.from('analytics_events').insert({
        user_id: null,
        event: AI_EVENT,
        properties: { ref: rowId, app, ip: ipHash, kind, answer, failed: raw == null },
      });
      return kind ? { kind, answer } : null;
    } catch (e) {
      console.error('[feedback] instant answer failed', e instanceof Error ? e.message : e);
      return null;
    }
  }

  async function POST(request: Request) {
    try {
      const body = await request.json();
      const { message, page } = body ?? {};
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return NextResponse.json({ error: 'Message is required' }, { status: 400 });
      }

      const service = getServiceClient();
      if (!service) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

      // The in-game modal sends includeAccount explicitly (anonymous unless
      // ticked); older callers that don't send it keep attaching the user.
      const includeAccount = typeof body.includeAccount === 'boolean' ? body.includeAccount : true;
      const userId = includeAccount ? await currentUserId() : null;
      const text = message.trim().slice(0, MAX_MESSAGE);
      const pagePath = typeof page === 'string' ? page.slice(0, 300) : null;
      const kind = KINDS.has(body.kind) ? (body.kind as string) : null;
      const contact = typeof body.contact === 'string' && EMAIL_RE.test(body.contact.trim())
        ? body.contact.trim().slice(0, 200)
        : null;
      const context = cleanContext(body.context);

      const full = { user_id: userId, message: text, page: pagePath, app, kind, contact, context };
      let rowId: string | null = null;
      let { data: saved, error } = await service.from('feedback').insert(full).select('id').single();
      if (error) {
        // kind/contact/context columns not migrated yet (20261110_feedback_kind.sql):
        // keep the message in the base columns, with the kind + reply email inline.
        const prefix = [kind && `[${kind}]`, contact && `[reply: ${contact}]`].filter(Boolean).join(' ');
        ({ data: saved, error } = await service.from('feedback').insert({
          user_id: userId,
          message: (prefix ? `${prefix} ${text}` : text).slice(0, MAX_MESSAGE),
          page: pagePath,
          app,
        }).select('id').single());
      }
      if (!error) {
        rowId = saved?.id != null ? String(saved.id) : null;
      } else {
        // Table missing (migration not applied yet) or schema drift — keep the message.
        const fallback = await service.from('analytics_events').insert({
          user_id: userId,
          event: 'feedback',
          properties: { message: text, page: pagePath, app, kind, contact, context },
        }).select('id').single();
        if (fallback.error) {
          console.error('[feedback] insert failed', error.message, fallback.error.message);
          return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });
        }
        rowId = fallback.data?.id != null ? `ev-${fallback.data.id}` : null;
      }

      // The message is stored. Anything from here on is a bonus for the player.
      const ai = await instantAnswer(service, request, rowId, { message: text, kind, page: pagePath, context });
      return NextResponse.json({
        ok: true,
        ...(ai?.answer && rowId ? { id: rowId, answer: ai.answer } : {}),
      });
    } catch {
      return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });
    }
  }

  /** "Did this help?" on an instant answer. Anonymous, so it only ever records a yes/no against a row id. */
  async function PATCH(request: Request) {
    try {
      const body = await request.json();
      const id = typeof body?.id === 'string' && ROW_ID_RE.test(body.id) ? body.id : null;
      if (!id || typeof body.helpful !== 'boolean') {
        return NextResponse.json({ error: 'Bad request' }, { status: 400 });
      }
      const service = getServiceClient();
      if (!service) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

      // Only rate a message that actually got an answer, and only once.
      const [answered, rated] = await Promise.all([
        service.from('analytics_events').select('id', { count: 'exact', head: true })
          .eq('event', AI_EVENT).eq('properties->>ref', id).not('properties->>answer', 'is', null),
        service.from('analytics_events').select('id', { count: 'exact', head: true })
          .eq('event', RATING_EVENT).eq('properties->>ref', id),
      ]);
      if (!answered.count) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (!rated.count) {
        await service.from('analytics_events').insert({
          user_id: null,
          event: RATING_EVENT,
          properties: { ref: id, app, helpful: body.helpful },
        });
      }
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
  }

  /** Admin-only: recent feedback from both apps, newest first. */
  async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();
    if (!service) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

    const { data: profile } = await service.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50') || 50, 100);

    const [tableRes, eventsRes, aiRes] = await Promise.all([
      service.from('feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit),
      service.from('analytics_events')
        .select('id, properties, created_at, user_id')
        .eq('event', 'feedback')
        .order('created_at', { ascending: false })
        .limit(limit),
      service.from('analytics_events')
        .select('event, properties')
        .in('event', [AI_EVENT, RATING_EVENT])
        .order('created_at', { ascending: false })
        .limit(limit * 4),
    ]);

    // Instant answers and their ratings, keyed by the feedback row they belong to.
    const ai = new Map<string, { kind: string | null; answer: string | null }>();
    const helpful = new Map<string, boolean>();
    for (const r of aiRes.data ?? []) {
      const p = (r.properties ?? {}) as Record<string, unknown>;
      if (typeof p.ref !== 'string') continue;
      if (r.event === RATING_EVENT) {
        if (typeof p.helpful === 'boolean') helpful.set(p.ref, p.helpful);
      } else if (!ai.has(p.ref)) {
        ai.set(p.ref, {
          kind: typeof p.kind === 'string' ? p.kind : null,
          answer: typeof p.answer === 'string' ? p.answer : null,
        });
      }
    }

    const fromTable: FeedbackRow[] = tableRes.error ? [] : (tableRes.data ?? []) as FeedbackRow[];
    const fromEvents: FeedbackRow[] = (eventsRes.data ?? []).map(r => {
      const p = (r.properties ?? {}) as Record<string, unknown>;
      return {
        id: `ev-${r.id}`,
        message: typeof p.message === 'string' ? p.message : '',
        page: typeof p.page === 'string' ? p.page : null,
        created_at: r.created_at as string,
        user_id: (r.user_id as string | null) ?? null,
        app: typeof p.app === 'string' ? p.app : null,
        kind: typeof p.kind === 'string' ? p.kind : null,
        contact: typeof p.contact === 'string' ? p.contact : null,
        context: p.context && typeof p.context === 'object' ? p.context as Record<string, unknown> : null,
      };
    });

    const feedback = [...fromTable, ...fromEvents]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map(row => {
        const hit = ai.get(String(row.id));
        return hit
          ? { ...row, ai_kind: hit.kind, ai_answer: hit.answer, ai_helpful: helpful.get(String(row.id)) ?? null }
          : row;
      });
    return NextResponse.json({ feedback });
  }

  return { POST, GET, PATCH };
}
