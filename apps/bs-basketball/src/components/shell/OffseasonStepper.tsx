'use client';

import Link from 'next/link';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { expansionWindow, getExpansion } from '@/lib/expansion';

/**
 * Offseason step indicator (parity with football's expansion stepper). Shows the
 * BS Hoops offseason order — Draft → Re-sign → Free Agency — with the current
 * step highlighted. Steps link to their page. Roster cuts aren't a separate step:
 * they're folded into Re-sign as a hard 15-man gate before the season starts.
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
  return (
    <div className="flex items-center gap-1 flex-wrap mb-5 text-xs font-bold">
      {STEPS.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1">
          <Link
            href={s.href}
            className="px-2.5 py-1 rounded-md transition-colors"
            style={s.key === active ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--text-sec)' }}
          >
            {s.label}
          </Link>
          {i < STEPS.length - 1 && <span className="opacity-40">→</span>}
        </span>
      ))}
      {showExpansion && (
        <Link
          href="/expansion"
          className="ml-2 px-2.5 py-1 rounded-md border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--accent)', background: 'var(--surface)' }}
        >
          {exp && exp.stage !== 'done' ? '🏗️ Expansion in progress' : '🏗️ Expand the league'}
        </Link>
      )}
    </div>
  );
}
