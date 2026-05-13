'use client';

import { useEffect } from 'react';

/** Registers the Serwist-generated service worker so the app can load
 *  offline once the bundles + roster JSONs are cached. The SW itself is
 *  built by next.config.ts (withSerwist) — this component is just the
 *  client-side bootstrap that asks the browser to install it. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Defer until idle so registration doesn't compete with the initial
    // render's network requests.
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[sw] registration failed:', err);
      });
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
    if (ric) {
      ric(register);
    } else {
      setTimeout(register, 1);
    }
  }, []);

  return null;
}
