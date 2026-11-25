import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import ReferenceChrome from '@/components/reference/ReferenceChrome';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { teamSlug } from '@/lib/mockDraft/engine';
import {
  listEras,
  getEraMeta,
  getPlayerDetails,
  getPlayerBySlug,
  isIndexablePlayer,
  formatContract,
  formatHeight,
  KEY_RATINGS,
  POS_NAMES,
  RATING_LABELS,
  type RefPlayerDetail,
} from '@/lib/data/referenceRosters';

/**
 * /rosters/[era]/players/[slug] — one player's BS Football ratings, real
 * season stats, contract and injury status, built at deploy time from the
 * weekly-refreshed roster file. URLs don't include the team, so they survive
 * trades. Players without a game played this season are noindex (thin pages)
 * and left out of the sitemap, but still linked so their teammates' pages work.
 */

export const dynamic = 'force-static';
export const dynamicParams = false;

const BASE_URL = 'https://bs-football.com';

type Params = Promise<{ era: string; slug: string }>;

export function generateStaticParams() {
  return listEras().flatMap((e) => getPlayerDetails(e.slug).map((p) => ({ era: e.slug, slug: p.slug })));
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

const posOne = (pos: string) => POS_NAMES[pos]?.one ?? pos;
const posMany = (pos: string) => POS_NAMES[pos]?.many ?? `${pos}s`;
const fmt = (n: number) => n.toLocaleString('en-US');
const ratio = (a: number, b: number, digits = 1) => (b ? (a / b).toFixed(digits) : '—');

function fgMade(s: Record<string, number>) { return s.fg0 + s.fg20 + s.fg30 + s.fg40 + s.fg50; }
function fgAtt(s: Record<string, number>) { return s.fga0 + s.fga20 + s.fga30 + s.fga40 + s.fga50; }

/** Position-appropriate season stat line: [label, value] pairs. */
function statLine(p: RefPlayerDetail): Array<[string, string]> {
  const s = p.seasonStats;
  if (!s) return [];
  const tackles = s.defTckSolo + s.defTckAst;
  switch (p.pos) {
    case 'QB': return [['GP', fmt(s.gp)], ['Cmp/Att', `${fmt(s.pssCmp)}/${fmt(s.pss)}`], ['Cmp %', s.pss ? `${((s.pssCmp / s.pss) * 100).toFixed(1)}` : '—'], ['Pass Yds', fmt(s.pssYds)], ['TD', fmt(s.pssTD)], ['INT', fmt(s.pssInt)], ['Rush Yds', fmt(s.rusYds)], ['Rush TD', fmt(s.rusTD)]];
    case 'RB': return [['GP', fmt(s.gp)], ['Carries', fmt(s.rus)], ['Rush Yds', fmt(s.rusYds)], ['YPC', ratio(s.rusYds, s.rus)], ['Rush TD', fmt(s.rusTD)], ['Rec', fmt(s.rec)], ['Rec Yds', fmt(s.recYds)], ['Rec TD', fmt(s.recTD)]];
    case 'WR':
    case 'TE': return [['GP', fmt(s.gp)], ['Targets', fmt(s.tgt)], ['Rec', fmt(s.rec)], ['Rec Yds', fmt(s.recYds)], ['Y/Rec', ratio(s.recYds, s.rec)], ['Rec TD', fmt(s.recTD)]];
    case 'OL': return [['GP', fmt(s.gp)], ['Starts', fmt(s.gs)]];
    case 'K': return [['GP', fmt(s.gp)], ['FG', `${fgMade(s)}/${fgAtt(s)}`], ['FG %', fgAtt(s) ? ((fgMade(s) / fgAtt(s)) * 100).toFixed(1) : '—'], ['50+', `${s.fg50}/${s.fga50}`], ['Long', s.fgLng ? String(s.fgLng) : '—'], ['XP', `${s.xp}/${s.xpa}`]];
    case 'P': return [['GP', fmt(s.gp)], ['Punts', fmt(s.pnt)], ['Yds', fmt(s.pntYds)], ['Avg', ratio(s.pntYds, s.pnt)], ['Inside 20', fmt(s.pntIn20)]];
    default: return [['GP', fmt(s.gp)], ['Tackles', fmt(tackles)], ['TFL', fmt(s.defTckLoss)], ['Sacks', String(Math.round(s.defSk * 10) / 10)], ['INT', fmt(s.defInt)], ['Pass Def', fmt(s.defPssDef)], ['FF', fmt(s.defFmbFrc)]];
  }
}

/** One plain-English sentence on the season so far, or null. */
function statSentence(p: RefPlayerDetail, season: number): string | null {
  const s = p.seasonStats;
  if (!s) return null;
  const g = `${s.gp} game${s.gp === 1 ? '' : 's'}`;
  switch (p.pos) {
    case 'QB': return `Through ${g} in ${season}, he has thrown for ${fmt(s.pssYds)} yards with ${s.pssTD} touchdowns and ${s.pssInt} interceptions${s.rusYds > 100 ? `, and run for ${fmt(s.rusYds)} more` : ''}.`;
    case 'RB': return `Through ${g} in ${season}, he has ${fmt(s.rusYds)} rushing yards on ${s.rus} carries and ${s.rusTD + s.recTD} total touchdowns.`;
    case 'WR': case 'TE': return `Through ${g} in ${season}, he has ${s.rec} catches for ${fmt(s.recYds)} yards and ${s.recTD} touchdown${s.recTD === 1 ? '' : 's'}.`;
    case 'OL': return `He has played ${g} in ${season}${s.gs ? `, with ${s.gs} start${s.gs === 1 ? '' : 's'}` : ''}.`;
    case 'K': return `Through ${g} in ${season}, he is ${fgMade(s)} of ${fgAtt(s)} on field goals${s.fgLng ? `, with a long of ${s.fgLng}` : ''}.`;
    case 'P': return `Through ${g} in ${season}, he has ${s.pnt} punts at ${ratio(s.pntYds, s.pnt)} yards per punt.`;
    default: {
      const t = s.defTckSolo + s.defTckAst;
      const extras = [s.defSk ? `${Math.round(s.defSk * 10) / 10} sack${s.defSk === 1 ? '' : 's'}` : '', s.defInt ? `${s.defInt} interception${s.defInt === 1 ? '' : 's'}` : ''].filter(Boolean);
      return `Through ${g} in ${season}, he has ${t} tackles${extras.length ? ` and ${extras.join(' and ')}` : ''}.`;
    }
  }
}

function ratingBar(v: number): string {
  if (v >= 80) return 'bg-blue-600';
  if (v >= 60) return 'bg-blue-400';
  if (v >= 40) return 'bg-gray-400';
  return 'bg-gray-300';
}

async function load(params: Params) {
  const { era, slug } = await params;
  return { era, meta: getEraMeta(era), p: getPlayerBySlug(era, slug) };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { era, meta, p } = await load(params);
  if (!meta || !p) return {};
  const url = `${BASE_URL}/rosters/${era}/players/${p.slug}`;
  const title = `${p.name} ${meta.season} Rating, Stats & Contract — ${p.team.name} ${p.pos}`;
  const stats = statSentence(p, meta.season);
  const rankText = p.posRank === 1 ? `the top-rated ${posOne(p.pos)}` : `the ${ordinal(p.posRank)}-best ${posOne(p.pos)}`;
  const description = `${p.name} (${p.team.fullName} ${p.pos}) is rated ${p.ovr} overall in BS Football, ${rankText} in the NFL. ${stats ?? ''} Contract, injury status and full ratings.`.replace(/\s+/g, ' ').trim();
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'profile' },
    twitter: { card: 'summary', title, description },
    robots: isIndexablePlayer(p) ? undefined : { index: false, follow: true },
  };
}

