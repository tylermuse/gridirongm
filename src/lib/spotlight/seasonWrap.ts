/**
 * The season wrap: the Team Spotlight episode for the end of the user's
 * season (knocked out, champion, or missed the playoffs). It's the only
 * end-of-season episode — it recaps the game that ended the season and
 * previews the offseason — so re-signing, the draft and free agency replay
 * it instead of making a new one.
 *
 * The show's inputs are saved with the league when the episode is made:
 * the roster, cap and stats all move during the offseason, and an episode
 * rebuilt from them would be a different (and newly billed) video.
 * Pure (client-safe).
 */
import type { AiSpotlightTopic } from '@/lib/engine/aiSpotlight';
import type { GameTopic } from './showGame';
import type { ShowStatLine } from './teamStats';

export interface SeasonWrapEpisode {
  season: number;
  teamId: string;
  /** The phase it was made in. A later phase replays it as-is. */
  phase: string;
  narrative: string;
  /** Watched: the video stays exactly the one the viewer saw. */
  watched?: boolean;
  /** The poster's episode title. */
  label: string;
  /** The storylines, as the written recap shows them. */
  topics: AiSpotlightTopic[];
  /** The storylines the video airs (the AI's can still be streaming in when
   *  someone presses play, so they're kept apart from `topics`). */
  showTopics: AiSpotlightTopic[];
  /** The breakdown of the game that ended the season. */
  game: GameTopic[];
  /** What the video ends on (the offseason preview). */
  closing: AiSpotlightTopic[];
  stats: ShowStatLine | null;
}

/** The saved season wrap for this season and team, if there is one. */
export function seasonWrapFor(saved: SeasonWrapEpisode | null | undefined, season: number, teamId: string): SeasonWrapEpisode | null {
  return saved && saved.season === season && saved.teamId === teamId ? saved : null;
}

/** The written recap replays the saved one once the season has moved past
 *  the phase the episode was made in. */
export function wrapTextFrozen(saved: SeasonWrapEpisode | null, phase: string): boolean {
  return !!saved && saved.phase !== phase;
}

/** The video replays the saved one from then on too, and as soon as it's
 *  been watched. */
export function wrapShowFrozen(saved: SeasonWrapEpisode | null, phase: string): boolean {
  return !!saved && (!!saved.watched || saved.phase !== phase);
}
