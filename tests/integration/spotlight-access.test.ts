import { describe, it, expect } from 'vitest';
import {
  aiCommentaryEnabled,
  shouldShowSpotlightPopup,
  listenState,
  nextCreditReset,
  formatResetDate,
} from '@/lib/engine/spotlightAccess';

describe('aiCommentaryEnabled', () => {
  it('is Premium-only', () => {
    expect(aiCommentaryEnabled(true, false)).toBe(false);
    expect(aiCommentaryEnabled(undefined, false)).toBe(false);
  });
  it('defaults ON for Premium when the setting is missing', () => {
    expect(aiCommentaryEnabled(undefined, true)).toBe(true);
    expect(aiCommentaryEnabled(true, true)).toBe(true);
  });
  it('respects an explicit OFF', () => {
    expect(aiCommentaryEnabled(false, true)).toBe(false);
  });
});

describe('shouldShowSpotlightPopup — same rule for every tier', () => {
  it('never pops on ordinary weeks', () => {
    expect(shouldShowSpotlightPopup('weekly')).toBe(false);
  });
  it('pops at every narrative moment', () => {
    for (const m of ['preseason', 'tradeDeadline', 'playoffsStart', 'seasonOver'] as const) {
      expect(shouldShowSpotlightPopup(m)).toBe(true);
    }
  });
});

describe('listenState', () => {
  const base = { loading: false, signedIn: true, premium: true, remaining: 3 };
  it('waits while the subscription loads', () => {
    expect(listenState({ ...base, loading: true })).toBe('checking');
  });
  it('asks signed-out users to sign in (not a generic retry)', () => {
    expect(listenState({ ...base, signedIn: false, premium: false })).toBe('signedOut');
  });
  it('shows free users a locked Premium button before they click', () => {
    expect(listenState({ ...base, premium: false, remaining: 0 })).toBe('locked');
  });
  it('shows exhausted for Premium with 0 credits', () => {
    expect(listenState({ ...base, remaining: 0 })).toBe('exhausted');
  });
  it('is ready with credits, and for uncapped admins (-1)', () => {
    expect(listenState(base)).toBe('ready');
    expect(listenState({ ...base, remaining: -1 })).toBe('ready');
  });
});

describe('nextCreditReset', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  it('uses the stored reset when it is still ahead', () => {
    expect(nextCreditReset('2026-10-20T00:00:00Z', now).toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });
  it('falls back to the 1st of next month when missing or past', () => {
    expect(nextCreditReset(null, now).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(nextCreditReset('2026-09-01T00:00:00Z', now).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
  it('rolls over the year in December', () => {
    expect(nextCreditReset(null, new Date('2026-12-15T00:00:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
  it('formats as "Nov 1"', () => {
    expect(formatResetDate(new Date('2026-11-01T00:00:00Z'))).toBe('Nov 1');
  });
});
