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
  scoutOvrEstimate: { low: number; high: number };
  rosterComparison: string;
  riskFactors: string[];
  combine: {
    fortyYard: number;
    benchPress: number;
    verticalJump: number;
    shuttle: number;
  };
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

function generateScoutsTake(
  player: Player,
  seed: number,
  scoutOvr: { low: number; high: number },
  publicOvrRange: { lo: number; hi: number },
  fitBadge: DraftScoutEvaluation['fitBadge'],
  userRoster: Player[],
): string {
  const ovr = player.ratings.overall;
  const pot = player.potential;
  const pos = player.position;
  const label = player.scoutingLabel ?? '';
  const profile = player.draftProfile ?? 'normal';
  const publicMid = Math.round((publicOvrRange.lo + publicOvrRange.hi) / 2);

  // ── Talent assessment ──
  let talent: string;

  if (profile === 'bust' && ovr >= 68 && ((seed * 3571 + 8923) % 100) < 75) {
    const bustTakes = [
      `The physical tools are undeniable, but our staff has questions about ${pos === 'QB' ? 'his ability to process at NFL speed' : pos === 'WR' || pos === 'TE' ? 'whether the production will translate without a scheme advantage' : pos === 'OL' ? 'his ability to handle NFL-level pass rushers consistently' : 'whether the college production was inflated by the system he played in'}.`,
      `The consensus loves this kid, but something doesn't sit right with our evaluators. The ${pos === 'QB' ? 'decision-making under pressure' : 'consistency from snap to snap'} concerns me.`,
      `There's a disconnect between the measurables and the tape. ${pos === 'QB' ? "The arm is electric but the football IQ hasn't caught up." : "Dominates with athleticism but gets exposed when the opponent schemes around it."}`,
    ];
    talent = pick(bustTakes, seed);
  } else if (profile === 'boom' && ovr < 68 && ((seed * 3571 + 8923) % 100) < 75) {
    const boomTakes = [
      `Don't sleep on this kid. ${pos === 'QB' ? "There's arm talent here that you can't teach, and the improvement from year 3 to year 4 was dramatic." : pos === 'WR' || pos === 'TE' ? "The route-running has improved every single year. Give him NFL coaching and watch out." : pos === 'OL' ? "The technique is raw but the physical tools are first-round caliber." : "Every coach who worked with him says the same thing — this player has another gear."}`,
      `Our scouts are higher on this one than the consensus — significantly higher. ${pot > ovr + 10 ? 'There\'s a world where this player becomes a legitimate starter within two years.' : 'The improvement trajectory is what caught our eye.'}`,
      `This is the type of prospect that makes you look like a genius in three years. Raw? Absolutely. But the tools are tantalizing and the work ethic is off the charts.`,
    ];
    talent = pick(boomTakes, seed);
  } else if (ovr >= 78) {
    const eliteTemplates = [
      `Most complete ${pos} in this class. Does everything at a high level and projects as a day-one starter.`,
      `Rare combination of physical tools and football instincts. Tape is consistently dominant against top competition.`,
      `Pro-ready in every sense. ${pos === 'QB' ? 'Command of the pocket, accuracy in all three levels, and leadership that jumps off the tape.' : pos === 'WR' || pos === 'TE' ? 'Route tree is NFL-caliber already, and the hands are as reliable as they come.' : pos === 'OL' ? 'Anchor strength and pass sets are already at a professional level.' : 'Instincts and closing speed set him apart from everyone else in this class.'}`,
    ];
    talent = pick(eliteTemplates, seed);
  } else if (ovr >= 68) {
    const solidTemplates = [
      `Reliable, well-rounded ${pos} who should compete for a starting role early. ${pot > ovr + 5 ? 'Still has significant upside to unlock.' : 'Safe floor as a quality starter.'}`,
      `Good tape against solid competition. ${pos === 'QB' ? "Processes the field well and limits mistakes." : pos === 'RB' ? 'Runs with power and vision between the tackles.' : pos === 'DL' || pos === 'LB' ? 'Plays with a high motor and fills his gaps consistently.' : 'Technically sound with room to add more explosive plays.'}`,
      `Starter-caliber prospect with a clear role at the next level. ${label === 'High motor' ? "Work ethic is off the charts." : label === 'Pro-ready' ? 'Most polished player at the position in this draft.' : 'Not a flashy pick but a smart one.'}`,
    ];
    talent = pick(solidTemplates, seed);
  } else if (ovr >= 58) {
    const midTemplates = [
      `Developmental prospect with ${pot > ovr + 8 ? 'intriguing upside' : 'a defined role'}. ${label === 'Raw but explosive' ? 'Athletic tools are clear but the technique needs work.' : 'Needs time but could earn a spot in the rotation.'}`,
      `${pos === 'QB' ? 'Arm talent is there but decision-making is inconsistent.' : pos === 'WR' || pos === 'TE' ? 'Flashes of separation ability but drops are a concern.' : pos === 'OL' ? 'Has the frame and feet, needs to add strength and refine technique.' : 'Showed improvement through the college season. Trending in the right direction.'}`,
      `Project pick with ${pot > ovr + 10 ? 'legitimate starter potential in 2-3 years' : 'a ceiling as a quality backup'}. Needs reps and coaching to close the gap between tools and production.`,
    ];
    talent = pick(midTemplates, seed);
  } else {
    const rawTemplates = [
      `Long-term project. ${pot > ovr + 12 ? 'There\'s a player in there — it just might take 2-3 years to find him.' : 'Camp body who will need to show something special to stick.'}`,
      `Raw athleticism that hasn't translated to consistent production yet. ${pot > 70 ? 'If the light comes on, you\'re looking at a late-round steal.' : 'Likely practice squad or special teams contributor early.'}`,
      `Depth pick at best right now. ${label === 'High motor' ? 'Effort is never a question — the physical tools just need to catch up.' : 'Will need significant development to contribute on game days.'}`,
    ];
    talent = pick(rawTemplates, seed);
  }

  // ── OVR opinion (only if scout disagrees with consensus) ──
  let ovrOpinion = '';
  if (ovr > publicMid + 3) {
    ovrOpinion = ` Our staff has him higher than consensus — more of a ${scoutOvr.low}-${scoutOvr.high} player.`;
  } else if (ovr < publicMid - 3) {
    ovrOpinion = ` We're lower on him than most — ${scoutOvr.low}-${scoutOvr.high} range for us.`;
  } else {
    ovrOpinion = ` ${scoutOvr.low}-${scoutOvr.high} feels right based on our evaluations.`;
  }

  // ── Fit opinion ──
  const samePos = userRoster.filter(p => p.position === pos && !p.retired);
  let fitOpinion = '';
  if (fitBadge === 'Strong Target') {
    fitOpinion = ` ${player.lastName} fills a real need — I'd be aggressive to get him.`;
  } else if (fitBadge === 'Roster Redundancy') {
    fitOpinion = ` We're already deep at ${pos} though, so the opportunity cost is too high.`;
  } else if (fitBadge === 'Not a Fit') {
    fitOpinion = ` Just doesn't match what we need right now.`;
  } else if (samePos.length >= 3) {
    fitOpinion = ` Solid pick if the board falls this way.`;
  }

  return talent + ovrOpinion + fitOpinion;
}

