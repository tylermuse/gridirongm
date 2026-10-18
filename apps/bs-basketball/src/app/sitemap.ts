import type { MetadataRoute } from 'next';

const SITE = 'https://bs-basketball.com';

/** Crawlable public pages. Game routes are client-rendered per save, so only
 *  the shareable entry points are listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']) => ({
    url: `${SITE}${path}`, lastModified: now, changeFrequency, priority,
  });
  return [
    page('/', 1, 'weekly'),
    page('/rosters', 0.8, 'weekly'),
    page('/about', 0.6, 'monthly'),
    page('/pricing', 0.5, 'monthly'),
    page('/privacy', 0.2, 'yearly'),
    page('/terms', 0.2, 'yearly'),
  ];
}
