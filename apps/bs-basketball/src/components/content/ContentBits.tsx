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
/** Shared nav + footer links for the public content pages (parity with BS
 *  Football's (marketing) layout). Search visitors land here with no league
 *  loaded, so the app shell is minimal — this is their only site navigation. */
const CONTENT_NAV = [
  { label: 'Rosters', href: '/rosters/2026' },
  { label: 'Player Tiers', href: '/player-tiers' },
  { label: 'Playoff Odds', href: '/predictions' },
  { label: 'Blog', href: '/blog' },
  { label: 'Compare', href: '/vs/basketball-gm' },
];

const CONTENT_FOOTER = [
  {
    title: 'Game',
    links: [
      { label: 'Play Now', href: '/' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Real NBA Rosters', href: '/rosters' },
    ],
  },
  {
    title: 'Data',
    links: [
      { label: '2026-27 Team Rosters', href: '/rosters/2026' },
      { label: 'Player Tiers', href: '/player-tiers' },
      { label: 'Playoff Odds', href: '/predictions' },
    ],
  },
  {
    title: 'Compare',
    links: [
      { label: 'vs Basketball GM', href: '/vs/basketball-gm' },
      { label: 'vs NBA 2K MyLeague', href: '/vs/nba-2k-myleague' },
      { label: 'Best Basketball GM Games', href: '/best/basketball-gm-games' },
      { label: 'Free Basketball Games', href: '/best/free-basketball-games-online' },
      { label: 'Basketball GM Alternative', href: '/alternatives/basketball-gm' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Beginner’s Guide', href: '/blog/first-season-beginners-guide' },
      { label: 'Cap, Tax & Aprons', href: '/glossary/nba-salary-cap-aprons' },
      { label: 'For Fantasy Players', href: '/for/fantasy-basketball-players' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'BS Football', href: 'https://bs-football.com' },
    ],
  },
];

function ContentHeader() {
  return (
    <header className="flex items-center gap-4 mb-8 pb-4 border-b border-[var(--border)]">
      <Link href="/" className="font-black text-lg tracking-tight shrink-0" style={{ fontFamily: 'var(--font-display)' }}>
        <span style={{ color: 'var(--accent)' }}>BS</span> Hoops
      </Link>
      <nav aria-label="Site" className="flex-1 min-w-0 flex items-center gap-4 overflow-x-auto text-sm text-[var(--text-sec)] [scrollbar-width:none]">
        {CONTENT_NAV.map(item => (
          <Link key={item.href} href={item.href} className="whitespace-nowrap hover:text-[var(--foreground)] transition-colors">
            {item.label}
          </Link>
        ))}
      </nav>
      <Link href="/" className="hidden sm:inline-block shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
        Play Now
      </Link>
    </header>
  );
}

function ContentFooter() {
  return (
    <footer className="mt-12 pt-8 border-t border-[var(--border)]">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
        {CONTENT_FOOTER.map(col => (
          <div key={col.title}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2">{col.title}</h3>
            <ul className="space-y-1.5">
              {col.links.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-[var(--text-sec)] hover:text-[var(--foreground)] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {/* The app shell's footer carries the parody / not-affiliated notice. */}
    </footer>
  );
}

export function ContentFrame({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`${wide ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-4 sm:px-6 py-6 sm:py-8`}>
      <ContentHeader />
      {children}
      <ContentFooter />
    </main>
  );
}
