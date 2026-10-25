import Link from 'next/link';
import type { Metadata } from 'next';
import { SITE } from '@/lib/content/rosters2026';
import { getNbaOdds, type NbaOdds, type NbaTeamOdds } from '@/lib/predictions/nbaOdds';
import { ARTICLE_PROSE, Breadcrumbs, ContentFrame, JsonLd, PlayCta, breadcrumbJsonLd } from '@/components/content/ContentBits';

/**
 * /predictions — NBA play-in, playoff and title odds from BS Hoops' season
 * simulator. The Hoops port of BS Football's /predictions (that site's
 * evergreen SEO page). Odds are computed at build time (see
 * src/lib/predictions/nbaOdds.ts); a weekly Vercel Cron redeploys every Monday.
 */

export const dynamic = 'force-static';

const URL = `${SITE}/predictions`;

function copy(odds: NbaOdds) {
  const sims = odds.sims.toLocaleString('en-US');
  return {
    title: `NBA Playoff Odds ${odds.season}: We Simulated the Season ${sims} Times`,
    description: `${odds.season} NBA playoff, play-in, conference and championship odds for all 30 teams, from ${sims} simulations of the rest of the season through the BS Hoops game engine. Updated weekly.`,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const odds = await getNbaOdds();
  const { title, description } = copy(odds);
  return {
    title: `NBA Playoff & Championship Odds ${odds.season} — Updated Weekly`,
    description,
    keywords: ['nba playoff odds', 'nba play-in odds', 'nba championship odds', 'nba finals odds', 'nba playoff predictions', `nba playoff odds ${odds.season}`, 'nba season simulator'],
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

/** Accent tint that deepens with probability. */
function shade(v: number): React.CSSProperties | undefined {
  if (v < 10) return { color: 'var(--text-sec)' };
  const mix = v >= 75 ? 22 : v >= 40 ? 13 : 6;
  return { background: `color-mix(in srgb, var(--accent) ${mix}%, transparent)` };
}

const TH = 'text-right font-semibold px-3 py-2.5 whitespace-nowrap';
const TD = 'px-3 py-2.5 text-right tabular-nums';

function ConferenceTable({ conference, teams }: { conference: string; teams: NbaTeamOdds[] }) {
  const rows = [...teams].sort((a, b) => b.projectedWins - a.projectedWins || b.champion - a.champion);
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-black mb-3" style={{ fontFamily: 'var(--font-display)' }}>{conference}ern Conference</h2>
      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-[var(--text-sec)] text-xs uppercase">
            <tr>
              <th className="text-left font-semibold px-3 py-2.5 sticky left-0 bg-[var(--muted)]">Team</th>
              <th className={TH} title="Average final win total across all simulations">Proj. W</th>
              <th className={TH} title="Reach the first round, directly or through the play-in">Playoffs</th>
              <th className={TH} title="Finish 7th-10th in the conference">Play-In</th>
              <th className={TH} title="Finish top 6 in the conference">Top 6</th>
              <th className={TH}>Win Conf.</th>
              <th className={TH}>Win Title</th>
              <th className={TH} title="Change in playoff odds over the last seven days, in percentage points">7-day Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.abbrev} className={`border-t border-[var(--border)] ${i === 6 || i === 10 ? 'border-t-2 border-t-[var(--text-sec)]/40' : ''}`}>
                <td className="px-3 py-2.5 sticky left-0 bg-[var(--surface)]" style={{ boxShadow: `inset 4px 0 0 ${t.color}` }}>
                  <Link href={`/rosters/2026/${t.slug}`} prefetch={false} className="font-bold whitespace-nowrap hover:underline">
                    <span className="sm:hidden">{t.abbrev}</span><span className="hidden sm:inline">{t.city}</span>
                  </Link>
                  <div className="text-xs text-[var(--text-sec)] whitespace-nowrap">{t.record}<span className="hidden sm:inline"> · {t.division}</span></div>
                </td>
                <td className={`${TD} font-semibold`}>{t.projectedWins.toFixed(1)}</td>
                <td className={`${TD} font-bold`} style={shade(t.playoffs)}>{pct(t.playoffs)}</td>
                <td className={TD} style={shade(t.playIn)}>{pct(t.playIn)}</td>
                <td className={TD} style={shade(t.top6)}>{pct(t.top6)}</td>
                <td className={TD} style={shade(t.conferenceTitle * 2)}>{pct(t.conferenceTitle)}</td>
                <td className={`${TD} font-bold`} style={shade(t.champion * 3)}>{pct(t.champion)}</td>
                <td className={`${TD} text-[var(--text-sec)]`}>{change(t.playoffsChange)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--text-sec)]">Sorted by projected wins. Lines mark the top-6 and play-in cutoffs. Tap a team for its full roster.</p>
    </section>
  );
}

