'use client';

/**
 * Football's two tab styles:
 *   - primary: the page's main view switch — a filled accent pill on a
 *     surface-2 track (Standings / Scores / Schedule).
 *   - secondary: a sub-toggle inside a view — the active option lifts onto a
 *     surface chip with a shadow (Division / Conference / League).
 * Both get hover states on the inactive options.
 */
export function SegmentedControl<T extends string>({
  options, value, onChange, variant = 'primary', size = 'md', className = '',
}: {
  options: ReadonlyArray<{ value: T; label: string; badge?: number }>;
  value: T;
  onChange: (v: T) => void;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const pad = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm';
  return (
    <div role="tablist" className={`inline-flex bg-[var(--surface-2)] rounded-lg p-0.5 ${className}`}>
      {options.map(o => {
        const active = o.value === value;
        const activeCls = variant === 'primary'
          ? 'bg-[var(--accent)] text-white shadow-sm'
          : 'bg-[var(--surface)] text-[var(--text)] shadow-sm';
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`${pad} rounded-md font-medium whitespace-nowrap transition-colors inline-flex items-center gap-1.5 ${
              active ? activeCls : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--border)]/50'
            }`}
          >
            {o.label}
            {o.badge != null && o.badge > 0 && (
              <span className={`text-[10px] font-bold rounded-full px-1.5 min-w-[1.1rem] text-center ${active && variant === 'primary' ? 'bg-white/25 text-white' : 'bg-red-600 text-white'}`}>
                {o.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
