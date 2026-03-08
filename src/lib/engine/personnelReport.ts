/**
 * Personnel Reports: Front Office + Coaching Staff evaluations
 *
 * Used on:
 *   - Free Agency page: FO evaluation of whether to sign a FA
 *   - Player profile page: Coach evaluation (locker room, effort, etc.) + FO evaluation (roster fit, contract value)
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

function tierLabel(val: number): 'Elite' | 'Above Average' | 'Average' | 'Below Average' | 'Poor' {
  if (val >= 90) return 'Elite';
  if (val >= 80) return 'Above Average';
  if (val >= 65) return 'Average';
  if (val >= 50) return 'Below Average';
  return 'Poor';
}

/* ─── Types ──────────────────────────────────────────────────── */

export interface FAEvaluation {
  recommendation: 'Must Sign' | 'Strong Target' | 'Worth Considering' | 'Depth Only' | 'Pass';
  fitScore: number;           // 0-100
  impactDescription: string;  // what they'd do for the team
  concerns: string[];         // 0-3 concerns
  comparisons: string;        // "Would start over [current starter]" or "depth behind X"
  contractVerdict: string;    // "Fair value" | "Overpay" | "Bargain" etc.
  foQuote: string;            // GM-style quote
}

export interface CoachEvaluation {
  lockerRoomPresence: 'Team Captain Material' | 'Positive Influence' | 'Quiet Professional' | 'Non-Factor' | 'Potential Distraction';
  workEthic: 'First In, Last Out' | 'Above Average' | 'Steady' | 'Inconsistent' | 'Concerning';
  practiceHabits: string;
  gamePreparation: string;
  coachability: 'Extremely Coachable' | 'Receptive' | 'Average' | 'Stubborn' | 'Difficult';
  coachQuote: string;         // HC-style quote about the player
}

export interface RosterEvaluation {
  rosterStatus: 'Franchise Cornerstone' | 'Core Starter' | 'Solid Starter' | 'Key Rotation' | 'Depth Piece' | 'On the Bubble';
  contractValue: 'Elite Value' | 'Good Value' | 'Fair' | 'Overpaid' | 'Significantly Overpaid';
  recommendation: 'Extend Now' | 'Keep & Develop' | 'Hold Through Contract' | 'Explore Trade Value' | 'Consider Release';
  tradeValue: 'Untouchable' | 'High' | 'Moderate' | 'Low' | 'Minimal';
  foQuote: string;
}

/* ─── Position need context ──────────────────────────────────── */

const POSITION_ROLE_DESCRIPTIONS: Record<Position, { starter: string; depth: string; elite: string }> = {
  QB: { starter: 'franchise quarterback', depth: 'reliable backup', elite: 'transformational passer' },
  RB: { starter: 'featured back', depth: 'change-of-pace back', elite: 'three-down workhorse' },
  WR: { starter: 'starting receiver', depth: 'rotational weapon', elite: 'true WR1' },
  TE: { starter: 'starting tight end', depth: 'blocking/receiving hybrid', elite: 'elite pass-catching TE' },
  OL: { starter: 'starting lineman', depth: 'versatile swing lineman', elite: 'anchor of the offensive line' },
  DL: { starter: 'starting defensive lineman', depth: 'rotational pass rusher', elite: 'dominant force up front' },
  LB: { starter: 'starting linebacker', depth: 'special teams contributor', elite: 'defensive quarterback' },
  CB: { starter: 'starting corner', depth: 'nickel/dime specialist', elite: 'shutdown corner' },
  S: { starter: 'starting safety', depth: 'sub-package defender', elite: 'versatile defensive playmaker' },
  K: { starter: 'reliable kicker', depth: 'placeholder', elite: 'clutch kicker' },
  P: { starter: 'starting punter', depth: 'placeholder', elite: 'elite punter' },
};

/* ─── FA Evaluation Generator ────────────────────────────────── */

