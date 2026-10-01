import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@bs/core/supabase/server';

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

export async function POST(request: Request) {
  try {
    const ua = request.headers.get('user-agent') ?? '';
    if (!ua || BOT_UA.test(ua)) {
      return NextResponse.json({ ok: true });
    }

    const { event, properties, deviceId } = await request.json();

    if (!event || typeof event !== 'string') {
      return NextResponse.json({ error: 'Missing event' }, { status: 400 });
    }

    const service = getServiceClient();
    if (!service) {
      return NextResponse.json({ ok: true }); // Supabase not configured, silently skip
    }

    // Try to get user from session (optional — anonymous events are fine)
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // No session — that's ok
    }

    // Store device_id in properties for anonymous user tracking
    const enrichedProperties = {
      ...(properties ?? {}),
      ...(deviceId ? { device_id: deviceId } : {}),
      app: 'bs-football',
    };

    await service.from('analytics_events').insert({
      user_id: userId,
      event,
      properties: enrichedProperties,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Never fail on analytics
  }
}
