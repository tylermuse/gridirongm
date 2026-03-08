import type { Player, Position } from '@/types';

/* ─── helpers ────────────────────────────────────────────────── */

function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function tierLabel(val: number): string {
  if (val >= 90) return 'Elite';
  if (val >= 80) return 'Above Average';
  if (val >= 65) return 'Average';
  if (val >= 50) return 'Below Average';
  return 'Poor';
}

/* ─── Player Comparisons (fictional archetypes) ────────────────── */

const PLAYER_COMPARISONS: Record<Position, string[]> = {
  QB: [
    'Marcus Webb (3x All-Pro)',
    'Darius Cole (Elite passer)',
    'Jake Hennessy (Dual-threat)',
    'Tyler Knox (Field general)',
    'Chris Darnell (Rocket arm)',
    'Aiden Marshall (Pocket passer)',
    'Ricky Fontaine (Improviser)',
    'DeAndre Hawkins (Mobile QB)',
  ],
  RB: [
    'DeShawn Harris (Power back)',
    'Malik Turner (Speed back)',
    'Jaylen Booker (All-purpose)',
    'Carlos Reeves (Bruiser)',
    'Terrance Banks (Pass-catching back)',
    'Andre Whitfield (Three-down back)',
    'Deon Carpenter (Home-run hitter)',
    'Isaiah Odom (Short-yardage specialist)',
  ],
  WR: [
    'Tyrell Simmons (Contested-catch king)',
    'Rasheed Franklin (Deep threat)',
    'Corey Ashford (Slot technician)',
    'Brandon Okafor (YAC monster)',
    'Marquise Hollins (Route craftsman)',
    'Devon Ingram (Big-bodied target)',
    'Kendall Price (Speedster)',
    'Nate Calloway (Possession receiver)',
  ],
  TE: [
    'Jordan Kelso (Receiving TE)',
    'Marcus Blackwell (Blocking TE)',
    'Darnell Quarles (Move TE)',
    'Kyle Addington (Do-it-all TE)',
    'Travis Goodwin (Red-zone weapon)',
    'Ryan Davenport (Flex TE)',
    'Aaron Mercer (Versatile)',
    'Cameron Rhodes (Athletic mismatch)',
  ],
  OL: [
    'Warren Stokes (Road grader)',
    'Terrence Buckley (Technician)',
    'David Ormond (Anchor)',
    'Liam Kowalski (Athletic tackle)',
    'Marcus Peele (Mauler)',
    'Jameson Hart (Pass protector)',
    'Reggie Townsend (Nasty streak)',
    'Brandon Osei (Versatile lineman)',
  ],
  DL: [
    'Jamal Prescott (Edge rusher)',
    'Kwame Okafor (Interior wrecker)',
    'Darius Gage (Run stuffer)',
    'Tyrone Blanton (Pocket collapser)',
    'Rashad Kemp (Speed rusher)',
    'Aaron Westbrook (Power end)',
    'Devon Chisholm (Penetrator)',
    'Marcus Lyle (Disruptive 3-tech)',
  ],
  LB: [
    'Devin Callahan (Signal caller)',
    'Rasheem Foster (Thumper)',
    'Kareem Obi (Sideline-to-sideline)',
    'Jordan Myles (Coverage LB)',
    'Terrance Upton (Blitzing LB)',
    'Darius Kwan (Run-and-hit)',
    'Malcolm Briggs (Instinctive)',
    'Isaiah Colvin (Versatile)',
  ],
  CB: [
    'Quinyon Mitchell (Lockdown)',
    'Terrance Lattimore (Press corner)',
    'Devonte Slay (Ball hawk)',
    'Marcus Allen (Zone specialist)',
    'Jaylen Witherspoon (Long corner)',
    'Keenan Stingley (Sticky coverage)',
    'Andre Ramsey (Physical corner)',
    'Darius Ward (Shutdown)',
  ],
  S: [
    'Jordan Battle (Enforcer)',
    'Malik Winfield (Center fielder)',
    'Terrance Mathieu (Swiss-army knife)',
    'Deshon Branch (Box safety)',
    'Kendrick Neal (Playmaker)',
    'Avery Bates (Range safety)',
    'Marcus Peppers (Versatile DB)',
    'Isaiah Simmons (Hybrid)',
  ],
  K: [
    'Justin Carlson (Big leg)',
    'Ryan Koo (Clutch kicker)',
    'Marcus Gould (Automatic)',
    'Tyler Bass-Wright (Reliable)',
  ],
  P: [
    'Braden Kern (Directional punter)',
    'Ryan Dickson (Booming leg)',
    'Marcus Fox (Coffin-corner specialist)',
    'Tyler Araiza (Hang-time master)',
  ],
};

/* ─── Primary rating key per position ────────────────────────── */

function primaryKey(pos: Position): keyof Player['ratings'] {
  const map: Record<Position, keyof Player['ratings']> = {
    QB: 'throwing', RB: 'carrying', WR: 'catching', TE: 'catching',
    OL: 'blocking', DL: 'passRush', LB: 'tackling', CB: 'coverage',
    S: 'coverage', K: 'kicking', P: 'kicking',
  };
  return map[pos];
}

function secondaryKey(pos: Position): keyof Player['ratings'] {
  const map: Record<Position, keyof Player['ratings']> = {
    QB: 'awareness', RB: 'speed', WR: 'speed', TE: 'blocking',
    OL: 'strength', DL: 'strength', LB: 'speed', CB: 'speed',
    S: 'tackling', K: 'awareness', P: 'awareness',
  };
  return map[pos];
}

/* ─── Overview templates ─────────────────────────────────────── */

