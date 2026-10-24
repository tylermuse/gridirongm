import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@bs/core/billing';
import { createClient } from '@bs/core/supabase/server';
import { getServiceClient, saveCustomerId, upsertSubscription } from '@/lib/server/stripeSync';
import { grantEpisodePack } from '@bs/core/podcast';

/**
 * Called by the success page right after Stripe Checkout redirects back.
 * Writes the subscription to Supabase immediately so the user sees Premium
 * without waiting for (or depending on) the webhook.
 */
export async function POST(request: Request) {
  try {
    const { sessionId } = await request.json();
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    // Only the user who started this checkout may sync it.
    if (session.metadata?.supabase_user_id !== user.id) {
      return NextResponse.json({ error: 'Session does not belong to this user' }, { status: 403 });
    }
    // An episode pack: grant it now rather than waiting on the webhook
    // (grantEpisodePack is idempotent, so both can run).
    const packCredits = Number(session.metadata?.episode_pack ?? 0);
    if (session.mode === 'payment' && packCredits > 0) {
      if (session.payment_status !== 'paid') return NextResponse.json({ synced: false });
      const granted = await grantEpisodePack(getServiceClient(), user.id, session.id, packCredits);
      return NextResponse.json({ synced: true, episodes: packCredits, granted });
    }
    if (session.mode !== 'subscription' || !session.subscription) {
      return NextResponse.json({ synced: false });
    }

    const sub = session.subscription as Stripe.Subscription;
    await upsertSubscription(sub, user.id);
    if (typeof session.customer === 'string') {
      await saveCustomerId(user.id, session.customer);
    }

    return NextResponse.json({ synced: true, status: sub.status });
  } catch (err) {
    console.error('Stripe sync error:', err);
    return NextResponse.json({ error: 'Failed to sync subscription' }, { status: 500 });
  }
}
