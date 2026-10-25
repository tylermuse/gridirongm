import { NextResponse, type NextRequest } from 'next/server';
import { blogPosts } from '@/lib/content/posts';
import { seoPages } from '@/lib/content/pages';
import { isAuthorizedCron } from '@/lib/cronAuth';

/**
 * IndexNow ping (Bing, plus Yandex/Seznam/Naver via the shared endpoint).
 * Ported from BS Football. Bing's index also feeds ChatGPT search, so new
 * pages get picked up within hours instead of waiting for a crawl.
 *
 * Runs daily via Vercel Cron (vercel.json). Submits blog posts that just hit
 * their publishDate (future-dated posts auto-publish), and on the 1st of each
 * month the evergreen landing pages (/vs, /best, …, /player-tiers) plus the
 * roster hub, since those have no publish date of their own.
 *
 * Ownership is proven by the key file at /<INDEXNOW_KEY>.txt in /public.
 */

const HOST = 'bs-basketball.com';
const BASE = `https://${HOST}`;
const INDEXNOW_KEY = 'c27738dd334079e682ede61561746384';
const LOOKBACK_DAYS = 3;

function recentlyChangedUrls(now: Date): string[] {
  const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const urls: string[] = [];
  const newPosts = blogPosts.filter(p => p.publishDate > cutoff && p.publishDate <= today);
  for (const p of newPosts) urls.push(`${BASE}/blog/${p.slug}`);
  if (newPosts.length) urls.push(`${BASE}/blog`);
  if (now.getUTCDate() === 1) {
    for (const p of seoPages) urls.push(`${BASE}/${p.section}/${p.slug}`);
    urls.push(`${BASE}/player-tiers`, `${BASE}/rosters/2026`);
  }
  return urls;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const urlList = recentlyChangedUrls(new Date());
  if (urlList.length === 0) return NextResponse.json({ submitted: 0, urls: [] });

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: `${BASE}/${INDEXNOW_KEY}.txt`, urlList }),
  });
  // 200 = accepted, 202 = accepted pending key check; anything else is logged.
  if (res.status !== 200 && res.status !== 202) {
    console.error('[indexnow] submit failed', res.status, await res.text().catch(() => ''));
    return NextResponse.json({ submitted: 0, status: res.status, urls: urlList }, { status: 502 });
  }
  return NextResponse.json({ submitted: urlList.length, status: res.status, urls: urlList });
}
