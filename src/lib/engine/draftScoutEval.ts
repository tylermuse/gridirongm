/**
 * Draft Scout Evaluation — generates rich scouting reports for draft prospects
 * Modeled after the FA evaluation panel (personnelReport.ts).
 *
 * Used when a prospect is "scouted" (1 scout point spent).
 */
import type { Player, Position } from '@/types';

/* ─── helpers ────────────────────────────────────────────────── */

function seedFromId(id: string, salt = 0): number {
  let h = salt;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/* ─── Types ──────────────────────────────────────────────────── */

export interface DraftScoutEvaluation {
  fitBadge: 'Strong Target' | 'Worth a Look' | 'Not a Fit' | 'Roster Redundancy';
  fitScore: number;
  scoutsTake: string;
  scoutOvrEstimate: { low: number; high: number; quote: string };
  rosterComparison: string;
  riskFactors: string[];
  combine: {
    fortyYard: number;
    benchPress: number;
    verticalJump: number;
    shuttle: number;
  };
  scoutQuote: string;
}

/* ─── Position context ───────────────────────────────────────── */

const POSITION_ROLES: Record<Position, { starter: string; depth: string; elite: string }> = {
  QB: { starter: 'franchise quarterback', depth: 'developmental passer', elite: 'franchise-altering talent' },
  RB: { starter: 'featured back', depth: 'rotational piece', elite: 'three-down bell cow' },
  WR: { starter: 'WR1', depth: 'rotational weapon', elite: 'true alpha receiver' },
  TE: { starter: 'starting tight end', depth: 'blocking/receiving hybrid', elite: 'elite pass-catching TE' },
  OL: { starter: 'starting lineman', depth: 'swing lineman', elite: 'franchise anchor' },
  DL: { starter: 'starting defensive lineman', depth: 'rotational rusher', elite: 'dominant interior force' },
  LB: { starter: 'starting linebacker', depth: 'depth/special teams', elite: 'defensive quarterback' },
  CB: { starter: 'starting corner', depth: 'nickel specialist', elite: 'shutdown corner' },
  S: { starter: 'starting safety', depth: 'sub-package defender', elite: 'versatile playmaker' },
  K: { starter: 'reliable kicker', depth: 'placeholder', elite: 'clutch specialist' },
  P: { starter: 'starting punter', depth: 'placeholder', elite: 'elite punter' },
};

/* ─── Scout's Take templates ─────────────────────────────────── */

function generateScoutsTake(player: Player, seed: number): string {
  const ovr = player.ratings.overall;
  const pot = player.potential;
  const pos = player.position;
  const label = player.scoutingLabel ?? '';

  // Elite prospect (OVR >= 78)
  if (ovr >= 78) {
    const eliteTemplates = [
      `Most complete ${pos} in this class. Does everything at a high level and projects as a day-one starter. The kind of player you build a unit around.`,
      `Rare combination of physical tools and football instincts. Tape is consistently dominant against top competition. This is an impact player from Week 1.`,
      `Pro-ready in every sense. ${pos === 'QB' ? 'Command of the pocket, accuracy in all three levels, and leadership that jumps off the tape.' : pos === 'WR' || pos === 'TE' ? 'Route tree is NFL-caliber already, and the hands are as reliable as they come.' : pos === 'OL' ? 'Anchor strength and pass sets are already at a professional level.' : 'Instincts and closing speed set him apart from everyone else in this class.'}`,
      `Blue-chip prospect. ${pot > ovr + 3 ? "Hasn't even scratched his ceiling yet — and he's already this good." : "What you see is what you get, and what you get is a difference-maker."}`,
    ];
    return pick(eliteTemplates, seed);
  }

  // Solid prospect (OVR 68-77)
  if (ovr >= 68) {
    const solidTemplates = [
      `Reliable, well-rounded ${pos} who should compete for a starting role early. ${pot > ovr + 5 ? 'Still has significant upside to unlock with the right coaching.' : 'Safe floor as a quality starter.'}`,
      `Good tape against solid competition. ${pos === 'QB' ? "Processes the field well and limits mistakes, though the arm talent isn't elite." : pos === 'RB' ? 'Runs with power and vision between the tackles, needs work in pass protection.' : pos === 'DL' || pos === 'LB' ? 'Plays with a high motor and fills his gaps consistently.' : 'Technically sound with room to add more explosive plays to his game.'}`,
      `Starter-caliber prospect with a clear role at the next level. ${label === 'High motor' ? "Work ethic is off the charts — this kid doesn't take plays off." : label === 'Pro-ready' ? 'Most polished player at the position in this draft.' : 'Not a flashy pick but a smart one.'}`,
      `Solid foundation to build on. ${pot >= 80 ? 'The ceiling here is tantalizing if the development staff can unlock it.' : 'Projects as a dependable starter for years.'}`,
    ];
    return pick(solidTemplates, seed);
  }

  // Mid-tier prospect (OVR 58-67)
  if (ovr >= 58) {
    const midTemplates = [
      `Developmental prospect with ${pot > ovr + 8 ? 'intriguing upside' : 'a defined role'}. ${label === 'Raw but explosive' ? 'Athletic tools are clear but the technique needs work.' : label === 'Sleeper' ? 'Flying under the radar — our staff sees something the consensus doesn\'t.' : 'Needs time but could earn a spot in the rotation.'}`,
      `${pos === 'QB' ? 'Arm talent is there but decision-making is inconsistent. Will need time behind a veteran.' : pos === 'WR' || pos === 'TE' ? 'Flashes of separation ability but drops are a concern.' : pos === 'OL' ? 'Has the frame and feet, needs to add strength and refine technique.' : 'Showed improvement through the college season. Trending in the right direction.'}`,
      `Project pick with ${pot > ovr + 10 ? 'legitimate starter potential in 2-3 years' : 'a ceiling as a quality backup'}. ${label === 'Combine standout' ? 'Combine numbers will inflate his stock, but the game tape tells a more modest story.' : 'Needs reps and coaching to close the gap between tools and production.'}`,
    ];
    return pick(midTemplates, seed);
  }

  // Raw prospect (OVR < 58)
  const rawTemplates = [
    `Long-term project. ${pot > ovr + 12 ? 'There\'s a player in there — it just might take 2-3 years to find him.' : 'Camp body who will need to show something special to stick.'} ${label === 'Sleeper' ? 'But our scouts see traits that don\'t show up in the box score.' : ''}`,
    `Raw athleticism that hasn't translated to consistent production yet. ${pot > 70 ? 'If the light comes on, you\'re looking at a late-round steal.' : 'Likely practice squad or special teams contributor early.'}`,
    `Depth pick at best right now. ${label === 'High motor' ? 'Effort is never a question — the physical tools just need to catch up.' : 'Will need significant development to contribute on game days.'}`,
  ];
  return pick(rawTemplates, seed);
}

/* ─── Scout's OVR Estimate ───────────────────────────────────── */

function generateScoutOvrEstimate(
  player: Player,
  publicRange: { lo: number; hi: number },
  seed: number,
): { low: number; high: number; quote: string } {
  const trueOvr = player.ratings.overall;
  // Scout estimate is ±3-5 from true OVR (tighter than public range)
  const spreadHalf = 3 + (seed % 3); // 3, 4, or 5
  const low = clamp(trueOvr - spreadHalf, 20, 99);
  const high = clamp(trueOvr + spreadHalf, 20, 99);
  const publicMid = Math.round((publicRange.lo + publicRange.hi) / 2);

  let quote: string;
  if (trueOvr > publicMid + 3) {
    // Scout thinks player is better than consensus
    const quotes = [
      `I think this guy is more of a ${low}-${high} player, not the ${publicMid} everyone's projecting. Could be a steal here.`,
      `Consensus has him undervalued. I'm seeing ${low}-${high} on tape — the athletic testing doesn't do him justice.`,
      `He's better than his draft stock suggests. I'd put him at ${low}-${high}, which makes him a value pick at this spot.`,
    ];
    quote = pick(quotes, seed + 7);
  } else if (trueOvr < publicMid - 3) {
    // Scout thinks player is worse than consensus
    const quotes = [
      `Consensus has him at ${publicMid} but I'm seeing more like ${low}-${high}. The athletic testing is inflating his stock.`,
      `I'm lower on this one than most — ${low}-${high} range for me. The tape doesn't match the hype.`,
      `Everyone loves the measurables, but I've got him at ${low}-${high}. There are technique concerns that will matter at the next level.`,
    ];
    quote = pick(quotes, seed + 7);
  } else {
    // Scout agrees with consensus
    const quotes = [
      `I agree with the ${publicMid} projection. What you see is what you get — ${high >= 75 ? 'a solid starter' : high >= 65 ? 'a reliable contributor' : 'a developmental piece'}, nothing more.`,
      `Our evaluation lines up with consensus — ${low}-${high} range. ${high >= 75 ? 'No surprises here, just a quality player.' : 'Fair assessment of his current ability.'}`,
      `Right in line with where everyone has him. ${low}-${high} feels right based on our evaluations.`,
    ];
    quote = pick(quotes, seed + 7);
  }

  return { low, high, quote };
}

/* ─── Roster Comparison ──────────────────────────────────────── */

function generateRosterComparison(
  player: Player,
  userRoster: Player[],
): string {
  const pos = player.position;
  const ovr = player.ratings.overall;

  const samePos = userRoster
    .filter(p => p.position === pos && !p.retired)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);

  const starter = samePos[0];
  const backup = samePos[1];

  if (!starter) {
    return `Would be the only ${pos} on the roster — immediate starter`;
  }

  const starterOvr = starter.ratings.overall;

  if (ovr > starterOvr + 5) {
    return `Would start over ${starter.firstName} ${starter.lastName} (${starterOvr} OVR) at ${pos} immediately. Clear upgrade.`;
  }
  if (ovr > starterOvr) {
    return `Would start over ${starter.firstName} ${starter.lastName} (${starterOvr} OVR) at ${pos}. Modest upgrade with room to grow.`;
  }
  if (ovr >= starterOvr - 5) {
    return `Competitive with ${starter.firstName} ${starter.lastName} (${starterOvr} OVR). ${backup ? `Pushes ${backup.firstName} ${backup.lastName} (${backup.ratings.overall} OVR) down the depth chart.` : 'Would create a genuine position battle.'}`;
  }
  return `Depth piece behind ${starter.firstName} ${starter.lastName} (${starterOvr} OVR)${backup ? ` and ${backup.firstName} ${backup.lastName} (${backup.ratings.overall})` : ''}`;
}

