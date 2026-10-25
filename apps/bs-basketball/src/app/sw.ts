/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, CacheableResponsePlugin, ExpirationPlugin, NetworkOnly, Serwist } from 'serwist';

/**
 * BS Hoops service worker (Serwist). Built by next.config.ts → public/sw.js in
 * production builds only.
 *
 * - Precache: Next's hashed static chunks + the app shell ("/") + "/offline" +
 *   the PWA icons (see additionalPrecacheEntries in next.config.ts).
 * - /rosters/*.json: cache-first. The bundled BBGM roster is ~7.6MB, too big
 *   for the precache, so it's cached on first use (new league / photo backfill)
 *   and then served from the SW cache — new leagues work offline afterwards.
 * - /api/(auth|stripe|analytics)/*: never cached (network-only, any method).
 * - /api/spotlight, /api/recap: these are POSTs, which the Cache API can't
 *   store, so they're network-only; offline they fail fast and the AI widgets
 *   fall back to their empty/error state (callers already catch).
 * - Everything else: Serwist's defaultCache (SWR for JS/CSS, network-first
 *   for pages/RSC/other GET APIs).
 * - Navigations with no network and no cached copy → precached /offline.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const NEVER_CACHE = /^\/api\/(auth|stripe|analytics)(\/|$)/;
// Every /api/spotlight* route (spotlight-audio, -chat, -show streams NDJSON) and recap:
// never cached or buffered (same prefix rule as BS Football's sw).
const AI_ROUTES = /^\/api\/(spotlight[\w-]*|recap)(\/|$)/;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Same update policy as BS Football: a new SW activates immediately. The
  // client (ServiceWorkerRegister) then does a full reload on the next route
  // change so the page never runs old JS against a new precache.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    ...(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).flatMap((method) => [
      { matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) => sameOrigin && NEVER_CACHE.test(url.pathname), method, handler: new NetworkOnly() },
      { matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) => sameOrigin && AI_ROUTES.test(url.pathname), method, handler: new NetworkOnly() },
    ]),
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && /^\/rosters\/.*\.json$/i.test(url.pathname),
      handler: new CacheFirst({
        cacheName: 'bsh-roster-files',
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 }),
        ],
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