export default async function PlayerPage({ params }: { params: Params }) {
  const { era, meta, p } = await load(params);
  if (!meta || !p) notFound();

  const all = getPlayerDetails(era);
  const atPos = all.filter((x) => x.pos === p.pos).sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
  const myIdx = atPos.findIndex((x) => x.pid === p.pid);
  const neighbors = atPos.slice(Math.max(0, myIdx - 3), myIdx + 4);
  const teammates = all
    .filter((x) => x.team.tid === p.team.tid && x.pid !== p.pid)
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 10);
  const posMates = all
    .filter((x) => x.team.tid === p.team.tid && x.pos === p.pos && x.pid !== p.pid)
    .sort((a, b) => b.ovr - a.ovr);

  const keys = (KEY_RATINGS[p.pos] ?? []).filter((k) => k in p.ratings);
  // Skip near-zero ratings outside his position (a QB's punting power) — noise, not information.
  const otherRatings = Object.keys(RATING_LABELS).filter((k) => k in p.ratings && !keys.includes(k) && p.ratings[k] >= 10);
  const line = statLine(p);
  const stats = statSentence(p, meta.season);
  const tied = atPos.filter((x) => x.ovr === p.ovr).length > 1;
  const url = `${BASE_URL}/rosters/${era}/players/${p.slug}`;
  const teamUrl = `/rosters/${era}/${p.team.abbrev.toLowerCase()}`;

  const depth = p.teamPosRank === 1
    ? `the top-rated ${p.pos} on the ${p.team.name}`
    : `${ordinal(p.teamPosRank)} among ${p.team.name} ${posMany(p.pos)} by rating`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'BS Football', item: BASE_URL },
          { '@type': 'ListItem', position: 2, name: `${meta.season} NFL Rosters`, item: `${BASE_URL}/rosters/${era}` },
          { '@type': 'ListItem', position: 3, name: p.team.fullName, item: `${BASE_URL}${teamUrl}` },
          { '@type': 'ListItem', position: 4, name: p.name, item: url },
        ],
      },
      {
        '@type': 'Person',
        name: p.name,
        url,
        jobTitle: `${posOne(p.pos)}`,
        affiliation: { '@type': 'SportsTeam', name: p.team.fullName, sport: 'American football' },
        ...(p.college ? { alumniOf: { '@type': 'CollegeOrUniversity', name: p.college } } : {}),
        ...(p.heightIn ? { height: { '@type': 'QuantitativeValue', value: p.heightIn, unitCode: 'INH' } } : {}),
        ...(p.weightLb ? { weight: { '@type': 'QuantitativeValue', value: p.weightLb, unitCode: 'LBR' } } : {}),
      },
    ],
  };

  return (
    <ReferenceChrome>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <article className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <nav className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href={`/rosters/${era}`} className="hover:text-gray-700">{meta.season} Rosters</Link>
          <span className="mx-2">/</span>
          <Link href={teamUrl} className="hover:text-gray-700">{p.team.fullName}</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{p.name}</span>
        </nav>

        <div className="flex items-start gap-4 mb-4">
          <Link href={teamUrl} className="shrink-0 mt-1" aria-label={`${p.team.fullName} roster`}><TeamLogo abbreviation={p.team.abbrev} primaryColor={p.team.colors[0] || '#1f2937'} secondaryColor={p.team.colors[1] || '#ffffff'} logoUrl={p.team.logo || undefined} logoOnWhite size="xl" /></Link>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">{p.name}</h1>
            <p className="text-gray-600 mt-1">
              <Link href={teamUrl} className="text-blue-600 hover:underline">{p.team.fullName}</Link> · {p.pos}
              {p.jersey != null && !Number.isNaN(p.jersey) ? ` · #${p.jersey}` : ''}
              {p.injury ? <span className="ml-2 inline-block rounded-full bg-red-50 text-red-700 text-xs font-semibold px-2 py-0.5">Injured</span> : null}
            </p>
          </div>
        </div>

        <p className="text-lg text-gray-700 leading-relaxed max-w-3xl">
          {p.name} is {p.age ? `a ${p.age}-year-old` : 'a'} {posOne(p.pos)} for the {p.team.fullName}. BS Football rates him{' '}
          <strong className="text-gray-900">{p.ovr} overall</strong> with {p.pot} potential. That makes him{' '}
          {p.posRank === 1
            ? `${tied ? 'one of the highest-rated' : 'the highest-rated'} ${tied ? posMany(p.pos) : posOne(p.pos)} in the league`
            : `the ${tied ? 'joint ' : ''}${ordinal(p.posRank)}-best ${posOne(p.pos)} in the league`}{' '}
          out of {p.posCount}, and {depth}.{' '}
          {stats}{' '}
          {p.contractAmount ? `He's signed through ${p.contractExp} at ${formatContract(p.contractAmount)} a year.` : ''}
        </p>
        {p.injury && (
          <p className="mt-3 max-w-3xl rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
            <strong>Injury:</strong> {p.injury.type === 'Injury' ? 'on the injury report' : p.injury.type}, expected out about {p.injury.games} more game{p.injury.games === 1 ? '' : 's'}
            {' '}(from the latest NFL injury report, as used in the game).
          </p>
        )}

        <section className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Overall', value: String(p.ovr), sub: `${p.pot} potential` },
            { label: `${p.pos} rank`, value: `#${p.posRank}`, sub: `of ${p.posCount}` },
            { label: 'Age', value: p.age ? String(p.age) : '—', sub: null },
            { label: 'Height / Wt', value: formatHeight(p.heightIn), sub: p.weightLb ? `${p.weightLb} lb` : null },
            { label: 'Salary', value: formatContract(p.contractAmount), sub: p.contractExp ? `through ${p.contractExp}` : null },
            { label: 'College', value: p.college || '—', sub: p.draft ? `${p.draft.year} draft, Rd ${p.draft.round}` : 'Undrafted' },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{c.label}</div>
              <div className={`font-bold text-gray-900 tabular-nums mt-1 ${c.value.length > 9 ? 'text-base leading-snug' : 'text-2xl'}`}>{c.value}</div>
              {c.sub && <div className="text-xs text-gray-500 mt-0.5">{c.sub}</div>}
            </div>
          ))}
        </section>

        {line.length > 0 && (
          <section className="mt-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">{meta.season} season stats</h2>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>{line.map(([k]) => <th key={k} className="text-right first:text-left font-semibold px-3 py-2.5 whitespace-nowrap">{k}</th>)}</tr>
                </thead>
                <tbody>
                  <tr>{line.map(([k, v]) => <td key={k} className="text-right first:text-left px-3 py-2.5 tabular-nums text-gray-900">{v}</td>)}</tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">Real {meta.season} NFL regular-season stats, refreshed weekly.</p>
          </section>
        )}

        <section className="mt-10 grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Key {p.pos} ratings</h2>
            <ul className="space-y-2.5">
              {keys.map((k) => (
                <li key={k}>
                  <div className="flex justify-between text-sm"><span className="text-gray-700">{RATING_LABELS[k]}</span><span className="font-semibold tabular-nums text-gray-900">{p.ratings[k]}</span></div>
                  <div className="h-2 rounded-full bg-gray-100 mt-1"><div className={`h-2 rounded-full ${ratingBar(p.ratings[k])}`} style={{ width: `${Math.max(2, Math.min(100, p.ratings[k]))}%` }} /></div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Other ratings</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {otherRatings.map((k) => (
                <div key={k} className="flex justify-between border-b border-gray-100 py-1">
                  <dt className="text-gray-600">{RATING_LABELS[k]}</dt>
                  <dd className="tabular-nums text-gray-900">{p.ratings[k]}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-gray-500 mt-3">Ratings are BS Football&apos;s 0–100 scale. They&apos;re adjusted each week for how players are actually performing.</p>
          </div>
        </section>

        <section className="mt-10 grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Where he ranks among {posMany(p.pos)}</h2>
            <ol className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
              {neighbors.map((x) => (
                <li key={x.pid} className={`flex items-center gap-3 px-3 py-2 text-sm ${x.pid === p.pid ? 'bg-blue-50' : ''}`}>
                  <span className="w-8 text-gray-500 tabular-nums">#{x.posRank}</span>
                  {x.pid === p.pid
                    ? <span className="flex-1 font-semibold text-gray-900">{x.name}</span>
                    : <Link href={`/rosters/${era}/players/${x.slug}`} className="flex-1 text-blue-600 hover:underline">{x.name}</Link>}
                  <span className="flex items-center gap-1.5 text-gray-500"><TeamLogo abbreviation={x.team.abbrev} primaryColor={x.team.colors[0] || '#1f2937'} secondaryColor={x.team.colors[1] || '#ffffff'} logoUrl={x.team.logo || undefined} logoOnWhite size="xs" />{x.team.abbrev}</span>
                  <span className="w-8 text-right font-semibold tabular-nums text-gray-900">{x.ovr}</span>
                </li>
              ))}
            </ol>
            <Link href={`/rosters/${era}/players#${p.pos.toLowerCase()}`} className="inline-block text-sm text-blue-600 hover:underline mt-2">All {meta.season} {p.pos} ratings →</Link>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">{p.team.name} teammates</h2>
            {posMates.length > 0 && (
              <p className="text-sm text-gray-600 mb-2">
                Other {p.team.name} {posMany(p.pos)}:{' '}
                {posMates.slice(0, 4).map((x, i) => (
                  <span key={x.pid}>{i ? ', ' : ''}<Link href={`/rosters/${era}/players/${x.slug}`} className="text-blue-600 hover:underline">{x.name}</Link> ({x.ovr})</span>
                ))}
              </p>
            )}
            <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
              {teammates.map((x) => (
                <li key={x.pid} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-8 text-gray-500">{x.pos}</span>
                  <Link href={`/rosters/${era}/players/${x.slug}`} className="flex-1 text-blue-600 hover:underline">{x.name}</Link>
                  <span className="w-8 text-right font-semibold tabular-nums text-gray-900">{x.ovr}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
              <Link href={teamUrl} className="text-blue-600 hover:underline">Full {p.team.name} roster →</Link>
              <Link href={`/predictions/${teamSlug(p.team)}`} className="text-blue-600 hover:underline">{p.team.name} playoff chances →</Link>
            </div>
          </div>
        </section>

        <div className="mt-12 py-8 px-6 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Put {p.name} on your team</h2>
          <p className="text-gray-600 mb-5">Take over the {p.team.name}, or trade for him with any other team. Then play out the season, in 3D if you want. Free, in your browser.</p>
          <Link href="/" className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Play BS Football — It&apos;s Free
          </Link>
        </div>

        <p className="mt-10 text-xs text-gray-400 max-w-3xl">
          Ratings are BS Football&apos;s own and are not official NFL or Madden ratings. BS Football is an independent simulation and is not affiliated with or endorsed by the National Football League.
        </p>
      </article>
    </ReferenceChrome>
  );
}
