import { createFeedbackHandlers } from '@bs/core/feedback/server';
import { answerFeedback } from '@/lib/feedback/answer';

// Shared with BS Football; see packages/core/src/feedback/server.ts. The admin
// view on bs-football.com lists feedback from both apps (so no GET here).
// Hoops also answers how-to questions on the spot from its help sheet
// (src/lib/feedback); PATCH records the player's "did this help?" click.
export const maxDuration = 30;
export const { POST, PATCH } = createFeedbackHandlers('bs-hoops', { answer: answerFeedback });
