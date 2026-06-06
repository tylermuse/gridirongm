import { NextResponse } from 'next/server';
import { createClient } from '@bs/core/supabase/server';

/**
 * OAuth callback (parity 3.3). Supabase redirects here after Google/Discord
 * auth; we exchange the code for a session and forward to a whitelisted
 * relative `next` path (open-redirects rejected).
 */
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.length >= 2048) return '/';
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next'));
  if (!code) return NextResponse.redirect(new URL('/login?error=missing_code', url.origin));

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL('/login?error=exchange_failed', url.origin));
    return NextResponse.redirect(new URL(next, url.origin));
  } catch {
    return NextResponse.redirect(new URL('/login?error=callback_failed', url.origin));
  }
}
