import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedCron } from '@/lib/cronAuth';

/**
 * Weekly rebuild for /predictions. The odds are computed at build time, so
 * every Monday morning (after Sunday's games) Vercel Cron calls this route,
 * which fires the project's deploy hook to rebuild production with fresh
 * results. Set PREDICTIONS_DEPLOY_HOOK_URL to a Vercel deploy hook for the
 * main branch of the bs-basketball project (Project Settings → Git → Deploy Hooks).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const hook = process.env.PREDICTIONS_DEPLOY_HOOK_URL;
  if (!hook) {
    console.error('[rebuild-predictions] PREDICTIONS_DEPLOY_HOOK_URL is not set');
    return NextResponse.json({ triggered: false, error: 'PREDICTIONS_DEPLOY_HOOK_URL not set' }, { status: 500 });
  }
  const res = await fetch(hook, { method: 'POST', cache: 'no-store' });
  if (!res.ok) {
    console.error('[rebuild-predictions] deploy hook failed', res.status, await res.text().catch(() => ''));
    return NextResponse.json({ triggered: false, status: res.status }, { status: 502 });
  }
  return NextResponse.json({ triggered: true, status: res.status });
}
