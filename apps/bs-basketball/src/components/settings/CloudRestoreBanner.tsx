'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSupabaseUser } from '@/lib/auth/useSupabaseUser';
import { readCloudIndex } from '@/lib/persistence/cloud';

/**
 * Splash prompt for a signed-in user on a device that's missing some of their
 * cloud leagues ("Continue on another device"). Restoring happens in Settings,
 * which handles newer-local conflicts.
 */
export function CloudRestoreBanner({ localIds }: { localIds: string[] }) {
  const { user } = useSupabaseUser();
  const [missing, setMissing] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void readCloudIndex().then(idx => {
      if (!cancelled) setMissing(idx.filter(m => !localIds.includes(m.id)).length);
    });
    return () => { cancelled = true; };
  }, [user, localIds]);

  if (!user || missing === 0) return null;
  return (
    <div className="mb-6 max-w-md w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 flex items-center gap-3">
      <span className="text-xl" aria-hidden>☁️</span>
      <div className="flex-1 text-sm">
        <div className="font-bold">{missing} league{missing === 1 ? '' : 's'} saved to your account</div>
        <div className="text-xs text-[var(--text-sec)]">Pick up where you left off on another device.</div>
      </div>
      <Link href="/settings" className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>Restore</Link>
    </div>
  );
}
