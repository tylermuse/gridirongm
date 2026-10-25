import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  CATEGORY_LABELS,
  formatPostDate,
  getPublishedPostBySlug,
  getPublishedPosts,
  getRelatedPosts,
  wordCount,
} from '@/lib/content/posts';
import {
  ARTICLE_PROSE,
  Breadcrumbs,
  ContentFrame,
  JsonLd,
  PlayCta,
  breadcrumbJsonLd,
} from '@/components/content/ContentBits';

const SITE = 'https://www.bs-basketball.com';

// Published posts are prebuilt; a post dated in the future 404s until its date,
// then renders on first request (dynamicParams) and is cached for a day.
export const revalidate = 86400;
export const dynamicParams = true;

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getPublishedPosts().map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPublishedPostBySlug(slug);
  if (!post) return { title: 'Not found', robots: { index: false } };
  const url = `${SITE}/blog/${post.slug}`;
  return {
    title: post.seoTitle,
    description: post.metaDescription,
    keywords: post.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: post.seoTitle,
      description: post.metaDescription,
      url,
      type: 'article',
      publishedTime: post.publishDate,
      siteName: 'BS Hoops',
    },
    twitter: { card: 'summary_large_image', title: post.seoTitle, description: post.metaDescription },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPublishedPostBySlug(slug);
  if (!post) notFound();

  const url = `${SITE}/blog/${post.slug}`;
  const related = getRelatedPosts(post);

  return (
    <ContentFrame>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: post.title,
          description: post.metaDescription,
          datePublished: post.publishDate,
          dateModified: post.publishDate,
          wordCount: wordCount(post.content),
          articleSection: CATEGORY_LABELS[post.category],
          keywords: post.keywords.join(', '),
          mainEntityOfPage: { '@type': 'WebPage', '@id': url },
          url,
          author: { '@type': 'Organization', name: 'BS Hoops', url: `${SITE}/about` },
          publisher: { '@type': 'Organization', name: 'BS Sports GM LLC', url: SITE },
          about: { '@type': 'VideoGame', name: 'BS Hoops', url: SITE },
        }}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { label: 'Home', url: `${SITE}/` },
          { label: 'Blog', url: `${SITE}/blog` },
          { label: post.title, url },
        ])}
      />
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: CATEGORY_LABELS[post.category] }]} />

      <article>
        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-sec)] mb-3">
            <span
              className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
            >
              {CATEGORY_LABELS[post.category]}
            </span>
            <time dateTime={post.publishDate}>{formatPostDate(post.publishDate)}</time>
            <span>{post.readingTime} min read</span>
          </div>
          <h1 className="text-3xl sm:text-[2.6rem] font-black tracking-tight leading-[1.08]" style={{ fontFamily: 'var(--font-display)' }}>
            {post.title}
          </h1>
          <p className="mt-4 text-lg text-[var(--text-sec)] leading-relaxed">{post.summary}</p>
        </header>

        <div
          className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 sm:px-9 py-6 sm:py-8 overflow-x-auto ${ARTICLE_PROSE}`}
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
      </article>

      <PlayCta
        title="Put it into practice"
        body="BS Hoops is free, runs in your browser, and needs no account. Pick a franchise and you’ll be setting a rotation in under a minute."
        secondary={{ label: 'Browse 2026 rosters', href: '/rosters/2026' }}
      />

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-sec)] mb-3">Keep reading</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {related.map(r => (
              <Link
                key={r.slug}
                href={`/blog/${r.slug}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent)] transition-colors"
              >
                <div className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--accent)' }}>
                  {CATEGORY_LABELS[r.category]}
                </div>
                <div className="font-bold leading-snug text-sm">{r.title}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </ContentFrame>
  );
}
