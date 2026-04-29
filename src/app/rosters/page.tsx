'use client';

import { useState } from 'react';
import Link from 'next/link';

interface RosterEntry {
  id: string;
  title: string;
  description: string;
  fileName: string;
  lastUpdated: string;
  compatibility: string[];
  startMode: 'offseason' | 'regular';
  /** Tier label rendered as a pill on the card. Defaults to "Modern" when unset. */
  era?: 'Modern' | 'Era' | 'Beta';
  /** Optional caveat shown in muted text under the description — used to set
   *  expectations for v0 era rosters that aren’t fully hand-curated yet. */
  caveat?: string;
}

const ROSTERS: RosterEntry[] = [
  {
    id: 'nfl-2026-updated',
    title: 'NFL 2026 Roster — Updated April 26, 2026 (Post-Draft)',
    description:
      'Complete NFL roster with verified contracts and the full 2026 NFL Draft — all 257 picks across all 7 rounds landed on their actual drafted teams. Updated April 26 with Day 3 (Jermod McCoy 4.1 to the Raiders, Cade Klubnik to the Jets in the 4th, Garrett Nussmeier sliding to the Chiefs in the 7th, etc.) plus 74 small-school and post-combine-riser prospects that weren’t in the original class — they’ve been generated and slotted on their real teams so every late-round pick lands somewhere. Also includes the latest April trades: Greenard to the Eagles, Tyree Wilson to the Saints, Dee Winters to the Cowboys.',
    fileName: 'FBGM_NFL_Roster_2026_Updated.json',
    lastUpdated: 'April 26, 2026',
    compatibility: ['Football GM (FBGM)', 'BS Football'],
    startMode: 'regular',
    era: 'Modern',
  },
  {
    id: 'nfl-2026-predraft',
    title: 'NFL 2026 Roster — Pre-Draft (Play the Draft Yourself)',
    description:
      'Same league state as the April 24 post-draft roster — same free-agency moves, same contracts, same refreshed 2026 class — but Round 1 has been rolled back. All 32 first-rounders (Mendoza, Bain, Reese, Bailey, Mauigoa, Love, etc.) are back in the draft pool, and every team has its Round 1 pick restored. Start a franchise and play the draft yourself: draft with the actual team you picked, trade up or down, see how your roster stacks against the consensus board. Rounds 2-7 pick as normal after. Everything else is identical to the post-draft file.',
    fileName: 'FBGM_NFL_Roster_2026_PreDraft.json',
    lastUpdated: 'April 24, 2026',
    compatibility: ['Football GM (FBGM)', 'BS Football'],
    startMode: 'offseason',
    era: 'Modern',
  },
  {
    id: 'nfl-2007-brady-era',
    title: 'Tom Brady Era — 2007 NFL Season',
    description:
      'Travel back to 2007 — Brady’s 16-0 regular season with Moss + Welker, Manning still in his Colts prime, LT chasing the rushing record in San Diego, the Mannings vs Brady storyline at full volume. Every team’s 2007 roster is stamped onto their real-life slots: Brady, Moss, Welker, Brady‑era Patriots; Manning, Wayne, Harrison, Addai, Freeney Colts; LT, Rivers, Gates, Merriman Chargers; Adrian Peterson rookie year on the Vikings, Patrick Willis rookie year on SF; Romo + T.O. + Witten in Dallas, Brees + Reggie Bush in NO, Favre + Greg Jennings in GB, Ed Reed + Ray Lewis Ravens, Polamalu + Big Ben + Hines Ward Steelers, Larry Fitzgerald + Anquan Boldin + Kurt Warner Cardinals — across all 32 teams. Salary cap set to 2007 ($109M), contracts scaled to era dollars, league boots clean as a fresh 2007 season.',
    fileName: 'FBGM_NFL_Roster_BradyEra_2007.json',
    lastUpdated: 'April 28, 2026',
    compatibility: ['Football GM (FBGM)', 'BS Football'],
    startMode: 'regular',
    era: 'Era',
    caveat:
      'Powered by nflverse historical NFL roster data: ~1,700 real 2007 NFL players are stamped onto their actual 2007 teams. Ratings inherit from the 2026 base so OVRs are a rough fit (not historically tuned) — Adrian Peterson’s rookie OVR will reflect his 2026 namesake’s slot, not his 2007 form. Depth chart slot ordering is OVR-driven, so a real 2007 starter may show up as a backup on a team where the 2026 lineup happened to bury that position. Some long-tail roster spots (deepest backups) fall back to filler names where the 2007 active roster had fewer players than 2026.',
  },
];

