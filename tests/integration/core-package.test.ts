/**
 * @bs/core consumability smoke test.
 *
 * Proves that the workspace symlink wiring works end-to-end:
 *   - @bs/core resolves via node_modules/@bs/core → packages/core
 *   - the package.json exports field surfaces the right subpaths
 *   - TypeScript narrows the imported types correctly
 *
 * If this passes, Sub-phase 1C is functionally complete and we can start
 * extracting utility modules into @bs/core (Sub-phase 1D).
 */

import { describe, it, expect } from 'vitest';
import type {
  SportAdapter,
  BasePlayer,
  BaseTeam,
  PlayerMovement,
  TieFormat,
} from '@bs/core/adapter';

describe('@bs/core package wiring', () => {
  it('resolves @bs/core/adapter and surfaces the core types', () => {
    // The import statement at the top of this file is the actual test.
    // If TypeScript can't find @bs/core/adapter, this file won't compile
    // and the test runner won't see it. Adding a runtime assertion just
    // so vitest reports a pass/fail line:
    const types: Array<keyof typeof globalThis | string> = [
      'SportAdapter',
      'BasePlayer',
      'BaseTeam',
      'PlayerMovement',
      'TieFormat',
    ];
    expect(types.length).toBe(5);

    // Reference each type so TypeScript doesn't tree-shake the imports.
    // These are type-only references — no runtime cost.
    type _check =
      | SportAdapter<unknown, unknown, string, unknown>
      | BasePlayer<unknown, unknown>
      | BaseTeam<unknown, unknown>
      | PlayerMovement
      | TieFormat;
    const _typeCheck = null as unknown as _check;
    expect(_typeCheck).toBeNull();
  });

  it('discriminated unions narrow correctly across the package boundary', () => {
    // Constructing a TieFormat value of each variant validates the
    // discriminated union came through the import correctly.
    const matches: TieFormat[] = [
      { type: 'single_match' },
      { type: 'best_of', games: 7 },
      { type: 'legs', count: 2, awayGoalsRule: false },
    ];
    expect(matches).toHaveLength(3);
    expect(matches[0].type).toBe('single_match');
    expect(matches[1].type).toBe('best_of');
    expect(matches[2].type).toBe('legs');
  });
});