const OVERVIEW_OPENERS: Record<Position, { elite: string[]; solid: string[]; raw: string[] }> = {
  QB: {
    elite: [
      '{name} is one of the premier quarterback prospects in this draft class. He commands the pocket with poise, delivering the ball with velocity and accuracy to all three levels of the field.',
      '{name} has established himself as a top-tier signal caller. His arm talent is exceptional, showing the ability to make every throw in the playbook with ease.',
    ],
    solid: [
      '{name} is a capable passer who shows solid mechanics and good decision-making in the pocket. He processes reads efficiently and delivers an accurate ball on rhythm throws.',
      '{name} projects as a starting-caliber quarterback at the next level. He has the arm strength and football IQ to run a pro-style offense.',
    ],
    raw: [
      '{name} is a developmental quarterback who flashes intriguing tools but needs refinement. His arm talent is there, but consistency remains a question mark.',
      '{name} has the physical traits to develop into a starter, but his tape shows inconsistency in his reads and ball placement under pressure.',
    ],
  },
  RB: {
    elite: [
      '{name} is an explosive, dynamic runner who can change games with his ability. He combines vision, patience, and burst to create big plays consistently.',
      '{name} is a complete back who excels in all phases. His combination of power, speed, and receiving ability makes him a true three-down weapon.',
    ],
    solid: [
      '{name} is a reliable between-the-tackles runner with good vision and consistent production. He finds the crease quickly and falls forward for extra yardage.',
      '{name} brings a well-rounded skill set to the backfield. He runs with authority, picks up blitzes, and is a capable receiver out of the backfield.',
    ],
    raw: [
      '{name} has intriguing physical traits but needs to develop his craft. His burst is evident, but his vision and patience at the line of scrimmage need work.',
      '{name} is a toolsy runner who can make defenders miss in space, but his overall feel for running lanes is still developing.',
    ],
  },
  WR: {
    elite: [
      '{name} is an elite receiver prospect who wins at every level of the route tree. His combination of route-running precision and natural hands make him a nightmare for defensive backs.',
      '{name} is a dynamic playmaker who separates consistently and is virtually uncoverable in one-on-one matchups. He accelerates through his breaks and tracks the ball naturally.',
    ],
    solid: [
      '{name} is a well-rounded receiver who is clean in and out of his breaks and reliable with the ball in his hands. He projects as a dependable starter at the next level.',
      '{name} is a polished route runner who creates separation with technique rather than pure athleticism. His hands are consistent and he competes in contested-catch situations.',
    ],
    raw: [
      '{name} is a raw but physically gifted receiver who needs to develop his route-running technique. His physical tools are tantalizing, but he relies too much on athleticism.',
      '{name} has the measurables to develop into a productive receiver, but his route tree is limited and he needs to improve his releases off the line.',
    ],
  },
  TE: {
    elite: [
      '{name} is a matchup nightmare at tight end with rare receiving ability for his size. He stretches the seam, wins contested catches, and is a willing blocker.',
      '{name} is one of the most complete tight ends in this class. He can line up inline, in the slot, or out wide and be productive in all three spots.',
    ],
    solid: [
      '{name} is a solid all-around tight end who contributes as both a receiver and blocker. He understands leverage in the run game and finds soft spots in zone coverage.',
      '{name} brings good size and reliable hands to the position. He is a dependable target on third down and moves the chains consistently.',
    ],
    raw: [
      '{name} has the frame and athleticism to develop into a productive tight end, but he is still learning the position. His blocking technique needs refinement and his route tree is limited.',
      '{name} flashes receiving upside but is raw as a blocker. He needs time in a pro strength program to handle the rigors of inline work.',
    ],
  },
  OL: {
    elite: [
      '{name} is a technically refined offensive lineman who dominates at the point of attack. He combines outstanding footwork, hand placement, and anchor to neutralize pass rushers.',
      '{name} is a premier blocking prospect who plays with a nasty streak and finishes his blocks. His combination of power and athleticism is rare for the position.',
    ],
    solid: [
      '{name} is a dependable offensive lineman who plays with good technique and consistency. He rarely gets beat and communicates well on stunts and blitzes.',
      '{name} projects as a reliable starter at the next level. He has the size, strength, and football IQ to handle the demands of pro blocking schemes.',
    ],
    raw: [
      '{name} has the physical tools to develop into a starter, but his technique is inconsistent. He gets caught leaning and loses his base against power rushers.',
      '{name} has excellent size and length but needs to clean up his hand placement and pad level. He is a project who could reward patience.',
    ],
  },
  DL: {
    elite: [
      '{name} is an elite pass-rushing prospect who wins with a devastating combination of speed and power off the edge. He bends the corner, converts speed to power, and closes on the quarterback.',
      '{name} is a dominant force on the defensive line who collapses the pocket and wreaks havoc in the backfield. He has a refined pass-rush plan and elite closing burst.',
    ],
    solid: [
      '{name} is a productive pass rusher who wins with effort, technique, and a developing repertoire of moves. He sets the edge consistently and holds up well in run defense.',
      '{name} brings a solid combination of size and quickness to the defensive line. He can play multiple positions and is a dependable contributor against both the run and pass.',
    ],
    raw: [
      '{name} has explosive physical traits but is still learning how to use them consistently. His first step is electric, but he lacks counter moves when his initial rush is stalled.',
      '{name} flashes as a pass rusher with impressive get-off, but his hand usage and pass-rush plan need significant development at the next level.',
    ],
  },
  LB: {
    elite: [
      '{name} is a sideline-to-sideline linebacker who makes plays all over the field. He diagnoses plays quickly, fills downhill with authority, and can cover backs and tight ends.',
      '{name} is a complete linebacker prospect who excels against both the run and pass. His instincts, range, and physicality make him a defensive centerpiece.',
    ],
    solid: [
      '{name} is a dependable linebacker who plays with discipline and fills his gaps consistently. He is a sure tackler and reads his keys well.',
      '{name} brings solid run-defense ability and enough coverage skills to stay on the field in passing situations. He communicates well and plays with effort.',
    ],
    raw: [
      '{name} has intriguing athleticism but is still learning to process at the linebacker position. He can be a step slow diagnosing plays and takes false steps in coverage.',
      '{name} has the physical tools to develop but is too reactive at this stage. He needs to trust his reads and play with more anticipation.',
    ],
  },
  CB: {
    elite: [
      '{name} is one of the top cornerbacks in this draft class. He excels in press coverage, altering release timing with punches and slides. His smooth hips and efficient footwork keep him connected in man coverage.',
      '{name} is a lockdown cornerback prospect with the ability to shadow top receivers. He plays with length, physicality, and the ball skills to make game-changing plays.',
    ],
    solid: [
      '{name} is a solid cover corner who plays with good technique and awareness. He stays in phase on routes and competes at the catch point with consistent effort.',
      '{name} is a dependable cornerback who can play in press or off-man coverage. He reads route concepts well and is rarely caught out of position.',
    ],
    raw: [
      '{name} has the athletic traits to develop into a quality cornerback but is raw in his technique. He gets grabby in coverage and needs to improve his ability to locate the ball.',
      '{name} has ideal size and speed for the position but needs to refine his footwork in transitions. He can get turned around on double moves.',
    ],
  },
  S: {
    elite: [
      '{name} is a versatile safety who excels in coverage and comes downhill with force against the run. He has center-field range and the instincts to jump routes for takeaways.',
      '{name} is an elite defensive back who can play single-high, in the box, or in the slot. His football IQ and playmaking ability set him apart from this class.',
    ],
    solid: [
      '{name} is a reliable safety who plays with good angles and solid tackling. He communicates well in the secondary and rarely gives up big plays.',
      '{name} brings good awareness and range to the safety position. He is physical against the run and dependable in zone coverage.',
    ],
    raw: [
      '{name} has the athleticism and size to develop at safety, but his read-and-react timing needs work. He can be late rotating to the ball and takes poor angles at times.',
      '{name} flashes big-play ability but is inconsistent in his positioning. He needs to improve his discipline against play-action and misdirection.',
    ],
  },
  K: {
    elite: [
      '{name} has one of the strongest legs in this draft class, consistently booming kicks from 50+ yards. He is automatic from inside 40 and handles pressure situations with poise.',
    ],
    solid: [
      '{name} is a reliable kicker who is consistent from inside 45 yards and has shown the ability to extend his range. He handles kickoff duties well.',
    ],
    raw: [
      '{name} has a big leg but his accuracy needs refinement, particularly from long range. His consistency under pressure is a question mark.',
    ],
  },
  P: {
    elite: [
      '{name} is an exceptional punter with outstanding hang time and directional control. He consistently pins opponents deep and is a true weapon in the field-position battle.',
    ],
    solid: [
      '{name} is a solid punter with good hang time and reasonable consistency. He handles poor snaps well and can execute rugby-style punts when needed.',
    ],
    raw: [
      '{name} has a strong leg but his directional punting and consistency need work. He can boom a long punt but also shanks one occasionally.',
    ],
  },
};

