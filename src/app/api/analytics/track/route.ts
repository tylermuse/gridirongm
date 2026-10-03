import { createTrackHandler } from '@bs/core/analytics/server';

// Batched + legacy payloads, bot filtering, and the app tag all live in the
// shared handler (packages/core/src/analytics/server.ts).
export const POST = createTrackHandler('bs-football');
