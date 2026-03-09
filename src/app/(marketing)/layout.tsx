import Link from 'next/link';

const NAV_ITEMS = [
  { label: 'Blog', href: '/blog' },
  { label: 'vs Competitors', href: '/vs/football-gm' },
  { label: 'Best Of', href: '/best/football-gm-games' },
  { label: 'Glossary', href: '/glossary/football-gm-simulator' },
];

const FOOTER_COLS = [
  {
    title: 'Game',
    links: [
      { label: 'Play Now', href: '/' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Compare',
    links: [
      { label: 'vs Football GM', href: '/vs/football-gm' },
      { label: 'vs Madden', href: '/vs/madden-franchise-mode' },
      { label: 'Best Football GM Games', href: '/best/football-gm-games' },
      { label: 'Free Football Games', href: '/best/free-football-games-online' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Draft Strategy Guide', href: '/blog/draft-strategy-guide' },
      { label: 'Salary Cap Tips', href: '/blog/salary-cap-management-tips' },
      { label: 'What Is a Football GM?', href: '/glossary/football-gm-simulator' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Football GM Alternative', href: '/alternatives/football-gm' },
      { label: 'Madden Alternative', href: '/alternatives/madden-franchise-mode' },
      { label: 'For Draft Fans', href: '/for/nfl-draft-fans' },
      { label: 'For Fantasy Players', href: '/for/fantasy-football-players' },
    ],
  },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f0f4f8' }}>
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <span className="text-blue-600">GRIDIRON</span>
            <span className="text-gray-900">GM</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Play Now
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {FOOTER_COLS.map(col => (
              <div key={col.title}>
                <h3 className="text-sm font-bold text-gray-900 mb-3">{col.title}</h3>
                <ul className="space-y-2">
                  {col.links.map(link => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 pt-6 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} Gridiron GM. All rights reserved.</p>
            <Link href="/" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              Play Now &mdash; It&apos;s Free
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
