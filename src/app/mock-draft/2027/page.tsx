import type { Metadata } from 'next';
import Link from 'next/link';
import { publicConsensusBlurb } from '@/lib/engine/draftScoutEval';
import type { Position } from '@/types';
import {
  BOARD_POSITIONS,
  asOfLabel,
  heightLabel,
  prospectTier,
  recordLabel,
  teamSlug,
  type ProspectTier,
} from '@/lib/mockDraft/engine';
import { getMockDraftData } from '@/lib/mockDraft/serverData';
import { TeamLogo } from '@/components/ui/TeamLogo';

const BASE_URL = 'https://bs-football.com';
const PAGE_PATH = '/mock-draft/2027';

type SearchParams = Promise<{ pos?: string | string[] }>;

const TIER_CLASS: Record<ProspectTier, string> = {
  'Blue-chip': 'bg-blue-100 text-blue-800',
  '1st-round': 'bg-green-100 text-green-800',
  'Day 2': 'bg-amber-100 text-amber-800',
  'Day 3': 'bg-gray-100 text-gray-700',
};

function parsePosition(raw: string | string[] | undefined): Position | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return BOARD_POSITIONS.find((pos) => pos === value?.toUpperCase()) ?? null;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const data = getMockDraftData();
  const position = parsePosition((await searchParams).pos);
  const count = position ? data.prospects.filter((p) => p.pos === position).length : data.prospects.length;
  const title = position
    ? `${data.draftYear} NFL Draft ${position} Rankings: Top ${count} Prospects | BS Football`
    : `${data.draftYear} NFL Draft Big Board: Top ${count} Prospects | BS Football`;
  const description = `The ${data.draftYear} NFL Draft big board: ${count} ${position ? `${position} ` : ''}prospects ranked with school, size, age, and draft tier, plus the current draft order. Updated weekly.`;
  const url = `${BASE_URL}${PAGE_PATH}${position ? `?pos=${position}` : ''}`;
  const image = `${BASE_URL}/api/og/mock`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

function MockDraftCta() {
  return (
    <Link
      href="/mock-draft"
      className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
    >
      Run your own mock draft →
    </Link>
  );
}

export default async function BigBoardPage({ searchParams }: { searchParams: SearchParams }) {
  const data = getMockDraftData();
  const position = parsePosition((await searchParams).pos);
  const prospects = position ? data.prospects.filter((p) => p.pos === position) : data.prospects;
  const teams = new Map(data.teams.map((t) => [t.tid, t]));
  const roundOne = data.order.filter((slot) => slot.round === 1);
  // The round-1 list misses teams that traded their 1st, so the team pages get their own full list.
  const teamsByName = [...data.teams].sort((a, b) => `${a.region} ${a.name}`.localeCompare(`${b.region} ${b.name}`));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${data.draftYear} NFL Draft Big Board${position ? `: ${position}` : ''}`,
    numberOfItems: prospects.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: prospects.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${p.firstName} ${p.lastName}, ${p.pos}, ${p.college}`,
    })),
  };

  const chipClass = 'px-3 py-1 rounded-full text-sm font-semibold transition-colors';
  const chipOn = 'bg-blue-600 text-white';
  const chipOff = 'bg-white border border-gray-200 text-gray-700 hover:border-blue-300';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
        {data.draftYear} NFL Draft Big Board: Top {prospects.length} {position ? `${position} ` : ''}Prospects
      </h1>
      <p className="text-lg text-gray-700 leading-relaxed mt-3 mb-5 max-w-3xl">
        Every prospect in the {data.draftYear} NFL Draft class, ranked by BS Football, as of {asOfLabel(data.asOf)} (Week{' '}
        {data.currentWeek} of the {data.season} season). The class can still change before the underclassman declaration
        deadline in January.
      </p>
      <MockDraftCta />

      <nav aria-label="Filter by position" className="flex flex-wrap gap-2 mt-8 mb-4">
        <Link href={PAGE_PATH} prefetch={false} className={`${chipClass} ${position ? chipOff : chipOn}`}>
          All
        </Link>
        {BOARD_POSITIONS.map((pos) => (
          <Link
            key={pos}
            href={`${PAGE_PATH}?pos=${pos}`}
            prefetch={false}
            className={`${chipClass} ${position === pos ? chipOn : chipOff}`}
          >
            {pos}
          </Link>
        ))}
      </nav>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="px-3 py-2">Rank</th>
              <th scope="col" className="px-3 py-2">Name</th>
              <th scope="col" className="px-3 py-2">Pos</th>
              <th scope="col" className="px-3 py-2">School</th>
              <th scope="col" className="px-3 py-2 whitespace-nowrap">Ht / Wt</th>
              <th scope="col" className="px-3 py-2">Age</th>
              <th scope="col" className="px-3 py-2">Tier</th>
              <th scope="col" className="px-3 py-2 min-w-64">Outlook</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-700">
            {prospects.map((p) => {
              const tier = prospectTier(p.pot);
              return (
                <tr key={p.pid}>
                  <td className="px-3 py-2 tabular-nums font-semibold">{p.rank}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{p.firstName} {p.lastName}</td>
                  <td className="px-3 py-2">{p.pos}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{p.college}</td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">{heightLabel(p.hgt)} / {p.weight}</td>
                  <td className="px-3 py-2 tabular-nums">{p.age}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${TIER_CLASS[tier]}`}>{tier}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {publicConsensusBlurb({ projectedRank: p.rank, ratings: { overall: p.ovr } })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="mt-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Draft order if the season ended today</h2>
        <p className="text-sm text-gray-500 mb-4">
          Round 1, as of Week {data.currentWeek}. Pick a team for its full 7-round mock draft and needs.
        </p>
        <ol className="grid sm:grid-cols-2 gap-x-6 rounded-xl border border-gray-200 bg-white px-4 py-2">
          {roundOne.map((slot) => {
            const team = teams.get(slot.tid);
            if (!team) return null;
            const via = slot.tid !== slot.originalTid ? teams.get(slot.originalTid)?.abbrev : null;
            return (
              <li key={slot.pick} className="flex items-center gap-3 py-2 border-b border-gray-100 text-sm">
                <span className="w-6 shrink-0 tabular-nums font-semibold text-gray-500">{slot.pick}</span>
                <TeamLogo abbreviation={team.abbrev} primaryColor={team.colors[0]} secondaryColor={team.colors[1]} logoUrl={team.imgURL || undefined} logoOnWhite size="sm" />
                <Link
                  href={`${PAGE_PATH}/${teamSlug(team)}`}
                  prefetch={false}
                  className="font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                >
                  {team.region} {team.name}
                </Link>
                <span className="text-gray-500 tabular-nums">{recordLabel(team)}</span>
                {via && <span className="ml-auto text-xs text-gray-500">via {via}</span>}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">{data.draftYear} mock drafts by team</h2>
        <p className="text-sm text-gray-500 mb-4">Every team&apos;s picks across all 7 rounds, its needs, and the prospects in range.</p>
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1 text-sm">
          {teamsByName.map((team) => (
            <li key={team.tid}>
              <Link href={`${PAGE_PATH}/${teamSlug(team)}`} prefetch={false} className="text-blue-600 hover:underline">
                {team.region} {team.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 rounded-xl border border-blue-200 bg-blue-50 p-6 text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Think you can draft better?</h2>
        <p className="text-gray-700 mb-4">Pick your team and see how your class grades out. It&apos;s free, with no login.</p>
        <MockDraftCta />
      </div>
    </div>
  );
}
