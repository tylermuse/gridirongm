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
            <ol className="list-decimal list-inside space-y-1 text-[var(--text-sec)]">
              <li>
                Go to{' '}
                <Link href="/" className="text-blue-600 hover:underline">
                  Gridiron GM
                </Link>
              </li>
              <li>Click <strong>Import League File</strong> on the team picker screen</li>
              <li>
                Paste this URL into the input:{' '}
                <code className="text-xs bg-[var(--surface-2)] px-1.5 py-0.5 rounded font-mono">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/rosters/{roster.fileName}
                </code>
              </li>
              <li>Click <strong>Load</strong>, then pick your team</li>
            </ol>
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

              <a
                href={`/rosters/${roster.fileName}`}
                download={roster.fileName}
                className="shrink-0 inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Roster
              </a>
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
        </div>
      </div>
    </div>
  );
}
