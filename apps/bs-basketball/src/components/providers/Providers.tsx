'use client';

import { type ReactNode } from 'react';
import { SubscriptionProvider } from './SubscriptionProvider';
import { useInteractionTracking, usePageView } from '@bs/core/analytics';
import { ServiceWorkerRegister } from './ServiceWorkerRegister';

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
 *
 * PageViewTracker: page_view + session_start beacons to /api/analytics/track
 * (rows tagged app = 'bs-hoops'). Also makes trackAuthEvent's signup/login
 * beacons land — they were 404ing before this route existed. Also runs the
 * click/hover/change autocapture behind the admin feature-usage report.
 *
 * ServiceWorkerRegister: production-only PWA/offline registration (sw.ts).
 */
function PageViewTracker() {
  usePageView();
  useInteractionTracking();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SubscriptionProvider>
      <PageViewTracker />
      <ServiceWorkerRegister />
      {children}
    </SubscriptionProvider>
  );
}
