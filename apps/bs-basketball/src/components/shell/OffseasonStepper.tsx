'use client';

import Link from 'next/link';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { expansionWindow, getExpansion } from '@/lib/expansion';

/**
 * Offseason step indicator (parity with football's expansion stepper). Shows the
 * BS Hoops offseason order — Draft → Re-sign → Free Agency — with the current
 * step highlighted. Steps link to their page. Roster cuts aren't a separate step:
 * they're folded into Re-sign as a hard roster-limit gate before the season starts.
 *
 * An optional "Expansion" link appears while the expansion window is open (after
 * the draft, before the season) or an expansion is in progress.
 */

export type OffseasonStep = 'resign' | 'draft' | 'fa';

const STEPS: { key: OffseasonStep; label: string; href: string }[] = [
  { key: 'draft', label: '1. Draft', href: '/draft' },
  { key: 'resign', label: '2. Re-sign', href: '/re-sign' },
  { key: 'fa', label: '3. Free Agency', href: '/free-agency' },
];

export function OffseasonStepper({ active }: { active: OffseasonStep }) {
  const league = useLeagueStore(s => s.league);
  const exp = league ? getExpansion(league) : null;
  const showExpansion = !!league && ((!!exp && exp.stage !== 'done') || expansionWindow(league).open);
  // The flow is linear, so every step before the active one is done.
  const activeIdx = STEPS.findIndex(s => s.key === active);
  return (
    <nav aria-label="Offseason steps" className="flex items-center gap-1 flex-wrap mb-5 text-xs font-bold">
      {STEPS.map((s, i) => {
        const isActive = s.key === active;
        const done = i < activeIdx;
        const cls = isActive
          ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]'
          : done
            ? 'bg-[var(--surface-2)] text-[var(--text-sec)] opacity-70 hover:opacity-100 hover:text-[var(--text)]'
            : 'bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--border)]';
        return (
          <span key={s.key} className="flex items-center gap-1">
            <Link
              href={s.href}
              aria-current={isActive ? 'step' : undefined}
              className={`px-2.5 py-1 rounded-md transition-colors ${cls}`}
            >
              {done && <span aria-hidden className="mr-1 text-green-600">✓</span>}
              {s.label}
              {done && <span className="sr-only"> (done)</span>}
            </Link>
            {i < STEPS.length - 1 && <span className="opacity-40" aria-hidden>→</span>}
          </span>
        );
      })}
      {showExpansion && (
        <Link
          href="/expansion"
          className="ml-2 px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-colors"
        >
          {exp && exp.stage !== 'done' ? '🏗️ Expansion in progress' : '🏗️ Expand the league'}
        </Link>
      )}
    </nav>
  );
}