export default async function PredictionsPage() {
  const odds = await getNbaOdds();
  const { title: TITLE, description: DESCRIPTION } = copy(odds);
  const favorites = [...odds.teams].sort((a, b) => b.champion - a.champion).slice(0, 6);
  const east = odds.teams.filter(t => t.conference === 'East');
  const west = odds.teams.filter(t => t.conference === 'West');
  const sims = odds.sims.toLocaleString('en-US');

  return (
    <ContentFrame wide>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: TITLE,
          description: DESCRIPTION,
          url: URL,
          dateModified: odds.generatedAt,
          creator: { '@type': 'Organization', name: 'BS Hoops', url: SITE },
          isAccessibleForFree: true,
          variableMeasured: ['Playoff probability', 'Play-in probability', 'Conference title probability', 'Championship probability', 'Projected wins'],
        }}
      />
      <JsonLd data={breadcrumbJsonLd([{ label: 'Home', url: `${SITE}/` }, { label: 'NBA Playoff Odds', url: URL }])} />
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'NBA Playoff Odds' }]} />

      <header className="mb-8 max-w-3xl">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-3" style={{ fontFamily: 'var(--font-display)' }}>
          {TITLE}
        </h1>
        <p className="text-[var(--text-sec)] text-lg leading-relaxed">
          Results through <strong className="text-[var(--foreground)]">{fmtDate(odds.resultsThrough)}</strong> ·{' '}
          {odds.completedGames} games played, {odds.remainingGames} to go. Every team&apos;s chances of making the playoffs, landing in
          the play-in, and winning it all. New odds every Monday.
        </p>
      </header>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] mb-3">Title favorites</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {favorites.map((t, i) => (
            <Link
              key={t.abbrev}
              href={`/rosters/2026/${t.slug}`}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent)] transition-colors"
              style={{ borderTop: `4px solid ${t.color}` }}
            >
              <div className="text-xs text-[var(--text-sec)]">#{i + 1} · {t.record}</div>
              <div className="font-bold leading-tight mt-0.5">{t.city}</div>
              <div className="text-2xl font-black mt-2 tabular-nums" style={{ color: 'var(--accent)' }}>{pct(t.champion)}</div>
              <div className="text-xs text-[var(--text-sec)]">to win the title · {t.projectedWins.toFixed(0)} proj. W</div>
            </Link>
          ))}
        </div>
      </section>

      <ConferenceTable conference="East" teams={east} />
      <ConferenceTable conference="West" teams={west} />

      <PlayCta
        title="Think your team deserves better odds?"
        body="Take over any of the 30 teams with its real 2026-27 roster, make the trades the front office won't, and sim the season yourself. Free, in your browser."
        secondary={{ label: 'Browse all 30 rosters', href: '/rosters/2026' }}
      />

      <section className={`mt-12 max-w-3xl ${ARTICLE_PROSE}`}>
        <h2>How these odds work</h2>
        <p>
          Every week we take the real {odds.season} standings and the remaining schedule, then play out the rest of the season {sims}{' '}
          times. Each percentage is the share of those simulated seasons in which a team reached that milestone. Projected wins are the
          average final win total across all of them.
        </p>
        <ul>
          <li>
            <strong>Team strength comes from the BS Hoops game engine.</strong> Every team plays every other team, home and away, through
            the same possession-by-possession sim you play in the game, using the 2026-27 rosters and ratings from{' '}
            <Link href="/rosters/2026">our roster pages</Link>. A team&apos;s average margin in those games is its rating.
          </li>
          <li><strong>Injuries count.</strong> Injured rotation players sit until their injury runs out, then return to the lineup.</li>
          <li>
            <strong>Real results count more as the season goes on.</strong> Each rating is blended with the team&apos;s actual point
            differential; after about 15 games the results carry half the weight. Each simulated season also nudges every team&apos;s
            strength up or down a little, because nobody knows exactly how good a team is in October.
          </li>
          <li><strong>Home court</strong> is worth about two and a half points. Neutral-site games get none.</li>
          <li>
            <strong>Postseason follows the NBA format:</strong> the top six in each conference go straight to the playoffs, seeds 7-10
            play the play-in tournament for the last two spots, then four best-of-seven rounds with home court to the higher seed.
          </li>
          <li>
            <strong>Tiebreakers are simplified:</strong> win percentage, then head-to-head, conference record, then a coin flip. The
            NBA&apos;s full procedure has more steps, so very close races can differ slightly.
          </li>
        </ul>
        <p>Results and schedule come from public NBA data; ratings come from BS Hoops. These are simulations for fun, not betting advice.</p>

        <h2>Frequently asked questions</h2>
        <h3>What&apos;s the difference between playoff odds and play-in odds?</h3>
        <p>
          Play-in odds are the chance a team finishes 7th through 10th in its conference. Playoff odds are the chance it reaches the
          first round at all: either a top-six finish, or winning its way through the play-in.
        </p>
        <h3>How often are the odds updated?</h3>
        <p>Every Monday morning, with every result through Sunday night.</p>
        <h3>Why do these odds differ from other sites?</h3>
        <p>
          Every model rates teams differently. Ours starts from BS Hoops player ratings run through our own game engine, then leans on
          real results as the season goes on. Other sites use betting markets, Elo, or play-by-play efficiency.
        </p>
        <h3>Can I simulate the season myself?</h3>
        <p>
          Yes. In BS Hoops you can take over any team with its current roster, make trades and signings, and sim or watch the rest of
          the season. See how every player rates in the <Link href="/player-tiers">player tiers</Link>, or <Link href="/">start a league</Link>.
        </p>
      </section>
    </ContentFrame>
  );
}
