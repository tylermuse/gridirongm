'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSubscription } from '@/components/providers/SubscriptionProvider';

type AdSize = 'banner' | 'leaderboard' | 'rectangle' | 'sidebar';

interface AdSlotProps {
  size?: AdSize;
  slotId?: string;
  className?: string;
}

const SIZES: Record<AdSize, { width: string; height: string; label: string }> = {
  banner:      { width: '320px', height: '50px',  label: '320×50' },
  leaderboard: { width: '728px', height: '90px',  label: '728×90' },
  rectangle:   { width: '300px', height: '250px', label: '300×250' },
  sidebar:     { width: '160px', height: '600px', label: '160×600' },
};

const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

// How long to wait for AdSense to fill a slot before falling back to the
// upgrade prompt. AdSense collapses unfilled <ins> elements to height 0;
// the ResizeObserver catches that immediately, but the timeout covers cases
// where the observer fires late or not at all (e.g. during AdSense account
// approval / no inventory for this slot).
const FILL_TIMEOUT_MS = 2000;

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

/**
 * Free-tier ad placement. Renders nothing for Premium / Founder / Admin users.
 *
 * Falls back to the upgrade prompt when AdSense hasn't filled the slot
 * (pending account approval, no inventory) so the space is never blank.
 */
export function AdSlot({ size = 'leaderboard', slotId, className }: AdSlotProps) {
  const { hasFeature, loading } = useSubscription();
  const insRef = useRef<HTMLModElement | null>(null);
  const [adFilled, setAdFilled] = useState(false);

  useEffect(() => {
    if (!ADSENSE_CLIENT_ID || !slotId || !insRef.current) return;

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.error('[AdSlot] adsbygoogle push failed:', err);
    }

    const el = insRef.current;
    let filled = false;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          filled = true;
          setAdFilled(true);
        }
      }
    });
    observer.observe(el);

    const timeout = setTimeout(() => {
      if (!filled) setAdFilled(false);
    }, FILL_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [size, slotId]);

  if (loading) return null;
  if (hasFeature('ad_free')) return null;

  const dims = SIZES[size];

  if (ADSENSE_CLIENT_ID && slotId) {
    return (
      <div className={`mx-auto my-4 ${className ?? ''}`} style={{ width: dims.width, maxWidth: '100%' }}>
        {/* The <ins> is always rendered so AdSense can request a fill.
            It is hidden behind the visible slot until fill is confirmed. */}
        <ins
          ref={insRef}
          className="adsbygoogle"
          style={{
            display: 'block',
            width: dims.width,
            height: adFilled ? dims.height : '0px',
            maxWidth: '100%',
            overflow: 'hidden',
          }}
          data-ad-client={ADSENSE_CLIENT_ID}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
        {/* Upgrade prompt shown until AdSense confirms a fill. */}
        {!adFilled && <UpgradePromptInner dims={dims} />}
      </div>
    );
  }

  return (
    <div
      data-ad-slot={slotId ?? size}
      className={`mx-auto my-4 flex items-center justify-center gap-4 px-4 rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 ${className ?? ''}`}
      style={{ width: dims.width, maxWidth: '100%', height: dims.height }}
    >
      <UpgradePromptInner dims={dims} />
    </div>
  );
}

function UpgradePromptInner({ dims }: { dims: { width: string; height: string; label: string } }) {
  return (
    <div
      className="flex items-center justify-center gap-4 px-4 rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50"
      style={{ width: '100%', height: dims.height }}
    >
      <div className="min-w-0 text-left">
        <div className="text-sm font-bold text-[var(--text,#111827)] truncate">
          Enjoying BS Football?
        </div>
        <p className="text-xs text-[var(--text-sec,#6b7280)] truncate">
          Premium unlocks AI commentary, 3× scouting, and podcasts.
        </p>
      </div>
      <Link
        href="/pricing"
        className="shrink-0 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors whitespace-nowrap"
      >
        Go Premium — $4.99/mo
      </Link>
    </div>
  );
}

export default AdSlot;