/* ─── Scout's OVR Estimate ───────────────────────────────────── */

function generateScoutOvrEstimate(
  player: Player,
  publicRange: { lo: number; hi: number },
  seed: number,
): { low: number; high: number } {
  const trueOvr = player.ratings.overall;
  const spreadHalf = 2 + (seed % 2); // 2 or 3
  const low = clamp(trueOvr - spreadHalf, 20, 99);
  const high = clamp(trueOvr + spreadHalf, 20, 99);
  return { low, high };
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

function generateRiskFactors(player: Player, seed: number, scoutingLevel = 0): string[] {
  const risks: string[] = [];
  const label = player.scoutingLabel ?? '';

  // ── Boom/Bust scouting hints ──
  // Detection rate scales with scouting investment:
  //   Level 0 (Entry): 35%, Level 1 (Pro): 50%, Level 2 (Elite): 65%
  const DETECTION_RATES = [35, 50, 65];
  const detectionThreshold = DETECTION_RATES[Math.min(scoutingLevel, 2)] ?? 35;
  const scoutAccuracy = ((seed * 3571 + 8923) % 100);
  if (player.draftProfile === 'bust' && scoutAccuracy < detectionThreshold) {
    const bustHints = [
      'Some evaluators question whether his college production will translate to the next level',
      'Our staff notes a plateau in development during his final college season — worth monitoring',
      'There\'s a gap between the measurables and the tape that gives our scouts pause',
      'Production was heavily scheme-dependent — may struggle to adapt without the same system',
    ];
    risks.push(pick(bustHints, seed + 33));
  } else if (player.draftProfile === 'boom' && scoutAccuracy < detectionThreshold) {
    const boomHints = [
      'Intriguing athletic profile that may take time to develop at the pro level',
      'Our staff sees a player whose improvement trajectory suggests untapped potential',
      'Raw tools that could translate with patient coaching — not a day-one starter but worth the wait',
      'There\'s more here than the stats suggest — a late bloomer who may surprise',
    ];
    risks.push(pick(boomHints, seed + 33));
  }

  if (label === 'Injury history') {
    risks.push('Medical red flag — injury history raises durability concerns');
  }
  if (label === 'Character concerns') {
    risks.push('Character concerns flagged by multiple sources');
  }
  if (player.potential > player.ratings.overall + 12 && player.ratings.overall < 65 && player.draftProfile !== 'boom') {
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
  scoutingLevel?: number, // 0=entry, 1=pro, 2=elite
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

  // ── Scout's OVR Estimate (numeric range) ──
  const scoutOvrEstimate = generateScoutOvrEstimate(player, publicOvrRange, seed);

  // ── Roster Comparison ──
  const rosterComparison = generateRosterComparison(player, userRoster);

  // ── Risk Factors ──
  const riskFactors = generateRiskFactors(player, seed, scoutingLevel ?? 0);

  // ── Combine ──
  const combine = extendedCombine(player);

  // ── Scout's Take (unified: talent + OVR opinion + fit) ──
  const scoutsTake = generateScoutsTake(player, seed, scoutOvrEstimate, publicOvrRange, fitBadge, userRoster);

  return {
    fitBadge,
    fitScore,
    scoutsTake,
    scoutOvrEstimate,
    rosterComparison,
    riskFactors,
    combine,
  };
}
