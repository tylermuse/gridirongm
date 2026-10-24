import Link from 'next/link';
import type { Metadata } from 'next';
import { getNflOdds, type NflOdds, type NflTeamOdds } from '@/lib/predictions/nflOdds';

/**
 * /predictions — NFL playoff & Super Bowl odds from BS Football's season
 * simulator. Odds are computed at build time (see src/lib/predictions/nflOdds.ts);
 * a weekly Vercel Cron redeploys every Tuesday after Monday Night Football.
 */

export const dynamic = 'force-static';

const URL = 'https://bs-football.com/predictions';

function copy(odds: NflOdds) {
  const sims = odds.sims.toLocaleString('en-US');
  return {
    title: `NFL Playoff Odds ${odds.season}: We Simulated the Rest of the Season ${sims} Times`,
    description: `Week ${odds.week} NFL playoff, division and Super Bowl odds for every team, from ${sims} simulations of the remaining ${odds.season} schedule. Updated weekly.`,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const odds = await getNflOdds();
  const { title, description } = copy(odds);
  return {
    title: `NFL Playoff & Super Bowl Odds — Week ${odds.week}, ${odds.season} | BS Football`,
    description,
    keywords: ['nfl playoff odds', 'nfl playoff chances', 'super bowl odds', `nfl playoff odds week ${odds.week}`, 'nfl playoff predictions', 'nfl season simulator'],
    alternates: { canonical: URL },
    openGraph: { title, description, url: URL },
  };
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', {
  timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric',
});

function pct(v: number): string {
  if (v >= 99.95) return '>99.9%';
  if (v > 0 && v < 0.1) return '<0.1%';
  return `${v.toFixed(1)}%`;
}

