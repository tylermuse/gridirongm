import type { NextRequest } from 'next/server';

/** Vercel Cron auth: when CRON_SECRET is set, Vercel sends it as a Bearer
 *  token and we require it; otherwise only Vercel Cron's user agent passes. */
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`;
  return (req.headers.get('user-agent') ?? '').startsWith('vercel-cron/');
}
