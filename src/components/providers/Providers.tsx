'use client';

import { type ReactNode } from 'react';
import { SubscriptionProvider } from './SubscriptionProvider';
import { useInteractionTracking, usePageView } from '@bs/core/analytics';

function PageViewTracker() {
  usePageView();
  useInteractionTracking();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SubscriptionProvider>
      <PageViewTracker />
      {children}
    </SubscriptionProvider>
  );
}
