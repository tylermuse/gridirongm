/**
 * Settings shared by every marketing email. Mail is sent through Resend from
 * the verified mail.bs-football.com domain.
 */

export const EMAIL_FROM = 'Tyler from BS Football <tyler@mail.bs-football.com>';
export const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || 'tylermuse@gmail.com';
export const SITE_URL = 'https://bs-football.com';

/** US law (CAN-SPAM) requires a physical mailing address in every marketing email. */
export const FOOTER_COMPANY = 'BS Sports GM LLC';
export const FOOTER_ADDRESS = '5473 Blair Rd Ste 100, PMB 244784, Dallas, TX 75231-4227';

/** Most emails one cron run may send. Keeps a new sending domain's volume low. */
export function dailyCap(): number {
  const n = Number(process.env.EMAIL_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 80;
}

/**
 * A campaign only sends real email when it is named in EMAIL_LIVE_CAMPAIGNS
 * (comma-separated). Anything else runs as a dry run that reports who would
 * be emailed.
 */
export function isCampaignLive(campaign: string, raw = process.env.EMAIL_LIVE_CAMPAIGNS): boolean {
  if (!raw) return false;
  return raw.split(',').map((s) => s.trim()).filter(Boolean).includes(campaign);
}

export function unsubscribePageUrl(token: string): string {
  return `${SITE_URL}/unsubscribe?t=${encodeURIComponent(token)}`;
}

export function unsubscribeOneClickUrl(token: string): string {
  return `${SITE_URL}/api/email/unsubscribe?t=${encodeURIComponent(token)}`;
}

export function trackedUrl(path: string, campaign: string): string {
  const url = new URL(path, SITE_URL);
  url.searchParams.set('utm_source', 'email');
  url.searchParams.set('utm_medium', 'lifecycle');
  url.searchParams.set('utm_campaign', campaign);
  return url.toString();
}
