import type { MetadataRoute } from 'next';
import { getPublishedPosts } from '@/lib/content/posts';
import { getLeague2026 } from '@/lib/content/rosters2026';
import { seoPages } from '@/lib/content/pages';

const SITE = 'https://bs-basketball.com';

// Rebuild daily so newly published (previously future-dated) posts appear.
export const revalidate = 86400;

/** Crawlable public pages. Game routes are client-rendered per save, so only
 *  the shareable entry points, content pages and roster reference are listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']) => ({
    url: `${SITE}${path}`, lastModified: now, changeFrequency, priority,
  });

  const posts = getPublishedPosts();
  const blog: MetadataRoute.Sitemap = posts.map(p => ({
    url: `${SITE}/blog/${p.slug}`,
    lastModified: new Date(`${p.publishDate}T00:00:00Z`),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const landing: MetadataRoute.Sitemap = seoPages.map(p =>
    page(`/${p.section}/${p.slug}`, p.section === 'vs' || p.section === 'best' ? 0.8 : 0.6, 'monthly'));

  const rosters: MetadataRoute.Sitemap = getLeague2026().teams.map(t => page(`/rosters/2026/${t.slug}`, 0.6, 'monthly'));

  return [
    page('/', 1, 'weekly'),
    page('/blog', 0.8, 'weekly'),
    ...blog,
    ...landing,
    page('/player-tiers', 0.8, 'monthly'),
    page('/rosters', 0.8, 'weekly'),
    page('/rosters/2026', 0.8, 'monthly'),
    ...rosters,
    page('/about', 0.6, 'monthly'),
    page('/contact', 0.3, 'yearly'),
    page('/pricing', 0.5, 'monthly'),
    page('/privacy', 0.2, 'yearly'),
    page('/terms', 0.2, 'yearly'),
  ];
}
