import Link from 'next/link';

/**
 * Shared server-rendered pieces for the crawlable content pages (blog, roster
 * reference). Theme tokens only — no typography plugin in Hoops, so article
 * elements are styled with arbitrary child selectors (same approach as
 * LegalPage).
 */

export const ARTICLE_PROSE = [
  'text-[16px] leading-[1.75] text-[var(--foreground)]',
  '[&_p]:my-4',
  '[&_h2]:text-2xl [&_h2]:font-black [&_h2]:tracking-tight [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:[font-family:var(--font-display)]',
  '[&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-7 [&_h3]:mb-2',
  '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-4 [&_li]:my-1.5',
  '[&_a]:text-[var(--accent)] [&_a]:font-semibold hover:[&_a]:underline',
  '[&_strong]:font-semibold',
  '[&_table]:w-full [&_table]:my-6 [&_table]:text-sm [&_table]:border-collapse',
  '[&_th]:text-left [&_th]:font-semibold [&_th]:bg-[var(--muted)] [&_th]:px-3 [&_th]:py-2 [&_th]:border-b [&_th]:border-[var(--border)]',
  '[&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-[var(--border)] [&_td]:align-top',
  '[&_blockquote]:border-l-4 [&_blockquote]:border-[var(--accent)] [&_blockquote]:pl-4 [&_blockquote]:my-6 [&_blockquote]:text-[var(--text-sec)]',
].join(' ');

export interface Crumb { label: string; href?: string }

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-[var(--text-sec)] mb-5 flex flex-wrap items-center gap-y-1">
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`} className="inline-flex items-center min-w-0">
          {i > 0 && <span className="mx-2 opacity-60">/</span>}
          {c.href ? (
            <Link href={c.href} className="hover:text-[var(--foreground)]">{c.label}</Link>
          ) : (
            <span className="text-[var(--foreground)] truncate">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** schema.org BreadcrumbList for the same trail. */
export function breadcrumbJsonLd(items: { label: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: c.url })),
  };
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

export function PlayCta({ title, body, secondary }: { title: string; body: string; secondary?: { label: string; href: string } }) {
  return (
    <div
      className="mt-12 rounded-2xl border px-6 py-8 text-center"
      style={{ borderColor: 'color-mix(in srgb, var(--accent) 35%, var(--border))', background: 'color-mix(in srgb, var(--accent) 7%, var(--surface))' }}
    >
      <h2 className="text-2xl font-black mb-2" style={{ fontFamily: 'var(--font-display)' }}>{title}</h2>
      <p className="text-[var(--text-sec)] mb-5 max-w-xl mx-auto">{body}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className="inline-block rounded-lg px-6 py-3 font-semibold text-white hover:brightness-95" style={{ background: 'var(--accent)' }}>
          Play BS Hoops free →
        </Link>
        {secondary && (
          <Link href={secondary.href} className="inline-block rounded-lg px-6 py-3 font-semibold border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]">
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Page frame for content pages: max width + footer links + parody note. */
export function ContentFrame({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`${wide ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-4 sm:px-6 py-10`}>
      {children}
      <div className="mt-12 pt-6 border-t border-[var(--border)]">
        <p className="text-[11px] text-[var(--text-sec)] opacity-80">
          BS Hoops is an independent parody basketball simulation. It is not affiliated with or endorsed by the NBA, any team, or any player.
        </p>
      </div>
    </main>
  );
}
