'use client';

import { type ReactNode } from 'react';
import { SubscriptionProvider } from './SubscriptionProvider';

/**
 * BS Hoops app providers.
 *
 * STRIPE port (June 2026): SubscriptionProvider is now mounted. It reads the
 * authenticated Supabase user from `@bs/core/supabase/client`, joins to
 * `subscriptions` + `profiles` (shared with bs-football, same project), and
 * exposes `useSubscription()` for the paywall and AI commentary gates. A
 * single Premium sub on either sport unlocks Premium on both — the tier
 * resolver in `@bs/core/billing` collapses every legacy price into 'premium'.
 *
 * Coming later:
 *   - SimEngineProvider (basketballAdapter passed through context)
 *   - ThemeProvider (light/dark toggle, persisted to localStorage)
 *   - PageViewTracker once `/api/analytics/track` lands in this app
 */
export function Providers({ children }: { children: ReactNode }) {
  return <SubscriptionProvider>{children}</SubscriptionProvider>;
}
