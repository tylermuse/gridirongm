import { NextResponse } from 'next/server';
import { getStripe } from '@bs/core/billing';
import Stripe from 'stripe';
import {
  getServiceClient,
  resolveUserId,
  saveCustomerId,
  upsertSubscription,
} from '@/lib/server/stripeSync';

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

  // Any failure below returns 500 so Stripe retries the event (for up to
  // 3 days). Previously Supabase errors were ignored and we returned 200,
  // which silently dropped the write and left paying users without Premium.
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const sub = await getStripe().subscriptions.retrieve(session.subscription as string);
          const userId = session.metadata?.supabase_user_id ?? (await resolveUserId(sub));
          if (userId) {
            await upsertSubscription(sub, userId);
            if (typeof session.customer === 'string') {
              await saveCustomerId(userId, session.customer);
            }
          } else {
            console.error(`[stripe webhook] no user for subscription ${sub.id}`);
          }
        }
        break;
      }

      // Upsert (not update) so a subscription whose checkout event was missed
      // still gets a row the next time anything happens to it (e.g. renewal).
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(sub);
        if (userId) {
          await upsertSubscription(sub, userId);
        } else {
          console.error(`[stripe webhook] no user for subscription ${sub.id}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as unknown as Record<string, unknown>;
        const parent = invoice.parent as
          | { subscription_details?: { subscription?: string } }
          | undefined;
        const subscriptionId =
          (invoice.subscription as string | null) ?? parent?.subscription_details?.subscription ?? null;
        if (subscriptionId) {
          const { error } = await getServiceClient()
            .from('subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('id', subscriptionId);
          if (error) throw new Error(`past_due update failed for ${subscriptionId}: ${error.message}`);
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[stripe webhook] ${event.type} ${event.id} failed:`, err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
