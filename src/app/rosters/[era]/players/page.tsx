import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import ReferenceChrome from '@/components/reference/ReferenceChrome';
import { listEras, getEraMeta, getPlayerDetails, POS_ORDER, POS_NAMES } from '@/lib/data/referenceRosters';

/** /rosters/[era]/players — the top players at every position, linking to each player page. */

export const dynamic = 'force-static';
export const dynamicParams = false;

const TOP_N = 32;

type Params = Promise<{ era: string }>;

export function generateStaticParams() {
  return listEras().map((e) => ({ era: e.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { era } = await params;
  const meta = getEraMeta(era);
  if (!meta) return {};
  const title = `${meta.season} NFL Player Ratings: Best Players at Every Position`;
  const description = `BS Football's ${meta.season} ratings for every NFL player, ranked by position: the top ${TOP_N} quarterbacks, running backs, receivers, linemen, defenders and kickers, with real season stats. Updated weekly.`;
  const url = `https://bs-football.com/rosters/${era}/players`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url } };
}

export default async function PlayersHub({ params }: { params: Params }) {
  const { era } = await params;
  const meta = getEraMeta(era);
  if (!meta) notFound();
  const all = getPlayerDetails(era);

  return (
    <ReferenceChrome>
      <article className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <nav className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href={`/rosters/${era}`} className="hover:text-gray-700">{meta.season} Rosters</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Player Ratings</span>
        </nav>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">{meta.season} NFL Player Ratings</h1>
        <p className="text-lg text-gray-600 mb-6 max-w-3xl">
          The best players at every position, by BS Football overall rating. Ratings start from each player&apos;s real profile and
          are adjusted every week for how he&apos;s actually playing. {all.length.toLocaleString('en-US')} players across all 32 teams.
        </p>
        <div className="flex flex-wrap gap-2 mb-8">
          {POS_ORDER.map((pos) => (
            <a key={pos} href={`#${pos.toLowerCase()}`} className="text-sm px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300">{pos}</a>
          ))}
        </div>

        {POS_ORDER.map((pos) => {
          const list = all.filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name)).slice(0, TOP_N);
          if (!list.length) return null;
          return (
            <section key={pos} id={pos.toLowerCase()} className="mt-10 scroll-mt-20">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Top {list.length} {POS_NAMES[pos]?.many ?? pos}</h2>
              <ol className="grid sm:grid-cols-2 gap-x-6 rounded-xl border border-gray-200 bg-white p-2">
                {list.map((p) => (
                  <li key={p.pid} className="flex items-center gap-3 px-2 py-1.5 text-sm border-b border-gray-100">
                    <span className="w-8 text-gray-500 tabular-nums">#{p.posRank}</span>
                    <Link href={`/rosters/${era}/players/${p.slug}`} className="flex-1 text-blue-600 hover:underline">{p.name}</Link>
                    <span className="text-gray-500 w-10">{p.team.abbrev}</span>
                    <span className="w-8 text-right font-semibold tabular-nums text-gray-900">{p.ovr}</span>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}

        <p className="mt-10 text-sm text-gray-600">
          Looking for a specific team? Every player is on his <Link href={`/rosters/${era}`} className="text-blue-600 hover:underline">team&apos;s {meta.season} roster page</Link>.
        </p>
        <p className="mt-6 text-xs text-gray-400 max-w-3xl">
          Ratings are BS Football&apos;s own and are not official NFL or Madden ratings. BS Football is not affiliated with or endorsed by the National Football League.
        </p>
      </article>
    </ReferenceChrome>
  );
}
