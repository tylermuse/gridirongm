import { NextResponse, type NextRequest } from 'next/server';
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

    // Check if analytics_events table exists by doing a small query
    const { error: tableCheck } = await service
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    if (tableCheck) {
      // Table doesn't exist — return empty data with a helpful message
      return NextResponse.json({
        period,
        totalUsers: 0,
        activeUsers: 0,
        pageViews: 0,
        conversionRate: 0,
        totalSubscriptions: 0,
        signupsByDay: {},
        topPages: [],
        recentEvents: [],
        _warning: `analytics_events table error: ${tableCheck.message}. Run the SQL migration to create it.`,
      });
    }

    // Run all queries in parallel
    const [
      totalUsersRes,
      activeUsersRes,
      pageViewsRes,
      signupsRes,
      signupsByDayRes,
      topPagesRes,
      recentEventsRes,
      subscriptionCountRes,
    ] = await Promise.all([
      service.from('analytics_events')
        .select('user_id')
        .eq('event', 'signup'),

      service.from('analytics_events')
        .select('user_id')
        .gte('created_at', since)
        .not('user_id', 'is', null),

      service.from('analytics_events')
        .select('id', { count: 'exact', head: true })
        .eq('event', 'page_view')
        .gte('created_at', since),

      service.from('analytics_events')
        .select('id', { count: 'exact', head: true })
        .eq('event', 'signup'),

      service.from('analytics_events')
        .select('created_at')
        .eq('event', 'signup')
        .gte('created_at', since)
        .order('created_at', { ascending: true }),

      service.from('analytics_events')
        .select('properties')
        .eq('event', 'page_view')
        .gte('created_at', since)
        .limit(5000),

      service.from('analytics_events')
        .select('event, properties, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(50),

      service.from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'trialing']),
    ]);

    // Compute active users (distinct user_ids)
    const activeUserIds = new Set(
      (activeUsersRes.data ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean),
    );

    // Count total unique signups
    const totalSignupUserIds = new Set(
      (totalUsersRes.data ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean),
    );

    // Aggregate signups by day
    const signupsByDay: Record<string, number> = {};
    for (const row of signupsByDayRes.data ?? []) {
      const day = (row as { created_at: string }).created_at.slice(0, 10);
      signupsByDay[day] = (signupsByDay[day] ?? 0) + 1;
    }

    // Aggregate top pages
    const pageCounts: Record<string, number> = {};
    for (const row of topPagesRes.data ?? []) {
      const path = (row as { properties: { path?: string } }).properties?.path ?? 'unknown';
      pageCounts[path] = (pageCounts[path] ?? 0) + 1;
    }
    const topPages = Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    // Conversion rate
    const totalSignups = signupsRes.count ?? 0;
    const totalSubscriptions = subscriptionCountRes.count ?? 0;
    const conversionRate = totalSignups > 0 ? totalSubscriptions / totalSignups : 0;

    return NextResponse.json({
      period,
      totalUsers: totalSignupUserIds.size,
      activeUsers: activeUserIds.size,
      pageViews: pageViewsRes.count ?? 0,
      conversionRate,
      totalSubscriptions,
      signupsByDay,
      topPages,
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
