import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/login'] }],
    sitemap: 'https://bs-basketball.com/sitemap.xml',
    host: 'https://bs-basketball.com',
  };
}
