import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPageBySlug, seoPages, type SEOPage } from '@/lib/content/pages';
import {
  ARTICLE_PROSE,
  Breadcrumbs,
  ContentFrame,
  JsonLd,
  PlayCta,
  breadcrumbJsonLd,
} from '@/components/content/ContentBits';

/**
 * Shared renderer for the programmatic SEO landing pages (/vs, /alternatives,
 * /best, /for, /glossary). Ported from BS Football, where these pages drive
 * most of the organic traffic; each route file is a thin wrapper.
 */

const SITE = 'https://bs-basketball.com';

type Section = SEOPage['section'];

export const SECTION_LABELS: Record<Section, string> = {
  vs: 'Comparisons',
  alternatives: 'Alternatives',
  best: 'Best Of',
  for: 'For Fans',
  glossary: 'Glossary',
};

export function seoStaticParams(section: Section) {
  return seoPages.filter(p => p.section === section).map(p => ({ slug: p.slug }));
}

export function seoMetadata(section: Section, slug: string): Metadata {
  const page = getPageBySlug(section, slug);
  if (!page) return { title: 'Not found', robots: { index: false } };
  const url = `${SITE}/${section}/${page.slug}`;
  return {
    title: page.seoTitle,
    description: page.metaDescription,
    keywords: page.keywords,
    alternates: { canonical: url },
    openGraph: { title: page.seoTitle, description: page.metaDescription, url, siteName: 'BS Hoops' },
    twitter: { card: 'summary_large_image', title: page.seoTitle, description: page.metaDescription },
  };
}

const stripTags = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Q&A pairs from the page's "Frequently Asked Questions" section (h3 + following paragraphs). */
function extractFaq(html: string): { q: string; a: string }[] {
  const start = html.search(/<h2[^>]*>\s*Frequently Asked Questions/i);
  if (start < 0) return [];
  const faq = html.slice(start).replace(/^<h2[\s\S]*?<\/h2>/i, '');
  const end = faq.search(/<h2/i);
  const body = end >= 0 ? faq.slice(0, end) : faq;
  return body
    .split(/<h3[^>]*>/i)
    .slice(1)
    .map(chunk => {
      const [q, rest = ''] = chunk.split(/<\/h3>/i);
      return { q: stripTags(q), a: stripTags(rest) };
    })
    .filter(x => x.q && x.a);
}

export function SeoLandingPage({ section, slug }: { section: Section; slug: string }) {
  const page = getPageBySlug(section, slug);
  if (!page) notFound();

  const url = `${SITE}/${section}/${page.slug}`;
  const faq = page.schema === 'FAQ' ? extractFaq(page.content) : [];

  return (
    <ContentFrame>
      <JsonLd
        data={faq.length > 0
          ? {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              name: page.title,
              url,
              mainEntity: faq.map(({ q, a }) => ({
                '@type': 'Question',
                name: q,
                acceptedAnswer: { '@type': 'Answer', text: a },
              })),
            }
          : {
              '@context': 'https://schema.org',
              '@type': 'WebPage',
              name: page.title,
              description: page.metaDescription,
              url,
              about: { '@type': 'VideoGame', name: 'BS Hoops', url: SITE },
            }}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { label: 'Home', url: `${SITE}/` },
          { label: SECTION_LABELS[section], url },
          { label: page.title, url },
        ])}
      />
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: SECTION_LABELS[section] }]} />

      <article>
        <header className="mb-8">
          <h1 className="text-3xl sm:text-[2.6rem] font-black tracking-tight leading-[1.08]" style={{ fontFamily: 'var(--font-display)' }}>
            {page.title}
          </h1>
          <p className="mt-4 text-lg text-[var(--text-sec)] leading-relaxed">{page.metaDescription}</p>
        </header>

        <div
          className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 sm:px-9 py-6 sm:py-8 overflow-x-auto ${ARTICLE_PROSE}`}
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      </article>

      <PlayCta
        title="Ready to run a franchise?"
        body="BS Hoops is free, runs in your browser, and needs no account. Pick a team and you’ll be setting a rotation in under a minute."
        secondary={{ label: 'Browse 2026 rosters', href: '/rosters/2026' }}
      />

      {page.internalLinks.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-sec)] mb-3">Related</h2>
          <div className="flex flex-wrap gap-2">
            {page.internalLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      )}
    </ContentFrame>
  );
}
