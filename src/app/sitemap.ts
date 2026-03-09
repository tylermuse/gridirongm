import type { MetadataRoute } from 'next';
import { blogPosts } from '@/lib/content/posts';
import { seoPages } from '@/lib/content/pages';

const BASE_URL = 'https://gridirongm.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];

  const blogPages: MetadataRoute.Sitemap = blogPosts.map(post => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.publishDate,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const sectionPages: MetadataRoute.Sitemap = seoPages.map(page => ({
    url: `${BASE_URL}/${page.section}/${page.slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: page.section === 'vs' || page.section === 'best' ? 0.8 : 0.6,
  }));

  return [...staticPages, ...blogPages, ...sectionPages];
}
