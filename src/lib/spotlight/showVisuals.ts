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

/** The player a line names: the topic's players first, then anyone on the
 *  rosters of `teamIds` (the spotlight team, the opponent). Full name, then
 *  last name, then a first name ("Dak") — a partial name only when it points
 *  to exactly one player in that group. */
export function playerNamedIn(text: string, topic: VisualTopic | undefined, players: Player[], teamIds: string[] = []): Player | null {
  const inTopic = (topic?.playerIds ?? []).map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p);
  const onTeams = teamIds.length ? players.filter(p => p.teamId && teamIds.includes(p.teamId) && !inTopic.includes(p)) : [];
  const word = (w: string) => w.length >= 3 && new RegExp(`(^|[^A-Za-z])${escapeRe(w)}(?![A-Za-z])`).test(text);
  // Full names: whoever the line names first.
  const full = [...inTopic, ...onTeams]
    .map(p => ({ p, at: text.indexOf(`${p.firstName} ${p.lastName}`) }))
    .filter(x => x.at >= 0)
    .sort((a, b) => a.at - b.at)[0];
  if (full) return full.p;
  for (const pool of [inTopic, onTeams]) {
    const last = pool.filter(p => word(p.lastName));
    if (last.length === 1 || (pool === inTopic && last.length)) return last[0];
    const first = pool.filter(p => word(p.firstName));
    if (first.length === 1) return first[0];
  }
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
