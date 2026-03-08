'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { type Tier, type Feature, hasFeature as checkFeature, maxScoutingLevel } from '@/lib/subscription';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

interface SubscriptionContextValue {
  user: User | null;
  tier: Tier;
  loading: boolean;
  hasFeature: (feature: Feature) => boolean;
  maxScoutingLevel: number;
  signOut: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  user: null,
  tier: 'free',
  loading: true,
  hasFeature: () => false,
  maxScoutingLevel: 0,
  signOut: async () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // DEV OVERRIDE: default to 'elite' in development for admin testing
  const devTier = process.env.NODE_ENV === 'development' ? 'elite' : 'free';
  const [tier, setTier] = useState<Tier>(devTier as Tier);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const fetchSubscription = useCallback(async (userId: string) => {
    if (!supabase) return;
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
  }, [supabase]);

  useEffect(() => {
    // If Supabase is not configured, keep devTier default and mark as loaded
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getUser().then(({ data: { user: currentUser } }: { data: { user: User | null } }) => {
      setUser(currentUser);
      if (currentUser) {
        fetchSubscription(currentUser.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch(() => {
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, session: Session | null) => {
        const newUser = session?.user ?? null;
        setUser(newUser);
        if (newUser) {
          await fetchSubscription(newUser.id);
        } else {
          setTier('free');
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
  }, [supabase]);

  const value: SubscriptionContextValue = {
    user,
    tier,
    loading,
    hasFeature: (feature: Feature) => checkFeature(tier, feature),
    maxScoutingLevel: maxScoutingLevel(tier),
    signOut,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}
