import { createFeedbackHandlers } from '@bs/core/feedback/server';
import { answerFeedback } from '@/lib/feedback/answer';

// Shared with BS Hoops; see packages/core/src/feedback/server.ts for the
// table + analytics_events fallback. Football also answers how-to questions
// on the spot from its help sheet (src/lib/feedback); PATCH records the
// player's "did this help?" click.
export const maxDuration = 30;
export const { POST, GET, PATCH } = createFeedbackHandlers('bs-football', { answer: answerFeedback });
