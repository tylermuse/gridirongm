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

      {/* Restyled per Tyler's reference: light-lavender pill with the real
          Discord mark in brand purple and dark-navy label. Reads as inviting
          instead of demanding the viewer's eye like the solid-purple version. */}
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors hover:brightness-95"
        style={{ background: '#E6E7FB', color: '#1D2C5E' }}
      >
        <svg
          aria-hidden
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="#5865F2"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057 13.107 13.107 0 01-1.8722-.8923.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0065.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0188 1.3332-.9554 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z" />
        </svg>
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
