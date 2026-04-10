import type { Player, Team, GameResult, SocialPost } from '@/types';

function uuid(): string { return crypto.randomUUID(); }

function seedHash(s: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number): T { return arr[seed % arr.length]; }

function playerHandle(p: Player): string {
  return `@${p.firstName[0]}${p.lastName}${(seedHash(p.id, 0) % 90) + 10}`;
}

const FAN_HANDLES = [
  '@GridironFanatic', '@CapSpaceKing', '@TankNation', '@DraftSzn',
  '@FireTheCoach', '@RingChaser2026', '@NFLCTakes', '@FantasyGuru',
  '@TradeSeason', '@RookieWatch', '@SundayCouch', '@PlayoffPush',
  '@Armchair_GM', '@RedZoneJunkie', '@TailgateTom', '@BleacherBum42',
  '@CoachKiller99', '@SnapCountNerd', '@FranchiseMode', '@PracticeSquadFan',
];

function generateEngagement(
  authorType: string,
  verified: boolean,
  priority: number,
  seed: number,
) {
  const base =
    authorType === 'media' ? 5000 :
    authorType === 'team' ? 3000 :
    verified ? 2000 :
    authorType === 'player' ? 500 : 100;
  const mult = priority / 50;
  const variance = 0.5 + (seed % 100) / 100;
  return {
    likes: Math.round(base * mult * variance),
    reposts: Math.round(base * mult * variance * 0.15),
    replies: Math.round(base * mult * variance * 0.25),
  };
}

interface SocialInput {
  team: Team;
  roster: Player[];
  allTeams: Team[];
  players: Player[];
  season: number;
  week: number;
  games: GameResult[];
}

interface RawPost {
  priority: number;
  category: SocialPost['category'];
  authorType: SocialPost['author']['type'];
  personId?: SocialPost['author']['personId'];
  playerId?: string;
  name: string;
  handle: string;
  avatar: string;
  verified: boolean;
  text: string;
  action?: SocialPost['action'];
  teamId?: string;
}

