import type { NextConfig } from "next";

/**
 * BS Hoops Next.js config.
 *
 * Mirrors apps/../next.config.ts (the football app at repo root) where
 * applicable, minus the Serwist PWA layer (we'll add that in a later 2C
 * slice once the shell is solid).
 *
 * Workspace packages (@bs/core, @bs/sport-basketball) ship as TS source
 * files, so Next.js needs to transpile them at consumer build time.
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@bs/core', '@bs/sport-basketball'],
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