/* ─── Risk Factors ───────────────────────────────────────────── */

function generateRiskFactors(player: Player, seed: number): string[] {
  const risks: string[] = [];
  const label = player.scoutingLabel ?? '';

  if (label === 'Injury history') {
    risks.push('Medical red flag — injury history raises durability concerns');
  }
  if (label === 'Character concerns') {
    risks.push('Character concerns flagged by multiple sources');
  }
  if (player.potential > player.ratings.overall + 12 && player.ratings.overall < 65) {
    risks.push('Boom or bust — our scouts are split on this one');
  }
  if (player.ratings.stamina < 55) {
    risks.push('Conditioning concerns — below-average stamina testing');
  }
  // ~5% random character flag for prospects without explicit label
  if (!label.includes('Character') && !label.includes('Injury') && seed % 20 === 0) {
    risks.push('Minor off-field questions — nothing disqualifying but worth monitoring');
  }

  return risks.slice(0, 3);
}

/* ─── Combine Measurables (extended) ─────────────────────────── */

function extendedCombine(player: Player): DraftScoutEvaluation['combine'] {
  const cs = player.combineStats;
  const seed = player.scoutingSeed ?? seedFromId(player.id);

  // Generate shuttle from agility + speed
  const agilityFactor = ((player.ratings.agility ?? 60) - 30) / 69;
  const noise = ((seed * 4271 + 17389) % 233280) / 233280 - 0.5;
  const rawShuttle = 4.50 - agilityFactor * 0.55; // 4.50 to 3.95
  const shuttle = Math.round((rawShuttle + noise * 0.12) * 100) / 100;

  return {
    fortyYard: cs?.fortyYard ?? 4.65,
    benchPress: cs?.benchPress ?? 15,
    verticalJump: cs?.verticalJump ?? 33,
    shuttle: clamp(shuttle, 3.8, 4.8),
  };
}

