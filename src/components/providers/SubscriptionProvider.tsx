'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { type Tier, type Feature, hasFeature as checkFeature, maxScoutingLevel } from '@/lib/subscription';
import { trackEvent } from '@/lib/analytics';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

interface SubscriptionContextValue {
  user: User | null;
  tier: Tier;
  isAdmin: boolean;
  loading: boolean;
  hasFeature: (feature: Feature) => boolean;
  maxScoutingLevel: number;
  signOut: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  user: null,
  tier: 'free',
  isAdmin: false,
  loading: true,
  hasFeature: () => false,
  maxScoutingLevel: 0,
  signOut: async () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // 🎉 LIMITED-TIME PROMO: All users get elite tier (was: dev-only override)
  const [tier, setTier] = useState<Tier>('elite');
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const fetchSubscription = useCallback(async (userId: string) => {
    if (!supabase) return;

    // Check admin status from profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    // Fallback: grant admin to known admin emails if profile query fails
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const ADMIN_EMAILS = ['tylermuse@gmail.com'];
    const profileAdmin = profile?.is_admin === true || profile?.is_admin === 'true';
    const emailAdmin = ADMIN_EMAILS.includes(authUser?.email?.toLowerCase() ?? '');
    setIsAdmin(profileAdmin || emailAdmin);

    // 🎉 LIMITED-TIME PROMO: All users get elite tier for free
    // To revert: remove this block and uncomment the subscription check below
    setTier('elite');
    return;

    /* --- ORIGINAL SUBSCRIPTION CHECK (uncomment when promo ends) ---
    // Admins get elite tier regardless of subscription
    if (admin) {
      setTier('elite');
      return;
    }

    const { data } = await supabase
      .from('subscriptions')
      .select('tier, status')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data?.tier) {
      setTier(data.tier as Tier);
    } else {
      setTier('free');
    }
    --- END ORIGINAL --- */
  }, [supabase]);

  useEffect(() => {
    // If Supabase is not configured, keep devTier default and mark as loaded
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session (with timeout to prevent infinite loading)
    const authTimeout = setTimeout(() => setLoading(false), 5000);
    supabase.auth.getUser().then(({ data: { user: currentUser } }: { data: { user: User | null } }) => {
      clearTimeout(authTimeout);
      setUser(currentUser);
      if (currentUser) {
        fetchSubscription(currentUser.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch(() => {
      clearTimeout(authTimeout);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      async (authEvent: AuthChangeEvent, session: Session | null) => {
        const newUser = session?.user ?? null;
        setUser(newUser);
        if (newUser) {
          // Track login/signup
          if (authEvent === 'SIGNED_IN') {
            const createdAt = new Date(newUser.created_at).getTime();
            const isNewUser = Date.now() - createdAt < 60_000; // created < 1 min ago
            trackEvent(isNewUser ? 'signup' : 'login');
          }
          await fetchSubscription(newUser.id);
        } else {
          setTier('free');
          setIsAdmin(false);
        }
      },
    );

    return () => {
      authSub.unsubscribe();
    };
  }, [supabase, fetchSubscription]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setTier('free');
    setIsAdmin(false);
  }, [supabase]);

  const value: SubscriptionContextValue = {
    user,
    tier,
    isAdmin,
    loading,
    hasFeature: (feature: Feature) => isAdmin || checkFeature(tier, feature),
    maxScoutingLevel: isAdmin ? 2 : maxScoutingLevel(tier),
    signOut,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}