export function generateFAEvaluation(
  player: Player,
  userRoster: Player[],
  capSpace: number,
  marketSalary: number,
): FAEvaluation {
  const seed = seedFromId(player.id, 42);
  const ovr = player.ratings.overall;
  const pos = player.position;
  const roles = POSITION_ROLE_DESCRIPTIONS[pos];

  // Find current starters at this position on user's team
  const samePos = userRoster
    .filter(p => p.position === pos && !p.retired)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);
  const currentStarter = samePos[0];
  const posCount = samePos.length;
  const starterOvr = currentStarter?.ratings.overall ?? 0;
  const wouldStart = ovr > starterOvr;
  const ovrGap = ovr - starterOvr;

  // Fit score
  const needsPosition = posCount < (pos === 'OL' ? 5 : pos === 'DL' || pos === 'WR' || pos === 'LB' ? 3 : pos === 'QB' || pos === 'K' || pos === 'P' ? 1 : 2);
  let fitScore = 50;
  if (needsPosition) fitScore += 30;
  else if (wouldStart) fitScore += 20;
  else if (ovrGap > -5) fitScore += 10;
  if (ovr >= 75) fitScore += 15;
  if (ovr >= 85) fitScore += 10;
  if (player.age >= 32) fitScore -= 15;
  if (player.age <= 26) fitScore += 10;
  if (player.potential > ovr + 5) fitScore += 5;
  fitScore = Math.max(10, Math.min(100, fitScore));

  // Recommendation
  let recommendation: FAEvaluation['recommendation'];
  if (fitScore >= 85 && ovr >= 78) recommendation = 'Must Sign';
  else if (fitScore >= 70 && ovr >= 70) recommendation = 'Strong Target';
  else if (fitScore >= 50 || ovr >= 65) recommendation = 'Worth Considering';
  else if (ovr >= 55) recommendation = 'Depth Only';
  else recommendation = 'Pass';

  // Impact description
  let impactDescription: string;
  if (wouldStart && ovrGap >= 10) {
    impactDescription = `Immediately upgrades ${pos} by ${ovrGap} points over ${currentStarter?.firstName} ${currentStarter?.lastName}. Would be our ${roles.elite} from day one.`;
  } else if (wouldStart) {
    impactDescription = `Steps in as our ${roles.starter}, upgrading over ${currentStarter?.firstName} ${currentStarter?.lastName} (${starterOvr} OVR). ${ovr >= 80 ? 'Impact starter who elevates the unit.' : 'Solid improvement at the position.'}`;
  } else if (needsPosition) {
    impactDescription = `Fills a critical roster hole at ${pos}. ${ovr >= 70 ? `Capable ${roles.starter} who can contribute immediately.` : `Projects as a ${roles.depth} with room to grow.`}`;
  } else if (ovr >= starterOvr - 3) {
    impactDescription = `Creates genuine competition with ${currentStarter?.firstName} ${currentStarter?.lastName} (${starterOvr} OVR). ${roles.depth} who pushes the room.`;
  } else {
    impactDescription = `Adds depth behind ${currentStarter?.firstName} ${currentStarter?.lastName}. ${ovr >= 60 ? `Experienced ${roles.depth} for insurance.` : 'Camp body / special teams contributor.'}`;
  }

  // Concerns
  const concerns: string[] = [];
  if (player.age >= 30) concerns.push(`Age ${player.age} — declining production likely within 1-2 seasons`);
  else if (player.age >= 28) concerns.push(`Entering age-28+ window — may not age well at ${pos}`);
  if (player.injury) concerns.push(`Currently dealing with ${player.injury.type} (${player.injury.weeksLeft} weeks)`);
  if (player.ratings.stamina < 60) concerns.push('Durability concerns — low stamina rating');
  if (marketSalary > capSpace && capSpace > 0) concerns.push(`Market salary ($${marketSalary.toFixed(1)}M) exceeds our cap space ($${capSpace.toFixed(1)}M)`);
  if (ovr < 60 && player.potential <= ovr + 3) concerns.push('Limited ceiling — what you see is what you get');
  if (player.scoutingLabel === 'Injury history') concerns.push('Injury-prone history raises long-term availability concerns');
  if (player.scoutingLabel === 'Character concerns') concerns.push('Character red flags from previous team');

  // Comparison to current roster
  let comparisons: string;
  if (wouldStart) {
    comparisons = `Would start over ${currentStarter?.firstName} ${currentStarter?.lastName} (${starterOvr} OVR) immediately`;
  } else if (currentStarter && ovr >= starterOvr - 5) {
    comparisons = `Competitive with ${currentStarter.firstName} ${currentStarter.lastName} (${starterOvr} OVR) for the starting role`;
  } else if (currentStarter) {
    comparisons = `Depth behind ${currentStarter.firstName} ${currentStarter.lastName} (${starterOvr} OVR)`;
  } else {
    comparisons = `Would be the only ${pos} on the roster`;
  }

  // Contract verdict
  let contractVerdict: string;
  const capPct = capSpace > 0 ? (marketSalary / capSpace) * 100 : 999;
  if (marketSalary <= 1.5) contractVerdict = 'Minimum deal — no financial risk';
  else if (ovr >= 80 && marketSalary < 25) contractVerdict = 'Excellent value for an All-Pro-caliber player';
  else if (ovr >= 70 && marketSalary < 15) contractVerdict = 'Fair market value for a quality starter';
  else if (capPct > 40) contractVerdict = `At $${marketSalary.toFixed(1)}M, this would consume ${Math.round(capPct)}% of remaining cap — significant commitment`;
  else if (player.age >= 30 && marketSalary > 10) contractVerdict = 'Paying a premium for declining years — keep the term short';
  else contractVerdict = `$${marketSalary.toFixed(1)}M/yr is in line with market expectations for a ${ovr}+ OVR ${pos}`;

  // GM quote
  const gmQuotes = {
    'Must Sign': [
      `"This is a rare opportunity. ${player.lastName} is exactly what this team needs. We have to be aggressive here."`,
      `"Players like ${player.lastName} don't hit the market often. I'd make this our top priority."`,
      `"If we don't sign ${player.lastName}, we'll regret it all season. This is a difference-maker."`,
    ],
    'Strong Target': [
      `"${player.lastName} would be a significant addition. I'd pursue this one hard, but let's not overpay."`,
      `"Really like what ${player.lastName} brings. Good fit for what we're building here."`,
      `"I've got ${player.lastName} circled on my board. Smart signing if the money works."`,
    ],
    'Worth Considering': [
      `"${player.lastName} is interesting — not a home run, but fills a need if the price is right."`,
      `"I could see ${player.lastName} in our system. Not the flashiest signing but solid value."`,
      `"Worth a conversation. ${player.lastName} has some upside if we can get the deal done at our number."`,
    ],
    'Depth Only': [
      `"I'd bring ${player.lastName} in for depth, but I wouldn't break the bank. Camp invite at best."`,
      `"Low-cost depth move. ${player.lastName} gives us a body but won't move the needle."`,
    ],
    'Pass': [
      `"Not the fit we're looking for. I'd pass on ${player.lastName} and allocate those resources elsewhere."`,
      `"${player.lastName} doesn't fit our timeline or roster needs. Let's stay disciplined."`,
    ],
  };
  const foQuote = pick(gmQuotes[recommendation], seed);

  return {
    recommendation,
    fitScore,
    impactDescription,
    concerns: concerns.slice(0, 3),
    comparisons,
    contractVerdict,
    foQuote,
  };
}

