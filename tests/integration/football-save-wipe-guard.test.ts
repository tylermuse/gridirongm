/**
 * Save-wipe guard (daily spec §1.1, vulcan832 — overnight full save loss).
 *
 * A silent auth-token expiry or hydration failure can reset the store to its
 * initial empty state; the persist middleware would then stomp the good save
 * with empty teams+players. The storage layer now refuses to overwrite a
 * non-empty save with an empty-roster payload.
 */

import { describe, it, expect } from 'vitest';
import { setItem, getItem } from '@bs/core/storage';

const nonEmpty = JSON.stringify({
  state: { teams: [{ id: 't1' }], players: [{ id: 'p1' }], userTeamId: 't1' },
  version: 1,
});
const empty = JSON.stringify({ state: { teams: [], players: [] }, version: 1 });

describe('save-wipe guard', () => {
  it('blocks an empty-roster write from overwriting a non-empty save', async () => {
    const key = 'wipe-test-block';
    await setItem(key, nonEmpty);
    await setItem(key, empty); // should be blocked by the guard
    expect(await getItem(key)).toBe(nonEmpty);
  });

  it('allows a normal non-empty overwrite (no false positives)', async () => {
    const key = 'wipe-test-normal';
    await setItem(key, nonEmpty);
    const updated = JSON.stringify({
      state: { teams: [{ id: 't1' }, { id: 't2' }], players: [{ id: 'p1' }], userTeamId: 't1' },
      version: 1,
    });
    await setItem(key, updated);
    expect(await getItem(key)).toBe(updated);
  });

  it('allows writing empty when there is no existing save (new user)', async () => {
    const key = 'wipe-test-new';
    await setItem(key, empty);
    expect(await getItem(key)).toBe(empty);
  });

  it('allows empty-over-empty (no existing roster to protect)', async () => {
    const key = 'wipe-test-empty-over-empty';
    await setItem(key, empty);
    const empty2 = JSON.stringify({ state: { teams: [], players: [], userTeamId: null }, version: 1 });
    await setItem(key, empty2);
    expect(await getItem(key)).toBe(empty2);
  });
});
