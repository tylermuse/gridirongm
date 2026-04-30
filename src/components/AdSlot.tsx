'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useSubscription } from '@/components/providers/SubscriptionProvider';

type AdSize = 'banner' | 'leaderboard' | 'rectangle' | 'sidebar';

interface AdSlotProps {
  /** Pre-defined sizes. Real provider integration lives behind these. */
  size?: AdSize;
  /**
   * AdSense ad-unit slot ID for THIS placement. When NEXT_PUBLIC_ADSENSE_CLIENT_ID
   * is set, this is required for the slot to render real ads.
   * (Without it the slot stays in placeholder mode.)
   */
  slotId?: string;
  /** Optional className applied to the outer wrapper. */
  className?: string;
}

const SIZES: Record<AdSize, { width: string; height: string; label: string }> = {
  banner:      { width: '320px', height: '50px',  label: '320×50' },
  leaderboard: { width: '728px', height: '90px',  label: '728×90' },
  rectangle:   { width: '300px', height: '250px', label: '300×250' },
  sidebar:     { width: '160px', height: '600px', label: '160×600' },
};

const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

// Minimal type extension so we can call window.adsbygoogle.push without `any`.
declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

/**
 * Free-tier ad placement. Renders nothing for Premium / Founder / Admin users.
 *
 * Provider: Google AdSense. To activate real ads:
 *   1. Get your AdSense publisher ID (`ca-pub-XXXXXXXXXXXXXXXX`).
 *   2. Set `NEXT_PUBLIC_ADSENSE_CLIENT_ID` in Vercel env vars.
 *   3. Make sure the AdSense script is loaded once globally — see
 *      src/app/layout.tsx (it's wired via next/script).
 *   4. For each AdSlot placement in the codebase, create a corresponding
 *      ad unit in AdSense and pass its slot ID here as `slotId`.
 *
 * When `NEXT_PUBLIC_ADSENSE_CLIENT_ID` is unset, the slot renders a
 * placeholder block so layouts stay correct during development and during
 * the AdSense approval window.
 */
export function AdSlot({ size = 'leaderboard', slotId, className }: AdSlotProps) {
  const { hasFeature, loading } = useSubscription();
  const insRef = useRef<HTMLModElement | null>(null);

  // Push to AdSense queue once the ins element is mounted. Re-runs if size
  // or slotId changes (uncommon, but defensive).
  useEffect(() => {
    if (!ADSENSE_CLIENT_ID || !slotId || !insRef.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.error('[AdSlot] adsbygoogle push failed:', err);
    }
  }, [size, slotId]);

  // Don't flash an ad on initial load while subscription state resolves.
  if (loading) return null;
  // Premium / Founder / Admin → no ads.
  if (hasFeature('ad_free')) return null;

  const dims = SIZES[size];

  // Real AdSense ad unit (when fully configured).
  if (ADSENSE_CLIENT_ID && slotId) {
    return (
      <div
        data-ad-slot={slotId}
        className={`mx-auto my-4 ${className ?? ''}`}
        style={{ width: dims.width, maxWidth: '100%' }}
      >
        <ins
          ref={insRef}
          className="adsbygoogle"
          style={{ display: 'block', width: dims.width, height: dims.height, maxWidth: '100%' }}
          data-ad-client={ADSENSE_CLIENT_ID}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  // Placeholder (no AdSense client ID yet, or no slot ID for this placement).
  return (
    <div
      data-ad-slot={slotId ?? size}
      className={`mx-auto my-4 flex items-center justify-center bg-[var(--surface,#f3f4f6)] border border-dashed border-[var(--border,#d1d5db)] rounded-lg text-[10px] text-[var(--text-sec,#6b7280)] ${
        className ?? ''
      }`}
      style={{
        width: dims.width,
        maxWidth: '100%',
        height: dims.height,
      }}
    >
      <div className="flex flex-col items-center gap-1 px-2 text-center">
        <span className="font-bold uppercase tracking-wider">Ad Slot · {dims.label}</span>
        <Link href="/pricing" className="text-blue-600 hover:underline">
          Remove ads — $4.99/mo
        </Link>
      </div>
    </div>
  );
}

export default AdSlot;
