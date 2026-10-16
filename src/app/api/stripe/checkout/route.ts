import { NextResponse } from 'next/server';
import { getStripe } from '@bs/core/billing';
import { createClient } from '@bs/core/supabase/server';
import { PREMIUM_PRICE_ID, LEGACY_PAID_PRICE_IDS, EPISODE_PACK } from '@bs/core/billing';
import { readCredits, getServiceClient } from '@bs/core/podcast';
import { getOrCreateCustomerId, hasLiveSubscription } from '@/lib/server/stripeSync';

// Only the configured Premium price is allowed at checkout. Legacy prices
// remain valid for existing subscribers (the webhook still maps them up to
// 'premium') but new sign-ups always go through the current Premium price.
const ALLOWED_PRICE_IDS = new Set<string>(
  [PREMIUM_PRICE_ID, ...LEGACY_PAID_PRICE_IDS].filter((p): p is string => !!p),
);

export async function POST(request: Request) {
  try {
    const { priceId, product } = (await request.json()) as { priceId?: string; product?: string };
    // Episode pack: a one-time purchase, Premium subscribers only.
    const pack = product === 'episode_pack';
    if (pack && !EPISODE_PACK.priceId) {
      return NextResponse.json({ error: 'Episode packs are not configured. Set NEXT_PUBLIC_STRIPE_EPISODE_PACK_PRICE_ID.' }, { status: 503 });
    }
    if (!pack && (!priceId || typeof priceId !== 'string')) {
      return NextResponse.json({ error: 'Price ID is required' }, { status: 400 });
    }
    if (!pack && !PREMIUM_PRICE_ID) {
      return NextResponse.json(
        { error: 'Premium plan is not configured. Set NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID.' },
        { status: 503 },
      );
    }
    if (!pack && !ALLOWED_PRICE_IDS.has(priceId!)) {
      return NextResponse.json({ error: 'Invalid price ID' }, { status: 400 });
    }

    // Get current user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Never sell a second subscription to someone who already has one. This is
    // what let users who still saw the paywall (webhook late or failed) pay
    // 4–5 times in a few minutes.
    if (await hasLiveSubscription(user.id)) {
      return NextResponse.json(
        {
          error: 'You already have an active Premium subscription. It may take a minute to show up — try refreshing.',
          alreadySubscribed: true,
        },
        { status: 409 },
      );
    }

    // Reuse the user's existing Stripe customer instead of minting a new one per click.
    const customerId = await getOrCreateCustomerId(user.id, user.email);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
    if (pack) {
      const credits = await readCredits(getServiceClient(), user.id, user.created_at);
      if (credits.tier !== 'premium') {
        return NextResponse.json({ error: 'Episode packs are for Premium subscribers.', code: 'premium_required' }, { status: 403 });
      }
      const session = await getStripe().checkout.sessions.create({
        customer: customerId,
        line_items: [{ price: EPISODE_PACK.priceId, quantity: 1 }],
        mode: 'payment',
        // Back to the dashboard: the show is right there, with the new episodes.
        success_url: `${appUrl}/?episodes=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/?episodes=canceled`,
        metadata: { supabase_user_id: user.id, episode_pack: String(EPISODE_PACK.credits) },
      });
      return NextResponse.json({ url: session.url });
    }
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      // session_id lets the success page sync the subscription immediately
      // instead of waiting on the webhook.
      success_url: `${appUrl}/settings?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing?subscription=canceled`,
      metadata: { supabase_user_id: user.id },
      // Put the user ID on the subscription itself so every later
      // subscription event can be tied back to the user.
      subscription_data: { metadata: { supabase_user_id: user.id } },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
