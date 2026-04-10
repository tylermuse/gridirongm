'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const DEVICE_ID_KEY = 'gg-device-id';

/** Stable anonymous device ID — persists across sessions via localStorage */
function getDeviceId(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch { return null; }
}

/** Fire-and-forget event tracking. Safe to call anywhere on the client. */
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  try {
    const deviceId = getDeviceId();
    navigator.sendBeacon(
      '/api/analytics/track',
      JSON.stringify({ event, properties, deviceId }),
    );
  } catch {
    // Silently fail — analytics should never break the app
  }
}

/** Track page views on route changes. Call once in a root provider. */
export function usePageView() {
  const pathname = usePathname();
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === prev.current) return;
    prev.current = pathname;
    trackEvent('page_view', { path: pathname });
  }, [pathname]);

  // Track session start once per browser session
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('gg_session')) return;
    sessionStorage.setItem('gg_session', '1');
    trackEvent('session_start');
  }, []);
}
