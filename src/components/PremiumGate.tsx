'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import type { Feature } from '@/lib/subscription';

interface PremiumGateProps {
  /** What the user is trying to access — drives the upsell copy. */
  feature?: Feature;
  /** Children rendered when the user has access. */
  children: ReactNode;
  /**
   * 'block' (default): hide children and show an upsell card.
   * 'soft': render children but disabled, with an upsell strip overlaid.
   */
  mode?: 'block' | 'soft';
  /** Override the default headline shown in the upsell. */
  title?: string;
  /** Override the default supporting copy. */
  description?: string;
  /** Where the Upgrade button links to. Defaults to /pricing. */
  upgradeHref?: string;
  /** Optional className applied to the wrapping element. */
  className?: string;
}

const FEATURE_COPY: Record<Feature, { title: string; description: string }> = {
  ad_free: {
    title: 'Go Ad-Free with Premium',
    description: 'Remove banner ads and play distraction-free for $4.99/mo.',
  },
  ai_commentary: {
    title: 'AI Commentary is a Premium Feature',
    description:
      'Live AI commentary, debate segments, and weekly recaps are unlocked with Premium.',
  },
  unlimited_scouting: {
    title: 'Unlimited Scouting is a Premium Feature',
    description:
      'Premium gives you unlimited scouting points, all scouting levels, and uncapped evaluations.',
  },
  podcast_credits: {
    title: 'Podcasts are a Premium Feature',
    description:
      'Premium subscribers get 3 audio podcast credits every month plus access to the full feed.',
  },
};

export function PremiumGate({
  feature,
  children,
  mode = 'block',
  title,
  description,
  upgradeHref = '/pricing',
  className,
}: PremiumGateProps) {
  const { hasFeature, loading } = useSubscription();

  // While we're still figuring out auth, render children. Avoids a flash of
  // upsell on every page load for paying users.
  if (loading) return <>{children}</>;

  // No specific feature → treat as a generic premium check via 'ad_free' as
  // a stand-in. (Any premium feature works; founders/admins/premium pass.)
  const allowed = hasFeature(feature ?? 'ad_free');
  if (allowed) return <>{children}</>;

  const copy = feature
    ? FEATURE_COPY[feature]
    : { title: 'Upgrade to Premium', description: 'Unlock the full BS Football experience for $4.99/mo.' };
  const finalTitle = title ?? copy.title;
  const finalDescription = description ?? copy.description;

  if (mode === 'soft') {
    return (
      <div className={`relative ${className ?? ''}`}>
        <div className="opacity-40 pointer-events-none select-none" aria-hidden>
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="bg-white border border-blue-200 rounded-xl shadow-lg p-4 max-w-sm text-center">
            <div className="text-sm font-bold text-[var(--text)]">{finalTitle}</div>
            <p className="text-xs text-[var(--text-sec)] mt-1">{finalDescription}</p>
            <Link
              href={upgradeHref}
              className="inline-block mt-3 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
            >
              Upgrade — $4.99/mo
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/40 p-6 text-center ${
        className ?? ''
      }`}
    >
      <div className="text-2xl mb-2">🔒</div>
      <div className="text-base font-bold text-[var(--text)]">{finalTitle}</div>
      <p className="text-sm text-[var(--text-sec)] mt-1 max-w-md mx-auto">
        {finalDescription}
      </p>
      <Link
        href={upgradeHref}
        className="inline-block mt-4 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
      >
        Upgrade to Premium
      </Link>
    </div>
  );
}

export default PremiumGate;
