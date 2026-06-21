'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@bs/core/supabase/client';
import { Button } from '@/components/ui/Button';

/**
 * /login — optional sign-in for the global GM leaderboard (parity 3.3) AND
 * the gateway used by the Stripe pricing flow. The game is fully playable
 * logged-out; signing in lets your franchise appear on the leaderboard and
 * connects a Supabase customer for billing.
 *
 * Honors a `?next=` query param (whitelisted to relative paths) so the pricing
 * page can chain through here on the "Upgrade" CTA: /pricing → /login?next=/
 * pricing?intent=checkout → /pricing auto-fires the Stripe checkout. Defaults
 * to /gm-rankings when no `next` is set, mirroring the original behavior.
 */
function safeNextPath(raw: string | null): string {
  if (!raw) return '/gm-rankings';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/gm-rankings';
  return raw.length < 2048 ? raw : '/gm-rankings';
}

export default function LoginPage() {
  // useSearchParams forces a client bailout — wrap in Suspense so `next build`
  // can still prerender the route.
  return (
    <Suspense fallback={<main className="max-w-sm mx-auto p-8 text-sm text-[var(--text-sec)]">Loading…</main>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get('next'));
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sb = createClient();
  const unconfigured = !sb;

  async function emailAuth() {
    if (!sb) return;
    setBusy(true); setMsg(null);
    try {
      if (mode === 'up') {
        const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}` } });
        setMsg(error ? error.message : 'Check your email to confirm, then sign in.');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) setMsg(error.message);
        else router.push(next);
      }
    } finally { setBusy(false); }
  }

  async function oauth(provider: 'google' | 'discord') {
    if (!sb) return;
    await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }

  return (
    <main className="max-w-sm mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <h1 className="text-3xl font-extrabold mt-2 mb-1" style={{ color: 'var(--accent)' }}>Sign in</h1>
      <p className="text-sm text-[var(--text-sec)] mb-5">Optional — only to appear on the global GM leaderboard. The game works fully without it.</p>

      {unconfigured ? (
        <div className="rounded-lg border px-4 py-3 text-sm text-[var(--text-sec)]" style={{ borderColor: 'var(--border)' }}>
          Online accounts aren&apos;t configured in this build.
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-4">
            <button onClick={() => oauth('google')} className="flex-1 rounded-lg border py-2 text-sm font-semibold hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)' }}>Continue with Google</button>
            <button onClick={() => oauth('discord')} className="flex-1 rounded-lg border py-2 text-sm font-semibold hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)' }}>Discord</button>
          </div>

          <div className="space-y-2">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-2)] text-sm" style={{ borderColor: 'var(--border)' }} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-2)] text-sm" style={{ borderColor: 'var(--border)' }} />
            <Button variant="primary" className="w-full" disabled={busy || !email || !password} onClick={() => void emailAuth()}>
              {busy ? '…' : mode === 'up' ? 'Create account' : 'Sign in'}
            </Button>
          </div>

          <button onClick={() => { setMode(m => (m === 'in' ? 'up' : 'in')); setMsg(null); }} className="mt-3 text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
            {mode === 'in' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </button>
          {msg && <p className="mt-3 text-xs text-[var(--text-sec)]">{msg}</p>}
        </>
      )}
    </main>
  );
}
