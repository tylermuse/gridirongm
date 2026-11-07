/**
 * @bs/core/analytics/feature — one event for "someone used a feature".
 *
 *   trackFeature('call_in', { mode: 'typed' })
 *     → analytics_events row: event='feature_used',
 *       properties={ feature:'call_in', plan:'paid', tier:'premium', mode:'typed', ... }
 *
 * `plan` (guest / free / paid / founder / admin) comes from the billing state
 * the SubscriptionProvider keeps current, so usage splits by plan with a plain
 * GROUP BY — no join against subscriptions or auth.users.
 *
 * Feature keys in use (keep this list current):
 *   live_sim_3d      watched a game with the 3D sim on (Football) / Court Cam (Hoops)
 *   broadcast        started the full Marcus & Tony play-by-play (not the free teaser)
 *   spotlight_audio  played a Spotlight podcast episode
 *   spotlight_show   started the Spotlight video show
 *   call_in          asked Marcus & Tony a question (mode: chip | typed)
 *   scouting         spent scout points on a prospect
 *   fa_intel         revealed a free-agency intel report
 */

import { trackEvent } from './track';
import { getCurrentPlan, getCurrentSubscriptionTier } from '../billing/state';

export function trackFeature(feature: string, properties?: Record<string, unknown>) {
  trackEvent('feature_used', {
    ...properties,
    feature,
    plan: getCurrentPlan(),
    tier: getCurrentSubscriptionTier(),
  });
}
