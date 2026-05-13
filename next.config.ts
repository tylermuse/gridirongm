import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// PWA / offline support via Serwist. The service worker source lives at
// src/app/sw.ts and the compiled output ships as /sw.js. Disabled in dev
// so HMR keeps working; enabled in prod builds (turbopack-compatible).
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
});

const nextConfig: NextConfig = {
  /* config options here */
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
