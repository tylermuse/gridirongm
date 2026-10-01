/**
 * Who/what the Spotlight show's graphics should picture for a line: the
 * team a topic is about (its logo) and the player a line is about (their
 * photo). Pure helpers, shared by the player and tests.
 */
import type { Player, Team } from '@/types';

export interface VisualTopic {
  teamIds?: string[];
  playerIds?: string[];
}

/** The team a topic is about: another team it names (a rival, a trade
 *  partner), else the spotlight team itself. */
export function topicTeam(topic: VisualTopic | undefined, team: Team, teams: Team[]): Team {
  const otherId = topic?.teamIds?.find(id => id !== team.id);
  return (otherId && teams.find(t => t.id === otherId)) || team;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The player a line names, among the topic's players (full name first,
 *  then last name as a whole word). */
export function playerNamedIn(text: string, topic: VisualTopic | undefined, players: Player[]): Player | null {
  const pool = (topic?.playerIds ?? []).map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p);
  for (const p of pool) if (text.includes(`${p.firstName} ${p.lastName}`)) return p;
  for (const p of pool) if (new RegExp(`\\b${escapeRe(p.lastName)}\\b`).test(text)) return p;
  return null;
}

/**
 * Player to picture for the line at `lines[upTo]` of one topic: the latest
 * player named so far in the topic; before anyone is named, the topic's
 * player if it's about exactly one.
 */
export function playerForLine(lines: string[], upTo: number, topic: VisualTopic | undefined, players: Player[]): Player | null {
  for (let k = Math.min(upTo, lines.length - 1); k >= 0; k--) {
    const p = playerNamedIn(lines[k], topic, players);
    if (p) return p;
  }
  const ids = topic?.playerIds ?? [];
  return ids.length === 1 ? players.find(p => p.id === ids[0]) ?? null : null;
}
