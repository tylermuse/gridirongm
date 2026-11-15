/**
 * Instant answers for BS Football's feedback modal (server-only).
 *
 * The rules, the model calls and the parsing are shared with BS Hoops in
 * packages/core/src/feedback/answer.ts. This file supplies what is Football's
 * own: the help sheet the model may answer from, and examples in football
 * terms. Wired in via createFeedbackHandlers(..., { answer }) in
 * src/app/api/feedback/route.ts.
 */

import { createFeedbackAnswerer, parseAnswer } from '@bs/core/feedback/answer';
import { HELP_SHEET } from './helpSheet';

export { parseAnswer };

export const answerFeedback = createFeedbackAnswerer({
  appName: 'BS Football',
  gameDescription: 'a football general-manager simulation game played in the browser',
  realLeague: 'NFL',
  examples: {
    explained: 'a button that hides, a depth chart that re-sorts after a trade, saves lost when browser data is cleared',
    questionFiledAsBug: '"During a game, how do I change players?"',
    closestThing: 'moving a tackle to right guard: you cannot pick the exact spot, but you can pin him to OG on his card',
    normalBehaviour: '"the Trades button is gone" after the trade deadline',
  },
  helpSheet: HELP_SHEET,
});