/* ─── Consensus Blurb ────────────────────────────────────────── */

export function publicConsensusBlurb(player: Player): string {
  const rank = player.projectedRank ?? 128;
  const total = 256;
  const ovr = player.ratings.overall;

  if (rank <= 10) {
    return ovr >= 75
      ? 'Projected top-10 pick. Regarded as one of the premier talents in this draft class.'
      : 'Projected top-10 pick. High-profile name with some questions about his pro readiness.';
  }
  if (rank <= 32) {
    return 'Projected first-round pick. Regarded as a reliable starter at the next level.';
  }
  if (rank <= 64) {
    return 'Projected Day 2 selection. Should contribute early in a defined role.';
  }
  if (rank <= 128) {
    return 'Mid-round prospect. Could develop into a quality contributor with the right situation.';
  }
  if (rank <= 192) {
    return 'Late-round flyer with upside. Will need to earn a roster spot in camp.';
  }
  return 'Priority free agent candidate. Long shot to make a 53-man roster as a rookie.';
}

/* ─── Main Generator ─────────────────────────────────────────── */

export function generateDraftScoutEval(
  player: Player,
  userRoster: Player[],
  publicOvrRange: { lo: number; hi: number },
  schemeFit?: number, // 0-100, optional from coaching
): DraftScoutEvaluation {
  const seed = seedFromId(player.id, 55);
  const ovr = player.ratings.overall;
  const pos = player.position;

  // ── Fit Score ──
  const samePos = userRoster
    .filter(p => p.position === pos && !p.retired)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);
  const starterOvr = samePos[0]?.ratings.overall ?? 0;
  const posCount = samePos.length;
  const wouldStart = ovr > starterOvr;

  const needsPosition = posCount < (
    pos === 'OL' ? 5 : pos === 'DL' || pos === 'WR' || pos === 'LB' ? 3 :
    pos === 'QB' || pos === 'K' || pos === 'P' ? 1 : 2
  );

  let fitScore = 50;
  if (needsPosition) fitScore += 25;
  else if (wouldStart) fitScore += 15;
  if (ovr >= 75) fitScore += 15;
  if (ovr >= 85) fitScore += 10;
  if (player.potential > ovr + 5) fitScore += 5;
  if (pos === 'K' || pos === 'P') fitScore -= 20;
  if (schemeFit != null) fitScore += Math.round((schemeFit - 50) * 0.2);
  // Penalize redundancy
  if (!needsPosition && !wouldStart && posCount >= 3) fitScore -= 15;
  fitScore = clamp(fitScore, 5, 100);

  // ── Fit Badge ──
  let fitBadge: DraftScoutEvaluation['fitBadge'];
  if (!needsPosition && !wouldStart && posCount >= 4) {
    fitBadge = 'Roster Redundancy';
  } else if (fitScore >= 75 && ovr >= 70) {
    fitBadge = 'Strong Target';
  } else if (fitScore >= 45) {
    fitBadge = 'Worth a Look';
  } else {
    fitBadge = 'Not a Fit';
  }

  // ── Scout's Take ──
  const scoutsTake = generateScoutsTake(player, seed);

  // ── Scout's OVR Estimate ──
  const scoutOvrEstimate = generateScoutOvrEstimate(player, publicOvrRange, seed);

  // ── Roster Comparison ──
  const rosterComparison = generateRosterComparison(player, userRoster);

  // ── Risk Factors ──
  const riskFactors = generateRiskFactors(player, seed);

  // ── Combine ──
  const combine = extendedCombine(player);

  // ── Scout Quote ──
  const roles = POSITION_ROLES[pos];
  const scoutQuotes: Record<DraftScoutEvaluation['fitBadge'], string[]> = {
    'Strong Target': [
      `"This is the guy. ${player.lastName} fills a real need and the talent is there. I'd be aggressive to get him."`,
      `"${player.lastName} is my favorite player at ${pos} in this class. If he's there at our pick, we should sprint to the podium."`,
      `"I've watched every snap of ${player.lastName}'s tape. He's the real deal — ${roles.elite} potential."`,
    ],
    'Worth a Look': [
      `"${player.lastName} is interesting. Not a home run, but a solid pick if the board falls this way."`,
      `"I could see ${player.lastName} in our system. Good value if he slides to us."`,
      `"There's something here with ${player.lastName}. Worth keeping on the board — wouldn't reach for him though."`,
    ],
    'Not a Fit': [
      `"Talented player, just doesn't match what we need right now. I'd pass unless there's nobody else."`,
      `"${player.lastName} is fine, but we've got bigger holes to fill. Let someone else draft him."`,
    ],
    'Roster Redundancy': [
      `"We're already deep at ${pos}. Even if ${player.lastName} is talented, the opportunity cost is too high."`,
      `"Good player, wrong team. We'd be drafting for depth when we need starters elsewhere."`,
    ],
  };
  const scoutQuote = pick(scoutQuotes[fitBadge], seed + 11);

  return {
    fitBadge,
    fitScore,
    scoutsTake,
    scoutOvrEstimate,
    rosterComparison,
    riskFactors,
    combine,
    scoutQuote,
  };
}