export function generateSocialPosts(input: SocialInput): SocialPost[] {
  const { team, roster, allTeams, season, week, games } = input;
  const raw: RawPost[] = [];

  // Helpers
  const wpGames = team.record.wins + team.record.losses + team.record.ties;
  const winPct = wpGames > 0 ? (team.record.wins + team.record.ties * 0.5) / wpGames : 0.5;

  // This week's user game
  const userGame = games.find(
    g => g.played && (g.homeTeamId === team.id || g.awayTeamId === team.id),
  );
  const userWon = userGame
    ? (userGame.homeTeamId === team.id ? userGame.homeScore > userGame.awayScore : userGame.awayScore > userGame.homeScore)
    : false;
  const userLost = userGame ? !userWon && userGame.homeScore !== userGame.awayScore : false;
  const closeLoss = userGame && userLost && Math.abs(userGame.homeScore - userGame.awayScore) <= 3;

  // Find top performer for user team this week
  let topPerformer: Player | null = null;
  if (userGame) {
    let bestScore = 0;
    for (const p of roster) {
      const ps = userGame.playerStats[p.id];
      if (!ps) continue;
      const score = (ps.passYards ?? 0) * 0.04 + (ps.passTDs ?? 0) * 4 + (ps.rushYards ?? 0) * 0.1 +
        (ps.rushTDs ?? 0) * 6 + (ps.receivingYards ?? 0) * 0.1 + (ps.receivingTDs ?? 0) * 6 +
        (ps.sacks ?? 0) * 3 + (ps.defensiveINTs ?? 0) * 5 + (ps.tackles ?? 0) * 0.5;
      if (score > bestScore) {
        bestScore = score;
        topPerformer = p;
      }
    }
  }

  // Market salary estimate (inline simplified)
  function estimateMarketSalary(p: Player): number {
    const ovr = p.ratings.overall;
    if (ovr >= 85) return 20 + (ovr - 85) * 2;
    if (ovr >= 75) return 8 + (ovr - 75) * 1.2;
    if (ovr >= 65) return 2 + (ovr - 65) * 0.6;
    return 0.75 + (ovr - 50) * 0.08;
  }

  // ── Player Posts ──────────────────────────────────────────────
  const holdoutTemplates = [
    "Not about the money. It's about RESPECT. 💯",
    "I've earned this. Period.",
    "Know what I bring to this team. Time to show it in the contract.",
    "Can't keep playing at this level on this deal. Something's gotta change.",
  ];
  const veryUnhappyTemplates = [
    "Sometimes you gotta put yourself first. 🤷",
    "Not everything is in my control, but my effort will never change.",
    "Silence speaks volumes. Just know that.",
    "Tough times don't last. Tough people do.",
  ];
  const underpaidTemplates = [
    "Know your worth. Then add tax. 💰",
    "Betting on myself every single day.",
    "Numbers don't lie. I've outplayed this contract.",
    "Working like a $30M player on a rookie deal.",
  ];
  const unhappyTemplates = [
    "Can't control what I can't control. 🤐",
    "Head down. Work hard. Stay ready.",
    "Some things are bigger than football... but football is pretty big.",
  ];
  const bigGameTemplates = [
    "When the work pays off >>> 🔥",
    "Built different. 💪",
    "Sundays are my office. Clocked in today.",
    "This is what they drafted me for.",
  ];
  const happyTemplates = [
    "This team is special. 🏈",
    "Grateful to be part of something real.",
    "Brotherhood. That's all I'll say.",
    "Best locker room in the league. Don't @ me.",
  ];

  for (const p of roster) {
    if (p.retired || p.injury) continue;
    const pSeed = seedHash(p.id, season * 100 + week);
    const market = estimateMarketSalary(p);
    const salaryRatio = market > 0 ? market / Math.max(p.contract.salary, 0.5) : 1;

    if (p.holdout) {
      raw.push({
        priority: 100,
        category: 'player',
        authorType: 'player',
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        handle: playerHandle(p),
        avatar: p.position,
        verified: p.ratings.overall >= 75,
        text: pick(holdoutTemplates, pSeed),
        action: { label: 'Extend', type: 'extend', playerId: p.id },
      });
    } else if (p.mood < 25) {
      raw.push({
        priority: 85,
        category: 'player',
        authorType: 'player',
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        handle: playerHandle(p),
        avatar: p.position,
        verified: p.ratings.overall >= 75,
        text: pick(veryUnhappyTemplates, pSeed),
        action: { label: 'View Player', type: 'viewPlayer', playerId: p.id },
      });
    } else if (salaryRatio >= 2) {
      raw.push({
        priority: 80,
        category: 'player',
        authorType: 'player',
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        handle: playerHandle(p),
        avatar: p.position,
        verified: p.ratings.overall >= 75,
        text: pick(underpaidTemplates, pSeed),
        action: { label: 'Extend', type: 'extend', playerId: p.id },
      });
    } else if (p.mood < 50) {
      raw.push({
        priority: 70,
        category: 'player',
        authorType: 'player',
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        handle: playerHandle(p),
        avatar: p.position,
        verified: p.ratings.overall >= 75,
        text: pick(unhappyTemplates, pSeed),
      });
    } else if (topPerformer && topPerformer.id === p.id) {
      raw.push({
        priority: 75,
        category: 'player',
        authorType: 'player',
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        handle: playerHandle(p),
        avatar: p.position,
        verified: p.ratings.overall >= 75,
        text: pick(bigGameTemplates, pSeed),
      });
    } else if (p.mood >= 65 && winPct >= 0.5) {
      raw.push({
        priority: 50,
        category: 'player',
        authorType: 'player',
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        handle: playerHandle(p),
        avatar: p.position,
        verified: p.ratings.overall >= 75,
        text: pick(happyTemplates, pSeed),
      });
    }
  }

  // ── Fan Posts ─────────────────────────────────────────────────
  const fanWinTemplates = [
    `This team is DIFFERENT this year 🔥`,
    `I've been a fan for 20 years and this is the best roster we've ever had`,
    `Playoff bound, book it 📖`,
    `We are LEGIT`,
  ];
  const fanLoseTemplates = [
    `Fire the coach. Trade everyone. Start over.`,
    `This franchise is CURSED`,
    `I can't watch this anymore 😤`,
    `Blow it up. Full tank. Get the #1 pick.`,
  ];
  const fanCloseTemplates = [
    `We were RIGHT THERE. This hurts. 😢`,
    `That loss is gonna haunt me all week`,
    `If ONE play goes different we win that game`,
    `So close. So frustrating.`,
  ];

  const fanSeed = seedHash(team.id, season * 100 + week);
  const fanHandle = pick(FAN_HANDLES, fanSeed);
  const fanName = fanHandle.replace('@', '');

  if (winPct >= 0.6) {
    raw.push({
      priority: 65,
      category: 'fan',
      authorType: 'fan',
      name: fanName,
      handle: fanHandle,
      avatar: 'fan',
      verified: false,
      text: pick(fanWinTemplates, fanSeed),
    });
  }
  if (winPct < 0.35 && wpGames >= 3) {
    raw.push({
      priority: 70,
      category: 'fan',
      authorType: 'fan',
      name: fanName,
      handle: fanHandle,
      avatar: 'fan',
      verified: false,
      text: pick(fanLoseTemplates, fanSeed),
    });
  }
  if (closeLoss) {
    const closeFanSeed = seedHash(team.id + 'close', season * 100 + week);
    const closeFanHandle = pick(FAN_HANDLES, closeFanSeed);
    raw.push({
      priority: 65,
      category: 'fan',
      authorType: 'fan',
      name: closeFanHandle.replace('@', ''),
      handle: closeFanHandle,
      avatar: 'fan',
      verified: false,
      text: pick(fanCloseTemplates, closeFanSeed),
    });
  }

  // ── Tony Blaze (media personality) ────────────────────────────
  const unhappyPlayers = roster.filter(p => !p.retired && (p.mood ?? 70) < 50);
  const underpaidStar = roster.find(p => !p.retired && p.ratings.overall >= 80 && estimateMarketSalary(p) / Math.max(p.contract.salary, 0.5) >= 1.5);

  const tonyBigWinTemplates = [
    `STATEMENT GAME by the ${team.city} ${team.name}. That's a CHAMPIONSHIP-caliber performance. 🎤`,
    `The ${team.name} just put the LEAGUE on notice. I've been telling y'all.`,
    `That's what I'm talking about! The ${team.name} are FOR REAL.`,
  ];
  const tonyBadLossTemplates = [
    `That was EMBARRASSING for the ${team.city} ${team.name}. No other word for it. 🤦`,
    `I don't even know what to say about the ${team.name} after that performance.`,
    `Somebody needs to be held accountable in ${team.city}. That was UNACCEPTABLE.`,
  ];
  const tonyBlazeSeed = seedHash('tony_' + team.id, season * 100 + week);

  if (unhappyPlayers.length >= 2 && week % 3 === 0) {
    // Only post locker room reports every ~3 weeks to avoid repetition
    const tonyUnhappyTemplates = [
      `I'm hearing things out of ${team.city}... and it's NOT good. Multiple players are UNHAPPY. This could get ugly. 👀`,
      `Somebody in the ${team.name} front office needs to wake up. ${unhappyPlayers.length} players frustrated and nobody's doing anything about it. 🚨`,
      `The vibes in ${team.city} are OFF. Talked to a source close to the team — morale is at an all-time low. Something's gotta give.`,
      `You can only ignore unhappy players for so long. The ${team.name} have a LOCKER ROOM problem and everyone knows it except apparently their GM.`,
      `${unhappyPlayers.length} frustrated players on one roster? That's not bad luck — that's bad MANAGEMENT. Fix it or lose them. Period.`,
    ];
    raw.push({
      priority: 82,
      category: 'media',
      authorType: 'media',
      personId: 'tony_blaze',
      name: 'Tony Blaze',
      handle: '@TonyBlazeShow',
      avatar: 'media_tony',
      verified: true,
      text: pick(tonyUnhappyTemplates, tonyBlazeSeed),
    });
  } else if (underpaidStar) {
    const underpaidTemplates = [
      `${underpaidStar.firstName} ${underpaidStar.lastName} is playing on a JOKE of a contract. $${underpaidStar.contract.salary.toFixed(1)}M for a ${underpaidStar.ratings.overall} OVR ${underpaidStar.position}?! PAY THAT MAN. 💰`,
      `How is ${underpaidStar.lastName} still making $${underpaidStar.contract.salary.toFixed(1)}M?! He's a ${underpaidStar.ratings.overall} OVR ${underpaidStar.position}! That contract is CRIMINAL. Front office needs to fix this YESTERDAY.`,
      `I'm going to keep saying it until they listen — ${underpaidStar.firstName} ${underpaidStar.lastName} at $${underpaidStar.contract.salary.toFixed(1)}M is the biggest steal in the league. But if they don't extend him, someone else WILL. 💰`,
      `Every week ${underpaidStar.lastName} goes out there and plays like a top ${underpaidStar.position} in the league for pocket change. $${underpaidStar.contract.salary.toFixed(1)}M?! This man deserves a BRINKS truck!`,
      `Sources tell me ${underpaidStar.firstName} ${underpaidStar.lastName}'s camp is getting restless about that $${underpaidStar.contract.salary.toFixed(1)}M deal. And honestly? Can you BLAME them? He's a ${underpaidStar.ratings.overall} OVR ${underpaidStar.position}!`,
    ];
    raw.push({
      priority: 80,
      category: 'media',
      authorType: 'media',
      personId: 'tony_blaze',
      name: 'Tony Blaze',
      handle: '@TonyBlazeShow',
      avatar: 'media_tony',
      verified: true,
      text: pick(underpaidTemplates, tonyBlazeSeed),
      action: { label: 'Extend', type: 'extend', playerId: underpaidStar.id },
    });
  } else if (userWon && userGame && Math.abs(userGame.homeScore - userGame.awayScore) >= 14) {
    raw.push({
      priority: 70,
      category: 'media',
      authorType: 'media',
      personId: 'tony_blaze',
      name: 'Tony Blaze',
      handle: '@TonyBlazeShow',
      avatar: 'media_tony',
      verified: true,
      text: pick(tonyBigWinTemplates, tonyBlazeSeed),
    });
  } else if (userLost && userGame && Math.abs(userGame.homeScore - userGame.awayScore) >= 14) {
    raw.push({
      priority: 68,
      category: 'media',
      authorType: 'media',
      personId: 'tony_blaze',
      name: 'Tony Blaze',
      handle: '@TonyBlazeShow',
      avatar: 'media_tony',
      verified: true,
      text: pick(tonyBadLossTemplates, tonyBlazeSeed),
    });
  }

  // ── Marcus Cole (analytics media) ────────────────────────────
  const marcusSeed = seedHash('marcus_' + team.id, season * 100 + week);

  if (userGame) {
    // Point differential ranking
    const teamDiffs = allTeams.map(t => ({
      id: t.id,
      diff: t.record.pointsFor - t.record.pointsAgainst,
      abbr: t.abbreviation,
    })).sort((a, b) => b.diff - a.diff);
    const userRank = teamDiffs.findIndex(t => t.id === team.id) + 1;
    const ordSuffix = userRank === 1 ? 'st' : userRank === 2 ? 'nd' : userRank === 3 ? 'rd' : 'th';
    const diffSign = team.record.pointsFor - team.record.pointsAgainst >= 0 ? '+' : '';
    const diff = team.record.pointsFor - team.record.pointsAgainst;
    const gp = team.record.wins + team.record.losses;
    const ppg = gp > 0 ? (team.record.pointsFor / gp).toFixed(1) : '0';
    const oppPpg = gp > 0 ? (team.record.pointsAgainst / gp).toFixed(1) : '0';

    const marcusGameTemplates = [
      `${team.abbreviation} now ${userRank}${ordSuffix} in point differential (${diffSign}${diff}). ${winPct >= 0.6 ? 'Sustainable winning.' : winPct <= 0.4 ? 'The numbers suggest trouble ahead.' : 'Right in the middle of the pack.'}`,
      `${team.abbreviation} scoring ${ppg} PPG, allowing ${oppPpg}. Net: ${diffSign}${diff} (${userRank}${ordSuffix} league-wide). ${winPct >= 0.6 ? 'The efficiency metrics are elite.' : winPct <= 0.4 ? 'Regression is inevitable with these margins.' : 'A team in search of an identity.'}`,
      `Interesting data point: ${team.abbreviation} at ${team.record.wins}-${team.record.losses} with a ${diffSign}${diff} differential. ${diff > 20 ? 'They\'re winning and the margins back it up.' : diff > 0 ? 'Positive differential but not by much — close games could swing either way.' : diff > -20 ? 'Slightly negative — they\'re closer than the record suggests.' : 'The underlying numbers are concerning.'}`,
      `The ${team.abbreviation} profile: ${ppg} points scored, ${oppPpg} allowed. That's ${userRank}${ordSuffix} in the league by differential. ${winPct >= 0.55 ? 'Process matches results.' : winPct >= 0.45 ? 'Could go either way down the stretch.' : 'Hard to see a path forward without improvement.'}`,
      `Week ${week} update: ${team.abbreviation} sits at ${diffSign}${diff} in point differential (${userRank}${ordSuffix}). ${diff > 30 ? 'Dominant on both sides of the ball.' : diff > 0 ? 'Outscoring opponents but not by a runaway margin.' : 'Being outscored — the wins have been close, the losses haven\'t.'}`,
    ];

    raw.push({
      priority: 60,
      category: 'media',
      authorType: 'media',
      personId: 'marcus_cole',
      name: 'Marcus Cole',
      handle: '@MarcusColeNFL',
      avatar: 'media_marcus',
      verified: true,
      text: pick(marcusGameTemplates, marcusSeed),
    });
  } else if (underpaidStar) {
    const market = estimateMarketSalary(underpaidStar);
    const valMult = (market / Math.max(underpaidStar.contract.salary, 0.5)).toFixed(1);
    const marcusUnderpaidTemplates = [
      `By the numbers: ${underpaidStar.firstName} ${underpaidStar.lastName} is producing at a $${market.toFixed(1)}M level while earning $${underpaidStar.contract.salary.toFixed(1)}M. That's a ${valMult}x value multiplier.`,
      `${underpaidStar.lastName}'s contract ($${underpaidStar.contract.salary.toFixed(1)}M) vs. market value ($${market.toFixed(1)}M) is one of the biggest discrepancies in the league. A ${valMult}x return on investment.`,
      `Fun fact: ${underpaidStar.firstName} ${underpaidStar.lastName} is generating $${market.toFixed(1)}M worth of production on a $${underpaidStar.contract.salary.toFixed(1)}M deal. By any metric, that's elite value management — or a ticking clock before he demands more.`,
      `The ${underpaidStar.lastName} situation in one number: ${valMult}x. That's how much more he's worth ($${market.toFixed(1)}M) than what he's being paid ($${underpaidStar.contract.salary.toFixed(1)}M). Extension talks should be a priority.`,
    ];
    raw.push({
      priority: 60,
      category: 'media',
      authorType: 'media',
      personId: 'marcus_cole',
      name: 'Marcus Cole',
      handle: '@MarcusColeNFL',
      avatar: 'media_marcus',
      verified: true,
      text: pick(marcusUnderpaidTemplates, marcusSeed),
      action: { label: 'Extend', type: 'extend', playerId: underpaidStar.id },
    });
  }

  // ── Team Account ──────────────────────────────────────────────
  if (userGame) {
    const isHome = userGame.homeTeamId === team.id;
    const teamScore = isHome ? userGame.homeScore : userGame.awayScore;
    const oppScore = isHome ? userGame.awayScore : userGame.homeScore;
    const oppId = isHome ? userGame.awayTeamId : userGame.homeTeamId;
    const opp = allTeams.find(t => t.id === oppId);
    const result = userWon ? 'W' : userLost ? 'L' : 'T';

    // Try to find next week's opponent
    const nextWeekGames = input.games.filter(g => g.week === week + 1 && !g.played);
    const nextGame = nextWeekGames.find(g => g.homeTeamId === team.id || g.awayTeamId === team.id);
    const nextOppId = nextGame ? (nextGame.homeTeamId === team.id ? nextGame.awayTeamId : nextGame.homeTeamId) : null;
    const nextOpp = nextOppId ? allTeams.find(t => t.id === nextOppId) : null;

    raw.push({
      priority: 35,
      category: 'team',
      authorType: 'team',
      teamId: team.id,
      name: `${team.city} ${team.name}`,
      handle: `@${team.abbreviation}`,
      avatar: 'team',
      verified: true,
      text: `${result}, ${teamScore}-${oppScore} vs ${opp?.abbreviation ?? 'OPP'}.${nextOpp ? ` Next up: ${nextOpp.abbreviation}.` : ' #OnToTheNext'}`,
    });
  }

  // ── Sort by priority and deduplicate ──────────────────────────
  raw.sort((a, b) => b.priority - a.priority);

  const selected: RawPost[] = [];
  let playerCount = 0;
  let fanCount = 0;
  let tonyCount = 0;
  let marcusCount = 0;
  let teamCount = 0;

  for (const post of raw) {
    if (selected.length >= 8) break;
    if (post.category === 'player' && playerCount >= 2) continue;
    if (post.category === 'fan' && fanCount >= 2) continue;
    if (post.personId === 'tony_blaze' && tonyCount >= 1) continue;
    if (post.personId === 'marcus_cole' && marcusCount >= 1) continue;
    if (post.category === 'team' && teamCount >= 1) continue;

    selected.push(post);
    if (post.category === 'player') playerCount++;
    if (post.category === 'fan') fanCount++;
    if (post.personId === 'tony_blaze') tonyCount++;
    if (post.personId === 'marcus_cole') marcusCount++;
    if (post.category === 'team') teamCount++;
  }

  // Must have at least 5 if possible
  if (selected.length < 5) {
    for (const post of raw) {
      if (selected.length >= 5) break;
      if (selected.includes(post)) continue;
      selected.push(post);
    }
  }

  // Convert to SocialPost[]
  return selected.map(post => {
    const engSeed = seedHash((post.playerId ?? post.handle) + season + week, season * week);
    const eng = generateEngagement(post.authorType, post.verified, post.priority, engSeed);
    return {
      id: uuid(),
      author: {
        type: post.authorType,
        playerId: post.playerId,
        personId: post.personId,
        teamId: post.teamId,
        name: post.name,
        handle: post.handle,
        avatar: post.avatar,
        verified: post.verified,
      },
      text: post.text,
      timestamp: { season, week },
      likes: eng.likes,
      reposts: eng.reposts,
      replies: eng.replies,
      action: post.action,
      category: post.category,
    };
  });
}
