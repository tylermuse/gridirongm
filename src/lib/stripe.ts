import Stripe from 'stripe';
import { PRICE_IDS, tierFromPriceId } from './subscription';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
    });
  }
  return _stripe;
}

// Re-export for convenience in server-side code
export { PRICE_IDS, tierFromPriceId };
export type { PriceId } from './subscription';
