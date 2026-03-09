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
  // Verify the caller is an admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const { data: profile } = await service
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse period
  const period = request.nextUrl.searchParams.get('period') ?? '30d';
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

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
    // Total unique users (all time)
    service.from('analytics_events')
      .select('user_id')
      .eq('event', 'signup'),

    // Active users in period (distinct users with any event)
    service.from('analytics_events')
      .select('user_id')
      .gte('created_at', since)
      .not('user_id', 'is', null),

    // Page views in period
    service.from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'page_view')
      .gte('created_at', since),

    // Total signups (all time)
    service.from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'signup'),

    // Signups by day in period
    service.from('analytics_events')
      .select('created_at')
      .eq('event', 'signup')
      .gte('created_at', since)
      .order('created_at', { ascending: true }),

    // Top pages in period
    service.from('analytics_events')
      .select('properties')
      .eq('event', 'page_view')
      .gte('created_at', since)
      .limit(5000),

    // Recent events (last 50)
    service.from('analytics_events')
      .select('event, properties, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(50),

    // Subscription conversions
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
}
