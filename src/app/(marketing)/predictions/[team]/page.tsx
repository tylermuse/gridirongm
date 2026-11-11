import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getNflOdds, type NflGame, type NflOdds, type NflTeamOdds } from '@/lib/predictions/nflOdds';
import { teamSlug } from '@/lib/mockDraft/engine';
import { getMockDraftData } from '@/lib/mockDraft/serverData';
import { TeamLogo } from '@/components/ui/TeamLogo';

/**
 * /predictions/[team] — one team's playoff, division and Super Bowl odds, its
 * division race and its remaining schedule with the model's win probability
 * for each game. Same build-time odds as /predictions (src/lib/predictions/nflOdds.ts),
 * rebuilt by the weekly deploy. Slug = nickname, as on /mock-draft/2027/[team].
 */

export const dynamic = 'force-static';
export const dynamicParams = false;

const BASE_URL = 'https://bs-football.com';
const ROSTER_FILE = 'FBGM_NFL_Roster_2026_Updated.json';

type Params = Promise<{ team: string }>;

export async function generateStaticParams() {
  const odds = await getNflOdds();
  return odds.teams.map((t) => ({ team: teamSlug(t) }));
}

async function load(slug: string) {
  const odds = await getNflOdds();
  const team = odds.teams.find((t) => teamSlug(t) === slug.toLowerCase());
  return { odds, team };
}

function pct(v: number): string {
  if (v >= 99.95) return '>99.9%';
  if (v > 0 && v < 0.1) return '<0.1%';
  return `${v.toFixed(1)}%`;
}

/** Rounded for prose and titles: "91%", "<1%", ">99%". */
function pctShort(v: number): string {
  if (v >= 99.5) return '>99%';
  if (v > 0 && v < 0.5) return '<1%';
  return `${Math.round(v)}%`;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });

const fmtLong = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' });

function changeText(v: number | null): string | null {
  if (v === null || Math.abs(v) < 0.5) return null;
  return `${v > 0 ? 'up' : 'down'} ${Math.abs(v).toFixed(1)} points from last week`;
}

/** One game from this team's side. */
interface TeamGame {
  game: NflGame;
  home: boolean;
  opponent: string;
  /** This team's win probability (remaining games only). */
  winProb: number | null;
  result: string | null;
}

function teamGames(odds: NflOdds, abbrev: string): TeamGame[] {
  return (odds.games ?? [])
    .filter((g) => g.home === abbrev || g.away === abbrev)
    .sort((a, b) => a.week - b.week)
    .map((g) => {
      const home = g.home === abbrev;
      const us = home ? g.homePts : g.awayPts;
      const them = home ? g.awayPts : g.homePts;
      return {
        game: g,
        home,
        opponent: home ? g.away : g.home,
        winProb: g.homeWinProb === null ? null : home ? g.homeWinProb : 1 - g.homeWinProb,
        result: g.done ? `${us > them ? 'W' : us < them ? 'L' : 'T'} ${us}-${them}` : null,
      };
    });
}

