import Link from 'next/link';
import type { Metadata } from 'next';
import { CATEGORY_LABELS, formatPostDate, getPublishedPosts } from '@/lib/content/posts';
import { Breadcrumbs, ContentFrame, JsonLd, breadcrumbJsonLd } from '@/components/content/ContentBits';

const SITE = 'https://bs-basketball.com';

// Rebuild daily so future-dated posts appear on their publish date.
export const revalidate = 86400;

const DESCRIPTION =
  'Strategy guides for BS Hoops, the free browser basketball GM game: salary cap and aprons, rotations and minutes, the draft lottery, trade value, player development, and game plans.';

export const metadata: Metadata = {
  title: 'Basketball GM Strategy Blog',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/blog` },
  openGraph: { title: 'BS Hoops Strategy Blog', description: DESCRIPTION, url: `${SITE}/blog`, type: 'website' },
};

export default function BlogIndex() {
  const posts = getPublishedPosts();
  const [lead, ...rest] = posts;

  return (
    <ContentFrame wide>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: 'BS Hoops Strategy Blog',
          url: `${SITE}/blog`,
          description: DESCRIPTION,
          blogPost: posts.map(p => ({
            '@type': 'BlogPosting',
            headline: p.title,
            url: `${SITE}/blog/${p.slug}`,
            datePublished: p.publishDate,
          })),
        }}
      />
      <JsonLd data={breadcrumbJsonLd([{ label: 'Home', url: `${SITE}/` }, { label: 'Blog', url: `${SITE}/blog` }])} />
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Blog' }]} />

      <header className="mb-8 max-w-3xl">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          Front Office Notes
        </h1>
        <p className="text-[var(--text-sec)] text-lg leading-relaxed">
          Strategy guides for running a franchise in BS Hoops — written from the game’s actual rules, so the numbers here
          are the numbers you’ll see on your cap sheet, depth chart and draft board.
        </p>
      </header>

      {!lead ? (
        <p className="text-[var(--text-sec)]">New guides are on the way — check back soon.</p>
      ) : (
        <>
          <Link
            href={`/blog/${lead.slug}`}
            className="block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 mb-6 hover:border-[var(--accent)] transition-colors"
          >
            <PostMeta category={CATEGORY_LABELS[lead.category]} date={lead.publishDate} minutes={lead.readingTime} />
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mt-2 mb-3" style={{ fontFamily: 'var(--font-display)' }}>
              {lead.title}
            </h2>
            <p className="text-[var(--text-sec)] leading-relaxed max-w-3xl">{lead.summary}</p>
            <span className="inline-block mt-4 text-sm font-semibold" style={{ color: 'var(--accent)' }}>Read the guide →</span>
          </Link>

          <div className="grid gap-4 sm:grid-cols-2">
            {rest.map(p => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--accent)] transition-colors"
              >
                <PostMeta category={CATEGORY_LABELS[p.category]} date={p.publishDate} minutes={p.readingTime} />
                <h2 className="text-lg font-bold leading-snug mt-2 mb-2">{p.title}</h2>
                <p className="text-sm text-[var(--text-sec)] leading-relaxed flex-1">{p.summary}</p>
              </Link>
            ))}
          </div>
        </>
      )}

      <section className="mt-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--text-sec)]">
        <h2 className="font-bold text-[var(--foreground)] mb-1">Looking for a team to run?</h2>
        Browse every franchise’s <Link href="/rosters/2026" className="font-semibold text-[var(--accent)] hover:underline">2026 roster, payroll and cap tier</Link>,
        or <Link href="/" className="font-semibold text-[var(--accent)] hover:underline">start a league</Link> — it’s free and runs in your browser.
      </section>
    </ContentFrame>
  );
}

function PostMeta({ category, date, minutes }: { category: string; date: string; minutes: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-sec)]">
      <span
        className="font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
        style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
      >
        {category}
      </span>
      <time dateTime={date}>{formatPostDate(date)}</time>
      <span>{minutes} min read</span>
    </div>
  );
}
