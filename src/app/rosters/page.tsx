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
}

const ROSTERS: RosterEntry[] = [
  {
    id: 'nfl-2026-updated',
    title: 'NFL 2026 Roster — Updated March 15, 2026',
    description:
      'Complete NFL roster with all 2026 free agency signings, trades, and cuts through mid-March. Includes Trey Hendrickson to Ravens, Mike Evans to 49ers, Kenneth Walker III to Chiefs, DJ Moore to Bills, Kyler Murray to Vikings, and 30+ more moves.',
    fileName: 'FBGM_NFL_Roster_2026_Updated.json',
    lastUpdated: 'March 15, 2026',
    compatibility: ['Football GM (FBGM)', 'Gridiron GM'],
  },
];

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
            <div className="font-bold text-[var(--text)] mb-1">For Gridiron GM:</div>
            <p className="text-[var(--text-sec)] mb-3">Click the <strong>&quot;Play in Gridiron GM&quot;</strong> button above.</p>
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
            Download updated NFL rosters for Football GM and Gridiron GM
          </p>
        </div>
      </div>

      {/* CTA Banner */}
      <div className="max-w-4xl mx-auto px-4 mt-6">
        <Link
          href="/"
          className="block bg-blue-600 hover:bg-blue-700 transition-colors text-white rounded-xl px-6 py-4 text-center"
        >
          <div className="text-sm font-bold">Want the full GM experience?</div>
          <div className="text-lg font-black mt-0.5">
            Play Gridiron GM <span className="ml-1">→</span>
          </div>
        </Link>
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
                <h2 className="text-lg font-black">{roster.title}</h2>
                <p className="text-sm text-[var(--text-sec)] mt-1.5 leading-relaxed">
                  {roster.description}
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
                  href={`/?roster=/rosters/${roster.fileName}`}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-lg transition-colors shadow-sm"
                >
                  Play in Gridiron GM →
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
            Have a custom roster to share? Post it in{' '}
            <a
              href="https://www.reddit.com/r/GMGridiron/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline font-medium"
            >
              r/GMGridiron
            </a>{' '}
            and we&apos;ll feature it here.
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <a
              href="https://discord.gg/t9qM9TEq"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-sec)] hover:text-blue-600 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Join our Discord
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
