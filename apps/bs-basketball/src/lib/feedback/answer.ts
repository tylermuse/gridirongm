/**
 * Instant answers for BS Hoops' feedback modal (server-only).
 *
 * The rules, the model calls and the parsing are shared with BS Football in
 * packages/core/src/feedback/answer.ts. This file supplies what is Hoops' own:
 * the help sheet the model may answer from, and examples in basketball terms
 * (each one true of the sheet). Wired in via createFeedbackHandlers(...,
 * { answer }) in src/app/api/feedback/route.ts.
 */

import { createFeedbackAnswerer } from '@bs/core/feedback/answer';
import { HELP_SHEET } from './helpSheet';

export const answerFeedback = createFeedbackAnswerer({
  appName: 'BS Hoops',
  gameDescription: 'a basketball general-manager simulation game played in the browser',
  realLeague: 'NBA',
  examples: {
    explained: 'a trade button that stops working after the deadline, a new signing who sits at the end of the bench, leagues lost when browser data is cleared',
    questionFiledAsBug: '"During a game, how do I sub players in?"',
    closestThing: 'setting a player\'s minutes: you cannot type in minutes, but bench order and the Game Plan\'s "Rotation" option decide who plays more',
    normalBehaviour: '"it won\'t let me trade anymore" after the trade deadline',
  },
  helpSheet: HELP_SHEET,
});
