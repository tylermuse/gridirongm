import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ROSTER_LIMITS, type Position } from '@/types';
import {
  BOARD_POSITIONS,
  HOUSE_MOCK_SETTINGS,
  asOfLabel,
  encodeShareQuery,
  findTeamBySlug,
  heightLabel,
  houseMock,
  needLabel,
  prospectTier,
  recordLabel,
  teamDraftNeeds,
  teamSlug,
  type MadePick,
  type MockDraftData,
  type MockProspect,
  type MockTeam,
} from '@/lib/mockDraft/engine';
import { getMockDraftData } from '@/lib/mockDraft/serverData';
import { TeamLogo } from '@/components/ui/TeamLogo';

const BASE_URL = 'https://bs-football.com';
const BOARD_PATH = '/mock-draft/2027';
/** Need positions to show prospects for, and how many each. */
const MAX_NEED_SECTIONS = 4;
const PROSPECTS_PER_NEED = 3;

type Params = Promise<{ team: string }>;

// The 32 slugs are the whole route. Anything else 404s instead of rendering on demand.
export const dynamicParams = false;

export function generateStaticParams() {
  return getMockDraftData().teams.map((team) => ({ team: teamSlug(team) }));
}

function fullName(team: Pick<MockTeam, 'region' | 'name'>): string {
  return `${team.region} ${team.name}`;
}

function prospectName(p: MockProspect): string {
  return `${p.firstName} ${p.lastName}`;
}

