'use client';

import { useSubscription } from '@/components/providers/SubscriptionProvider';

interface AdBannerProps {
  variant?: 'banner' | 'sidebar';
  className?: string;
}

/**
 * AdBanner — shows a placeholder ad for free-tier users.
 * Hidden for Pro+ subscribers. Will be replaced with real AdSense later.
 */
export function AdBanner({ variant = 'banner', className = '' }: AdBannerProps) {
  const { tier } = useSubscription();

  // Paid users see nothing
  if (tier !== 'free') return null;

  if (variant === 'sidebar') {
    return (
      <div className={`border border-dashed border-[var(--border)] rounded-lg bg-[var(--surface-2)] p-3 text-center ${className}`}>
        <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider mb-1">Advertisement</div>
        <div className="h-48 flex items-center justify-center text-xs text-[var(--text-sec)]">
          Ad Space
        </div>
        <a href="/pricing" className="text-[10px] text-blue-600 hover:underline">Remove ads →</a>
      </div>
    );
  }

  // Banner (horizontal)
  return (
    <div className={`border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Ad</span>
        <div className="h-[60px] w-[468px] max-w-full bg-[var(--surface)] border border-dashed border-[var(--border)] rounded flex items-center justify-center text-xs text-[var(--text-sec)]">
          Banner Ad (468×60)
        </div>
      </div>
      <a href="/pricing" className="text-[10px] text-blue-600 hover:underline shrink-0 ml-3">
        Remove ads →
      </a>
    </div>
  );
}
