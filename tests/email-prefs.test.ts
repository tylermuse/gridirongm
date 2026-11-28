import { describe, expect, it } from 'vitest';
import { isUnsubToken } from '@/lib/server/emailPrefs';

describe('isUnsubToken', () => {
  it('accepts a uuid', () => {
    expect(isUnsubToken('3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isUnsubToken('')).toBe(false);
    expect(isUnsubToken('abc')).toBe(false);
    expect(isUnsubToken(undefined)).toBe(false);
    expect(isUnsubToken("3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b' or 1=1")).toBe(false);
  });
});
