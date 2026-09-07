import Link from 'next/link';

const NAV = [
  { label: 'Rosters', href: '/rosters' },
  { label: 'Blog', href: '/blog' },
  { label: 'Pricing', href: '/pricing' },
];

const FOOTER_LINKS = [
  { label: 'Rosters', href: '/rosters' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
];

/** Lightweight server-rendered header + footer for the public reference pages,
 *  matching the marketing site's look and giving crawlers real internal links. */
export default function ReferenceChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f0f4f8' }}>
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <span className="text-blue-600">BS</span>
            <span className="text-gray-900">Football</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                {item.label}
              </Link>
            ))}
          </nav>
          <Link href="/" className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Play Now
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-gray-200 bg-white mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6">
            {FOOTER_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                {l.label}
              </Link>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} BS Sports GM LLC. BS Football is an independent football simulation and is not
            affiliated with or endorsed by the National Football League.
          </p>
        </div>
      </footer>
    </div>
  );
}