function change(v: number | null): string {
  if (v === null || Math.abs(v) < 0.5) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

function shade(v: number): string {
  if (v >= 75) return 'bg-blue-100 text-blue-900';
  if (v >= 40) return 'bg-blue-50 text-blue-900';
  if (v >= 10) return 'bg-gray-50 text-gray-800';
  return 'text-gray-500';
}

function ConferenceTable({ conference, teams }: { conference: string; teams: NflTeamOdds[] }) {
  const rows = [...teams].sort((a, b) => b.playoffs - a.playoffs || b.champion - a.champion);
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{conference}</h2>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left font-semibold px-3 py-2.5 sticky left-0 bg-gray-50">Team</th>
              <th className="text-right font-semibold px-3 py-2.5">Playoffs</th>
              <th className="text-right font-semibold px-3 py-2.5">Win SB</th>
              <th className="text-right font-semibold px-3 py-2.5" title="Average final wins across all simulations">Proj. W</th>
              <th className="text-right font-semibold px-3 py-2.5">Win Div.</th>
              <th className="text-right font-semibold px-3 py-2.5">#1 Seed</th>
              <th className="text-right font-semibold px-3 py-2.5">Win Conf.</th>
              <th className="text-right font-semibold px-3 py-2.5" title="Change in playoff odds since last week's results, in percentage points">Wk Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(t => (
              <tr key={t.abbrev} className="border-t border-gray-100">
                <td className="px-3 py-2.5 sticky left-0 bg-white">
                  <div className="font-semibold text-gray-900 whitespace-nowrap"><span className="hidden sm:inline">{t.city} </span>{t.name}</div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">{t.record}<span className="hidden sm:inline"> · {t.division}</span></div>
                </td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${shade(t.playoffs)}`}>{pct(t.playoffs)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${shade(t.champion * 3)}`}>{pct(t.champion)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{t.projectedWins.toFixed(1)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${shade(t.division_title)}`}>{pct(t.division_title)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{pct(t.topSeed)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{pct(t.conference_title)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{change(t.playoffsChange)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function PredictionsPage() {
  const odds = await getNflOdds();
  const { title: TITLE, description: DESCRIPTION } = copy(odds);
  const favorites = [...odds.teams].sort((a, b) => b.champion - a.champion).slice(0, 5);
  const afc = odds.teams.filter(t => t.conference === 'AFC');
  const nfc = odds.teams.filter(t => t.conference === 'NFC');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: TITLE,
    description: DESCRIPTION,
    url: URL,
    dateModified: odds.generatedAt,
    creator: { '@type': 'Organization', name: 'BS Football', url: 'https://bs-football.com' },
    isAccessibleForFree: true,
    variableMeasured: ['Playoff probability', 'Division title probability', 'Super Bowl probability', 'Projected wins'],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <nav className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">NFL Playoff Odds</span>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-3">{TITLE}</h1>
        <p className="text-gray-600 mb-8">
          Odds entering <strong className="text-gray-900">Week {odds.week}</strong> · results through {fmtDate(odds.resultsThrough)} ·{' '}
          {odds.completedGames} games played, {odds.remainingGames} to go. New odds every Tuesday.
        </p>

        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">Super Bowl favorites</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {favorites.map((t, i) => (
              <div key={t.abbrev} className={`rounded-xl border border-gray-200 bg-white p-4 ${i === 4 ? 'hidden sm:block' : ''}`}>
                <div className="text-xs text-gray-500">#{i + 1} · {t.record}</div>
                <div className="font-bold text-gray-900 leading-tight mt-0.5">{t.name}</div>
                <div className="text-2xl font-bold text-blue-600 mt-2 tabular-nums">{pct(t.champion)}</div>
                <div className="text-xs text-gray-500">to win the Super Bowl</div>
              </div>
            ))}
          </div>
        </section>

        <ConferenceTable conference="AFC" teams={afc} />
        <ConferenceTable conference="NFC" teams={nfc} />

        <div className="mt-12 py-8 px-6 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Think your team deserves better odds?</h2>
          <p className="text-gray-600 mb-5">Take over any NFL team with its real roster and run the rest of the season yourself. Free, in your browser.</p>
          <Link href="/" className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Take Over a Team — It&apos;s Free
          </Link>
        </div>

        <section className="mt-12 max-w-3xl prose prose-gray prose-p:text-gray-700 prose-li:text-gray-700 prose-headings:text-gray-900">
          <h2>How these odds work</h2>
          <p>
            Every week we take the real {odds.season} standings and the remaining schedule, then play out the rest of the season{' '}
            {odds.sims.toLocaleString('en-US')} times. Each percentage is the share of those simulated seasons in which a team reached
            that milestone. Projected wins are the average final win total across all of them.
          </p>
          <ul>
            <li><strong>Team strength</strong> starts from BS Football&apos;s player ratings for each team&apos;s healthy starters, using the current NFL rosters and injury report that power the game. Injured players return as their injuries run out.</li>
            <li><strong>Real results count more as the season goes on.</strong> Each team&apos;s rating is blended with its actual point differential per game; by midseason the results carry most of the weight.</li>
            <li><strong>Home field</strong> is worth about two points. International and other neutral-site games get none.</li>
            <li><strong>Playoffs</strong> follow the NFL format: four division winners and three wild cards per conference, a bye for each #1 seed, and reseeding after the wild-card round.</li>
            <li><strong>Tiebreakers are simplified:</strong> win percentage, then head-to-head, division record (for division rivals), conference record, then a coin flip. The NFL&apos;s full procedure has more steps, so very close races can differ slightly.</li>
          </ul>
          <p>Results and schedule come from public NFL data; ratings come from BS Football. These are simulations for fun, not betting advice.</p>

          <h2>Frequently asked questions</h2>
          <h3>How often are the odds updated?</h3>
          <p>Every Tuesday morning, after Monday Night Football, using the latest rosters and injury report in the game.</p>
          <h3>Why do my team&apos;s odds differ from other sites?</h3>
          <p>Every model rates teams differently. Ours starts from BS Football&apos;s player ratings and leans more on real results as the season goes on. Other sites use betting markets, Elo, or play-by-play efficiency.</p>
          <h3>Can I simulate the season myself?</h3>
          <p>Yes. In BS Football you can take over any team with its current roster, make trades and signings, and sim or play out the rest of the season. <Link href="/">Start a league</Link>.</p>
        </section>

        <p className="mt-10 text-xs text-gray-400 max-w-3xl">
          BS Football is an independent simulation and is not affiliated with or endorsed by the National Football League.
        </p>
      </article>
    </>
  );
}
