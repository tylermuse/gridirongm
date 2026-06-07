'use client';

import Link from 'next/link';

/**
 * Offseason step indicator (parity with football's expansion stepper). Shows the
 * BS Hoops offseason order — Draft → Re-sign → Cuts → Free Agency — with the
 * current step highlighted. Steps link to their page.
 */

export type OffseasonStep = 'resign' | 'draft' | 'cuts' | 'fa';

const STEPS: { key: OffseasonStep; label: string; href: string }[] = [
  { key: 'draft', label: '1. Draft', href: '/draft' },
  { key: 'resign', label: '2. Re-sign', href: '/re-sign' },
  { key: 'cuts', label: '3. Cuts', href: '/post-draft-cuts' },
  { key: 'fa', label: '4. Free Agency', href: '/free-agency' },
];

export function OffseasonStepper({ active }: { active: OffseasonStep }) {
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
    </div>
  );
}
