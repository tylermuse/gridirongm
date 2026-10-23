import { NextResponse, type NextRequest } from 'next/server';
import { blogPosts } from '@/lib/content/posts';
import { isAuthorizedCron } from '@/lib/cronAuth';

/**
 * IndexNow ping (Bing, plus Yandex/Seznam/Naver via the shared endpoint).
 * Bing's index also feeds ChatGPT search, so new pages get picked up within
 * hours instead of waiting for a crawl.
 *
 * Runs daily via Vercel Cron (vercel.json). Submits only URLs that changed in
 * the last few days: blog posts that just hit their publishDate (future-dated
 * posts auto-publish), and /predictions on Wednesdays, the day after its
 * Tuesday rebuild (see /api/cron/rebuild-predictions).
 *
 * Ownership is proven by the key file at /<INDEXNOW_KEY>.txt in /public.
 */

const HOST = 'bs-football.com';
const BASE = `https://${HOST}`;
const INDEXNOW_KEY = 'ec7ae8e01e7aeda248887579ed7f0f2a';
const LOOKBACK_DAYS = 3;

function recentlyChangedUrls(now: Date): string[] {
  const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const urls: string[] = [];
  const newPosts = blogPosts.filter(p => p.publishDate > cutoff && p.publishDate <= today);
  for (const p of newPosts) urls.push(`${BASE}/blog/${p.slug}`);
  if (newPosts.length) urls.push(`${BASE}/blog`);
  // Regular season runs September through early January.
  const month = now.getUTCMonth();
  if (now.getUTCDay() === 3 && (month >= 8 || month === 0)) urls.push(`${BASE}/predictions`);
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
