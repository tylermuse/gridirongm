import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@bs/core/billing';
import { createClient } from '@bs/core/supabase/server';
import { saveCustomerId, upsertSubscription } from '@/lib/server/stripeSync';

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
