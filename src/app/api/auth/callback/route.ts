import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * OAuth callback. Supabase redirects users here after they authenticate with
 * Google / Discord. We exchange the code for a session and forward to either
 * the requested `next` path or the home page.
 *
 * The `next` query param is whitelisted to relative paths only — open
 * redirects via `?next=https://evil.example/steal` are rejected.
 */
function safeNextPath(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw.length < 2048 ? raw : '/';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error:', error);
      return NextResponse.redirect(new URL('/login?error=exchange_failed', url.origin));
    }
    return NextResponse.redirect(new URL(next, url.origin));
  } catch (err) {
    console.error('[auth/callback] unexpected error:', err);
    return NextResponse.redirect(new URL('/login?error=callback_failed', url.origin));
  }
}
