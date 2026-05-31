'use client';

import { useEffect, useRef } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { getBracket } from '@/lib/playoffs';
import { playSound } from '@/lib/ui/sound';

/**
 * Audio reactions (Tier 3.1). Headless — renders nothing, just listens to the
 * store and fires a cue:
 *   - the user's team wins a game  → bright chime
 *   - any other sim batch finishes → soft pop
 *   - a champion is crowned        → buzzer
 *
 * All cues are no-ops unless the user enabled sound in /settings, so this is
 * always mounted and costs nothing when off.
 */
export function GameSounds() {
  const { simToast, league } = useLeagueStore();
  const championRef = useRef<string | null | undefined>(undefined);

  // Sim-result cue, keyed on the toast object the store replaces every sim.
  useEffect(() => {
    if (!simToast) return;
    playSound(simToast.text.includes('You won') ? 'chime' : 'pop');
  }, [simToast]);

  // Championship buzzer on the null → crowned transition.
  useEffect(() => {
    const champ = league ? (getBracket(league)?.championTeamId ?? null) : null;
    // Seed the ref on first run so loading an already-finished save stays quiet.
    if (championRef.current === undefined) {
      championRef.current = champ;
      return;
    }
    if (champ && champ !== championRef.current) playSound('buzzer');
    championRef.current = champ;
  }, [league]);

  return null;
}
