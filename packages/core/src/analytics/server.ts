/**
 * @bs/core/analytics/server — shared POST handler for /api/analytics/track.
 *
 * Each app's route is a one-liner:
 *   export const POST = createTrackHandler('bs-football');
 *
 * Accepts two payload shapes:
 *   - batched (current client, ./track.ts): { events: [{ event, properties, ts }], deviceId }
 *   - legacy single event (old bundles still open in a tab): { event, properties, deviceId }
 *
 * One request = one auth lookup + one multi-row insert, regardless of batch size.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '../supabase/server';

function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

// Crawlers that execute JS (Googlebot renders our SSR roster pages) get a
// fresh localStorage every visit, so each render minted a new device_id and
// inflated Unique Devices. Drop them at the door.
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|quora link|vercel-screenshot|python-requests|curl|wget/i;

const MAX_EVENTS_PER_REQUEST = 50;
const MAX_PROPERTIES_BYTES = 4_000;
const EVENT_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
/** Clamp for reconstructing in-batch ordering from client timestamps. */
const MAX_BATCH_SPREAD_MS = 10 * 60 * 1000;

interface IncomingEvent {
  event?: unknown;
  properties?: unknown;
  ts?: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Supabase SSR stores the session in `sb-<ref>-auth-token` (possibly chunked). */
function hasAuthCookie(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  return /(?:^|;\s*)sb-[^=]*-auth-token/.test(cookie);
}

export function createTrackHandler(app: string) {
  return async function POST(request: Request) {
    try {
      const ua = request.headers.get('user-agent') ?? '';
      if (!ua || BOT_UA.test(ua)) {
        return NextResponse.json({ ok: true });
      }

      const body = await request.json();
      const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : null;
      const incoming: IncomingEvent[] = Array.isArray(body?.events)
        ? body.events
        : body?.event ? [{ event: body.event, properties: body.properties }] : [];

      const events = incoming
        .slice(0, MAX_EVENTS_PER_REQUEST)
        .filter((e): e is IncomingEvent & { event: string } =>
          typeof e?.event === 'string' && EVENT_NAME_RE.test(e.event));

      if (events.length === 0) {
        return NextResponse.json({ error: 'Missing event' }, { status: 400 });
      }

      const service = getServiceClient();
      if (!service) {
        return NextResponse.json({ ok: true }); // Supabase not configured, silently skip
      }

      // Only pay for an auth round-trip when there's a session cookie to check.
      // Most traffic is anonymous guests, who never have one.
      let userId: string | null = null;
      if (hasAuthCookie(request)) {
        try {
          const supabase = await createClient();
          const { data: { user } } = await supabase.auth.getUser();
          userId = user?.id ?? null;
        } catch {
          // No valid session — that's ok
        }
      }

      // Server clock is the source of truth for created_at (aggregates key off
      // it), but a batch can hold ~10s+ of events. Back-date each row by its
      // offset from the newest client ts so ordering within a batch survives
      // without trusting the client's absolute clock.
      const now = Date.now();
      const tsList = events.map(e => (typeof e.ts === 'number' && Number.isFinite(e.ts) ? e.ts : null));
      const newestTs = Math.max(...tsList.map(t => t ?? -Infinity));

      const rows = events.map((e, i) => {
        const props = isPlainObject(e.properties) ? e.properties : {};
        const safeProps = JSON.stringify(props).length <= MAX_PROPERTIES_BYTES ? props : { _truncated: true };
        const ts = tsList[i];
        const offset = ts !== null && Number.isFinite(newestTs)
          ? Math.min(Math.max(newestTs - ts, 0), MAX_BATCH_SPREAD_MS)
          : 0;
        return {
          user_id: userId,
          event: e.event,
          created_at: new Date(now - offset).toISOString(),
          properties: {
            ...safeProps,
            ...(deviceId ? { device_id: deviceId } : {}),
            app,
          },
        };
      });

      await service.from('analytics_events').insert(rows);

      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ ok: true }); // Never fail on analytics
    }
  };
}
