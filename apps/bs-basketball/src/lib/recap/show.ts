/**
 * Episodic recap show (parity audit #15).
 *
 * Turns a SeasonRecap into a sequence of commentator-voiced segments — a little
 * studio show with two hosts (play-by-play + analyst) trading lines about the
 * champion, the MVP, the Finals, the awards circuit, and the season's moves.
 * Pure derivation off the recap + league; phrasing is hashed off season/ids so
 * the show is deterministic and never touches persisted state.
 */

import type { SeasonRecap, RecapAward } from './recap';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type ShowHost = 'pbp' | 'analyst';

export interface RecapSegment {
  id: string;
  /** Short studio chapter label. */
  chapter: string;
  host: ShowHost;
  /** The spoken line. */
  line: string;
  teamId?: string | null;
  playerId?: string | null;
}

export const HOSTS: Record<ShowHost, { name: string; avatar: string }> = {
  pbp: { name: 'Vic Marlowe', avatar: '🎙️' },
  analyst: { name: 'Dr. Hops', avatar: '🧠' },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pick<T>(arr: T[], seed: number): T {
  return arr[((seed % arr.length) + arr.length) % arr.length];
}

function teamName(league: LeagueState, id: string | null): string {
  if (!id) return 'the field';
  const t = (league.teams as BasketballTeam[]).find(x => x.id === id);
  return t ? `${t.city} ${t.name}` : id;
}

/** Build the studio rundown for the given recap, in broadcast order. */
export function buildRecapShow(league: LeagueState, recap: SeasonRecap): RecapSegment[] {
  const seed = hash(`${recap.season}-${recap.champion ?? 'none'}`);
  const seg: RecapSegment[] = [];
  const champ = teamName(league, recap.champion);
  const runner = teamName(league, recap.runnerUp);

  // 1 — Cold open
  seg.push({
    id: 'open',
    chapter: 'Cold Open',
    host: 'pbp',
    line: pick([
      `Welcome to the ${recap.season} season recap show — what a ride it's been around the league.`,
      `The ${recap.season} book is closed, folks, and we've got the whole story for you tonight.`,
      `Another season in the rearview — and the ${recap.season} campaign gave us everything.`,
    ], seed),
  });

  // 2 — Champion
  if (recap.champion) {
    seg.push({
      id: 'champ',
      chapter: 'Champions',
      host: 'pbp',
      teamId: recap.champion,
      line: pick([
        `Your ${recap.season} champions: the ${champ}. They got past the ${runner} when it mattered most.`,
        `The confetti fell for the ${champ}. They left the ${runner} one win short.`,
        `Hang the banner — the ${champ} are champions, denying the ${runner} on the game's biggest stage.`,
      ], seed >> 2),
    });
    seg.push({
      id: 'champ-analyst',
      chapter: 'Champions',
      host: 'analyst',
      teamId: recap.champion,
      line: pick([
        `And it wasn't luck, Vic — that title group controlled the margins all postseason.`,
        `What I loved was their composure. Championship teams make the simple play, and they did.`,
        `The ${runner} will be back, but tonight belongs to a team that earned every inch.`,
      ], seed >> 3),
    });
  }

  // 3 — Finals MVP / the moment
  if (recap.finalsMvp) {
    seg.push(awardSegment('finals-mvp', 'The Finals', 'pbp', recap.finalsMvp, seed, [
      `${recap.finalsMvp.name} was unstoppable when the lights were brightest — ${recap.finalsMvp.statline}.`,
      `Finals MVP ${recap.finalsMvp.name} put the team on his back: ${recap.finalsMvp.statline}.`,
    ]));
  }

  // 4 — MVP
  if (recap.mvp) {
    seg.push(awardSegment('mvp', 'MVP', 'analyst', recap.mvp, seed, [
      `Regular-season MVP ${recap.mvp.name} was a problem every single night — ${recap.mvp.statline}.`,
      `No debate for me: ${recap.mvp.name} earned the MVP. Look at the line — ${recap.mvp.statline}.`,
    ]));
  }

  // 5 — Scoring leader
  if (recap.scoringLeader) {
    seg.push(awardSegment('scoring', 'Bucket Getters', 'pbp', recap.scoringLeader, seed, [
      `Nobody filled it up like ${recap.scoringLeader.name} — ${recap.scoringLeader.statline} to lead the league.`,
      `${recap.scoringLeader.name} was must-watch every night: ${recap.scoringLeader.statline}.`,
    ]));
  }

  // 6 — Awards circuit
  if (recap.otherAwards.length) {
    const names = recap.otherAwards.map(a => `${a.label.replace(' of the Year', '')}: ${a.name}`).join(' · ');
    seg.push({
      id: 'awards',
      chapter: 'Awards Circuit',
      host: 'analyst',
      playerId: recap.otherAwards[0].playerId,
      line: `Around the hardware — ${names}. A loaded class this year.`,
    });
  }

  // 7 — Front office
  if (recap.notableMoves.length) {
    seg.push({
      id: 'moves',
      chapter: 'Front Office',
      host: 'pbp',
      line: `And the moves shaped it all: ${recap.notableMoves[0].summary}${recap.notableMoves.length > 1 ? `, plus ${recap.notableMoves.length - 1} more that moved the needle.` : '.'}`,
    });
  }

  // 8 — Sign-off
  seg.push({
    id: 'signoff',
    chapter: 'Sign-Off',
    host: 'analyst',
    line: pick([
      `That's the season. Rest up — the draft and free agency are right around the corner.`,
      `Offseason's here. Somewhere a contender is being built. We'll see you next year.`,
      `From all of us in the studio: great season, and the next one starts now.`,
    ], seed >> 5),
  });

  return seg;
}

function awardSegment(id: string, chapter: string, host: ShowHost, a: RecapAward, seed: number, lines: string[]): RecapSegment {
  return { id, chapter, host, playerId: a.playerId, teamId: a.teamId, line: pick(lines, seed >> 4) };
}
