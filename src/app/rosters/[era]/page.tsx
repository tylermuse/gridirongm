import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import ReferenceChrome from '@/components/reference/ReferenceChrome';
import { listEras, getEraMeta, getTeams } from '@/lib/data/referenceRosters';

interface Props {
  params: Promise<{ era: string }>;
}

export function generateStaticParams() {
  return listEras().map((e) => ({ era: e.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { era } = await params;
  const meta = getEraMeta(era);
  if (!meta) return {};
  const title = `${meta.label} — All 32 Team Rosters`;
  return {
    title,
    description: meta.blurb,
    openGraph: { title, description: meta.blurb, url: `https://bs-football.com/rosters/${era}` },
    alternates: { canonical: `https://bs-football.com/rosters/${era}` },
  };
}

export default async function EraRosterIndex({ params }: Props) {
  const { era } = await params;
  const meta = getEraMeta(era);
  if (!meta) notFound();
  const teams = getTeams(era);

  return (
    <ReferenceChrome>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <nav className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/rosters" className="hover:text-gray-700">Rosters</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{meta.season}</span>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">{meta.label}</h1>
        <p className="text-lg text-gray-600 mb-10 max-w-3xl">{meta.blurb}</p>

        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {teams.map((t) => (
            <Link
              key={t.abbrev}
              href={`/rosters/${era}/${t.abbrev.toLowerCase()}`}
              className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <span
                className="inline-block h-9 w-9 rounded-lg shrink-0"
                style={{ backgroundColor: t.colors[0] || '#1f2937' }}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block font-semibold text-gray-900 text-sm truncate group-hover:text-blue-700">
                  {t.fullName}
                </span>
                <span className="block text-xs text-gray-400">
                  {t.abbrev}
                  {typeof t.won === 'number' && typeof t.lost === 'number' ? ` · ${t.won}-${t.lost}${t.tied ? `-${t.tied}` : ''}` : ''}
                </span>
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-12 py-8 px-6 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Take control of any of these rosters</h2>
          <p className="text-gray-600 mb-5">Draft, trade, and manage the cap in BS Football — free, in your browser.</p>
          <Link href="/" className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Play Now — It&apos;s Free
          </Link>
        </div>
      </div>
    </ReferenceChrome>
  );
}
