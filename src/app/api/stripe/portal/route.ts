import { NextResponse } from 'next/server';
import { getStripe } from '@bs/core/billing';
import { createClient } from '@bs/core/supabase/server';
import { findCustomersForUser, saveCustomerId } from '@/lib/server/stripeSync';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    // Most existing subscribers have no profiles row, so fall back to the
    // Stripe customer tagged with this user (preferring one with a live sub).
    let customerId = profile?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customers = await findCustomersForUser(user.id);
      for (const c of customers) {
        const subs = await getStripe().subscriptions.list({ customer: c.id, status: 'all', limit: 10 });
        if (subs.data.some((s) => ['active', 'trialing', 'past_due'].includes(s.status))) {
          customerId = c.id;
          break;
        }
      }
      customerId ??= customers[0]?.id;
      if (customerId) await saveCustomerId(user.id, customerId);
    }

    if (!customerId) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Stripe portal error:', err);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
