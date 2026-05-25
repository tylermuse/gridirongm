/**
 * @bs/sport-basketball — BS Hoops sport adapter.
 *
 * Implements the SportAdapter contract from @bs/core/adapter for basketball.
 *
 * IN PROGRESS. Phase 2A is building this out. The sim engine is the hardest
 * single piece and lands first.
 *
 * Reference: packages/core/src/adapter/sketches/basketball.adapter.sketch.ts
 * was the types-only sketch that proved the SportAdapter interface could
 * express basketball. This package promotes that sketch into a real, runnable
 * implementation.
 */

export * from './types';
export * from './sim';
export * from './playerGen';
