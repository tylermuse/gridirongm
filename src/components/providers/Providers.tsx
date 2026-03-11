'use client';

import { type ReactNode } from 'react';
import { SubscriptionProvider } from './SubscriptionProvider';
import { usePageView } from '@/lib/analytics';

function PageViewTracker() {
  usePageView();
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
