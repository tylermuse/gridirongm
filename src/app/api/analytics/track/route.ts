import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@/lib/supabase/server';

function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

export async function POST(request: Request) {
  try {
    const { event, properties } = await request.json();

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

    await service.from('analytics_events').insert({
      user_id: userId,
      event,
      properties: properties ?? {},
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Never fail on analytics
  }
}
