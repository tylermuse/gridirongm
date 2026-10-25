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
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '../supabase/server';

const MAX_MESSAGE = 2000;

export interface FeedbackRow {
  id: string;
  message: string;
  page: string | null;
  created_at: string;
  user_id: string | null;
  app: string | null;
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

export function createFeedbackHandlers(app: string) {
  async function POST(request: Request) {
    try {
      const { message, page } = await request.json();
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return NextResponse.json({ error: 'Message is required' }, { status: 400 });
      }

      const service = getServiceClient();
      if (!service) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

      const userId = await currentUserId();
      const text = message.trim().slice(0, MAX_MESSAGE);
      const pagePath = typeof page === 'string' ? page.slice(0, 300) : null;

      const { error } = await service.from('feedback').insert({ user_id: userId, message: text, page: pagePath, app });
      if (!error) return NextResponse.json({ ok: true });

      // Table missing (migration not applied yet) or schema drift — keep the message.
      const fallback = await service.from('analytics_events').insert({
        user_id: userId,
        event: 'feedback',
        properties: { message: text, page: pagePath, app },
      });
      if (fallback.error) {
        console.error('[feedback] insert failed', error.message, fallback.error.message);
        return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });
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

    const [tableRes, eventsRes] = await Promise.all([
      service.from('feedback')
        .select('id, message, page, created_at, user_id, app')
        .order('created_at', { ascending: false })
        .limit(limit),
      service.from('analytics_events')
        .select('id, properties, created_at, user_id')
        .eq('event', 'feedback')
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);

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
      };
    });

    const feedback = [...fromTable, ...fromEvents]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
    return NextResponse.json({ feedback });
  }

  return { POST, GET };
}
