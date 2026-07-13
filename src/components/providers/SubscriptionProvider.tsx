'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { createClient } from '@bs/core/supabase/client';
import {
  type Tier,
  type Feature,
  type ScoutingAllocations,
  hasFeature as checkFeature,
  hasScouting as checkScouting,
  getScoutingAllocations,
  PODCAST_CREDITS_PER_MONTH,
} from '@bs/core/billing';
import { setCurrentSubscriptionAllocations, setCurrentSubscriptionTier } from '@bs/core/billing';
import { trackAuthEvent, clearAuthEventDedupe } from '@bs/core/analytics';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

// Anyone who signed up before this date is a Founding Member forever.
// Founding members get all Premium features for free, including the monthly
// podcast credit allotment.
const FOUNDING_MEMBER_CUTOFF = '2026-05-01T00:00:00Z';

interface PodcastCredits {
  /** Credits remaining this billing period. -1 means uncapped (admins). */
  remaining: number;
  /** Total credits the user is entitled to per period. */
  limit: number;
  /** ISO timestamp when the period resets. Null if never tracked. */
  resetAt: string | null;
}

interface SubscriptionContextValue {
  user: User | null;
  tier: Tier;
  isAdmin: boolean;
  isFoundingMember: boolean;
  loading: boolean;
  hasFeature: (feature: Feature) => boolean;
  /** Always true now — every tier has scouting access (with different allotments). Kept for back-compat. */
  hasScouting: boolean;
  /** Per-draft scout points and per-FA intel report allocations. */
  scoutingAllocations: ScoutingAllocations;
  podcastCredits: PodcastCredits;
  refreshPodcastCredits: () => Promise<void>;
  signOut: () => Promise<void>;
}

const DEFAULT_CREDITS: PodcastCredits = { remaining: 0, limit: 0, resetAt: null };

