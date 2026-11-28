import { createServerClient } from '@supabase/ssr';
import { dailyCap, isCampaignLive } from './config';
import { sendViaResend } from './resend';
import { buildWinbackEmail, WINBACK_CAMPAIGN, type WinbackRecipient } from './templates/winback';

/**
 * Runs marketing campaigns. Every send is recorded in public.email_sends,
 * whose (user_id, campaign) key guarantees a player gets each campaign once.
 */

export type CampaignSummary = {
  campaign: string;
  mode: 'live' | 'dry_run';
  /** Why a campaign that could have sent ran as a dry run instead. */
  reason?: string;
  audience: number;
  sent: number;
  failed: number;
  skipped: number;
};

type AudienceRow = WinbackRecipient & { user_id: string; email: string };

const SEND_GAP_MS = 550; // stay under Resend's per-second rate limit
const MAX_CONSECUTIVE_FAILURES = 3;

function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runWinbackCampaign(): Promise<CampaignSummary> {
  const campaign = WINBACK_CAMPAIGN;
  const summary: CampaignSummary = { campaign, mode: 'dry_run', audience: 0, sent: 0, failed: 0, skipped: 0 };

  const service = getServiceClient();
  if (!service) return { ...summary, reason: 'no database access' };

  const apiKey = process.env.RESEND_API_KEY;
  const live = isCampaignLive(campaign) && Boolean(apiKey);
  if (!isCampaignLive(campaign)) summary.reason = 'not listed in EMAIL_LIVE_CAMPAIGNS';
  else if (!apiKey) summary.reason = 'RESEND_API_KEY is not set';

  // A dry run counts the whole audience; a live run takes only today's batch.
  const { data, error } = await service.rpc('email_audience_winback', {
    p_campaign: campaign,
    p_limit: live ? dailyCap() : 5000,
  });
  if (error) return { ...summary, reason: `audience query failed: ${error.message}` };

  const audience = (data ?? []) as AudienceRow[];
  summary.audience = audience.length;
  if (!live || !apiKey) return summary;

  summary.mode = 'live';
  let consecutiveFailures = 0;

  for (const row of audience) {
    // Claim the (user, campaign) slot before sending so two runs can't both send.
    const claimed = await claimSend(service, row, campaign);
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }

    const built = buildWinbackEmail(row);
    const result = await sendViaResend(
      {
        to: row.email,
        subject: built.subject,
        html: built.html,
        text: built.text,
        unsubscribeToken: row.token,
        idempotencyKey: `${campaign}/${row.user_id}`,
        campaign,
      },
      apiKey,
    );

    if (result.ok) {
      consecutiveFailures = 0;
      summary.sent += 1;
      await service
        .from('email_sends')
        .update({ status: 'sent', resend_id: result.id, sent_at: new Date().toISOString(), error: null })
        .eq('user_id', row.user_id)
        .eq('campaign', campaign);
    } else {
      consecutiveFailures += 1;
      summary.failed += 1;
      await service
        .from('email_sends')
        .update({ status: 'failed', error: result.error.slice(0, 500) })
        .eq('user_id', row.user_id)
        .eq('campaign', campaign);
      console.error(`[email] ${campaign} send failed (${result.status}): ${result.error}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        summary.reason = `stopped after ${MAX_CONSECUTIVE_FAILURES} failures in a row: ${result.error}`;
        break;
      }
    }

    await sleep(SEND_GAP_MS);
  }

  return summary;
}

/** True when this run now owns the send. A previously failed row is re-claimed. */
async function claimSend(
  service: NonNullable<ReturnType<typeof getServiceClient>>,
  row: AudienceRow,
  campaign: string,
): Promise<boolean> {
  const { error } = await service
    .from('email_sends')
    .insert({ user_id: row.user_id, campaign, email: row.email, status: 'queued' });
  if (!error) return true;
  if (error.code !== '23505') return false;

  const { data } = await service
    .from('email_sends')
    .update({ status: 'queued', error: null })
    .eq('user_id', row.user_id)
    .eq('campaign', campaign)
    .eq('status', 'failed')
    .select('id');
  return Boolean(data && data.length > 0);
}
