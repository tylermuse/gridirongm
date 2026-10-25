import { createFeedbackHandlers } from '@bs/core/feedback/server';

// Shared with BS Football; see packages/core/src/feedback/server.ts. The admin
// view on bs-football.com lists feedback from both apps.
export const { POST } = createFeedbackHandlers('bs-hoops');
