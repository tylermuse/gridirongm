import { createFeedbackHandlers } from '@bs/core/feedback/server';

// Shared with BS Hoops; see packages/core/src/feedback/server.ts for the
// table + analytics_events fallback.
export const { POST, GET } = createFeedbackHandlers('bs-football');
