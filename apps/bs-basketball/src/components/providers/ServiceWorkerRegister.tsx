'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Registers the Serwist-built /sw.js (production only) so BS Hoops loads
 * offline once the shell + roster JSON are cached.
 *
 * Updates: sw.ts uses skipWaiting + clientsClaim (same as BS Football), so a
 * new version takes control as soon as it installs. The running page still has
 * the previous build's JS, so when control changes we do a full page load on
 * the next route change instead of interrupting whatever the user is doing.
 */
export function ServiceWorkerRegister() {
  const pathname = usePathname();
  const updateReady = useRef(false);
  const firstPath = useRef(pathname);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const hadController = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      // First install also fires controllerchange (clientsClaim) — not an update.
      if (hadController) updateReady.current = true;
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('[sw] registration failed:', err);
      });
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
    if (ric) ric(register);
    else setTimeout(register, 1);

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  useEffect(() => {
    if (pathname === firstPath.current) return;
    firstPath.current = pathname;
    if (updateReady.current && navigator.onLine) {
      updateReady.current = false;
      window.location.reload();
    }
  }, [pathname]);

  return null;
}
