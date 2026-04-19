'use client';

import Link from 'next/link';
import type { Position, SubPosition } from '@/types';

interface PositionLinkProps {
  position: Position;
  subPosition?: SubPosition;
  /** Render as a plain span when true (e.g. inside another <a>). */
  disabled?: boolean;
  className?: string;
}

/** Position label that deep-links into the global player search filtered to
 *  that position. Used across roster, depth chart, boxscore, draft board, etc.
 *  — trivial navigation affordance that compounds the value of the search page. */
export function PositionLink({ position, subPosition, disabled, className }: PositionLinkProps) {
  const label = (
    <>
      {position}
      {subPosition && subPosition !== position && (
        <span className="ml-1 text-[10px] text-[var(--text-sec)]/70">({subPosition})</span>
      )}
    </>
  );
  if (disabled) return <span className={className}>{label}</span>;
  return (
    <Link
      href={`/players?position=${position}`}
      className={`hover:text-blue-600 hover:underline transition-colors ${className ?? ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </Link>
  );
}
