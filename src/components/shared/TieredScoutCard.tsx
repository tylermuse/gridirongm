'use client';

import React from 'react';

interface TierConfig {
  id: string;
  label: string;
  icon: string;
  cost: number;
  unlocked: boolean;
  content: React.ReactNode;
  capLabel?: string;
  capReached?: boolean;
}

interface TieredScoutCardProps {
  tiers: [TierConfig, TierConfig, TierConfig];
  pointsRemaining: number;
  maxPoints: number;
  pointLabel: string;
  onUnlock: (tierId: string) => void;
  colorScheme: 'draft' | 'fa';
}

const COLOR_SCHEMES = {
  draft: {
    tier1: { bg: 'bg-sky-50', border: 'border-sky-300', accent: 'text-sky-700', leftBorder: 'border-l-sky-400' },
    tier2: { bg: 'bg-indigo-50', border: 'border-indigo-300', accent: 'text-indigo-700', leftBorder: 'border-l-indigo-500' },
    tier3: { bg: 'bg-violet-50', border: 'border-violet-300', accent: 'text-violet-700', leftBorder: 'border-l-violet-600' },
  },
  fa: {
    tier1: { bg: 'bg-emerald-50', border: 'border-emerald-300', accent: 'text-emerald-700', leftBorder: 'border-l-emerald-400' },
    tier2: { bg: 'bg-purple-50', border: 'border-purple-300', accent: 'text-purple-700', leftBorder: 'border-l-purple-500' },
    tier3: { bg: 'bg-amber-50', border: 'border-amber-300', accent: 'text-amber-700', leftBorder: 'border-l-amber-500' },
  },
};

function PointsBudget({ remaining, max }: { remaining: number; max: number }) {
  const pct = (remaining / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono font-bold text-[var(--text)]">{remaining}</span>
      <span className="text-[var(--text-sec)]">pts</span>
    </div>
  );
}

function LockedTierCTA({ tier, colors, pointsRemaining, onUnlock }: {
  tier: TierConfig;
  colors: { bg: string; border: string; accent: string };
  pointsRemaining: number;
  onUnlock: (id: string) => void;
}) {
  const canAfford = pointsRemaining >= tier.cost;
  const blocked = tier.capReached;
  return (
    <div className={`border-t-2 border-dashed ${colors.border} ${colors.bg} bg-opacity-50 px-3 py-2.5`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{tier.icon}</span>
          <div>
            <span className={`text-sm font-bold ${colors.accent}`}>{tier.label}</span>
            {tier.capLabel && <span className="text-[11px] text-[var(--text-sec)] ml-2">({tier.capLabel})</span>}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onUnlock(tier.id); }}
          disabled={!canAfford || !!blocked}
          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
            canAfford && !blocked
              ? `bg-white ${colors.accent} border ${colors.border} shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]`
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {blocked ? 'Cap reached' : `Unlock · ${tier.cost} pt${tier.cost > 1 ? 's' : ''}`}
        </button>
      </div>
      {!canAfford && !blocked && (
        <p className="text-[11px] text-[var(--text-sec)] mt-1 ml-7">Need {tier.cost} pts, only {pointsRemaining} remaining</p>
      )}
    </div>
  );
}

export function TieredScoutCard({ tiers, pointsRemaining, maxPoints, pointLabel, onUnlock, colorScheme }: TieredScoutCardProps) {
  const colors = COLOR_SCHEMES[colorScheme];
  const allTiers = [
    { tier: tiers[0], colors: colors.tier1, leftWidth: 'border-l-2' },
    { tier: tiers[1], colors: colors.tier2, leftWidth: 'border-l-[3px]' },
    { tier: tiers[2], colors: colors.tier3, leftWidth: 'border-l-4' },
  ];
  const nextLockedIdx = allTiers.findIndex(t => !t.tier.unlocked);

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface-2)] rounded-t-lg text-xs">
        <span className="text-[var(--text-sec)] font-medium">{pointLabel}</span>
        <PointsBudget remaining={pointsRemaining} max={maxPoints} />
      </div>
      <div className="rounded-b-lg overflow-hidden border border-[var(--border)]">
        {allTiers.map(({ tier, colors: c, leftWidth }, idx) => {
          if (!tier.unlocked) return null;
          return (
            <div key={tier.id} className={`${c.bg} ${leftWidth} ${c.leftBorder} border-b border-[var(--border)] last:border-b-0`}>
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-black/5">
                <span className="text-sm">{tier.icon}</span>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${c.accent}`}>{tier.label}</span>
                <span className="text-[10px] text-green-600">✓</span>
              </div>
              <div className="px-3 py-2">{tier.content}</div>
            </div>
          );
        })}
        {nextLockedIdx !== -1 && nextLockedIdx < 3 && (
          <LockedTierCTA tier={allTiers[nextLockedIdx].tier} colors={allTiers[nextLockedIdx].colors} pointsRemaining={pointsRemaining} onUnlock={onUnlock} />
        )}
      </div>
    </div>
  );
}
