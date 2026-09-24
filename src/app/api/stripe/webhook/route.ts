import { NextResponse } from 'next/server';
import { getStripe, tierFromPriceId } from '@bs/core/billing';
import { createServerClient } from '@supabase/ssr';
import Stripe from 'stripe';

// Service-role Supabase client for webhook writes (bypasses RLS)
function getServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

// Stripe moved `current_period_end` off the Subscription object and onto each
// subscription item in API version 2025-03-31.basil. Read it from the item
// first, fall back to the legacy subscription-level field, and guard against
// missing/invalid values so an unexpected event shape can never throw (a thrown
// `Date.toISOString()` on NaN was returning HTTP 500 and blocking every event).
function periodEndIso(sub: Record<string, unknown>): string | null {
  const item = (sub.items as { data?: Array<Record<string, unknown>> } | undefined)?.data?.[0];
  const raw = (item?.current_period_end ?? sub.current_period_end) as number | undefined;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const d = new Date(raw * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = getServiceClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription' && session.subscription) {
        const sub = await getStripe().subscriptions.retrieve(session.subscription as string) as unknown as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price.id;
        const userId = session.metadata?.supabase_user_id;

        if (userId && priceId) {
          const periodEnd = periodEndIso(sub as unknown as Record<string, unknown>);
          await supabase.from('subscriptions').upsert({
            id: sub.id,
            user_id: userId,
            status: sub.status,
            tier: tierFromPriceId(priceId),
            ...(periodEnd ? { current_period_end: periodEnd } : {}),
            cancel_at_period_end: (sub as unknown as Record<string, unknown>).cancel_at_period_end as boolean,
            updated_at: new Date().toISOString(),
          });
        }
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as unknown as Record<string, unknown>;
      const items = sub.items as { data: Array<{ price: { id: string } }> };
      const priceId = items?.data[0]?.price.id;

      if (priceId) {
        const periodEnd = periodEndIso(sub);
        await supabase
          .from('subscriptions')
          .update({
            status: sub.status as string,
            tier: tierFromPriceId(priceId),
            ...(periodEnd ? { current_period_end: periodEnd } : {}),
            cancel_at_period_end: sub.cancel_at_period_end as boolean,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sub.id as string);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as unknown as Record<string, unknown>;
      const subscriptionId = invoice.subscription as string | null;
      if (subscriptionId) {
        await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscriptionId);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
