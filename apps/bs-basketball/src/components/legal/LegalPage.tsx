import Link from 'next/link';

/**
 * Shared shell for static legal/info pages (privacy, terms, about). Server
 * component — these pages are crawlable HTML, unlike the client-rendered game.
 * Styles headings/lists/links with theme tokens (no typography plugin in Hoops).
 */

export const COMPANY = 'BS Sports GM LLC';
export const STATE = 'Texas';
export const CONTACT_EMAIL = 'support@bs-football.com';
export const SITE = 'https://bs-basketball.com';

const PROSE = [
  'text-[15px] leading-relaxed text-[var(--foreground)]',
  '[&_p]:my-3 [&_p]:text-[var(--foreground)]/90',
  '[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-9 [&_h2]:mb-3',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-3 [&_li]:my-1.5',
  '[&_a]:text-[var(--accent)] [&_a]:font-semibold hover:[&_a]:underline',
  '[&_strong]:font-semibold',
].join(' ');

export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <nav className="text-sm text-[var(--text-sec)] mb-5">
        <Link href="/" className="hover:text-[var(--foreground)]">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--foreground)]">{title}</span>
      </nav>
      <h1 className="text-3xl sm:text-4xl font-black mb-1" style={{ fontFamily: 'var(--font-display)' }}>{title}</h1>
      {updated && <p className="text-sm text-[var(--text-sec)] mb-8">Last updated: {updated}</p>}
      <div className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 sm:px-8 py-6 ${PROSE}`}>
        {children}
      </div>
      <LegalLinks />
    </main>
  );
}

export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-sec)] mt-6 ${className}`}>
      <Link href="/about" className="hover:text-[var(--foreground)]">About</Link>
      <Link href="/privacy" className="hover:text-[var(--foreground)]">Privacy</Link>
      <Link href="/terms" className="hover:text-[var(--foreground)]">Terms</Link>
      <a href="https://bs-football.com" className="hover:text-[var(--foreground)]">BS Football</a>
    </div>
  );
}
