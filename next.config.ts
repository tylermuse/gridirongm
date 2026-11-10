import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Build-scoped revision for the precached /offline fallback page, so each
// deploy refreshes it (same approach as apps/bs-basketball/next.config.ts).
const BUILD_REV =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? String(Date.now());

// PWA / offline support via Serwist. The service worker source lives at
// src/app/sw.ts and the compiled output ships as /sw.js. Disabled in dev
// so HMR keeps working; enabled in prod builds (turbopack-compatible).
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
  // Only precache the small top-level files (manifest, icons, ads.txt,
  // site-verification) and public/images. Serwist's default is ["**/*"],
  // which put every file in public/ — all 500+ /show/*.mp4 clips and the
  // seven /rosters/*.json files, ~737 MB — into the precache manifest, so
  // every first-time visitor downloaded all of it in the background. Those
  // directories (show/, rosters/, players/heads/, chase-cam/, mock/) are
  // served on demand via the runtime caching rules in src/app/sw.ts instead.
  globPublicPatterns: ["*.{svg,json,txt,png,ico}", "images/**"],
  // Serwist's `fallbacks` option (see sw.ts) only looks its entries up in the
  // precache — it expects them to have been precached already — and /offline
  // is an app route, not a public/ file, so it has to be added by hand.
  // Without this an offline navigation to a page that isn't in the runtime
  // cache fails with ERR_FAILED instead of rendering /offline.
  manifestTransforms: [
    async (manifest) => ({
      manifest: [...manifest, { url: "/offline", revision: BUILD_REV, size: 0 }],
      warnings: [],
    }),
  ],
});

const nextConfig: NextConfig = {
  // Dev runs on Turbopack (Next 16 default) with Serwist disabled, but the
  // Serwist wrapper still contributes a webpack hook — without an (empty)
  // turbopack config `next dev` errors on startup and serves nothing.
  turbopack: {},
  // Workspace packages live as TS source files (no build step). Next.js
  // needs to compile them at consumer build time. Added during Sub-phase 1D
  // when @bs/core/analytics became the first cross-package import.
  transpilePackages: ['@bs/core', '@bs/sport-football'],
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  async headers() {
    return [
      {
        source: '/rosters/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        // Service worker file must never be cached aggressively — browsers
        // need the latest version on every load so SW updates land.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
