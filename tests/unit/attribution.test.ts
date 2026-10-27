import { describe, it, expect } from 'vitest';
import { sanitizeAttribution, attributionToStripeMetadata } from '@/lib/attribution';

describe('sanitizeAttribution', () => {
  it('keeps only known keys with string values', () => {
    const out = sanitizeAttribution({
      ref: 'reddit.com',
      landing: '/rosters/2026',
      utm_source: 'reddit',
      bogus: 'nope',
      first_seen: 123, // wrong type → dropped
    });
    expect(out).toEqual({ ref: 'reddit.com', landing: '/rosters/2026', utm_source: 'reddit' });
  });

  it('returns null for empty or non-object input', () => {
    expect(sanitizeAttribution(null)).toBeNull();
    expect(sanitizeAttribution('reddit.com')).toBeNull();
    expect(sanitizeAttribution({ bogus: 'x' })).toBeNull();
    expect(sanitizeAttribution({ ref: '   ' })).toBeNull();
  });

  it('trims, strips control characters and caps length', () => {
    const out = sanitizeAttribution({ ref: '  goo\u0000gle.com\n ', landing: 'x'.repeat(500) });
    expect(out?.ref).toBe('google.com');
    expect(out?.landing).toHaveLength(200);
  });
});

describe('attributionToStripeMetadata', () => {
  it('namespaces keys with attr_ and handles null', () => {
    expect(attributionToStripeMetadata(null)).toEqual({});
    expect(attributionToStripeMetadata({ ref: 'direct', utm_campaign: 'launch' })).toEqual({
      attr_ref: 'direct',
      attr_utm_campaign: 'launch',
    });
  });
});
