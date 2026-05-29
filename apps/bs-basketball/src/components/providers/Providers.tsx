'use client';

import { type ReactNode } from 'react';
import { usePageView } from '@bs/core/analytics';

/**
 * BS Hoops app providers.
 *
 * v1 scope (2C-1): just analytics page-view tracking.
 *
 * Coming in later 2C slices:
 *   - SubscriptionProvider (shares Stripe customer with football — one sub
 *     unlocks both sports per the cross-sport billing decision)
 *   - SupabaseProvider (shares the football Supabase project for ONE user
 *     account across sports)
 *   - SimEngineProvider (basketballAdapter passed through context)
 *   - ThemeProvider (light/dark toggle, persisted to localStorage)
 */

function PageViewTracker() {
  usePageView();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      <PageViewTracker />
      {children}
    </>
  );
}
