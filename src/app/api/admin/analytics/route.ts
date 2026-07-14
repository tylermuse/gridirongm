import { NextResponse, type NextRequest } from 'next/server';
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

export async function GET(request: NextRequest) {
  try {
    // Verify the caller is an admin
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized', detail: authError?.message }, { status: 401 });
    }

    const service = getServiceClient();
    if (!service) {
      return NextResponse.json({
        error: 'Not configured',
        detail: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
      }, { status: 500 });
    }

    const { data: profile, error: profileError } = await service
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json({
        error: 'Profile lookup failed',
        detail: profileError.message,
      }, { status: 500 });
    }

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse period
    const period = request.nextUrl.searchParams.get('period') ?? '30d';
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // All aggregation happens in Postgres (see
    // supabase/migrations/20260712_analytics_aggregates.sql).
    //
    // Do NOT be tempted to go back to `.select()`-ing rows and tallying them
    // here: PostgREST caps row-returning requests at `db-max-rows` (1000 on
    // Supabase hosted), so any JS-side aggregate over a table this size is
    // computed on an arbitrary truncated slice and silently under-reports.
    const [summaryRes, recentEventsRes, subscriptionCountRes] = await Promise.all([
      service.rpc('admin_analytics_summary', { p_since: since }),

      service.from('analytics_events')
        .select('event, properties, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(50),

      service.from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'trialing']),
    ]);

    if (summaryRes.error) {
      return NextResponse.json({
        period,
        totalUsers: 0,
        activeUsers: 0,
        uniqueDevices: 0,
        sessions: 0,
        pageViews: 0,
        conversionRate: 0,
        totalSubscriptions: 0,
        signupsByDay: {},
        topPages: [],
        recentEvents: [],
        _warning:
          `admin_analytics_summary RPC failed: ${summaryRes.error.message}. ` +
          `Run supabase/migrations/20260712_analytics_aggregates.sql.`,
      });
    }

    const summary = (summaryRes.data ?? {}) as {
      totalUsers?: number;
      newUsers?: number;
      grandfatheredUsers?: number;
      convertibleUsers?: number;
      activeUsers?: number;
      uniqueDevices?: number;
      sessions?: number;
      pageViews?: number;
      signupEvents?: number;
      signupsByDay?: Record<string, number>;
      topPages?: { path: string; count: number }[];
    };

    // Conversion = subscribers / users who are actually ABLE to subscribe.
    //
    // Founding Members (signed up before 2026-05-01) get Premium free forever,
    // so they can never convert. As of Jul 2026 that's 165 of 256 accounts —
    // dividing by all users would fold a structurally unconvertible 64% into
    // the denominator and permanently understate the rate.
    //
    // Also deliberately NOT the raw `signup` event count: those rows are
    // duplicated ~2.6x per human by the old supabase SIGNED_IN re-fire bug.
    const convertibleUsers = summary.convertibleUsers ?? 0;
    const totalSubscriptions = subscriptionCountRes.count ?? 0;
    const conversionRate = convertibleUsers > 0 ? totalSubscriptions / convertibleUsers : 0;

    return NextResponse.json({
      period,
      totalUsers: summary.totalUsers ?? 0,               // all-time, from auth.users
      newUsers: summary.newUsers ?? 0,                   // in-window
      grandfatheredUsers: summary.grandfatheredUsers ?? 0,
      convertibleUsers,
      activeUsers: summary.activeUsers ?? 0,             // in-window
      uniqueDevices: summary.uniqueDevices ?? 0,         // in-window, upper bound on humans
      sessions: summary.sessions ?? 0,
      pageViews: summary.pageViews ?? 0,
      conversionRate,
      totalSubscriptions,
      signupsByDay: summary.signupsByDay ?? {},
      topPages: summary.topPages ?? [],
      recentEvents: recentEventsRes.data ?? [],
    });
  } catch (err) {
    console.error('Analytics API error:', err);
    return NextResponse.json({
      error: 'Internal server error',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