/** Everything a team page shows, from one read of the data file. */
function teamPageData(data: MockDraftData, team: MockTeam) {
  const teamsById = new Map(data.teams.map((t) => [t.tid, t]));
  const picks = data.order.filter((slot) => slot.tid === team.tid);
  const tradedAway = data.order.filter((slot) => slot.originalTid === team.tid && slot.tid !== team.tid);
  const firstRoundTradedTo = tradedAway.find((slot) => slot.round === 1);
  const mock = houseMock(data);
  const mockByPick = new Map(mock.picks.map((p) => [p.slot.pick, p]));
  const mockByPid = new Map(mock.picks.map((p) => [p.prospect.pid, p]));
  const needs = teamDraftNeeds(data, team);
  const firstPick = picks[0];
  return { teamsById, picks, tradedAway, firstRoundTradedTo, mock, mockByPick, mockByPid, needs, firstPick };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = getMockDraftData();
  const team = findTeamBySlug(data, (await params).team);
  if (!team) return {};
  const { picks, firstPick, mockByPick, needs } = teamPageData(data, team);
  const projected = firstPick ? mockByPick.get(firstPick.pick) : undefined;

  const name = fullName(team);
  const title = `${name} ${data.draftYear} Mock Draft: 7-Round Picks and Needs | BS Football`;
  const parts = [`${name} ${data.draftYear} mock draft: all ${picks.length} picks`];
  if (firstPick) parts[0] += `, first at No. ${firstPick.pick}`;
  if (projected) parts.push(`Our AI mock takes ${prospectName(projected.prospect)} (${projected.prospect.pos}, ${projected.prospect.college})`);
  if (needs.length > 0) parts.push(`Needs: ${needs.slice(0, 3).map((n) => n.pos).join(', ')}`);
  const description = `${parts.join('. ')}. Updated weekly.`;

  const url = `${BASE_URL}${BOARD_PATH}/${teamSlug(team)}`;
  const image = `${BASE_URL}/api/og/mock?team=${teamSlug(team)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

function CtaButton({ team }: { team: MockTeam }) {
  return (
    <Link
      href={`/mock-draft?team=${teamSlug(team)}`}
      prefetch={false}
      className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
    >
      Run a mock draft as the {team.name} →
    </Link>
  );
}

function MockPickCell({ pick }: { pick: MadePick | undefined }) {
  if (!pick) return <span className="text-gray-400">—</span>;
  const p = pick.prospect;
  return (
    <span>
      <span className="font-semibold text-gray-900">{prospectName(p)}</span>
      <span className="text-gray-500">
        {' '}
        {p.pos}, {p.college} · board #{p.rank}
      </span>
    </span>
  );
}

function ProspectTable({
  prospects,
  mockByPid,
  teamsById,
}: {
  prospects: MockProspect[];
  mockByPid: Map<number, MadePick>;
  teamsById: Map<number, MockTeam>;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th scope="col" className="px-3 py-2">Rank</th>
            <th scope="col" className="px-3 py-2">Name</th>
            <th scope="col" className="px-3 py-2">Pos</th>
            <th scope="col" className="px-3 py-2">School</th>
            <th scope="col" className="px-3 py-2 whitespace-nowrap">Ht / Wt</th>
            <th scope="col" className="px-3 py-2">Tier</th>
            <th scope="col" className="px-3 py-2 whitespace-nowrap">In our mock</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 text-gray-700">
          {prospects.map((p) => {
            const mocked = mockByPid.get(p.pid);
            const mockTeam = mocked ? teamsById.get(mocked.slot.tid) : undefined;
            return (
              <tr key={p.pid}>
                <td className="px-3 py-2 tabular-nums font-semibold">{p.rank}</td>
                <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{prospectName(p)}</td>
                <td className="px-3 py-2">{p.pos}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.college}</td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">{heightLabel(p.hgt)} / {p.weight}</td>
                <td className="px-3 py-2 whitespace-nowrap">{prospectTier(p.pot)}</td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {mocked && mockTeam ? `No. ${mocked.slot.pick}, ${mockTeam.abbrev}` : 'Undrafted'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function TeamMockDraftPage({ params }: { params: Params }) {
  const data = getMockDraftData();
  const team = findTeamBySlug(data, (await params).team);
  if (!team) notFound();

  const { teamsById, picks, tradedAway, firstRoundTradedTo, mock, mockByPick, mockByPid, needs, firstPick } =
    teamPageData(data, team);
  const name = fullName(team);
  const slug = teamSlug(team);
  const projected = firstPick ? mockByPick.get(firstPick.pick) : undefined;
  const needPositions = new Set(needs.map((n) => n.pos));
  const strip = BOARD_POSITIONS.filter((pos) => pos !== 'K' && pos !== 'P');
  const mockQuery = encodeShareQuery(data, HOUSE_MOCK_SETTINGS, []);

  const prospectsByNeed = needs.slice(0, MAX_NEED_SECTIONS).map((need) => ({
    need,
    prospects: data.prospects.filter((p) => p.pos === need.pos).slice(0, PROSPECTS_PER_NEED),
  }));
  // Board neighbours of the first pick: a few ranked just ahead (in case they slide) and the rest just behind.
  const inRange = firstPick
    ? data.prospects.filter((p) => p.rank >= firstPick.pick - 3 && p.rank <= firstPick.pick + 4)
    : [];
  const otherTeams = [...data.teams].sort((a, b) => fullName(a).localeCompare(fullName(b)));

  const pageUrl = `${BASE_URL}${BOARD_PATH}/${slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'BS Football', item: BASE_URL },
          { '@type': 'ListItem', position: 2, name: `${data.draftYear} NFL Draft Big Board`, item: `${BASE_URL}${BOARD_PATH}` },
          { '@type': 'ListItem', position: 3, name: `${name} ${data.draftYear} Mock Draft`, item: pageUrl },
        ],
      },
      {
        '@type': 'ItemList',
        name: `${name} ${data.draftYear} Mock Draft`,
        url: pageUrl,
        numberOfItems: picks.length,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        itemListElement: picks.map((slot, i) => {
          const mocked = mockByPick.get(slot.pick);
          return {
            '@type': 'ListItem',
            position: i + 1,
            name: mocked
              ? `Round ${slot.round}, pick ${slot.pick}: ${prospectName(mocked.prospect)}, ${mocked.prospect.pos}, ${mocked.prospect.college}`
              : `Round ${slot.round}, pick ${slot.pick}`,
          };
        }),
      },
    ],
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <nav aria-label="Breadcrumb" className="text-sm text-gray-500 mb-4">
        <Link href={BOARD_PATH} className="hover:underline">
          {data.draftYear} NFL Draft Big Board
        </Link>{' '}
        / <span className="text-gray-700">{team.name}</span>
      </nav>

      <div className="flex items-center gap-4">
        <TeamLogo abbreviation={team.abbrev} primaryColor={team.colors[0]} secondaryColor={team.colors[1]} logoUrl={team.imgURL || undefined} logoOnWhite size="lg" />
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
          {name} {data.draftYear} Mock Draft
        </h1>
      </div>

      <p className="text-lg text-gray-700 leading-relaxed mt-4 max-w-3xl">
        The {team.name} are {recordLabel(team)} through Week {data.currentWeek} of the {data.season} season (as of{' '}
        {asOfLabel(data.asOf)}).{' '}
        {firstPick && firstPick.round === 1 ? (
          <>If the season ended today, their first pick would be No. {firstPick.pick} overall.</>
        ) : firstPick ? (
          <>
            They don&apos;t own a 1st-round pick
            {firstRoundTradedTo && (
              <>
                {' '}
                (it belongs to the {fullName(teamsById.get(firstRoundTradedTo.tid) ?? team)}, at No. {firstRoundTradedTo.pick})
              </>
            )}
            , so their first selection is No. {firstPick.pick}, in round {firstPick.round}.
          </>
        ) : (
          <>They don&apos;t currently own a pick in the {data.draftYear} draft.</>
        )}{' '}
        {projected && (
          <>
            In our AI mock they take <strong>{prospectName(projected.prospect)}</strong>, {projected.prospect.pos} from{' '}
            {projected.prospect.college}, with that pick.
          </>
        )}
      </p>
      <div className="mt-5">
        <CtaButton team={team} />
      </div>

      <section className="mt-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          {team.name} {data.draftYear} draft picks
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          All 7 rounds, in the order as of Week {data.currentWeek}, with the pick our AI makes in each slot.{' '}
          <Link href={`/mock-draft?${mockQuery}`} prefetch={false} className="text-blue-600 hover:underline">
            See the full {mock.picks.length}-pick mock
          </Link>
          .
        </p>
        {firstPick?.round !== 1 && (
          <p className="mb-3 inline-block rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            No 1st-round pick
          </p>
        )}
        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2">Round</th>
                <th scope="col" className="px-3 py-2">Pick</th>
                <th scope="col" className="px-3 py-2">Our mock pick</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {picks.map((slot) => {
                const via = slot.originalTid !== slot.tid ? teamsById.get(slot.originalTid) : undefined;
                return (
                  <tr key={slot.pick}>
                    <td className="px-3 py-2 tabular-nums font-semibold">{slot.round}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                      No. {slot.pick}
                      {via && <span className="text-gray-500"> (via {via.abbrev})</span>}
                    </td>
                    <td className="px-3 py-2">
                      <MockPickCell pick={mockByPick.get(slot.pick)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {tradedAway.length > 0 && (
          <p className="text-sm text-gray-600 mt-3">
            Traded away:{' '}
            {tradedAway
              .map((slot) => `round ${slot.round} (No. ${slot.pick}, now ${teamsById.get(slot.tid)?.abbrev ?? '?'})`)
              .join(', ')}
            .
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          {team.name} team needs
        </h2>
        <div className="flex flex-wrap gap-1.5 mb-3" aria-label="Players on the roster by position">
          {strip.map((pos: Position) => (
            <span
              key={pos}
              title={`${team.countByPosition[pos] ?? 0} on the roster, minimum ${ROSTER_LIMITS[pos].min}`}
              className={`px-2 py-1 rounded text-sm font-semibold tabular-nums ${
                needPositions.has(pos) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {pos} {team.countByPosition[pos] ?? 0}
            </span>
          ))}
        </div>
        {needs.length > 0 ? (
          <ul className="list-disc pl-5 text-gray-700 space-y-1">
            {needs.map((need) => (
              <li key={need.pos}>{needLabel(need, data.teams.length)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-700">
            No glaring holes: the {team.name}&apos; starters rank outside the league&apos;s bottom quarter at every
            position, so expect them to take the best player available.
          </p>
        )}
        <p className="text-xs text-gray-500 mt-2">
          Chips show players on the current roster at each position. Needs compare this roster&apos;s starters with the
          rest of the league. Kickers and punters aren&apos;t counted.
        </p>
      </section>

      {prospectsByNeed.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Top prospects at {team.name} need positions</h2>
          <p className="text-sm text-gray-500 mb-4">The highest-ranked players on our board at each position of need.</p>
          <div className="space-y-6">
            {prospectsByNeed.map(({ need, prospects }) => (
              <div key={need.pos}>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{need.pos}</h3>
                <ProspectTable prospects={prospects} mockByPid={mockByPid} teamsById={teamsById} />
              </div>
            ))}
          </div>
        </section>
      )}

      {firstPick && inRange.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Who could be there at No. {firstPick.pick}</h2>
          <p className="text-sm text-gray-500 mb-4">
            Prospects ranked near the {team.name}&apos; first pick on our {data.draftYear} big board.
          </p>
          <ProspectTable prospects={inRange} mockByPid={mockByPid} teamsById={teamsById} />
        </section>
      )}

      <div className="mt-10 rounded-xl border border-blue-200 bg-blue-50 p-6 text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Draft for the {team.name} yourself</h2>
        <p className="text-gray-700 mb-4">
          Make every {team.abbrev} pick against the AI, then see how your class grades out. It&apos;s free, with no login.
        </p>
        <CtaButton team={team} />
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-bold text-gray-900 mb-3">{data.draftYear} mock drafts for every team</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1 text-sm">
          {otherTeams.map((t) => (
            <li key={t.tid}>
              {t.tid === team.tid ? (
                <span className="font-semibold text-gray-900">{fullName(t)}</span>
              ) : (
                <Link href={`${BOARD_PATH}/${teamSlug(t)}`} prefetch={false} className="text-blue-600 hover:underline">
                  {fullName(t)}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
