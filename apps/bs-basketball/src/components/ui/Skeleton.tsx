'use client';

/**
 * Skeleton loaders — placeholder shimmer rows for async lists, so content
 * fades in without a layout jump (spec 2.0 #6).
 */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded-md bg-[var(--surface-2)] ${className}`} style={style} aria-hidden />;
}

/** A stack of placeholder list rows. */
export function SkeletonList({ rows = 8, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: `${70 - (i % 4) * 8}%` }} />
          <Skeleton className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}