/* ─── Coach Evaluation Generator (for rostered players) ──────── */

export function generateCoachEvaluation(player: Player): CoachEvaluation {
  const seed = seedFromId(player.id, 77);
  const ovr = player.ratings.overall;
  const awareness = player.ratings.awareness;
  const stamina = player.ratings.stamina;
  const age = player.age;
  const exp = player.experience;

  // Locker room presence — driven by awareness + experience + age
  const presenceScore = awareness * 0.4 + Math.min(exp, 10) * 3 + (age >= 28 ? 10 : 0) + (seed % 15);
  let lockerRoomPresence: CoachEvaluation['lockerRoomPresence'];
  if (presenceScore >= 80 && exp >= 5) lockerRoomPresence = 'Team Captain Material';
  else if (presenceScore >= 65) lockerRoomPresence = 'Positive Influence';
  else if (presenceScore >= 45) lockerRoomPresence = 'Quiet Professional';
  else if (presenceScore >= 30) lockerRoomPresence = 'Non-Factor';
  else lockerRoomPresence = 'Potential Distraction';

  // Override for character concerns
  if (player.scoutingLabel === 'Character concerns') {
    lockerRoomPresence = seed % 3 === 0 ? 'Potential Distraction' : 'Non-Factor';
  }

  // Work ethic — awareness + potential growth trajectory
  const ethicScore = awareness * 0.35 + stamina * 0.25 + (player.potential > ovr ? 15 : 0) + (seed % 20);
  let workEthic: CoachEvaluation['workEthic'];
  if (ethicScore >= 75) workEthic = 'First In, Last Out';
  else if (ethicScore >= 60) workEthic = 'Above Average';
  else if (ethicScore >= 40) workEthic = 'Steady';
  else if (ethicScore >= 25) workEthic = 'Inconsistent';
  else workEthic = 'Concerning';

  if (player.scoutingLabel === 'High motor') workEthic = 'First In, Last Out';

  // Coachability
  const coachScore = awareness * 0.4 + (age <= 25 ? 15 : age >= 32 ? -5 : 5) + (seed % 18);
  let coachability: CoachEvaluation['coachability'];
  if (coachScore >= 65) coachability = 'Extremely Coachable';
  else if (coachScore >= 50) coachability = 'Receptive';
  else if (coachScore >= 35) coachability = 'Average';
  else if (coachScore >= 20) coachability = 'Stubborn';
  else coachability = 'Difficult';

  // Practice habits
  const practiceOptions: Record<string, string[]> = {
    'First In, Last Out': [
      'Sets the standard in practice. Full speed on every rep.',
      'Consistently the hardest worker on the field. Other guys feed off his energy.',
      'Never takes a day off. Even on veteran rest days, you\'ll find him doing extra work.',
    ],
    'Above Average': [
      'Solid work in practice. Comes prepared and puts in the reps.',
      'Good practice habits. Rarely has to be told something twice.',
      'Dependable every day. Not flashy, but you can count on him.',
    ],
    'Steady': [
      'Gets his work done. Doesn\'t go above and beyond but meets expectations.',
      'Consistent effort most days. Occasionally needs a push in training camp.',
    ],
    'Inconsistent': [
      'Some days he looks great, other days he\'s going through the motions.',
      'Effort level fluctuates. Need to stay on him to get the best out of him.',
    ],
    'Concerning': [
      'Struggles with the daily grind. Has to be coached hard to maintain effort.',
      'Practice habits don\'t match his talent level. That\'s a red flag for us.',
    ],
  };
  const practiceHabits = pick(practiceOptions[workEthic] ?? practiceOptions['Steady'], seed + 1);

  // Game preparation
  const prepOptions = ovr >= 75 ? [
    'Studies film like a coach. Always knows the game plan cold.',
    'One of the most prepared players on game day. Does his homework.',
    'Elite preparation. Knows opponent tendencies before we even review them.',
  ] : ovr >= 60 ? [
    'Adequate preparation. Knows his assignments on game day.',
    'Does the required film study. Could put in more work on special situations.',
    'Getting better at preparation. The mental side is catching up to his physical tools.',
  ] : [
    'Still learning the nuances of game preparation at this level.',
    'Needs help with pre-game prep. We simplify his assignments to keep him confident.',
  ];
  const gamePreparation = pick(prepOptions, seed + 2);

  // Coach quote
  const quotesByTier: string[][] = ovr >= 80 ? [
    [`"${player.lastName} is the kind of player you build around. He makes everyone around him better."`,
     `"I've coached a lot of players, and ${player.lastName} is special. His combination of talent and ${workEthic === 'First In, Last Out' ? 'work ethic' : 'ability'} is rare."`,
     `"${player.lastName} is our identity at ${player.position}. ${lockerRoomPresence === 'Team Captain Material' ? 'He leads by example every day.' : 'His play speaks for itself.'}"`,
    ],
  ] : ovr >= 65 ? [
    [`"${player.lastName} is a solid player for us. ${workEthic === 'First In, Last Out' || workEthic === 'Above Average' ? 'Does all the little things right.' : 'Still has room to grow in his approach.'}"`,
     `"I'm ${player.potential > ovr + 5 ? 'excited about' : 'pleased with'} where ${player.lastName} is. ${exp <= 2 ? 'The trajectory is there.' : 'He knows his role and executes.'}"`,
     `"${player.lastName} gives us quality ${player.experience <= 1 ? 'young talent' : 'experience'} at ${player.position}. ${lockerRoomPresence === 'Quiet Professional' ? 'Low maintenance, high output.' : 'Important piece of what we do.'}"`,
    ],
  ] : [
    [`"${player.lastName} is fighting for a spot. ${workEthic === 'First In, Last Out' ? 'Love his effort — that gives him a shot.' : 'Needs to show more to stick around.'}"`,
     `"We need ${player.lastName} to take a step forward. ${player.potential > ovr + 5 ? 'The talent is there, it\'s about consistency.' : 'At some point, the performance has to match the opportunity.'}"`,
     `"${player.lastName} is a project. ${player.age <= 25 ? 'We\'re being patient — development takes time.' : 'The clock is ticking on showing improvement.'}"`,
    ],
  ];
  const coachQuote = pick(quotesByTier[0], seed + 3);

  return {
    lockerRoomPresence,
    workEthic,
    practiceHabits,
    gamePreparation,
    coachability,
    coachQuote,
  };
}