const SubscriptionContext = createContext<SubscriptionContextValue>({
  user: null,
  tier: 'free',
  isAdmin: false,
  isFoundingMember: false,
  loading: true,
  hasFeature: () => false,
  hasScouting: true,
  scoutingAllocations: { scoutPoints: 10, intelReports: 3, isUnlimited: false },
  podcastCredits: DEFAULT_CREDITS,
  refreshPodcastCredits: async () => {},
  signOut: async () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

interface ProfileRow {
  is_admin: boolean | null;
  podcast_credits_used: number | null;
  podcast_credits_reset_at: string | null;
}

interface SubscriptionRow {
  tier: Tier | null;
  status: string | null;
}

function isPeriodExpired(resetAt: string | null): boolean {
  if (!resetAt) return true;
  return new Date(resetAt).getTime() <= Date.now();
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tier, setTier] = useState<Tier>('free');
  const [podcastCredits, setPodcastCredits] = useState<PodcastCredits>(DEFAULT_CREDITS);
  // If Supabase isn't configured, there's no auth to wait for — start loaded.
  // This avoids a synchronous setState inside the effect below.
  const [loading, setLoading] = useState<boolean>(() => supabase != null);

  // Dev-only tier override — flip the active view via URL param without
  // editing files or restarting. Persisted in sessionStorage so it survives
  // navigation. Only honored in development; ignored in production builds.
  //   ?devTier=free     → render as a Free user (suppresses founder + admin)
  //   ?devTier=premium  → render as a Premium subscriber
  //   ?devTier=clear    → remove the override and restore real account state
  const [devTierOverride, setDevTierOverride] = useState<Tier | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV !== 'development') return;
    const params = new URLSearchParams(window.location.search);
    const queryTier = params.get('devTier');
    if (queryTier === 'clear') {
      sessionStorage.removeItem('devTier');
      setDevTierOverride(null);
      return;
    }
    if (queryTier === 'free' || queryTier === 'premium') {
      sessionStorage.setItem('devTier', queryTier);
      setDevTierOverride(queryTier);
      return;
    }
    const stored = sessionStorage.getItem('devTier');
    if (stored === 'free' || stored === 'premium') {
      setDevTierOverride(stored);
    }
  }, []);

  const computeCredits = useCallback(
    (effectiveTier: Tier, admin: boolean, profile: ProfileRow | null): PodcastCredits => {
      if (admin) {
        return { remaining: -1, limit: -1, resetAt: null };
      }
      const limit = PODCAST_CREDITS_PER_MONTH[effectiveTier];
      if (limit <= 0) {
        return { remaining: 0, limit: 0, resetAt: profile?.podcast_credits_reset_at ?? null };
      }
      const expired = isPeriodExpired(profile?.podcast_credits_reset_at ?? null);
      const used = expired ? 0 : (profile?.podcast_credits_used ?? 0);
      return {
        remaining: Math.max(0, limit - used),
        limit,
        resetAt: profile?.podcast_credits_reset_at ?? null,
      };
    },
    [],
  );

  const fetchSubscription = useCallback(
    async (currentUser: User) => {
      if (!supabase) return;

      const userId = currentUser.id;
      const isFounder =
        !!currentUser.created_at &&
        new Date(currentUser.created_at) < new Date(FOUNDING_MEMBER_CUTOFF);

      // Fetch profile (admin flag + podcast credit tracking) and active subscription in parallel.
      const [profileResult, subResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('is_admin, podcast_credits_used, podcast_credits_reset_at')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('subscriptions')
          .select('tier, status')
          .eq('user_id', userId)
          .in('status', ['active', 'trialing'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (profileResult.error) {
        console.error('[SubscriptionProvider] profile fetch error:', profileResult.error);
      }

      const profile = (profileResult.data ?? null) as ProfileRow | null;
      const sub = (subResult.data ?? null) as SubscriptionRow | null;

      const admin = profile?.is_admin === true;
      setIsAdmin(admin);

      // Tier resolution priority: admin → founder → active sub → free.
      // Admin and founder both resolve to 'premium' for entitlement purposes,
      // but admin also bypasses the podcast credit cap below.
      let resolvedTier: Tier = 'free';
      if (admin || isFounder) {
        resolvedTier = 'premium';
      } else if (sub?.tier === 'premium') {
        resolvedTier = 'premium';
      }
      setTier(resolvedTier);
      setCurrentSubscriptionTier(resolvedTier);
      setCurrentSubscriptionAllocations(getScoutingAllocations(resolvedTier, admin || isFounder));
      setPodcastCredits(computeCredits(resolvedTier, admin, profile));
    },
    [supabase, computeCredits],
  );

  const refreshPodcastCredits = useCallback(async () => {
    if (!supabase || !user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('is_admin, podcast_credits_used, podcast_credits_reset_at')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      console.error('[SubscriptionProvider] refreshPodcastCredits error:', error);
      return;
    }
    const profile = (data ?? null) as ProfileRow | null;
    const admin = profile?.is_admin === true;
    setPodcastCredits(computeCredits(tier, admin, profile));
  }, [supabase, user, tier, computeCredits]);

  useEffect(() => {
    if (!supabase) {
      // Initial loading state already accounts for missing supabase.
      return;
    }

    // Get initial session (with timeout to prevent infinite loading).
    const authTimeout = setTimeout(() => setLoading(false), 5000);
    supabase.auth
      .getUser()
      .then(({ data: { user: currentUser } }: { data: { user: User | null } }) => {
        clearTimeout(authTimeout);
        setUser(currentUser);
        if (currentUser) {
          fetchSubscription(currentUser).finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        clearTimeout(authTimeout);
        setLoading(false);
      });

    // Listen for auth changes
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange(
      async (authEvent: AuthChangeEvent, session: Session | null) => {
        const newUser = session?.user ?? null;
        setUser(newUser);
        if (newUser) {
          if (authEvent === 'SIGNED_IN') {
            // Deduped inside trackAuthEvent — supabase re-fires SIGNED_IN on
            // token refresh and tab focus, not just on an actual sign-in.
            trackAuthEvent(newUser);
          }
          await fetchSubscription(newUser);
        } else {
          setTier('free');
          setCurrentSubscriptionTier('free');
          setIsAdmin(false);
          setPodcastCredits(DEFAULT_CREDITS);
        }
      },
    );

    return () => {
      authSub.unsubscribe();
    };
  }, [supabase, fetchSubscription]);

  const signOut = useCallback(async () => {
    try {
      if (supabase) await supabase.auth.signOut();
    } catch (err) {
      console.error('[signOut] supabase.auth.signOut failed:', err);
    }
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      /* ignore — localStorage might be restricted */
    }
    // Signing out ends the sign-in — the next one is a genuinely new `login`.
    clearAuthEventDedupe();
    setUser(null);
    setTier('free');
    setCurrentSubscriptionTier('free');
    setIsAdmin(false);
    setPodcastCredits(DEFAULT_CREDITS);
    window.location.href = '/';
  }, [supabase]);

  // Founding member = signed up before cutoff date.
  const realIsFoundingMember =
    !!user?.created_at && new Date(user.created_at) < new Date(FOUNDING_MEMBER_CUTOFF);

  // Apply dev-tier override (suppresses founder + admin so the override
  // actually changes what the UI sees). In production this is always null.
  const effectiveTier = devTierOverride ?? tier;
  const effectiveIsAdmin = devTierOverride ? false : isAdmin;
  const effectiveIsFoundingMember = devTierOverride ? false : realIsFoundingMember;

  // Sync the override back into the engine's subscriptionState module so
  // store actions (draft init, FA init, etc.) read the same allocation the
  // UI does.
  useEffect(() => {
    setCurrentSubscriptionTier(effectiveTier);
    setCurrentSubscriptionAllocations(
      getScoutingAllocations(effectiveTier, effectiveIsAdmin || effectiveIsFoundingMember),
    );
  }, [effectiveTier, effectiveIsAdmin, effectiveIsFoundingMember]);

  const value: SubscriptionContextValue = {
    user,
    tier: effectiveTier,
    isAdmin: effectiveIsAdmin,
    isFoundingMember: effectiveIsFoundingMember,
    loading,
    // Founders + admins always get premium features even if their tier resolved
    // to 'free' for any reason (e.g. profiles row missing on a brand-new account).
    hasFeature: (feature: Feature) =>
      effectiveIsAdmin || effectiveIsFoundingMember || checkFeature(effectiveTier, feature),
    hasScouting: effectiveIsAdmin || effectiveIsFoundingMember || checkScouting(effectiveTier),
    scoutingAllocations: getScoutingAllocations(effectiveTier, effectiveIsAdmin || effectiveIsFoundingMember),
    podcastCredits,
    refreshPodcastCredits,
    signOut,
  };

  return (
    <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
  );
}
