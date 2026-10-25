/**
 * Halftime breakdown notes — the Hoops port of BS Football's
 * generateHalftimeAudioBreakdown. A templated Marcus/Tony read of the first
 * half (score, who's carrying each side, stars gone quiet, shooting, boards,
 * turnovers, what the trailing team has to fix), built from the live viewer's
 * exact first-half lines.
 *
 * These are the producer's notes /api/halftime-audio hands its writer; when no
 * writer is configured they're voiced as-is, so they read as dialogue too.
 * Pure + client-safe.
 */

import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

export interface HalftimeLine { speaker: 'marcus' | 'tony'; text: string }

/** First-half stat line (same shape as the live viewer's LiveLine). */
export interface HalfLine { pts: number; reb: number; ast: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; stl: number; blk: number; to: number; pf: number }

interface TeamHalf { fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; reb: number; ast: number; to: number; stl: number; blk: number }

const pct = (m: number, a: number) => (a ? Math.round((m / a) * 100) : 0);

export function generateHalftimeNotes(args: {
  home: BasketballTeam;
  away: BasketballTeam;
  score: { home: number; away: number };
  lines: Map<string, HalfLine>;
  players: Record<string, BasketballPlayer>;
  /** Season scoring averages before tonight (for "gone quiet"). */
  seasonPpg?: Map<string, number>;
}): HalftimeLine[] {
  const { home, away, score, lines, players, seasonPpg } = args;
  const out: HalftimeLine[] = [];
  const say = (speaker: HalftimeLine['speaker'], text: string) => out.push({ speaker, text });
  const name = (id: string) => { const p = players[id]; return p ? `${p.firstName} ${p.lastName}` : 'a reserve'; };

  const teamHalf = (t: BasketballTeam): TeamHalf => t.playerIds.reduce<TeamHalf>((s, id) => {
    const l = lines.get(id); if (!l) return s;
    return { fgm: s.fgm + l.fgm, fga: s.fga + l.fga, tpm: s.tpm + l.tpm, tpa: s.tpa + l.tpa, ftm: s.ftm + l.ftm, fta: s.fta + l.fta, reb: s.reb + l.reb, ast: s.ast + l.ast, to: s.to + l.to, stl: s.stl + l.stl, blk: s.blk + l.blk };
  }, { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, ast: 0, to: 0, stl: 0, blk: 0 });
  const leaders = (t: BasketballTeam) => t.playerIds
    .map(id => ({ id: id as string, l: lines.get(id) }))
    .filter((x): x is { id: string; l: HalfLine } => !!x.l)
    .sort((a, b) => b.l.pts - a.l.pts || b.l.reb - a.l.reb);

  const h = teamHalf(home), a = teamHalf(away);
  const margin = score.home - score.away;
  const lead = margin > 0 ? home : margin < 0 ? away : null;
  const trail = lead === home ? away : lead === away ? home : null;
  const gap = Math.abs(margin);

  // Score + the shape of the half.
  if (!lead) say('marcus', `All square at the break, ${score.away} apiece. ${home.city} and ${away.city} have traded everything for twenty-four minutes.`);
  else say('marcus', `${lead.city} takes a ${gap}-point lead into the locker room, ${Math.max(score.home, score.away)} to ${Math.min(score.home, score.away)}.`);
  if (lead && gap >= 15) say('tony', `That's a beatdown, Marcus! ${trail!.city} looked like they were still on the bus.`);
  else if (lead && gap <= 4) say('tony', `${gap} points is NOTHING. That's two possessions. Anybody leaving early is crazy.`);
  else say('tony', `This one's got a little bit of everything so far. Let's get into who's doing the damage.`);

  // Who's carrying each side.
  for (const t of [away, home]) {
    const [top, second] = leaders(t);
    if (!top) continue;
    const l = top.l;
    say('marcus', `For ${t.city}, ${name(top.id)} leads the way with ${l.pts} points on ${l.fgm}-of-${l.fga} shooting${l.reb >= 5 ? `, plus ${l.reb} rebounds` : ''}${l.ast >= 4 ? ` and ${l.ast} assists` : ''}.${second && second.l.pts >= 8 ? ` ${name(second.id)} has chipped in ${second.l.pts}.` : ''}`);
  }

  // Stars who've gone quiet.
  if (seasonPpg) {
    const quiet = [...home.playerIds, ...away.playerIds]
      .map(id => ({ id, avg: seasonPpg.get(id) ?? 0, pts: lines.get(id)?.pts ?? 0, fga: lines.get(id)?.fga ?? 0 }))
      .filter(x => x.avg >= 17 && x.pts <= x.avg * 0.3)
      .sort((x, y) => y.avg - x.avg)[0];
    if (quiet) {
      const team = home.playerIds.includes(quiet.id) ? home : away;
      say('tony', `And where is ${name(quiet.id)}?! He averages ${Math.round(quiet.avg)} a night and he's got ${quiet.pts} on ${quiet.fga} shot${quiet.fga === 1 ? '' : 's'}. ${team.city} needs him in the second half, period.`);
    }
  }

  // Shooting, glass, ball security.
  say('marcus', `Shooting: ${away.city} is at ${pct(a.fgm, a.fga)}% from the field and ${a.tpm}-of-${a.tpa} from three; ${home.city} is at ${pct(h.fgm, h.fga)}% and ${h.tpm}-of-${h.tpa}.`);
  const rebEdge = h.reb - a.reb;
  if (Math.abs(rebEdge) >= 5) say('tony', `${rebEdge > 0 ? home.city : away.city} is OWNING the glass — ${Math.max(h.reb, a.reb)} boards to ${Math.min(h.reb, a.reb)}. Second chances kill you.`);
  const toEdge = h.to - a.to;
  if (Math.abs(toEdge) >= 4) say('marcus', `Turnovers are the other story: ${toEdge > 0 ? home.city : away.city} has given it away ${Math.max(h.to, a.to)} times to ${Math.min(h.to, a.to)}.`);

  // The adjustment.
  if (trail) {
    const tHalf = trail === home ? h : a;
    const fix = pct(tHalf.fgm, tHalf.fga) < 42 ? `get better looks — they're settling for tough shots`
      : tHalf.to >= 8 ? `take care of the ball`
      : `get stops and run`;
    say('marcus', `For ${trail.city} to come back, they have to ${fix}.`);
    say('tony', gap >= 12
      ? `I'm not saying it's over. I'm saying ${trail.city} needs a 12-0 run in the first five minutes of the third or I'm changing the channel.`
      : `Mark it down: ${trail.city} comes out of that locker room swinging. This one's going down to the wire.`);
  } else {
    say('tony', `Tied game, twenty-four minutes to go. Whoever wins the first five minutes of the third wins this game.`);
  }
  return out.slice(0, 16);
}
