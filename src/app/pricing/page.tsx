'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { PRICE_IDS, SCOUTING_LEVELS } from '@/lib/subscription';

const tiers = [
  {
    name: 'Free',
    tier: 'free' as const,
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: 'Full game, all features',
    features: [
      'Full season simulation',
      'Draft, free agency, trades',
      'All stats, standings, history',
      'Custom league settings',
      'Multiple leagues & unlimited saves',
      'Entry-level draft scouting',
    ],
    limitations: ['Banner ads', 'Entry scouting only'],
    priceIdMonthly: null,
    priceIdYearly: null,
  },
  {
    name: 'Pro',
    tier: 'pro' as const,
    monthlyPrice: 4.99,
    yearlyPrice: 39.99,
    description: 'Ad-free + better scouting',
    features: [
      'Everything in Free',
      'Ad-free experience',
      'Pro scouting level',
      'Tighter OVR ranges (±5)',
      'Position breakdowns, strengths & weaknesses',
      'Player comparisons & trait hints',
    ],
    limitations: [],
    priceIdMonthly: PRICE_IDS.pro_monthly,
    priceIdYearly: PRICE_IDS.pro_yearly,
    popular: true,
  },
  {
    name: 'Elite',
    tier: 'elite' as const,
    monthlyPrice: 9.99,
    yearlyPrice: 79.99,
    description: 'Maximum intel + exclusive features',
    features: [
      'Everything in Pro',
      'Elite scouting level',
      'Near-exact ratings (±2)',
      'Full projections & scout\'s take',
      'AI Coach Advisor (coming soon)',
      'Custom Team Creator (coming soon)',
      'Coaching Staff (coming soon)',
      'Advanced Analytics (coming soon)',
      'Historical Draft Classes (coming soon)',
      'League Export/Import (coming soon)',
    ],
    limitations: [],
    priceIdMonthly: PRICE_IDS.elite_monthly,
    priceIdYearly: PRICE_IDS.elite_yearly,
  },
];

export default function PricingPage() {
  const router = useRouter();
  const { user, tier: currentTier } = useSubscription();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (priceId: string) => {
    if (!user) {
      router.push('/login');
      return;
    }

    setLoading(priceId);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen py-16 px-4" style={{ backgroundColor: '#f0f4f8' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black mb-2">
            <span className="text-blue-600">GRIDIRON</span> GM Pro
          </h1>
          <p className="text-lg text-[var(--text-sec)]">
            Upgrade your scouting department. Unlock elite intel.
          </p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            ← Back to game
          </button>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex bg-white rounded-xl border border-[var(--border)] p-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                billing === 'monthly' ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('yearly')}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                billing === 'yearly' ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              Yearly <span className="text-green-600 font-bold">Save 33%</span>
            </button>
          </div>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {tiers.map(t => {
            const isCurrent = currentTier === t.tier;
            const price = billing === 'monthly' ? t.monthlyPrice : t.yearlyPrice;
            const priceId = billing === 'monthly' ? t.priceIdMonthly : t.priceIdYearly;

            return (
              <div
                key={t.name}
                className={`relative rounded-2xl border-2 bg-white p-8 flex flex-col ${
                  t.popular ? 'border-blue-600 shadow-lg' : 'border-[var(--border)]'
                }`}
              >
                {t.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-xl font-black">{t.name}</h3>
                  <p className="text-sm text-[var(--text-sec)] mt-1">{t.description}</p>
                </div>
                <div className="mb-6">
                  {price === 0 ? (
                    <div className="text-4xl font-black">Free</div>
                  ) : (
                    <div>
                      <span className="text-4xl font-black">${price}</span>
                      <span className="text-[var(--text-sec)]">/{billing === 'monthly' ? 'mo' : 'yr'}</span>
                    </div>
                  )}
                </div>
                <ul className="flex-1 space-y-3 mb-8">
                  {t.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                  {t.limitations.map(l => (
                    <li key={l} className="flex items-start gap-2 text-sm text-[var(--text-sec)]">
                      <span className="mt-0.5">—</span>
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full py-3 rounded-xl bg-gray-100 text-[var(--text-sec)] text-sm font-bold"
                  >
                    Current Plan
                  </button>
                ) : priceId ? (
                  <button
                    onClick={() => handleSubscribe(priceId)}
                    disabled={!!loading}
                    className={`w-full py-3 rounded-xl text-sm font-bold transition-colors ${
                      t.popular
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                    } disabled:opacity-50`}
                  >
                    {loading === priceId ? 'Loading...' : `Upgrade to ${t.name}`}
                  </button>
                ) : (
                  <button
                    onClick={() => router.push('/')}
                    className="w-full py-3 rounded-xl border border-[var(--border)] text-sm font-bold hover:bg-gray-50 transition-colors"
                  >
                    Play Free
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Scouting comparison table */}
        <div className="bg-white rounded-2xl border border-[var(--border)] p-8">
          <h2 className="text-2xl font-black mb-6 text-center">Scouting Level Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-3 pr-4 font-bold">Level</th>
                  <th className="text-left py-3 px-4 font-bold">Tier</th>
                  <th className="text-left py-3 px-4 font-bold">Details</th>
                </tr>
              </thead>
              <tbody>
                {SCOUTING_LEVELS.map((level, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3 pr-4 font-bold">{level.name}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                        level.tier === 'free' ? 'bg-gray-100 text-gray-700' :
                        level.tier === 'pro' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {level.tier === 'free' ? 'Free' : level.tier === 'pro' ? 'Pro' : 'Elite'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-sec)]">{level.tooltip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
