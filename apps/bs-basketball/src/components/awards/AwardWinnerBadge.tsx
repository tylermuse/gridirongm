/** Season-winner crown (parity with football's AwardWinnerBadge). */
export function AwardWinnerBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return <span className={size === 'md' ? 'text-base' : 'text-xs'} title="Season winner">🏆</span>;
}
