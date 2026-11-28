import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedCron } from '@/lib/cronAuth';
import { runWinbackCampaign } from '@/lib/server/email/campaigns';

/**
 * Daily marketing-email run (Vercel Cron, see vercel.json).
 *
 * A campaign sends real email only when it is named in EMAIL_LIVE_CAMPAIGNS
 * and RESEND_API_KEY is set. Otherwise it is a dry run: the response and the
 * logs report how many players would be emailed, and nothing is sent.
 */
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const winback = await runWinbackCampaign();
  console.log('[email] run complete', JSON.stringify(winback));
  return NextResponse.json({ campaigns: [winback] });
}
