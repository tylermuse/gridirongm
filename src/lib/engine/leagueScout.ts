/**
 * League scouting packet — Premium-only context for the Call-In show.
 *
 * The team packet (buildSpotlightTeamData) tells the hosts about YOUR team.
 * This tells them about everyone else, so "who should I go get" has real
 * answers: sellers, expiring contracts, buried backups, the trade market,
 * and the free-agent pool. Built client-side from the Zustand store; sent
 * only on Premium turns. Target ≈ 4–5K tokens.
 */

import type { Team, Player, TradeRumor, Position } from '@/types';

const POS_WORDS: Record<string, Position> = {
  qb: 'QB', quarterback: 'QB', quarterbacks: 'QB', passer: 'QB',
  rb: 'RB', 'running back': 'RB', 'running backs': 'RB', back: 'RB', backs: 'RB', rusher: 'RB',
  wr: 'WR', receiver: 'WR', receivers: 'WR', 'wide receiver': 'WR', wideout: 'WR', weapons: 'WR',
  te: 'TE', 'tight end': 'TE', 'tight ends': 'TE',
  ol: 'OL', 'o-line': 'OL', 'offensive line': 'OL', tackle: 'OL', guard: 'OL', center: 'OL', lineman: 'OL', linemen: 'OL', protection: 'OL',
  dl: 'DL', 'd-line': 'DL', 'defensive line': 'DL', 'pass rush': 'DL', 'pass rusher': 'DL', edge: 'DL', 'defensive end': 'DL', 'defensive tackle': 'DL',
  lb: 'LB', linebacker: 'LB', linebackers: 'LB',
  cb: 'CB', corner: 'CB', corners: 'CB', cornerback: 'CB', cornerbacks: 'CB',
  s: 'S', safety: 'S', safeties: 'S', secondary: 'CB',
  k: 'K', kicker: 'K', p: 'P', punter: 'P',
};

/** Detect which position(s) a caller's message is about. */
export function detectPositions(message: string): Position[] {
  let m = ` ${message.toLowerCase()} `;
  const found = new Set<Position>();
  // Longest keys first, whole-word matches only, and blank out each match so
  // "pass rusher" doesn't also trip "rusher"→RB or "quarterbacks" trip "back".
  const keys = Object.keys(POS_WORDS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`(^|[^a-z])${k.replace(/[-]/g, '\\-')}(s|es)?(?=[^a-z]|$)`, 'g');
    if (re.test(m)) {
      found.add(POS_WORDS[k]);
      m = m.replace(re, '$1 ');
    }
  }
  if (found.has('CB') && message.toLowerCase().includes('secondary')) found.add('S');
  return [...found].slice(0, 2);
}

interface ScoutOpts {
  teams: Team[];
  players: Player[];
  userTeamId: string;
  freeAgentIds: string[];
  tradeRumors: TradeRumor[];
  season: number;
  week: number;
  phase: string;
  message: string;
  /** Seasons with a recorded champion — decides whether the next draft is this year's or next year's. */
  champions?: { season: number }[];
  /** Scouted OVR per prospect — what the user actually sees; hosts see the same. */
  draftScoutingData?: Record<string, { scoutedOvr: number; error: number; deepScouted: boolean }>;
}

const starterSlot = (team: Team, p: Player): number => {
  const chart = team.depthChart?.[p.position] ?? [];
  const i = chart.indexOf(p.id);
  return i >= 0 ? i + 1 : 99;
};

function fmtPlayer(p: Player, team: Team | null, extra?: Record<string, unknown>) {
  return {
    name: `${p.firstName} ${p.lastName}`,
    pos: p.position,
    ovr: p.ratings.overall,
    age: p.age,
    pot: p.potential,
    salary: `$${p.contract.salary}M`,
    yrsLeft: p.contract.yearsLeft,
    ...(team ? { team: team.abbreviation, teamRecord: `${team.record.wins}-${team.record.losses}`, role: starterSlot(team, p) === 1 ? 'starter' : starterSlot(team, p) === 2 ? 'backup' : 'depth' } : {}),
    ...(p.injury ? { injured: `${p.injury.type}, ${p.injury.weeksLeft}w` } : {}),
    ...extra,
  };
}

