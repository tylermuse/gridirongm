import { NextResponse } from 'next/server';
import { setEmailOptOut } from '@/lib/server/emailPrefs';

/**
 * POST /api/email/unsubscribe?t=<token>
 *
 * Two callers:
 *  - Mail clients (Gmail, Apple Mail) using the List-Unsubscribe-Post header
 *    (RFC 8058). They POST `List-Unsubscribe=One-Click` and expect a 2xx.
 *  - The form on /unsubscribe, which sends `from=page` and optionally
 *    `action=resubscribe`, and is redirected back to the page.
 *
 * GET is deliberately not handled: mail scanners follow links, and a GET that
 * unsubscribed would opt players out without them asking.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get('t') ?? '';
  let fromPage = false;
  let resubscribe = false;

  try {
    const form = await request.formData();
    const formToken = form.get('t');
    if (typeof formToken === 'string' && formToken) token = formToken;
    fromPage = form.get('from') === 'page';
    resubscribe = form.get('action') === 'resubscribe';
  } catch {
    // No form body (or not form-encoded): treat as a one-click unsubscribe.
  }

  const result = await setEmailOptOut(token, !resubscribe, fromPage ? 'page' : 'one_click');

  if (fromPage) {
    const back = new URL('/unsubscribe', url.origin);
    back.searchParams.set('t', token);
    if (result !== 'ok') back.searchParams.set('error', '1');
    return NextResponse.redirect(back, 303);
  }

  if (result === 'unavailable') {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  // An unknown token still gets a 200 so the response doesn't reveal which tokens exist.
  return NextResponse.json({ ok: true });
}
