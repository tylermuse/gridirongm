import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import ReferenceChrome from '@/components/reference/ReferenceChrome';
import {
  listEras,
  getEraMeta,
  getTeams,
  getTeamByAbbrev,
  getRoster,
  formatContract,
} from '@/lib/data/referenceRosters';

interface Props {
  params: Promise<{ era: string; team: string }>;
}

export function generateStaticParams() {
  const params: { era: string; team: string }[] = [];
  for (const e of listEras()) {
    for (const t of getTeams(e.slug)) {
      params.push({ era: e.slug, team: t.abbrev.toLowerCase() });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { era, team } = await params;
  const meta = getEraMeta(era);
  const t = getTeamByAbbrev(era, team);
  if (!meta || !t) return {};
  const title = `${t.fullName} ${meta.season} Roster — Depth Chart & Ratings`;
  const description = `The full ${t.fullName} ${meta.season} roster: every player with position, overall rating, age, college, and contract. Play them free in BS Football.`;
  return {
    title,
    description,
    openGraph: { title, description, url: `https://bs-football.com/rosters/${era}/${team}` },
    alternates: { canonical: `https://bs-football.com/rosters/${era}/${team}` },
  };
}

export default async function TeamRosterPage({ params }: Props) {
  const { era, team } = await params;
  const meta = getEraMeta(era);
  const t = getTeamByAbbrev(era, team);
  if (!meta || !t) notFound();

  const roster = getRoster(era, t.tid);
  const byOvr = [...roster].sort((a, b) => b.ovr - a.ovr);
  const leaders = byOvr.slice(0, 3);
  const allTeams = getTeams(era);
  const others = allTeams.filter((x) => x.abbrev !== t.abbrev);

  const recordStr =
    typeof t.won === 'number' && typeof t.lost === 'number'
      ? `${t.won}-${t.lost}${t.tied ? `-${t.tied}` : ''}`
      : null;

  return (
    <ReferenceChrome>
      <article className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <nav className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/rosters" className="hover:text-gray-700">Rosters</Link>
          <span className="mx-2">/</span>
          <Link href={`/rosters/${era}`} className="hover:text-gray-700">{meta.season}</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{t.fullName}</span>
        </nav>

        <div className="flex items-center gap-4 mb-4">
          <span className="inline-block h-12 w-12 rounded-xl shrink-0" style={{ backgroundColor: t.colors[0] || '#1f2937' }} aria-hidden />
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">{t.fullName} {meta.season} Roster</h1>
        </div>

        <p className="text-lg text-gray-600 mb-8 max-w-3xl">
          {recordStr ? `Coming off a ${recordStr} season, the ` : 'The '}{t.fullName}&apos;s {meta.season} roster carries {roster.length} players
          {leaders.length ? <>, led by {leaders.map((p, i) => (
            <span key={p.pid}>{i > 0 ? (i === leaders.length - 1 ? ' and ' : ', ') : ' '}<strong>{p.name}</strong> ({p.pos}, {p.ovr} OVR)</span>
          ))}</> : null}. Below is the complete depth chart with overall ratings, ages, colleges, and contracts — take control of them free in BS Football.
        </p>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600">
                <th className="p-3 font-semibold">#</th>
                <th className="p-3 font-semibold">Player</th>
                <th className="p-3 font-semibold">Pos</th>
                <th className="p-3 font-semibold">OVR</th>
                <th className="p-3 font-semibold">Age</th>
                <th className="p-3 font-semibold">College</th>
                <th className="p-3 font-semibold">Contract</th>
                <th className="p-3 font-semibold">Exp</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => (
                <tr key={p.pid} className="border-t border-gray-100">
                  <td className="p-3 text-gray-400 tabular-nums">{p.jersey ?? '—'}</td>
                  <td className="p-3 font-medium text-gray-900">{p.name}</td>
                  <td className="p-3 text-gray-600">{p.pos}</td>
                  <td className="p-3 tabular-nums font-semibold text-gray-900">{p.ovr}</td>
                  <td className="p-3 tabular-nums text-gray-600">{p.age ?? '—'}</td>
                  <td className="p-3 text-gray-600">{p.college || '—'}</td>
                  <td className="p-3 tabular-nums text-gray-600">{formatContract(p.contractAmount)}</td>
                  <td className="p-3 tabular-nums text-gray-400">{p.contractExp ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-12 py-8 px-6 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Run the {t.name} front office</h2>
          <p className="text-gray-600 mb-5">Draft, trade, manage the cap, and sim seasons with this roster — free, in your browser.</p>
          <Link href="/" className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Play Now — It&apos;s Free
          </Link>
        </div>

        <div className="mt-10 pt-8 border-t border-gray-200">
          <h2 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Other {meta.season} Rosters</h2>
          <div className="flex flex-wrap gap-2">
            {others.map((o) => (
              <Link
                key={o.abbrev}
                href={`/rosters/${era}/${o.abbrev.toLowerCase()}`}
                className="text-sm px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300 transition-colors"
              >
                {o.fullName}
              </Link>
            ))}
          </div>
        </div>
      </article>
    </ReferenceChrome>
  );
}
