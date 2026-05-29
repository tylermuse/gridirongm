'use client';

import { type ReactNode } from 'react';

/**
 * BS Hoops app providers.
 *
 * v1 scope (2C-1): pass-through. No analytics yet — we'd need to set up the
 * /api/analytics/track endpoint that @bs/core/analytics' usePageView posts
 * to, which 404s noisily in dev otherwise. Coming in a later 2C slice.
 *
 * Coming in later 2C slices:
 *   - SubscriptionProvider (shares Stripe customer with football — one sub
 *     unlocks both sports per the cross-sport billing decision)
 *   - SupabaseProvider (shares the football Supabase project for ONE user
 *     account across sports)
 *   - SimEngineProvider (basketballAdapter passed through context)
 *   - ThemeProvider (light/dark toggle, persisted to localStorage)
 *   - PageViewTracker once the analytics endpoint exists in this app
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
