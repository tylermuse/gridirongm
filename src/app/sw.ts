/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist } from 'serwist';

// Standard Serwist boilerplate — gives TS the SW global types.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Default cache rules cover JS/CSS/images. Augment with custom strategies
  // for roster JSONs (long-tail static, can be served stale-while-revalidate)
  // and the AI APIs (network-first so users get fresh commentary online, but
  // the home dashboard still renders offline using the prior cached topics).
  runtimeCaching: [
    {
      matcher: /^\/rosters\/.*\.json$/i,
      handler: new CacheFirst({
        cacheName: 'gg-roster-files',
        plugins: [new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/spotlight') || url.pathname.startsWith('/api/recap'),
      handler: new NetworkFirst({
        cacheName: 'gg-ai-commentary',
        networkTimeoutSeconds: 8,
        plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
