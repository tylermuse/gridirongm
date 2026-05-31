'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@bs/core/supabase/client';
import { useLeagueStore } from '@/lib/store/leagueStore';

const DISCORD_URL = 'https://discord.gg/RMtusS2GKW';
const APP_VERSION = 'v0.2';

/**
 * Sidebar account + community footer (parity audit P0.6).
 *
 * - Account widget: reflects a Supabase session when one exists (email + Sign
 *   Out). When Supabase is unconfigured (no NEXT_PUBLIC_SUPABASE_* env) or
 *   there's no session, it stays inert — the cross-sport sign-in flow + tier
 *   badges land once the shared subscription wiring ships.
 * - "Join the Community" Discord card.
 * - New League / Switch League (de-buries the save management from the splash).
 * - Version stamp.
 */
export function SidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const { clearActive } = useLeagueStore();

  function go(path: string) {
    clearActive();
    onNavigate?.();
    router.push(path);
  }

  return (
    <div className="border-t px-3 py-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
      <AccountWidget />

      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-white"
        style={{ background: '#5865F2' }}
      >
        <span aria-hidden>💬</span>
        Join the Community
      </a>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => go('/')}
          className="rounded-lg border px-2 py-1.5 text-xs font-semibold hover:bg-[var(--surface-2)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-sec)' }}
        >
          + New League
        </button>
        <button
          onClick={() => go('/')}
          className="rounded-lg border px-2 py-1.5 text-xs font-semibold hover:bg-[var(--surface-2)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-sec)' }}
        >
          ↔ Switch / Load
        </button>
      </div>

      <div className="text-center text-[9px] text-[var(--text-sec)] opacity-50 pt-0.5">BS Hoops {APP_VERSION}</div>
    </div>
  );
}

function AccountWidget() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return; // unconfigured → no auth UI
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setEmail(session?.user?.email ?? null);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  if (!email) return null; // signed out / unconfigured — stay quiet

  function signOut() {
    void createClient()?.auth.signOut();
    setEmail(null);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: 'var(--surface-2)' }}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>
        {email[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold truncate">{email}</div>
        <button onClick={signOut} className="text-[10px] text-[var(--text-sec)] hover:text-[var(--text)]">Sign out</button>
      </div>
    </div>
  );
}