/* ─── Roster Evaluation Generator (FO perspective on rostered players) ─── */

export function generateRosterEvaluation(
  player: Player,
  teammates: Player[],
  salaryCap: number,
): RosterEvaluation {
  const seed = seedFromId(player.id, 99);
  const ovr = player.ratings.overall;
  const salary = player.contract.salary;
  const yearsLeft = player.contract.yearsLeft;
  const age = player.age;
  const pos = player.position;

  // Roster status
  const samePos = teammates.filter(p => p.position === pos && !p.retired).sort((a, b) => b.ratings.overall - a.ratings.overall);
  const rank = samePos.findIndex(p => p.id === player.id) + 1;
  const isStarter = rank <= (pos === 'OL' ? 5 : pos === 'DL' || pos === 'WR' || pos === 'LB' ? 3 : pos === 'QB' || pos === 'K' || pos === 'P' ? 1 : 2);

  let rosterStatus: RosterEvaluation['rosterStatus'];
  if (ovr >= 85 && isStarter) rosterStatus = 'Franchise Cornerstone';
  else if (ovr >= 78 && isStarter) rosterStatus = 'Core Starter';
  else if (ovr >= 68 && isStarter) rosterStatus = 'Solid Starter';
  else if (ovr >= 60) rosterStatus = 'Key Rotation';
  else if (ovr >= 50) rosterStatus = 'Depth Piece';
  else rosterStatus = 'On the Bubble';

  // Contract value — salary vs. production
  // Expected salary for this OVR/pos (rough market check)
  const expectedSalary = (() => {
    if (ovr >= 85) return pos === 'QB' ? 45 : pos === 'RB' ? 15 : 30;
    if (ovr >= 75) return pos === 'QB' ? 30 : pos === 'RB' ? 10 : 18;
    if (ovr >= 65) return pos === 'QB' ? 18 : pos === 'RB' ? 6 : 10;
    if (ovr >= 55) return 3;
    return 1;
  })();

  const salaryRatio = salary / Math.max(expectedSalary, 0.75);
  let contractValue: RosterEvaluation['contractValue'];
  if (salaryRatio <= 0.5) contractValue = 'Elite Value';
  else if (salaryRatio <= 0.75) contractValue = 'Good Value';
  else if (salaryRatio <= 1.2) contractValue = 'Fair';
  else if (salaryRatio <= 1.8) contractValue = 'Overpaid';
  else contractValue = 'Significantly Overpaid';

  // Rookies on rookie deals are always good value
  if (player.experience <= 2 && salary <= 5) contractValue = ovr >= 65 ? 'Elite Value' : 'Good Value';

  // Recommendation
  let recommendation: RosterEvaluation['recommendation'];
  if (ovr >= 80 && yearsLeft <= 1 && age <= 29) recommendation = 'Extend Now';
  else if (ovr >= 70 && age <= 27 && player.potential > ovr) recommendation = 'Keep & Develop';
  else if (contractValue === 'Significantly Overpaid' && ovr < 70) recommendation = 'Explore Trade Value';
  else if (ovr < 55 && salary > 3) recommendation = 'Consider Release';
  else if (contractValue === 'Overpaid' && age >= 30) recommendation = 'Explore Trade Value';
  else if (yearsLeft >= 2) recommendation = 'Hold Through Contract';
  else recommendation = 'Keep & Develop';

  // Trade value
  let tradeValue: RosterEvaluation['tradeValue'];
  if (ovr >= 85 && age <= 28) tradeValue = 'Untouchable';
  else if (ovr >= 78 && age <= 30) tradeValue = 'High';
  else if (ovr >= 68 && age <= 30) tradeValue = 'Moderate';
  else if (ovr >= 60) tradeValue = 'Low';
  else tradeValue = 'Minimal';

  // Expensive players lose trade value
  if (salary > 25 && tradeValue !== 'Untouchable') {
    const idx = ['Untouchable', 'High', 'Moderate', 'Low', 'Minimal'].indexOf(tradeValue);
    tradeValue = (['Untouchable', 'High', 'Moderate', 'Low', 'Minimal'] as const)[Math.min(idx + 1, 4)];
  }

  // FO quote
  const foQuotes: Record<RosterEvaluation['recommendation'], string[]> = {
    'Extend Now': [
      `"${player.lastName} is a priority this offseason. We need to lock him up before he hits the market — he's earned it."`,
      `"I'm already working on an extension for ${player.lastName}. Can't let a player like this walk."`,
      `"${player.lastName} is central to our plans. Getting a deal done should be at the top of our list."`,
    ],
    'Keep & Develop': [
      `"${player.lastName} has upside we haven't fully tapped yet. Give him time and reps — the ceiling is there."`,
      `"Pleased with ${player.lastName}'s trajectory. The best is yet to come if we're patient."`,
      `"${player.lastName} is part of our young core. Developing him is an investment in our future."`,
    ],
    'Hold Through Contract': [
      `"${player.lastName} is under contract and contributing. We'll evaluate his future when it's time to make a decision."`,
      `"No urgency on ${player.lastName}. He's performing to his contract and we'll reassess down the road."`,
    ],
    'Explore Trade Value': [
      `"I'd quietly gauge the market for ${player.lastName}. If we can get value back, we should consider it."`,
      `"Love the player, but the contract situation is tough. If the right offer comes, we have to listen."`,
      `"We owe it to the roster to see what ${player.lastName}'s trade value looks like. Can't be sentimental."`,
    ],
    'Consider Release': [
      `"Tough decision ahead with ${player.lastName}. The cap savings might serve us better elsewhere."`,
      `"${player.lastName} is a roster casualty candidate. The numbers don't justify keeping him at that salary."`,
    ],
  };
  const foQuote = pick(foQuotes[recommendation], seed + 5);

  return {
    rosterStatus,
    contractValue,
    recommendation,
    tradeValue,
    foQuote,
  };
}