export function buildLeagueScoutPacket(o: ScoutOpts): Record<string, unknown> {
  const { teams, players, userTeamId, freeAgentIds, tradeRumors, message } = o;
  const byTeam = new Map<string, Player[]>();
  for (const p of players) {
    if (p.retired || !p.teamId) continue;
    if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, []);
    byTeam.get(p.teamId)!.push(p);
  }
  const teamById = new Map(teams.map(t => [t.id, t]));
  const rumorPlayerIds = new Set(tradeRumors.filter(r => !r.resolved).flatMap(r => r.playerIds));

  // 1. League index — one compact line per team.
  const leagueIndex = teams
    .filter(t => t.id !== userTeamId)
    .map(t => {
      const roster = byTeam.get(t.id) ?? [];
      const gp = t.record.wins + t.record.losses;
      const pct = gp ? t.record.wins / gp : 0.5;
      const qbs = roster.filter(p => p.position === 'QB').sort((a, b) => starterSlot(t, a) - starterSlot(t, b) || b.ratings.overall - a.ratings.overall);
      const qb1 = qbs[0], qb2 = qbs[1];
      const weakest = (['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'] as Position[])
        .map(pos => ({ pos, best: Math.max(0, ...roster.filter(p => p.position === pos).map(p => p.ratings.overall)) }))
        .sort((a, b) => a.best - b.best)[0];
      const capSpace = Math.round((t.salaryCap - t.totalPayroll) * 10) / 10;
      const expiringStarters = roster
        .filter(p => p.contract.yearsLeft <= 1 && starterSlot(t, p) === 1 && p.ratings.overall >= 75)
        .sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 2)
        .map(p => `${p.firstName} ${p.lastName} (${p.position} ${p.ratings.overall})`);
      return {
        team: t.abbreviation,
        name: `${t.city} ${t.name}`,
        record: `${t.record.wins}-${t.record.losses}`,
        lean: gp >= 4 ? (pct >= 0.6 ? 'buyer' : pct <= 0.35 ? 'seller' : 'neutral') : 'unknown',
        cap: `$${capSpace}M`,
        qb1: qb1 ? `${qb1.firstName} ${qb1.lastName} ${qb1.ratings.overall} (${qb1.age}y, ${qb1.contract.yearsLeft}y left)` : null,
        qb2: qb2 ? `${qb2.firstName} ${qb2.lastName} ${qb2.ratings.overall} (${qb2.age}y)` : null,
        weakest: weakest ? `${weakest.pos} ${weakest.best}` : null,
        expiringStarters,
      };
    });

  // 2. Position slice — top targets at the position(s) the caller asked about.
  const positions = detectPositions(message);
  const positionSlice: Record<string, unknown[]> = {};
  for (const pos of positions) {
    const pool = players.filter(p => !p.retired && p.teamId && p.teamId !== userTeamId && p.position === pos);
    const scored = pool.map(p => {
      const t = teamById.get(p.teamId!)!;
      const gp = t.record.wins + t.record.losses;
      const pct = gp ? t.record.wins / gp : 0.5;
      const slot = starterSlot(t, p);
      // Gettability: buried backups, sellers, expiring deals, rumored players.
      const why: string[] = [];
      if (slot >= 2 && p.ratings.overall >= 72) why.push('backup who could start');
      if (gp >= 4 && pct <= 0.35) why.push('team is a seller');
      if (p.contract.yearsLeft <= 1) why.push('contract year');
      if (rumorPlayerIds.has(p.id)) why.push('on the trade block');
      if (p.age <= 25 && p.potential - p.ratings.overall >= 8) why.push('young, still improving');
      return { p, t, score: p.ratings.overall + why.length * 6, why };
    });
    positionSlice[pos] = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 14)
      .map(({ p, t, why }) => fmtPlayer(p, t, { gettable: why.length ? why.join('; ') : 'would cost a lot' }));
  }

  // 3. Trade market — live rumors.
  const tradeMarket = tradeRumors
    .filter(r => !r.resolved)
    .slice(-12)
    .map(r => ({
      team: teamById.get(r.teamId)?.abbreviation ?? r.teamId,
      type: r.type,
      headline: r.headline,
      players: r.playerIds.map(id => players.find(p => p.id === id)).filter(Boolean).map(p => `${p!.firstName} ${p!.lastName} (${p!.position} ${p!.ratings.overall}, $${p!.contract.salary}M)`),
    }));

  // 4. Free-agent pool — best available, or best at the asked position.
  const faSet = new Set(freeAgentIds);
  const fas = players.filter(p => faSet.has(p.id) && !p.retired);
  const faPool = (positions.length ? fas.filter(p => positions.includes(p.position)) : fas)
    .sort((a, b) => b.ratings.overall - a.ratings.overall)
    .slice(0, 15)
    .map(p => fmtPlayer(p, null));

  // 5. Draft prospects — upcoming class, scouted values only (same as the
  // user sees on the draft page). Position-filtered when a position was asked.
  const seasonPlayed = (o.champions ?? []).some(c => c.season === o.season);
  const draftYear = seasonPlayed ? o.season + 1 : o.season;
  const prospects = players.filter(p => !p.teamId && !p.retired && p.draftYear === draftYear);
  const scouting = o.draftScoutingData ?? {};
  const prospectPool = (positions.length ? prospects.filter(p => positions.includes(p.position)) : prospects)
    .map(p => {
      const sc = scouting[p.id];
      const mid = sc ? sc.scoutedOvr : p.ratings.overall;
      const err = sc ? Math.max(0, Math.round(sc.error)) : 5;
      return { p, mid, err };
    })
    .sort((a, b) => (a.p.projectedRank ?? 999) - (b.p.projectedRank ?? 999) || b.mid - a.mid)
    .slice(0, 12)
    .map(({ p, mid, err }) => ({
      name: `${p.firstName} ${p.lastName}`,
      pos: p.position,
      projectedPick: p.projectedRank ?? null,
      scoutedOvr: err > 0 ? `${Math.max(20, mid - err)}-${Math.min(99, mid + err)}` : String(mid),
      potential: p.potential,
      age: p.age,
      ...(p.college ? { college: p.college } : {}),
      ...(p.scoutingLabel ? { scoutingNote: p.scoutingLabel } : {}),
    }));

  // Where the caller is projected to pick (worst record picks first) and
  // whether they still own that first-rounder.
  const userTeam = teamById.get(userTeamId);
  const worstFirst = [...teams].sort((a, b) => {
    const ga = a.record.wins + a.record.losses, gb = b.record.wins + b.record.losses;
    return (ga ? a.record.wins / ga : 0.5) - (gb ? b.record.wins / gb : 0.5);
  });
  const projectedSlot = worstFirst.findIndex(t => t.id === userTeamId) + 1;
  const ownsR1 = !!userTeam?.draftPicks.some(pk => pk.year === draftYear && pk.round === 1 && pk.ownerTeamId === userTeamId && !pk.playerId);
  const extraR1 = userTeam ? userTeam.draftPicks.filter(pk => pk.year === draftYear && pk.round === 1 && pk.ownerTeamId === userTeamId && pk.originalTeamId !== userTeamId && !pk.playerId).length : 0;

  return {
    note: 'LEAGUE SCOUTING: everything outside the caller\'s team. Use it to name specific, gettable targets and say WHY they are gettable (seller, contract year, buried backup, on the block, draft prospect within reach of the caller\'s pick) and roughly what it would cost. Rumors are rumors — hedge them.',
    positionsAsked: positions,
    leagueIndex,
    ...(Object.keys(positionSlice).length ? { positionTargets: positionSlice } : {}),
    tradeMarket,
    freeAgents: faPool,
    upcomingDraft: {
      year: draftYear,
      callerProjectedPick: projectedSlot ? `~#${projectedSlot} overall (by current record)` : null,
      callerOwnsFirstRounder: ownsR1,
      extraFirstRounders: extraR1,
      prospects: prospectPool,
      note: 'scoutedOvr is a range — scouting is imperfect. projectedPick is the mock-draft slot.',
    },
  };
}

const POS_LABEL: Record<Position, string> = {
  QB: 'quarterbacks', RB: 'running backs', WR: 'receivers', TE: 'tight ends', OL: 'offensive linemen',
  DL: 'pass rushers', LB: 'linebackers', CB: 'corners', S: 'safeties', K: 'kickers', P: 'punters',
};

/** Deterministic follow-up questions when the model doesn't supply any. */
export function fallbackFollowUps(message: string): string[] {
  const [pos] = detectPositions(message);
  if (pos) {
    const l = POS_LABEL[pos];
    return [
      `Which ${l} are available in free agency?`,
      `What ${l} can I draft at my pick?`,
      `Who's a realistic trade target at ${pos}?`,
    ];
  }
  const m = message.toLowerCase();
  if (/draft|prospect|pick/.test(m)) return ['Should I trade up?', 'Who falls to my pick?', 'Best player available or need?'];
  if (/trade|deal/.test(m)) return ['What would it cost me?', 'Who should I sell?', 'Is there a cheaper option?'];
  if (/cap|money|contract|extend/.test(m)) return ['Who should I extend first?', 'Who can I cut to clear room?', 'Is anyone overpaid?'];
  return ["What's the safer play?", "What's the bold move?", 'What would you do this week?'];
}