function eraPillClasses(era: RosterEntry['era']): string {
  if (era === 'Era') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (era === 'Beta') return 'bg-purple-50 text-purple-700 border-purple-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
}

function HowToUse({ roster }: { roster: RosterEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-[var(--border)] mt-4 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-medium text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        How to use this roster
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <div className="font-bold text-[var(--text)] mb-1">For BS Football:</div>
            <p className="text-[var(--text-sec)] mb-3">Click the <strong>&quot;Play in BS Football&quot;</strong> button above.</p>
          </div>
          <div>
            <div className="font-bold text-[var(--text)] mb-1">For Football GM:</div>
            <ol className="list-decimal list-inside space-y-1 text-[var(--text-sec)]">
              <li>
                Go to{' '}
                <a
                  href="https://play.football-gm.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  play.football-gm.com
                </a>
              </li>
              <li>Click <strong>Tools</strong> in the top menu</li>
              <li>Select <strong>Import/Export</strong></li>
              <li>Click <strong>Import</strong> and select the downloaded JSON file</li>
              <li>Start a new league with the imported roster</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RostersPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-4xl mx-auto px-4 py-10 text-center">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-2">
            Community Rosters
          </h1>
          <p className="text-[var(--text-sec)] text-sm sm:text-base">
            Download updated NFL rosters for Football GM and BS Football
          </p>
        </div>
      </div>

      {/* Roster Cards */}
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {ROSTERS.map((roster) => (
          <div
            key={roster.id}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full border ${eraPillClasses(roster.era)}`}
                  >
                    {roster.era ?? 'Modern'}
                  </span>
                </div>
                <h2 className="text-lg font-black">{roster.title}</h2>
                <p className="text-sm text-[var(--text-sec)] mt-1.5 leading-relaxed">
                  {roster.description}
                </p>
                {roster.caveat && (
                  <p className="text-xs text-[var(--text-sec)] mt-2 leading-relaxed italic opacity-80">
                    {roster.caveat}
                  </p>
                )}
                <p className="text-xs mt-2 text-gray-500 italic">
                  Original roster by Jack (boimenred). Free agency updates by BS Football.
                </p>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {roster.compatibility.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-green-50 text-green-700 border border-green-200"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="text-xs text-[var(--text-sec)]">
                    Updated {roster.lastUpdated}
                  </span>
                </div>
              </div>

              <div className="shrink-0 flex flex-col gap-2">
                <Link
                  href={`/?roster=/rosters/${roster.fileName}&startMode=${roster.startMode}`}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-lg transition-colors shadow-sm"
                >
                  Play in BS Football →
                </Link>
                <a
                  href={`/rosters/${roster.fileName}`}
                  download={roster.fileName}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)] font-medium text-xs rounded-lg transition-colors border border-[var(--border)]"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download JSON
                </a>
              </div>
            </div>

            <HowToUse roster={roster} />
          </div>
        ))}
      </div>

      {/* Bottom Section */}
      <div className="max-w-4xl mx-auto px-4 pb-12">
        <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-6 text-center">
          <p className="text-sm text-[var(--text)]">
            Have a custom roster to share? Drop it in{' '}
            <a
              href="https://discord.gg/RMtusS2GKW"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-blue-600 hover:underline font-medium"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              our Discord
            </a>{' '}
            and we&apos;ll feature it here.
          </p>
        </div>
      </div>
    </div>
  );
}