function title(team: NflTeamOdds, odds: NflOdds): string {
  return `${team.city} ${team.name} Playoff Chances ${odds.season}: ${pctShort(team.playoffs)} Entering Week ${odds.week}`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { odds, team } = await load((await params).team);
  if (!team) return {};
  const t = title(team, odds);
  const description = `${team.city} ${team.name} (${team.record}) playoff odds: ${pct(team.playoffs)} to make the playoffs, ${pct(team.division_title)} to win the ${team.division}, ${pct(team.champion)} to win the Super Bowl. Projected ${team.projectedWins.toFixed(1)} wins, with win chances for every remaining game. Updated weekly.`;
  const url = `${BASE_URL}/predictions/${teamSlug(team)}`;
  return {
    title: `${t} | BS Football`,
    description,
    keywords: [
      `${team.name.toLowerCase()} playoff chances`,
      `${team.name.toLowerCase()} playoff odds`,
      `${team.city.toLowerCase()} ${team.name.toLowerCase()} playoff picture`,
      `${team.name.toLowerCase()} super bowl odds`,
    ],
    alternates: { canonical: url },
    openGraph: { title: t, description, url, type: 'website' },
    twitter: { card: 'summary', title: t, description },
  };
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function probClass(p: number): string {
  if (p >= 0.65) return 'text-green-700';
  if (p >= 0.45) return 'text-gray-900';
  return 'text-red-700';
}

export default async function TeamPredictionsPage({ params }: { params: Params }) {
  const { odds, team } = await load((await params).team);
  if (!team) notFound();

  const slug = teamSlug(team);
  const name = `${team.city} ${team.name}`;
  const byAbbrev = new Map(odds.teams.map((t) => [t.abbrev, t]));
  const mockTeam = getMockDraftData().teams.find((t) => t.abbrev === team.abbrev);

  const conf = odds.teams.filter((t) => t.conference === team.conference).sort((a, b) => b.playoffs - a.playoffs);
  const confRank = conf.findIndex((t) => t.abbrev === team.abbrev) + 1;
  const division = odds.teams
    .filter((t) => t.division === team.division)
    .sort((a, b) => b.division_title - a.division_title || b.playoffs - a.playoffs);

  const games = teamGames(odds, team.abbrev);
  const remaining = games.filter((g) => g.winProb !== null);
  const played = games.filter((g) => g.result !== null);
  const toughest = [...remaining].sort((a, b) => a.winProb! - b.winProb!)[0];
  const easiest = [...remaining].sort((a, b) => b.winProb! - a.winProb!)[0];
  const expectedRemainingWins = remaining.reduce((s, g) => s + g.winProb!, 0);
  const lastWeek = changeText(team.playoffsChange);
  const confName = team.conference;

  const pageUrl = `${BASE_URL}/predictions/${slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'BS Football', item: BASE_URL },
          { '@type': 'ListItem', position: 2, name: 'NFL Playoff Odds', item: `${BASE_URL}/predictions` },
          { '@type': 'ListItem', position: 3, name: `${name} Playoff Chances`, item: pageUrl },
        ],
      },
      {
        '@type': 'Dataset',
        name: title(team, odds),
        url: pageUrl,
        dateModified: odds.generatedAt,
        creator: { '@type': 'Organization', name: 'BS Football', url: BASE_URL },
        isAccessibleForFree: true,
        variableMeasured: ['Playoff probability', 'Division title probability', 'Super Bowl probability', 'Projected wins', 'Game win probability'],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <article className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <nav className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/predictions" className="hover:text-gray-700">NFL Playoff Odds</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{team.name}</span>
        </nav>

        <div className="flex items-center gap-4">
          {mockTeam && (
            <TeamLogo
              abbreviation={mockTeam.abbrev}
              primaryColor={mockTeam.colors[0]}
              secondaryColor={mockTeam.colors[1]}
              logoUrl={mockTeam.imgURL || undefined}
              logoOnWhite
              size="xl"
            />
          )}
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
            {name} Playoff Chances {odds.season}
          </h1>
        </div>

        <p className="text-lg text-gray-700 leading-relaxed mt-4 max-w-3xl">
          Entering Week {odds.week}, the {team.name} ({team.record}) make the playoffs in{' '}
          <strong className="text-gray-900">{pct(team.playoffs)}</strong> of our {odds.sims.toLocaleString('en-US')} simulations of the
          rest of the {odds.season} season{lastWeek ? `, ${lastWeek}` : ''}. They win the {team.division} {pct(team.division_title)} of
          the time and the Super Bowl {pct(team.champion)}, and finish with {team.projectedWins.toFixed(1)} wins on average. That&apos;s the{' '}
          {ordinal(confRank)}-best playoff outlook in the {confName}.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Results through {fmtLong(odds.resultsThrough)} · {odds.remainingGames} games left league-wide · updated every Tuesday.
        </p>

        <section className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Make playoffs" value={pct(team.playoffs)} sub={lastWeek ? (team.playoffsChange! > 0 ? `▲ ${team.playoffsChange!.toFixed(1)} this week` : `▼ ${Math.abs(team.playoffsChange!).toFixed(1)} this week`) : null} />
          <StatCard label={`Win ${team.division}`} value={pct(team.division_title)} />
          <StatCard label="#1 seed" value={pct(team.topSeed)} />
          <StatCard label={`Win ${confName}`} value={pct(team.conference_title)} />
          <StatCard label="Win Super Bowl" value={pct(team.champion)} />
          <StatCard label="Projected wins" value={team.projectedWins.toFixed(1)} sub={`Now ${team.record}`} />
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{team.division} race</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-semibold px-3 py-2.5">Team</th>
                  <th className="text-right font-semibold px-3 py-2.5">Record</th>
                  <th className="text-right font-semibold px-3 py-2.5">Proj. W</th>
                  <th className="text-right font-semibold px-3 py-2.5">Win Div.</th>
                  <th className="text-right font-semibold px-3 py-2.5">Playoffs</th>
                  <th className="text-right font-semibold px-3 py-2.5">Win SB</th>
                </tr>
              </thead>
              <tbody>
                {division.map((t) => (
                  <tr key={t.abbrev} className={`border-t border-gray-100 ${t.abbrev === team.abbrev ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">
                      {t.abbrev === team.abbrev ? (
                        `${t.city} ${t.name}`
                      ) : (
                        <Link href={`/predictions/${teamSlug(t)}`} className="text-blue-600 hover:underline">
                          {t.city} {t.name}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{t.record}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{t.projectedWins.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{pct(t.division_title)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{pct(t.playoffs)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{pct(t.champion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {games.length > 0 && (
          <section className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{team.name} remaining schedule and win chances</h2>
            {remaining.length > 0 ? (
              <p className="text-sm text-gray-500 mb-4">
                The model gives the {team.name} about {expectedRemainingWins.toFixed(1)} more wins in their last {remaining.length}{' '}
                {remaining.length === 1 ? 'game' : 'games'}.
                {toughest && easiest && toughest !== easiest && (
                  <>
                    {' '}Toughest: {toughest.home ? 'vs' : 'at'} {byAbbrev.get(toughest.opponent)?.name ?? toughest.opponent} in Week{' '}
                    {toughest.game.week} ({pct(toughest.winProb! * 100)}). Most winnable: {easiest.home ? 'vs' : 'at'}{' '}
                    {byAbbrev.get(easiest.opponent)?.name ?? easiest.opponent} in Week {easiest.game.week} ({pct(easiest.winProb! * 100)}).
                  </>
                )}
              </p>
            ) : (
              <p className="text-sm text-gray-500 mb-4">The {team.name}&apos; regular season is complete.</p>
            )}
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2.5">Week</th>
                    <th className="text-left font-semibold px-3 py-2.5">Opponent</th>
                    <th className="text-left font-semibold px-3 py-2.5">Date</th>
                    <th className="text-right font-semibold px-3 py-2.5">Result / win chance</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => {
                    const opp = byAbbrev.get(g.opponent);
                    return (
                      <tr key={`${g.game.week}-${g.opponent}`} className={`border-t border-gray-100 ${g.result ? 'text-gray-500' : ''}`}>
                        <td className="px-3 py-2.5 tabular-nums">{g.game.week}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {g.game.neutral ? 'vs' : g.home ? 'vs' : '@'}{' '}
                          {opp ? (
                            <Link href={`/predictions/${teamSlug(opp)}`} className="font-semibold text-gray-900 hover:underline">
                              {opp.city} {opp.name}
                            </Link>
                          ) : (
                            g.opponent
                          )}
                          {g.game.neutral && <span className="text-xs text-gray-500"> (neutral site)</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{fmtDay(g.game.date)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${g.winProb !== null ? probClass(g.winProb) : ''}`}>
                          {g.result ?? pct(g.winProb! * 100)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {played.length > 0 && remaining.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">Win chances account for home field and current injuries.</p>
            )}
          </section>
        )}

        <div className="mt-12 py-8 px-6 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Think the {team.name} deserve better odds?</h2>
          <p className="text-gray-600 mb-5">
            Take over the {team.name} at Week {odds.week} with their real roster and run the rest of the season yourself. Free, in your browser.
          </p>
          <Link
            href={`/?roster=/rosters/${ROSTER_FILE}&startMode=regular&team=${team.abbrev}`}
            prefetch={false}
            className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Take Over the {team.name} →
          </Link>
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-bold text-gray-900 mb-3">More on the {team.name}</h2>
          <ul className="list-disc pl-5 text-gray-700 space-y-1">
            <li>
              <Link href={`/mock-draft/2027/${slug}`} className="text-blue-600 hover:underline">
                {name} 2027 mock draft
              </Link>
              : every pick, team needs and the prospects in range
            </li>
            <li>
              <Link href={`/rosters/2026/${team.abbrev.toLowerCase()}`} className="text-blue-600 hover:underline">
                {name} 2026 roster
              </Link>
              , with BS Football ratings
            </li>
            <li>
              <Link href="/predictions" className="text-blue-600 hover:underline">
                Playoff odds for all 32 teams
              </Link>
              , and how the model works
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold text-gray-900 mb-3">Playoff chances for every team</h2>
          {(['AFC', 'NFC'] as const).map((c) => (
            <div key={c} className="mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-1">{c}</h3>
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                {odds.teams
                  .filter((t) => t.conference === c)
                  .sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name))
                  .map((t) => (
                    <li key={t.abbrev}>
                      {t.abbrev === team.abbrev ? (
                        <span className="font-semibold text-gray-900">{t.city} {t.name}</span>
                      ) : (
                        <Link href={`/predictions/${teamSlug(t)}`} className="text-blue-600 hover:underline">
                          {t.city} {t.name}
                        </Link>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>

        <p className="mt-10 text-xs text-gray-400 max-w-3xl">
          Simulations for fun, not betting advice. BS Football is an independent simulation and is not affiliated with or endorsed by
          the National Football League.
        </p>
      </article>
    </>
  );
}
