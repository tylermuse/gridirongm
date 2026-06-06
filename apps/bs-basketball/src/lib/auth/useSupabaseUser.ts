'use client';

/**
 * Minimal auth hook for the global GM board (parity 3.3). Exposes the current
 * Supabase user (or null), whether Supabase is configured at all, and signOut.
 * No provider needed — the few surfaces that care subscribe directly.
 */

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@bs/core/supabase/client';
import type { User } from '@supabase/supabase-js';

export function useSupabaseUser() {
  // Derive `configured` + initial loading at init so the effect never calls
  // setState synchronously (createClient is memoized, so calling it is cheap).
  const configured = useMemo(() => createClient() != null, []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    const sb = createClient();
    if (!sb) return; // unconfigured — loading already false at init
    let active = true;
    void sb.auth.getUser().then(({ data }) => {
      if (active) { setUser(data.user ?? null); setLoading(false); }
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (active) setUser(session?.user ?? null);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  async function signOut() {
    const sb = createClient();
    await sb?.auth.signOut();
    setUser(null);
  }

  return { user, loading, configured, signOut };
}

/** Best-effort display name for a user (metadata → email prefix → "GM"). */
export function displayNameOf(user: User | null): string {
  if (!user) return 'GM';
  const meta = typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name.trim() : '';
  return meta || user.email?.split('@')[0] || 'GM';
}
