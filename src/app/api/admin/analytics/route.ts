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

/** Wall-clock each report so the page can say which one is slow, not just which one died. */
async function timed<T>(label: string, p: PromiseLike<T>, timings: Record<string, number>): Promise<T> {
  const t0 = Date.now();
  try {
    return await p;
  } finally {
    timings[label] = Date.now() - t0;
  }
}

/** PostgREST's message when an RPC isn't in the schema cache — i.e. its migration hasn't been applied. */
const MISSING_FN = /Could not find the function|does not exist/i;

// ---------------------------------------------------------------------------
// Report cache. The database is a Nano/Micro instance (2 shared cores); on
// 2026-11-01 one page load fired five multi-second reports at it in parallel,
// a 7d/30d/90d click fired five more before the first batch finished, and
// pg_stat_activity showed seven admin reports 30-46 s in while a player's
// analytics INSERT waited 11 s behind them. The page has exactly one reader,
// so the numbers do not need to be fresher than a few minutes:
//   - each report result is kept in memory for CACHE_TTL_MS, keyed by report
//     name + period, so a reload or a period switch is served instantly;
//   - an in-flight report is shared, so a second request while one is running
//     waits on the same promise instead of starting a duplicate;
//   - at most HEAVY_CONCURRENCY uncached reports run at once, so the page
//     never pins both cores and starves the game's own queries.
// Failures are not cached. This is per warm serverless instance, which is all
// one reader needs; a cold start just pays the full cost once.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 5 * 60 * 1000;
const HEAVY_CONCURRENCY = 2;

type RpcResult = { data: unknown; error: { message: string } | null };
type CacheEntry = { at: number; result: RpcResult };
const reportCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<RpcResult>>();

let running = 0;
const waiters: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= HEAVY_CONCURRENCY) await new Promise<void>(resolve => waiters.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiters.shift()?.();
  }
}