/* ─── Secondary modifiers appended to overview ───────────────── */

function overviewModifier(player: Player): string {
  const r = player.ratings;
  const pos = player.position;
  const parts: string[] = [];

  // Speed modifier
  if (pos !== 'OL' && pos !== 'K' && pos !== 'P') {
    if (r.speed >= 85) parts.push('His top-end speed is a true separator at the position.');
    else if (r.speed <= 45) parts.push('His lack of long speed is a concern at the next level.');
  }

  // Awareness modifier
  if (r.awareness >= 82) parts.push('His football IQ and processing speed are advanced for his age.');
  else if (r.awareness <= 40) parts.push('He needs to improve his mental processing and pre-snap reads.');

  // Scouting label modifier
  switch (player.scoutingLabel) {
    case 'Injury history':
      parts.push('Durability is a concern after dealing with injuries during his college career.');
      break;
    case 'Character concerns':
      parts.push('Off-field maturity will need to be evaluated thoroughly in the pre-draft process.');
      break;
    case 'Combine standout':
      parts.push('He turned heads at the combine with outstanding measurables that validated his tape.');
      break;
  }

  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

/* ─── Projection templates ───────────────────────────────────── */

function generateProjectionText(player: Player): string {
  const gap = player.potential - player.ratings.overall;
  const ovr = player.ratings.overall;

  if (ovr >= 78 && gap <= 5) {
    return `Projects as an immediate starter at the next level with All-Pro upside. His floor is high and he should contribute from day one.`;
  }
  if (ovr >= 78 && gap > 5) {
    return `Already a polished prospect with significant room to grow. If he reaches his ceiling, he could become an All-Pro caliber player.`;
  }
  if (ovr >= 65 && gap <= 5) {
    return `Projects as a solid starter or high-quality depth piece. What you see is what you get — a dependable contributor with a defined role.`;
  }
  if (ovr >= 65 && gap > 10) {
    return `A high-upside prospect with a wide range of outcomes. In the right system with patient coaching, he could develop into a difference-maker.`;
  }
  if (ovr >= 65) {
    return `Projects as a quality starter with room to develop. He has the tools to improve and could outperform his draft position.`;
  }
  if (gap > 15) {
    return `A developmental prospect with significant raw upside. He is a multi-year project but the physical tools suggest a high ceiling if everything clicks.`;
  }
  if (gap > 8) {
    return `A depth piece initially with developmental upside. He needs time to refine his skills but has the athletic foundation to grow.`;
  }
  return `A fringe roster prospect who will need to earn his spot in camp. Special teams ability and positional versatility will be key to sticking on a roster.`;
}

/* ─── Scout's Take ───────────────────────────────────────────── */

function generateScoutsTakeText(player: Player, seed: number): string {
  const ovr = player.ratings.overall;
  const pot = player.potential;
  const label = player.scoutingLabel;
  const parts: string[] = [];

  if (ovr >= 78) {
    parts.push(pick([
      `This is a blue-chip talent who should be a first-round lock.`,
      `Top of the board for me. You build around players like this.`,
      `Day-one starter with franchise-player potential.`,
    ], seed));
  } else if (ovr >= 65) {
    parts.push(pick([
      `A solid prospect who fills a need without a lot of risk.`,
      `Good value in the middle rounds. Should compete for a starting job early.`,
      `The kind of player who makes your roster better without breaking the bank.`,
    ], seed + 1));
  } else {
    parts.push(pick([
      `He is going to need time and coaching to reach his potential.`,
      `A late-round flier who could pay dividends if he develops.`,
      `Not a day-one contributor, but the upside is worth a look.`,
    ], seed + 2));
  }

  if (pot >= 85 && pot - ovr > 8) {
    parts.push('The ceiling here is tantalizing — if the work ethic matches the talent, watch out.');
  } else if (pot - ovr <= 3) {
    parts.push('What you see is pretty much what you get. He is who he is at this point.');
  }

  if (label === 'Pro-ready') {
    parts.push('He is pro-ready now and won\'t need a redshirt year.');
  } else if (label === 'Raw but explosive') {
    parts.push('The tools are loud, but he needs a team willing to invest in his development.');
  } else if (label === 'High motor') {
    parts.push('Coaches love the motor. This kid plays every snap like it is his last.');
  }

  return parts.join(' ');
}

/* ─── Strengths ──────────────────────────────────────────────── */

type StrengthRule = { key: keyof Player['ratings']; min: number; text: string };

const POSITION_STRENGTHS: Record<Position, StrengthRule[]> = {
  QB: [
    { key: 'throwing', min: 80, text: 'Elite arm talent with the ability to make every throw in the playbook.' },
    { key: 'throwing', min: 65, text: 'Accurate passer who puts the ball where his receivers can make plays.' },
    { key: 'awareness', min: 80, text: 'Excellent pre-snap processor who identifies defensive looks quickly.' },
    { key: 'awareness', min: 65, text: 'Reads the field well and generally makes good decisions with the football.' },
    { key: 'speed', min: 75, text: 'Dual-threat mobility that extends plays and creates with his legs.' },
    { key: 'agility', min: 75, text: 'Elusive in the pocket and avoids pressure with subtle movements.' },
    { key: 'strength', min: 70, text: 'Strong enough to deliver strikes while absorbing contact in the pocket.' },
  ],
  RB: [
    { key: 'carrying', min: 80, text: 'Elite ball carrier with outstanding vision and patience behind the line.' },
    { key: 'carrying', min: 65, text: 'Reliable runner who consistently falls forward and picks up tough yards.' },
    { key: 'speed', min: 80, text: 'Home-run speed that can take any carry to the house.' },
    { key: 'speed', min: 65, text: 'Good long speed to get to the corner and outrun pursuit angles.' },
    { key: 'agility', min: 80, text: 'Makes defenders miss in space with quick cuts and lateral agility.' },
    { key: 'catching', min: 70, text: 'Reliable pass catcher out of the backfield with soft hands.' },
    { key: 'strength', min: 75, text: 'Runs through arm tackles and powers through contact for extra yardage.' },
    { key: 'blocking', min: 65, text: 'Willing and capable pass protector who picks up blitzes effectively.' },
  ],
  WR: [
    { key: 'catching', min: 80, text: 'Outstanding hands and concentration — makes difficult catches look routine.' },
    { key: 'catching', min: 65, text: 'Reliable hands and consistent catching radius in traffic.' },
    { key: 'speed', min: 80, text: 'Blazing speed that stretches the defense and opens up the entire field.' },
    { key: 'speed', min: 65, text: 'Good straight-line speed to win on vertical routes and take the top off.' },
    { key: 'agility', min: 80, text: 'Exceptional route runner who creates separation with fluid breaks.' },
    { key: 'agility', min: 65, text: 'Smooth in and out of his cuts with the ability to win off the line.' },
    { key: 'awareness', min: 75, text: 'Finds soft spots in zone coverage and has a feel for getting open.' },
    { key: 'strength', min: 70, text: 'Physical at the catch point and wins contested catch situations.' },
  ],
  TE: [
    { key: 'catching', min: 80, text: 'Receiving ability that creates matchup problems for linebackers and safeties.' },
    { key: 'catching', min: 65, text: 'Reliable hands and the ability to make catches in traffic over the middle.' },
    { key: 'blocking', min: 80, text: 'Dominant inline blocker who creates movement at the point of attack.' },
    { key: 'blocking', min: 65, text: 'Willing blocker who sustains and finishes in the run game.' },
    { key: 'speed', min: 75, text: 'Rare speed for the position that allows him to stretch the seam.' },
    { key: 'strength', min: 75, text: 'Physical presence who can overwhelm smaller defenders after the catch.' },
    { key: 'awareness', min: 70, text: 'Good feel for finding voids in zone coverage and settling into open space.' },
  ],
  OL: [
    { key: 'blocking', min: 80, text: 'Technically refined pass protector with outstanding hand placement and timing.' },
    { key: 'blocking', min: 65, text: 'Sound fundamentals in pass protection with a good anchor.' },
    { key: 'strength', min: 80, text: 'Dominant power at the point of attack — drives defenders off the ball.' },
    { key: 'strength', min: 65, text: 'Strong enough to hold his ground against bull rushes and power moves.' },
    { key: 'agility', min: 70, text: 'Light feet for his size, handles speed rushers and pulls effectively.' },
    { key: 'awareness', min: 75, text: 'Excellent communication skills and ability to pick up stunts and blitzes.' },
    { key: 'speed', min: 65, text: 'Athletic enough to reach the second level and block in space.' },
  ],
  DL: [
    { key: 'passRush', min: 80, text: 'Devastating pass rusher with a refined repertoire of moves and counters.' },
    { key: 'passRush', min: 65, text: 'Productive pass rusher who gets after the quarterback with effort and technique.' },
    { key: 'strength', min: 80, text: 'Powerful at the point of attack — collapses the pocket with brute force.' },
    { key: 'strength', min: 65, text: 'Plays with good leverage and holds the point against double teams.' },
    { key: 'speed', min: 80, text: 'Elite first step and closing burst that overwhelms offensive tackles.' },
    { key: 'speed', min: 65, text: 'Good get-off that allows him to win with speed around the edge.' },
    { key: 'tackling', min: 70, text: 'Sure tackler who finishes plays in the backfield and sets the edge.' },
    { key: 'awareness', min: 70, text: 'Reads blocking schemes well and is rarely fooled by misdirection.' },
  ],
  LB: [
    { key: 'tackling', min: 80, text: 'Elite tackler who rarely misses — wraps up and finishes with authority.' },
    { key: 'tackling', min: 65, text: 'Sure tackler who fills gaps consistently and gets ball carriers on the ground.' },
    { key: 'coverage', min: 75, text: 'Covers backs and tight ends effectively and can match up in space.' },
    { key: 'coverage', min: 60, text: 'Shows enough coverage ability to stay on the field on third down.' },
    { key: 'speed', min: 80, text: 'Sideline-to-sideline range that allows him to make plays in pursuit.' },
    { key: 'speed', min: 65, text: 'Good closing speed to run down ball carriers from behind.' },
    { key: 'awareness', min: 75, text: 'Instinctive player who reads his keys quickly and triggers downhill.' },
    { key: 'passRush', min: 65, text: 'Effective blitzer who times his rushes well and creates pressure.' },
  ],
  CB: [
    { key: 'coverage', min: 80, text: 'Lockdown coverage ability with fluid hips and the length to blanket receivers.' },
    { key: 'coverage', min: 65, text: 'Stays in phase on routes and competes at the catch point with discipline.' },
    { key: 'speed', min: 80, text: 'Elite recovery speed that allows him to play tight and still recover on double moves.' },
    { key: 'speed', min: 65, text: 'Good enough speed to match up with most receivers on the outside.' },
    { key: 'agility', min: 80, text: 'Smooth hips and effortless transitions — mirrors routes like a shadow.' },
    { key: 'agility', min: 65, text: 'Clean footwork in his pedal and transitions that keeps him in position.' },
    { key: 'awareness', min: 75, text: 'Anticipates breaks from off-coverage and jumps routes for interceptions.' },
    { key: 'tackling', min: 65, text: 'Willing tackler who is physical at the line and supports in run defense.' },
  ],
  S: [
    { key: 'coverage', min: 80, text: 'Elite range and ball skills — plays center field with instinct and awareness.' },
    { key: 'coverage', min: 65, text: 'Reliable in zone coverage and communicates well with the secondary.' },
    { key: 'tackling', min: 80, text: 'Enforcer-level tackling who delivers big hits and discourages crossing routes.' },
    { key: 'tackling', min: 65, text: 'Sure open-field tackler who takes good angles to the ball.' },
    { key: 'speed', min: 80, text: 'Blazing range that allows him to cover sideline to sideline and close on the ball.' },
    { key: 'speed', min: 65, text: 'Good speed to recover in coverage and support from depth.' },
    { key: 'awareness', min: 75, text: 'Reads the quarterback well and triggers on the ball quickly.' },
    { key: 'passRush', min: 60, text: 'Effective blitzer from the secondary with good timing and closing speed.' },
  ],
  K: [
    { key: 'kicking', min: 80, text: 'Powerful, consistent leg with range well beyond 50 yards.' },
    { key: 'kicking', min: 65, text: 'Reliable from inside 45 yards with a clean, repeatable stroke.' },
    { key: 'awareness', min: 70, text: 'Poised under pressure — ice in his veins in clutch situations.' },
  ],
  P: [
    { key: 'kicking', min: 80, text: 'Outstanding hang time and directional control — a true weapon in the punt game.' },
    { key: 'kicking', min: 65, text: 'Consistent punter who pins opponents deep and controls field position.' },
    { key: 'awareness', min: 70, text: 'Handles bad snaps and pressure well, stays composed under duress.' },
  ],
};

/* ─── Weaknesses ─────────────────────────────────────────────── */

type WeaknessRule = { key: keyof Player['ratings']; max: number; text: string };

const POSITION_WEAKNESSES: Record<Position, WeaknessRule[]> = {
  QB: [
    { key: 'throwing', max: 55, text: 'Arm strength limits his ability to push the ball downfield consistently.' },
    { key: 'awareness', max: 55, text: 'Slow to process reads and struggles to get through progressions under pressure.' },
    { key: 'speed', max: 45, text: 'Lacks mobility — a sitting duck in the pocket when protection breaks down.' },
    { key: 'agility', max: 50, text: 'Stiff in the pocket and struggles to maneuver away from collapsing edges.' },
    { key: 'strength', max: 45, text: 'Slight frame that raises durability concerns at the pro level.' },
  ],
  RB: [
    { key: 'speed', max: 55, text: 'Lacks breakaway speed and won\'t hit many home runs at the next level.' },
    { key: 'carrying', max: 55, text: 'Ball security is a concern — fumbles under contact and in traffic.' },
    { key: 'catching', max: 45, text: 'Limited as a receiver out of the backfield — may come off the field on third down.' },
    { key: 'blocking', max: 40, text: 'Needs significant improvement in pass protection to earn three-down status.' },
    { key: 'agility', max: 50, text: 'Runs upright and lacks the lateral agility to make defenders miss.' },
  ],
  WR: [
    { key: 'catching', max: 55, text: 'Inconsistent hands — has concentration drops that hurt his reliability.' },
    { key: 'speed', max: 55, text: 'Limited deep speed that allows defensive backs to stay on his hip.' },
    { key: 'agility', max: 50, text: 'Stiff in his route breaks and struggles to create separation against press.' },
    { key: 'strength', max: 45, text: 'Gets pushed around by physical corners and loses at the catch point.' },
    { key: 'blocking', max: 35, text: 'Unwilling blocker who disappears in the run game.' },
  ],
  TE: [
    { key: 'blocking', max: 50, text: 'Gets washed out as an inline blocker and struggles to sustain at the point of attack.' },
    { key: 'catching', max: 50, text: 'Inconsistent hands and a limited route tree as a receiving option.' },
    { key: 'speed', max: 50, text: 'Lacks the speed to threaten the seam and will be schemed against by linebackers.' },
    { key: 'agility', max: 45, text: 'Stiff mover who won\'t create much separation at the pro level.' },
  ],
  OL: [
    { key: 'blocking', max: 55, text: 'Inconsistent technique — loses leverage and gets driven back too often.' },
    { key: 'strength', max: 55, text: 'Gets overwhelmed by power moves and bull rushes at the point of attack.' },
    { key: 'agility', max: 45, text: 'Heavy feet that struggle with speed rushers and lateral movement.' },
    { key: 'awareness', max: 50, text: 'Slow to pick up stunts and delayed on combo blocks to the second level.' },
  ],
  DL: [
    { key: 'passRush', max: 55, text: 'Limited pass-rush plan and lacks counter moves when his initial move fails.' },
    { key: 'strength', max: 50, text: 'Gets pushed around at the point of attack and washed out of his gap.' },
    { key: 'speed', max: 50, text: 'Lacks the first step and closing burst to consistently win off the edge.' },
    { key: 'tackling', max: 50, text: 'Overruns plays and misses tackles in the backfield when he has opportunities.' },
  ],
  LB: [
    { key: 'coverage', max: 50, text: 'Liability in coverage — can\'t match up with backs or tight ends in space.' },
    { key: 'speed', max: 50, text: 'Limited range and gets caught in pursuit when plays bounce outside.' },
    { key: 'tackling', max: 55, text: 'Misses too many tackles and doesn\'t finish in the open field.' },
    { key: 'awareness', max: 50, text: 'Takes false steps and is slow to process blocking schemes.' },
  ],
  CB: [
    { key: 'coverage', max: 55, text: 'Gets beat off the line and struggles to recover in man coverage.' },
    { key: 'speed', max: 55, text: 'Lacks the recovery speed to play tight coverage against faster receivers.' },
    { key: 'agility', max: 50, text: 'Tight hips that hinder his ability to flip and run with receivers downfield.' },
    { key: 'tackling', max: 45, text: 'Avoids contact and is a liability in run support.' },
    { key: 'awareness', max: 50, text: 'Bites on play-action and double moves too easily.' },
  ],
  S: [
    { key: 'coverage', max: 55, text: 'Gets caught out of position in zone and gives up plays behind him.' },
    { key: 'tackling', max: 50, text: 'Inconsistent tackler who whiffs in the open field too often.' },
    { key: 'speed', max: 50, text: 'Lacks the range to play single-high safety effectively.' },
    { key: 'awareness', max: 50, text: 'Slow to trigger on the ball and gets fooled by play-action.' },
  ],
  K: [
    { key: 'kicking', max: 55, text: 'Limited range — unreliable beyond 40 yards and inconsistent under pressure.' },
    { key: 'awareness', max: 45, text: 'Struggles with the mental side of kicking — collapses in high-pressure moments.' },
  ],
  P: [
    { key: 'kicking', max: 55, text: 'Inconsistent hang time and directional control — a liability in the punt game.' },
    { key: 'awareness', max: 45, text: 'Rattled by pressure and rushes his operation when the rush gets close.' },
  ],
};

/* ─── Label-driven extra bullets ─────────────────────────────── */

function labelStrength(label?: string): string | null {
  switch (label) {
    case 'Pro-ready': return 'Pro-ready polish — can step in and contribute immediately with minimal ramp-up.';
    case 'High motor': return 'Relentless motor and effort that elevates his game beyond his physical tools.';
    case 'Combine standout': return 'Exceptional measurables that tested off the charts at the combine.';
    default: return null;
  }
}

function labelWeakness(label?: string): string | null {
  switch (label) {
    case 'Injury history': return 'Durability concerns after a history of injuries that could limit his availability.';
    case 'Character concerns': return 'Off-field character red flags that require thorough vetting in the interview process.';
    case 'Raw but explosive': return 'Still very raw and could take 2-3 years of development before being a consistent contributor.';
    default: return null;
  }
}

/* ─── Section generators ─────────────────────────────────────── */

function generatePhysicalTraits(player: Player, showNumbers: boolean) {
  const r = player.ratings;
  const trait = (key: 'speed' | 'strength' | 'agility' | 'stamina') => ({
    value: showNumbers ? r[key] : null,
    label: tierLabel(r[key]),
  });
  return {
    speed: trait('speed'),
    strength: trait('strength'),
    agility: trait('agility'),
    stamina: trait('stamina'),
  };
}

function generateOverview(player: Player, seed: number): string {
  const pos = player.position;
  const primary = player.ratings[primaryKey(pos)];
  const templates = OVERVIEW_OPENERS[pos];
  const name = `${player.firstName} ${player.lastName}`;

  let tier: 'elite' | 'solid' | 'raw';
  if (primary >= 78) tier = 'elite';
  else if (primary >= 60) tier = 'solid';
  else tier = 'raw';

  const template = pick(templates[tier], seed).replace('{name}', name);
  return template + overviewModifier(player);
}

function generateStrengths(player: Player): string[] {
  const rules = POSITION_STRENGTHS[player.position];
  const bullets: string[] = [];

  for (const rule of rules) {
    if (player.ratings[rule.key] >= rule.min && bullets.length < 5) {
      // Only take the first matching rule per key to avoid duplicates
      if (!bullets.some(b => b === rule.text)) {
        bullets.push(rule.text);
      }
    }
  }

  const extra = labelStrength(player.scoutingLabel);
  if (extra && bullets.length < 5) bullets.push(extra);

  // Ensure at least 2 strengths
  if (bullets.length < 2) {
    const fallbacks = [
      'Shows flashes of ability that suggest untapped upside with development.',
      'Plays with effort and competitiveness on every snap.',
    ];
    while (bullets.length < 2) {
      bullets.push(fallbacks[bullets.length]);
    }
  }

  return bullets.slice(0, 5);
}

function generateWeaknesses(player: Player): string[] {
  const rules = POSITION_WEAKNESSES[player.position];
  const bullets: string[] = [];

  for (const rule of rules) {
    if (player.ratings[rule.key] <= rule.max && bullets.length < 4) {
      if (!bullets.some(b => b === rule.text)) {
        bullets.push(rule.text);
      }
    }
  }

  const extra = labelWeakness(player.scoutingLabel);
  if (extra && bullets.length < 4) bullets.push(extra);

  // Ensure at least 1 weakness
  if (bullets.length < 1) {
    bullets.push('No major weaknesses identified, though he will still need to adjust to the speed of the pro game.');
  }

  return bullets.slice(0, 4);
}

function getNflComparison(player: Player, seed: number): string {
  const comps = PLAYER_COMPARISONS[player.position];
  return pick(comps, seed);
}

/* ─── Public API ─────────────────────────────────────────────── */

export interface PhysicalTraitEntry {
  value: number | null;
  label: string;
}

/* ─── Combine Measurables (Elite only) ────────────────────── */

export interface CombineMeasurables {
  fortyYard: string;    // e.g. "4.42"
  vertical: string;     // e.g. "38.5\""
  benchPress: string;   // e.g. "22 reps"
  broadJump: string;    // e.g. "10'4\""
  threeCone: string;    // e.g. "6.89"
  shuttle: string;      // e.g. "4.18"
  height: string;       // e.g. "6'2\""
  weight: string;       // e.g. "218 lbs"
}

function generateCombineMeasurables(player: Player): CombineMeasurables {
  const r = player.ratings;
  const seed = player.scoutingSeed ?? seedFromId(player.id);

  // Heights by position (inches) — realistic ranges
  const heightBase: Record<Position, [number, number]> = {
    QB: [73, 77], RB: [68, 72], WR: [70, 76], TE: [75, 79],
    OL: [75, 79], DL: [74, 78], LB: [72, 76], CB: [69, 73],
    S: [70, 74], K: [71, 75], P: [73, 77],
  };
  // Weights by position (lbs)
  const weightBase: Record<Position, [number, number]> = {
    QB: [210, 235], RB: [195, 225], WR: [175, 215], TE: [240, 265],
    OL: [300, 335], DL: [260, 295], LB: [225, 255], CB: [180, 200],
    S: [195, 215], K: [185, 210], P: [200, 225],
  };

  const hRange = heightBase[player.position];
  const wRange = weightBase[player.position];
  const heightInches = hRange[0] + Math.round((hRange[1] - hRange[0]) * ((seed % 17) / 16));
  const weightLbs = wRange[0] + Math.round((wRange[1] - wRange[0]) * ((seed % 13) / 12));
  const heightFeet = Math.floor(heightInches / 12);
  const heightRemainder = heightInches % 12;

  // 40-yard dash: speed-driven (90→4.30, 40→5.10)
  const fortyBase = 5.10 - (r.speed - 40) * 0.016;
  const forty = Math.max(4.25, Math.min(5.20, fortyBase + ((seed % 7) - 3) * 0.02));

  // Vertical: speed+agility driven
  const vertBase = 24 + (r.speed + r.agility - 80) * 0.16;
  const vert = Math.max(26, Math.min(44, vertBase + ((seed % 5) - 2) * 1.5));

  // Bench press: strength-driven (reps)
  const benchBase = 10 + (r.strength - 40) * 0.3;
  const bench = Math.max(8, Math.min(35, Math.round(benchBase + ((seed % 9) - 4))));

  // Broad jump: speed+strength driven
  const broadBase = 106 + (r.speed + r.strength - 80) * 0.2;
  const broad = Math.max(100, Math.min(136, Math.round(broadBase + ((seed % 11) - 5))));
  const broadFeet = Math.floor(broad / 12);
  const broadInches = broad % 12;

  // 3-cone: agility-driven (lower is better)
  const threeConeBase = 7.50 - (r.agility - 40) * 0.015;
  const threeCone = Math.max(6.50, Math.min(7.60, threeConeBase + ((seed % 7) - 3) * 0.03));

  // Shuttle: agility+speed driven
  const shuttleBase = 4.60 - (r.agility + r.speed - 80) * 0.008;
  const shuttle = Math.max(3.90, Math.min(4.70, shuttleBase + ((seed % 7) - 3) * 0.02));

  return {
    fortyYard: forty.toFixed(2),
    vertical: `${vert.toFixed(1)}"`,
    benchPress: `${bench} reps`,
    broadJump: `${broadFeet}'${broadInches}"`,
    threeCone: threeCone.toFixed(2),
    shuttle: shuttle.toFixed(2),
    height: `${heightFeet}'${heightRemainder}"`,
    weight: `${weightLbs} lbs`,
  };
}

/* ─── Draft Grade (Elite only) ───────────────────────────── */

export interface DraftGrade {
  overall: string;        // "A+", "A", "B+", etc.
  floor: string;          // e.g. "Starter"
  ceiling: string;        // e.g. "All-Pro"
  confidence: string;     // "High", "Medium", "Low"
  riskLevel: string;      // "Low", "Medium", "High"
}

function generateDraftGrade(player: Player): DraftGrade {
  const ovr = player.ratings.overall;
  const pot = player.potential;
  const gap = pot - ovr;

  let overall: string;
  if (ovr >= 82) overall = 'A+';
  else if (ovr >= 78) overall = 'A';
  else if (ovr >= 74) overall = 'A-';
  else if (ovr >= 70) overall = 'B+';
  else if (ovr >= 65) overall = 'B';
  else if (ovr >= 60) overall = 'B-';
  else if (ovr >= 55) overall = 'C+';
  else if (ovr >= 50) overall = 'C';
  else overall = 'C-';

  let floor: string;
  if (ovr >= 78) floor = 'Starter';
  else if (ovr >= 65) floor = 'Rotational Player';
  else if (ovr >= 55) floor = 'Backup';
  else floor = 'Practice Squad';

  let ceiling: string;
  if (pot >= 90) ceiling = 'All-Pro';
  else if (pot >= 82) ceiling = 'All-Pro';
  else if (pot >= 74) ceiling = 'Quality Starter';
  else if (pot >= 65) ceiling = 'Starter';
  else ceiling = 'Backup';

  let confidence: string;
  if (gap <= 4) confidence = 'High';
  else if (gap <= 10) confidence = 'Medium';
  else confidence = 'Low';

  let riskLevel: string;
  const hasRedFlag = player.scoutingLabel === 'Injury history' || player.scoutingLabel === 'Character concerns';
  if (hasRedFlag || gap > 15) riskLevel = 'High';
  else if (gap > 8 || player.scoutingLabel === 'Raw but explosive') riskLevel = 'Medium';
  else riskLevel = 'Low';

  return { overall, floor, ceiling, confidence, riskLevel };
}

/* ─── Development Curve (Elite only) ─────────────────────── */

export interface DevelopmentCurve {
  year1: number;  // projected OVR after year 1
  year2: number;
  year3: number;
  peakAge: number;
  trajectory: 'Rapid Riser' | 'Steady Climber' | 'Slow Developer' | 'Near Ceiling';
}

function generateDevelopmentCurve(player: Player): DevelopmentCurve {
  const ovr = player.ratings.overall;
  const pot = player.potential;
  const gap = pot - ovr;

  // Simulate dev progression (simplified version of the actual dev engine)
  const yearlyGrowth = gap > 0 ? Math.min(gap, Math.max(1, gap * 0.35)) : 0;
  const year1 = Math.round(Math.min(pot, ovr + yearlyGrowth));
  const year2Gap = pot - year1;
  const year2 = Math.round(Math.min(pot, year1 + (year2Gap > 0 ? Math.max(1, year2Gap * 0.35) : 0)));
  const year3Gap = pot - year2;
  const year3 = Math.round(Math.min(pot, year2 + (year3Gap > 0 ? Math.max(1, year3Gap * 0.35) : 0)));

  // Peak age estimate
  const peakAge = player.age <= 22 ? 27 : player.age <= 24 ? 26 : 25;

  let trajectory: DevelopmentCurve['trajectory'];
  if (gap <= 3) trajectory = 'Near Ceiling';
  else if (yearlyGrowth >= 5) trajectory = 'Rapid Riser';
  else if (yearlyGrowth >= 3) trajectory = 'Steady Climber';
  else trajectory = 'Slow Developer';

  return { year1, year2, year3, peakAge, trajectory };
}

/* ─── Character & Intangibles (Elite only) ───────────────── */

export interface CharacterReport {
  workEthic: string;       // "Elite", "Strong", "Average", "Questionable"
  leadership: string;      // "Captain Material", "Vocal Leader", "Quiet Professional", "Follower"
  coachability: string;    // "Highly Coachable", "Receptive", "Stubborn", "Resistant"
  competitiveness: string; // "Alpha Competitor", "Competitive", "Passive", "Disengaged"
  notes: string;           // 1-2 sentence character summary
}

function generateCharacterReport(player: Player): CharacterReport {
  const seed = player.scoutingSeed ?? seedFromId(player.id);
  const label = player.scoutingLabel;
  const awareness = player.ratings.awareness;

  // Work ethic correlates with awareness and label
  let workEthic: string;
  if (label === 'High motor' || awareness >= 85) workEthic = 'Elite';
  else if (label === 'Pro-ready' || awareness >= 70) workEthic = 'Strong';
  else if (label === 'Character concerns') workEthic = 'Questionable';
  else workEthic = 'Average';

  // Leadership
  const leadershipPool = awareness >= 80
    ? ['Captain Material', 'Vocal Leader']
    : awareness >= 60
      ? ['Vocal Leader', 'Quiet Professional']
      : ['Quiet Professional', 'Follower'];
  const leadership = pick(leadershipPool, seed + 3);

  // Coachability
  let coachability: string;
  if (label === 'Pro-ready' || label === 'High motor') coachability = 'Highly Coachable';
  else if (label === 'Character concerns') coachability = pick(['Stubborn', 'Resistant'], seed + 5);
  else if (awareness >= 65) coachability = 'Receptive';
  else coachability = pick(['Receptive', 'Stubborn'], seed + 7);

  // Competitiveness
  let competitiveness: string;
  if (label === 'High motor' || label === 'Combine standout') competitiveness = 'Alpha Competitor';
  else if (awareness >= 70) competitiveness = 'Competitive';
  else competitiveness = pick(['Competitive', 'Passive'], seed + 9);

  // Character notes
  const noteOptions: string[] = [];
  if (label === 'Character concerns') {
    noteOptions.push(
      'Multiple team sources have flagged maturity concerns. Will need a strong locker room and veteran mentorship to stay on track.',
      'Off-field issues have been well-documented. His talent is undeniable, but the organization must be willing to invest in accountability structures.',
    );
  } else if (label === 'High motor') {
    noteOptions.push(
      'Universally praised by coaches and teammates for his relentless work ethic. First one in, last one out. The kind of player who elevates everyone around him.',
      'Film-room junkie who prepares like a 10-year vet. Coaches rave about his dedication and professionalism beyond his years.',
    );
  } else if (label === 'Pro-ready') {
    noteOptions.push(
      'Mature beyond his years with a professional approach to the game. Should have no issues adjusting to the demands of a pro schedule.',
      'Clean background, team captain, and a model citizen. Organizations will love the low-maintenance personality and high-character makeup.',
    );
  } else if (label === 'Injury history') {
    noteOptions.push(
      'Talented player whose biggest question mark is durability. When healthy, the talent is obvious — the concern is whether he can stay on the field.',
      'Medical staff will need to do extensive evaluation. The injuries are not catastrophic individually, but the pattern is concerning for long-term availability.',
    );
  } else if (label === 'Raw but explosive') {
    noteOptions.push(
      'A boom-or-bust personality who plays with raw emotion. The passion is a double-edged sword — electric when channeled, problematic when it boils over.',
      'Needs the right coaching staff and environment to reach his potential. Has all the tools but requires patience and a structured development plan.',
    );
  } else {
    noteOptions.push(
      'Low-maintenance player who does his job without drama. No red flags in the background check. Should fit into any locker room seamlessly.',
      'Solid character with no concerns. Interviews well and comes across as a team-first player who will earn the respect of his peers.',
    );
  }
  const notes = pick(noteOptions, seed + 11);

  return { workEthic, leadership, coachability, competitiveness, notes };
}

/* ─── Public API ─────────────────────────────────────────────── */

export interface ScoutingReport {
  nflComparison: string | null;
  overview: string | null;
  physicalTraits: {
    speed: PhysicalTraitEntry;
    strength: PhysicalTraitEntry;
    agility: PhysicalTraitEntry;
    stamina: PhysicalTraitEntry;
  } | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  projection: string | null;
  scoutsTake: string | null;
  combineMeasurables: CombineMeasurables | null;
  draftGrade: DraftGrade | null;
  developmentCurve: DevelopmentCurve | null;
  characterReport: CharacterReport | null;
}

export function generateScoutingReport(
  player: Player,
  scoutingLevel: 0 | 1 | 2,
  deepScouted: boolean,
): ScoutingReport {
  const effectiveLevel = deepScouted
    ? (Math.min(2, scoutingLevel + 1) as 0 | 1 | 2)
    : scoutingLevel;

  const seed = player.scoutingSeed ?? seedFromId(player.id);

  // 3-tier model:
  //   Entry (0): Physical traits only (vague labels, no numbers)
  //   Pro   (1): Overview, strengths (max 3), Player comparison, scouted ratings (grades only), trait numbers
  //   Elite (2): Everything — full strengths (5) + weaknesses, exact ratings, projection, scout's take,
  //              combine measurables, draft grade, development curve, character report
  return {
    physicalTraits: generatePhysicalTraits(player, effectiveLevel >= 1),
    overview: effectiveLevel >= 1 ? generateOverview(player, seed) : null,
    strengths: effectiveLevel >= 1 ? generateStrengths(player).slice(0, effectiveLevel >= 2 ? 5 : 3) : null,
    weaknesses: effectiveLevel >= 2 ? generateWeaknesses(player) : null,
    nflComparison: effectiveLevel >= 1 ? getNflComparison(player, seed) : null,
    projection: effectiveLevel >= 2 ? generateProjectionText(player) : null,
    scoutsTake: effectiveLevel >= 2 ? generateScoutsTakeText(player, seed) : null,
    combineMeasurables: effectiveLevel >= 2 ? generateCombineMeasurables(player) : null,
    draftGrade: effectiveLevel >= 2 ? generateDraftGrade(player) : null,
    developmentCurve: effectiveLevel >= 2 ? generateDevelopmentCurve(player) : null,
    characterReport: effectiveLevel >= 2 ? generateCharacterReport(player) : null,
  };
}

/** Returns the scouting level name needed to unlock a given section. */
export function unlockLevelName(section: 'overview' | 'strengths' | 'comparison' | 'weaknesses' | 'combine' | 'draftGrade' | 'devCurve' | 'character' | 'scoutsTake'): string {
  switch (section) {
    case 'overview': return 'Pro';
    case 'strengths': return 'Pro';
    case 'comparison': return 'Pro';
    case 'weaknesses': return 'Elite';
    case 'combine': return 'Elite';
    case 'draftGrade': return 'Elite';
    case 'devCurve': return 'Elite';
    case 'character': return 'Elite';
    case 'scoutsTake': return 'Elite';
  }
}
