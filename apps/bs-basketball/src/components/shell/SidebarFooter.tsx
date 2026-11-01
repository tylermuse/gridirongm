'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { useSubscription } from '@/components/providers/SubscriptionProvider';

export const DISCORD_URL = 'https://discord.gg/RMtusS2GKW';
const APP_VERSION = 'v0.2';

/**
 * Sidebar account + community footer (football's AccountSection parity).
 *
 * - Account: signed out → a Sign In pill; signed in → email, Founding Member
 *   flag, an Upgrade to Premium CTA for free accounts, Sign Out.
 * - One "Switch / New League" button (it was two buttons doing the same thing).
 * - Legal links + version stamp.
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


      <button
        onClick={() => go('/')}
        className="w-full rounded-lg border px-2 py-1.5 text-xs font-semibold hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
        style={{ borderColor: 'var(--border)', color: 'var(--text-sec)' }}
        title="Load another save or start a new league"
      >
        ↔ Switch / New League
      </button>

      <div className="flex items-center justify-center gap-2.5 text-[10px] text-[var(--text-sec)] pt-0.5">
        <Link href="/about" onClick={onNavigate} className="hover:text-[var(--foreground)]">About</Link>
        <Link href="/blog" onClick={onNavigate} className="hover:text-[var(--foreground)]">Blog</Link>
        <Link href="/privacy" onClick={onNavigate} className="hover:text-[var(--foreground)]">Privacy</Link>
        <Link href="/terms" onClick={onNavigate} className="hover:text-[var(--foreground)]">Terms</Link>
        <span className="opacity-50">{APP_VERSION}</span>
      </div>
    </div>
  );
}

function AccountWidget() {
  const { user, tier, isAdmin, isFoundingMember, signOut, loading } = useSubscription();
  if (loading && !user) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center justify-center w-full text-xs py-1.5 rounded-lg font-semibold transition-colors hover:brightness-95"
        style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
      >
        Sign In
      </Link>
    );
  }

  const email = user.email ?? '';
  return (
    <div className="rounded-lg px-2.5 py-2 space-y-1.5" style={{ background: 'var(--surface-2)' }}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>
          {email[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold truncate">{email}</div>
          {isFoundingMember && <div className="text-[9px] font-bold text-amber-600">⭐ Founding Member</div>}
          {!isFoundingMember && tier !== 'free' && <div className="text-[9px] font-bold" style={{ color: 'var(--accent)' }}>Premium</div>}
        </div>
      </div>
      {/* Gate on entitlement, not raw tier: a founder/admin's tier can read
          'free' before the subscription fetch completes. */}
      {tier === 'free' && !isFoundingMember && !isAdmin && (
        <Link
          href="/pricing"
          className="block text-[11px] text-center py-1.5 rounded-md text-white font-bold transition-colors hover:brightness-110"
          style={{ background: 'var(--accent)' }}
        >
          ⚡ Upgrade to Premium
        </Link>
      )}
      <button
        onClick={() => { void signOut().catch(() => {}); }}
        className="w-full text-[10px] text-center py-1 rounded text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--border)]/40 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
