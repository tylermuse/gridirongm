'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { PREMIUM_PRICE_ID } from '@bs/core/billing';

const PREMIUM_FEATURES = [
  'Ad-free experience',
  'AI commentary on every game',
  '3 audio podcast credits per month',
  '30 scout points per draft (3× the free allotment)',
  '9 free-agent intel reports (3× the free allotment)',
  'Cancel anytime — Stripe Customer Portal',
];

const FREE_FEATURES = [
  'Full season simulation',
  'Draft, free agency, trades',
  'All stats, standings, history',
  'Custom league settings',
  'Multiple leagues & unlimited saves',
  '10 scout points per draft',
  '3 free-agent intel reports',
];

const FREE_LIMITATIONS = [
  'Banner ads',
  'No AI commentary',
  'No podcast generation',
];

export default function PricingPage() {
  const router = useRouter();
  const {
    user,
    tier: currentTier,
    isAdmin,
    isFoundingMember,
  } = useSubscription();
  const [loading, setLoading] = useState<'checkout' | 'portal' | null>(null);

  const handleSubscribe = useCallback(async () => {
    if (!user) {
      // Preserve the upgrade intent through the login flow. After login the
      // user lands back here with ?intent=checkout, and the auto-fire effect
      // below picks up the action without losing their place in the game.
      const next = encodeURIComponent('/pricing?intent=checkout');
      router.push(`/login?next=${next}`);
      return;
    }
    if (!PREMIUM_PRICE_ID) {
      alert('Premium plan is not yet configured. Please try again later.');
      return;
    }
    setLoading('checkout');
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: PREMIUM_PRICE_ID }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to start checkout. Please try again.');
      }
    } catch {
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  }, [router, user]);

  // Auto-fire checkout when arriving back from login with ?intent=checkout.
  // Single-shot: ref guard prevents the effect re-firing if the user navigates
  // away and comes back to /pricing without the intent param.
  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (autoFiredRef.current) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('intent') !== 'checkout') return;
    if (!user) return; // wait for auth to resolve
    autoFiredRef.current = true;
    // Strip the param so a refresh doesn't re-fire the checkout.
    window.history.replaceState({}, '', '/pricing');
    handleSubscribe();
  }, [user, handleSubscribe]);

  const handleManage = async () => {
    setLoading('portal');
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to open subscription portal.');
      }
    } catch {
      alert('Failed to open subscription portal.');
    } finally {
      setLoading(null);
    }
  };

  const isPremium = currentTier === 'premium';
  // Founders are grandfathered into Premium for free — show that explicitly
  // so they know they don't need to subscribe.
  const isComplimentaryPremium = (isFoundingMember || isAdmin) && !user?.email?.endsWith('@noemail.test');

  return (
    <div className="min-h-screen py-16 px-4" style={{ backgroundColor: '#f0f4f8' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black mb-2">
            <span className="text-blue-600">BS</span> Football Premium
          </h1>
          <p className="text-lg text-[var(--text-sec)]">
            One simple plan. Unlock the full experience.
          </p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            ← Back to game
          </button>
        </div>

        {/* Founder callout */}
        {isComplimentaryPremium && (
          <div className="bg-gradient-to-r from-amber-100 to-yellow-50 border border-amber-300 rounded-2xl p-6 mb-8 text-center">
            <div className="text-2xl mb-1">⭐</div>
            <h2 className="text-lg font-black text-amber-900 mb-1">
              You&apos;re a Founding Member
            </h2>
            <p className="text-sm text-amber-800">
              All Premium features are unlocked on your account, free forever.
              No subscription needed.
            </p>
          </div>
        )}

        {/* Tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* Free tier */}
          <div className="rounded-2xl border-2 border-[var(--border)] bg-white p-8 flex flex-col">
            <div className="mb-6">
              <h3 className="text-xl font-black">Free</h3>
              <p className="text-sm text-[var(--text-sec)] mt-1">
                Full game, with ads
              </p>
            </div>
            <div className="mb-6">
              <div className="text-4xl font-black">Free</div>
            </div>
            <ul className="flex-1 space-y-3 mb-8">
              {FREE_FEATURES.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>{f}</span>
                </li>
              ))}
              {FREE_LIMITATIONS.map(l => (
                <li
                  key={l}
                  className="flex items-start gap-2 text-sm text-[var(--text-sec)]"
                >
                  <span className="mt-0.5">—</span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
            {currentTier === 'free' && !isComplimentaryPremium ? (
              <button
                disabled
                className="w-full py-3 rounded-xl bg-gray-100 text-[var(--text-sec)] text-sm font-bold"
              >
                Current Plan
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

          {/* Premium tier */}
          <div className="relative rounded-2xl border-2 border-blue-600 bg-white p-8 flex flex-col shadow-lg">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full">
              Recommended
            </div>
            <div className="mb-6">
              <h3 className="text-xl font-black">Premium</h3>
              <p className="text-sm text-[var(--text-sec)] mt-1">
                Everything unlocked. No ads.
              </p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-black">$4.99</span>
              <span className="text-[var(--text-sec)]">/mo</span>
            </div>
            <ul className="flex-1 space-y-3 mb-8">
              {PREMIUM_FEATURES.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            {isComplimentaryPremium ? (
              <button
                disabled
                className="w-full py-3 rounded-xl bg-amber-100 text-amber-900 text-sm font-bold"
              >
                Unlocked (Founding Member)
              </button>
            ) : isPremium ? (
              <button
                onClick={handleManage}
                disabled={loading === 'portal'}
                className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 transition-colors disabled:opacity-60"
              >
                {loading === 'portal' ? 'Opening…' : 'Manage subscription'}
              </button>
            ) : (
              <button
                onClick={handleSubscribe}
                disabled={loading === 'checkout'}
                className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {loading === 'checkout' ? 'Starting…' : 'Upgrade to Premium'}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-[var(--text-sec)]">
          Subscriptions are billed monthly via Stripe. Cancel anytime from the
          customer portal — your premium access continues until the end of the
          current billing period.
        </p>
      </div>
    </div>
  );
}
