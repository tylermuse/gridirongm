import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { PREMIUM_PRICE_ID, LEGACY_PAID_PRICE_IDS } from '@/lib/subscription';

// Only the configured Premium price is allowed at checkout. Legacy prices
// remain valid for existing subscribers (the webhook still maps them up to
// 'premium') but new sign-ups always go through the current Premium price.
const ALLOWED_PRICE_IDS = new Set<string>(
  [PREMIUM_PRICE_ID, ...LEGACY_PAID_PRICE_IDS].filter((p): p is string => !!p),
);

export async function POST(request: Request) {
  try {
    const { priceId } = await request.json();
    if (!priceId || typeof priceId !== 'string') {
      return NextResponse.json({ error: 'Price ID is required' }, { status: 400 });
    }
    if (!PREMIUM_PRICE_ID) {
      return NextResponse.json(
        { error: 'Premium plan is not configured. Set NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID.' },
        { status: 503 },
      );
    }
    if (!ALLOWED_PRICE_IDS.has(priceId)) {
      return NextResponse.json({ error: 'Invalid price ID' }, { status: 400 });
    }

    // Get current user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Look up or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Store the Stripe customer ID — use service role to bypass RLS
      const serviceClient = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { cookies: { getAll: () => [], setAll: () => {} } },
      );
      await serviceClient
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${appUrl}/settings?subscription=success`,
      cancel_url: `${appUrl}/pricing?subscription=canceled`,
      metadata: { supabase_user_id: user.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
