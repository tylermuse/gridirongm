'use client';

import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { useGameStore } from '@/lib/engine/store';
import { aiCommentaryEnabled } from '@/lib/engine/spotlightAccess';

/** True when this user should get AI Spotlight/recap content: Premium + setting not OFF. */
export function useAiCommentary(): boolean {
  const { hasFeature } = useSubscription();
  const setting = useGameStore(s => s.leagueSettings?.aiCommentary);
  return aiCommentaryEnabled(setting, hasFeature('ai_commentary'));
}
