import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/login'] }],
    sitemap: 'https://www.bs-basketball.com/sitemap.xml',
    host: 'https://www.bs-basketball.com',
  };
}
