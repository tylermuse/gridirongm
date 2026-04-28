'use client';

interface Props {
  size?: 'sm' | 'md';
}

/** Small reusable winner crown for season-end + (future) Hall of Fame entries. */
export function AwardWinnerBadge({ size = 'sm' }: Props) {
  const cls = size === 'md' ? 'text-base' : 'text-xs';
  return <span className={cls} title="Season winner">🏆</span>;
}