/** Run a heavy report through the cache + in-flight dedup + concurrency gate. Records cache age for the page. */
function cachedReport(
  key: string,
  run: () => PromiseLike<RpcResult>,
  cacheAge: Record<string, number>,
): Promise<RpcResult> {
  const hit = reportCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    cacheAge[key] = Date.now() - hit.at;
    return Promise.resolve(hit.result);
  }
  const pending = inFlight.get(key);
  if (pending) return pending;

  const p = withSlot(async () => {
    const result = await run();
    if (!result.error) reportCache.set(key, { at: Date.now(), result });
    return result;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
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

    // All aggregation happens in Postgres. Since 20261025_analytics_rollups every
    // report reads the small rollup tables (analytics_device_minutes,
    // analytics_page_hours, analytics_ui_days) that a trigger on analytics_events
    // keeps current; the raw 650 MB table is only touched for the live feed and
    // the rare sim3d / signup rows that have their own partial indexes.
    //
    // Do NOT be tempted to go back to `.select()`-ing rows and tallying them
    // here: PostgREST caps row-returning requests at `db-max-rows` (1000 on
    // Supabase hosted), so any JS-side aggregate over a table this size is
    // computed on an arbitrary truncated slice and silently under-reports.
    const timings: Record<string, number> = {};
    const cacheAge: Record<string, number> = {};
    // Heavy reports go through the cache (see top of file); the three cheap
    // index-backed reads below do not, so the live feed and health line are
    // always current.
    const [summaryRes, recentEventsRes, subscriptionCountRes, activeRes, hoopsActiveRes, sim3dRes, interactionsRes, healthRes] = await Promise.all([
      timed('summary', cachedReport(`summary:${period}`, () => service.rpc('admin_analytics_summary', { p_since: since }), cacheAge), timings),

      timed('recentEvents', service.from('analytics_events')
        .select('event, properties, created_at, user_id')
        // hovers + time-on-page rows would bury everything else in the live feed
        .not('event', 'in', '(ui_hover,page_engagement)')
        .order('created_at', { ascending: false })
        .limit(50), timings),

      timed('subscriptions', service.from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'trialing']), timings),

      // DAU / WAU / MAU — rolling windows, independent of `period`.
      // See supabase/migrations/20260930_active_user_metrics.sql.
      timed('activeUsers', cachedReport('activeUsers', () => service.rpc('admin_active_users', { p_app: 'bs-football' }), cacheAge), timings),
      timed('hoopsActiveUsers', cachedReport('hoopsActiveUsers', () => service.rpc('admin_active_users', { p_app: 'bs-hoops' }), cacheAge), timings),
      // 3D live sim launch experiment: free-for-all from 2026-10-23, compare 3D-on vs 3D-off devices (migration 20261023_sim3d_cohorts)
      timed('sim3dCohorts', cachedReport(`sim3dCohorts:${period}`, () => service.rpc('admin_sim3d_cohorts', { p_since: since }), cacheAge), timings),
      // Feature usage from automatic click/hover capture (migration 20261024_ui_interactions)
      timed('interactions', cachedReport(`interactions:${period}`, () => service.rpc('admin_interaction_report', { p_since: since, p_app: 'bs-football' }), cacheAge), timings),
      // Is the rollup pipeline applied, backfilled, and still being fed? (migration 20261101_analytics_rollup_health)
      timed('health', service.rpc('admin_analytics_health'), timings),
    ]);

    // A failed summary (typically a statement timeout) must not masquerade as
    // data: every card it feeds is null, and the page renders "—". It used to
    // zero them out, which read as "0 registered accounts" to a founder.
    const summary = (summaryRes.error ? null : (summaryRes.data ?? null)) as {
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
    } | null;
    const num = (v: number | undefined): number | null => (summary && typeof v === 'number' ? v : null);

    // Conversion = subscribers / users who are actually ABLE to subscribe.
    //
    // Founding Members (signed up before 2026-05-01) get Premium free forever,
    // so they can never convert. As of Jul 2026 that's 165 of 256 accounts —
    // dividing by all users would fold a structurally unconvertible 64% into
    // the denominator and permanently understate the rate.
    //
    // Also deliberately NOT the raw `signup` event count: those rows are
    // duplicated ~2.6x per human by the old supabase SIGNED_IN re-fire bug.
    const convertibleUsers = num(summary?.convertibleUsers);
    const totalSubscriptions = subscriptionCountRes.count ?? 0;
    const conversionRate = convertibleUsers === null ? null : convertibleUsers > 0 ? totalSubscriptions / convertibleUsers : 0;

    // Rollup pipeline health. `applied: null` = the health function itself is
    // missing (20261101 not applied), so we can't tell; the warning says so.
    const rollups = healthRes.error
      ? { applied: null as null, error: MISSING_FN.test(healthRes.error.message)
          ? 'admin_analytics_health() is missing — apply supabase/migrations/20261101_analytics_rollup_health.sql'
          : healthRes.error.message }
      : (healthRes.data ?? { applied: null as null, error: 'empty response' });

    return NextResponse.json({
      period,
      // Server clock, so the page can do "N minutes ago" math without calling Date.now() in render.
      generatedAt: new Date().toISOString(),
      totalUsers: num(summary?.totalUsers),               // all-time, from auth.users
      newUsers: num(summary?.newUsers),                   // in-window
      grandfatheredUsers: num(summary?.grandfatheredUsers),
      convertibleUsers,
      activeUsers: num(summary?.activeUsers),             // in-window
      uniqueDevices: num(summary?.uniqueDevices),         // in-window, upper bound on humans
      sessions: num(summary?.sessions),
      pageViews: num(summary?.pageViews),
      conversionRate,
      totalSubscriptions,
      // null (not {} / []) when the summary failed, so the page can say "didn't load" instead of "no page views yet"
      signupsByDay: summary ? (summary.signupsByDay ?? {}) : null,
      topPages: summary ? (summary.topPages ?? []) : null,
      recentEvents: recentEventsRes.data ?? [],
      // null if the migration hasn't been applied yet — the page hides the row.
      activeUsersRolling: activeRes.error ? null : (activeRes.data ?? null),
      hoopsActiveUsersRolling: hoopsActiveRes.error ? null : (hoopsActiveRes.data ?? null),
      sim3dCohorts: sim3dRes.error ? null : (sim3dRes.data ?? null),
      interactions: interactionsRes.error ? null : (interactionsRes.data ?? null),
      rollups,
      timingsMs: timings,
      // Age in ms of each report served from the in-memory cache (absent = computed fresh this request).
      cacheAgeMs: cacheAge,
      warnings: ([
        ['Summary cards', summaryRes.error],
        ['Recent activity', recentEventsRes.error],
        ['Active users (Football)', activeRes.error],
        ['Active users (Hoops)', hoopsActiveRes.error],
        ['3D sim cohorts', sim3dRes.error],
        ['Feature usage', interactionsRes.error],
        ['Rollup health', healthRes.error],
      ] as const)
        .filter(([, e]) => e)
        .map(([label, e]) => `${label}: ${e!.message}`),
    });
  } catch (err) {
    console.error('Analytics API error:', err);
    return NextResponse.json({
      error: 'Internal server error',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
