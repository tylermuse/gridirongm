import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * BS Hoops Next.js config.
 *
 * Mirrors apps/../next.config.ts (the football app at repo root), including
 * the Serwist PWA layer: src/app/sw.ts compiles to public/sw.js (gitignored)
 * in production builds; disabled in dev so HMR keeps working.
 *
 * Workspace packages (@bs/core, @bs/sport-basketball) ship as TS source
 * files, so Next.js needs to transpile them at consumer build time.
 */

// Build-scoped revision for precached HTML routes ("/" shell + "/offline"),
// so each deploy refreshes them.
const BUILD_REV =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? String(Date.now());

// Precache the PWA icons by content hash. The 7.6MB roster JSON is deliberately
// NOT precached (it's runtime cache-first in sw.ts); passing
// additionalPrecacheEntries replaces Serwist's default "precache all of
// public/" glob, which would otherwise try to include it.
const iconsDir = path.join(process.cwd(), "public/icons");
const iconEntries = readdirSync(iconsDir)
  .filter((f) => f.endsWith(".png"))
  .map((f) => ({
    url: `/icons/${f}`,
    revision: createHash("md5").update(readFileSync(path.join(iconsDir, f))).digest("hex"),
  }));

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // ServiceWorkerRegister (mounted in Providers) owns registration + updates.
  register: false,
  // Football reloads on reconnect; Hoops doesn't — a forced reload mid-sim is
  // jarring and nothing needs the network to keep playing.
  reloadOnOnline: false,
  additionalPrecacheEntries: [
    { url: "/", revision: BUILD_REV },
    { url: "/offline", revision: BUILD_REV },
    { url: "/manifest.webmanifest", revision: BUILD_REV },
    ...iconEntries,
  ],
});

const nextConfig: NextConfig = {
  transpilePackages: ['@bs/core', '@bs/sport-basketball'],
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  async headers() {
    return [
      {
        // Roster filenames aren't content-hashed, so cache for a week with SWR
        // rather than `immutable`. The SW serves it cache-first regardless.
        source: '/rosters/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' },
        ],
      },
      {
        // The SW script must never be cached aggressively so updates land.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
