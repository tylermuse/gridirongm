import type { LeagueState, Player, Team } from '@/types';

// ---------------------------------------------------------------------------
// Per-award scoring functions. These are the SINGLE source of truth — both
// the season-end winner determination (`computeSeasonAwards`) and the
// in-season award race tracker (`computeAwardRaces`) call into them so the
// race standings and the eventual winner can never disagree.
// ---------------------------------------------------------------------------

export function mvpScore(p: Player, teams: Team[]): number {
  const team = teams.find(t => t.id === p.teamId);
  const gp = team ? team.record.wins + team.record.losses : 1;
  const winPct = team ? team.record.wins / Math.max(1, gp) : 0.5;
  const wins = team?.record.wins ?? 0;
  const winBonus = wins * 8 + (winPct >= 0.65 ? 50 : winPct >= 0.5 ? 20 : -40);

  if (p.position === 'QB') {
    return p.stats.passYards * 0.05 + p.stats.passTDs * 8 - p.stats.interceptions * 6
      + p.stats.rushTDs * 4 + p.stats.rushYards * 0.02
      + winBonus * 1.2;
  }
  if (p.position === 'RB') {
    return p.stats.rushYards * 0.06 + p.stats.rushTDs * 6 + p.stats.receivingYards * 0.02 + winBonus;
  }
  if (p.position === 'TE') {
    return p.stats.receivingYards * 0.08 + p.stats.receivingTDs * 8 + winBonus;
  }
  return p.stats.receivingYards * 0.06 + p.stats.receivingTDs * 6 + winBonus;
}

export function dpoyScore(p: Player, teams: Team[]): number {
  const team = teams.find(t => t.id === p.teamId);
  const winBonus = team ? team.record.wins * 3 : 0;
  return p.stats.tackles * 0.5 + p.stats.sacks * 8 + p.stats.defensiveINTs * 7
    + (p.stats.tacklesForLoss ?? 0) * 2 + (p.stats.passDeflections ?? 0) * 2
    + (p.stats.forcedFumbles ?? 0) * 4 + winBonus;
}

export function opoyScore(p: Player): number {
  const yards = p.stats.passYards + p.stats.rushYards + p.stats.receivingYards;
  const tds = p.stats.passTDs + p.stats.rushTDs + p.stats.receivingTDs;
  return yards + tds * 30;
}

/** Performance score used by All-League / All-Rookie + ROY awards.
 *  80% season totals (rewards availability), 20% OVR. */
export function allLeagueScore(p: Player): number {
  const s = p.stats;
  let statPts = 0;
  switch (p.position) {
    case 'QB':
      statPts = s.passTDs * 6 + s.passYards / 20 - s.interceptions * 8 + s.rushTDs * 6 + s.rushYards / 25;
      break;
    case 'RB':
      statPts = s.rushYards / 8 + s.rushTDs * 8 + s.receptions * 1.0 + s.receivingYards / 15 + s.receivingTDs * 6;
      break;
    case 'WR':
    case 'TE':
      statPts = s.receptions * 1.5 + s.receivingYards / 8 + s.receivingTDs * 8;
      break;
    case 'DL':
    case 'LB':
      statPts = s.tackles * 1.5 + s.sacks * 6 + s.defensiveINTs * 10 + s.forcedFumbles * 5;
      break;
    case 'CB':
    case 'S':
      statPts = s.tackles * 1.2 + s.defensiveINTs * 10 + s.passDeflections * 4 + s.forcedFumbles * 5;
      break;
    case 'K':
      statPts = s.fieldGoalsMade * 4 + (s.fieldGoalsMade / Math.max(1, s.fieldGoalAttempts)) * 25;
      break;
    case 'P':
      statPts = p.ratings.overall * 0.6 + s.gamesPlayed * 2;
      break;
    default:
      statPts = (p.ratings.overall - 55) * 0.25 + s.gamesPlayed * 0.5 + (s.sacksAllowed != null ? Math.max(0, 20 - s.sacksAllowed) * 0.5 : 0);
      break;
  }
  return p.ratings.overall * 0.2 + statPts * 0.8;
}

// ---------------------------------------------------------------------------
// Season-end winner determination (called once at the end of the regular
// season). Strict eligibility: ≥10 games played, OVR thresholds.
// ---------------------------------------------------------------------------

export function computeSeasonAwards(state: LeagueState): { award: string; playerId: string; teamId: string }[] {
  const awards: { award: string; playerId: string; teamId: string }[] = [];
  const activePlayers = state.players.filter(p => !p.retired && p.teamId);
  const majorEligible = activePlayers.filter(p => p.ratings.overall >= 70);
  const rookieEligible = activePlayers.filter(p => p.ratings.overall >= 60);

  const withGames = (pos: string[], pool: typeof activePlayers = majorEligible) =>
    pool.filter(p => pos.includes(p.position) && p.stats.gamesPlayed >= 10);

  const mvpCandidates = withGames(['QB', 'RB', 'WR', 'TE']);
  if (mvpCandidates.length > 0) {
    const mvp = [...mvpCandidates].sort((a, b) => mvpScore(b, state.teams) - mvpScore(a, state.teams))[0];
    awards.push({ award: 'MVP', playerId: mvp.id, teamId: mvp.teamId! });
  }

  const defensivePlayers = withGames(['DL', 'LB', 'CB', 'S']);
  if (defensivePlayers.length > 0) {
    const dpoy = [...defensivePlayers].sort((a, b) => dpoyScore(b, state.teams) - dpoyScore(a, state.teams))[0];
    awards.push({ award: 'Defensive POY', playerId: dpoy.id, teamId: dpoy.teamId! });
  }

  const opoyCandidates = withGames(['QB', 'RB', 'WR', 'TE']);
  if (opoyCandidates.length > 0) {
    const sorted = [...opoyCandidates].sort((a, b) => opoyScore(b) - opoyScore(a));
    const top = sorted[0];
    const second = sorted[1];
    if (top.position === 'QB' && second && opoyScore(top) < opoyScore(second) * 1.20) {
      const nonQB = sorted.find(p => p.position !== 'QB');
      if (nonQB) {
        awards.push({ award: 'Offensive POY', playerId: nonQB.id, teamId: nonQB.teamId! });
      } else {
        awards.push({ award: 'Offensive POY', playerId: top.id, teamId: top.teamId! });
      }
    } else {
      awards.push({ award: 'Offensive POY', playerId: top.id, teamId: top.teamId! });
    }
  }

  const rookies = rookieEligible.filter(p => p.experience === 1 && p.stats.gamesPlayed >= 10);
  const offensiveRookies = rookies.filter(p => ['QB', 'RB', 'WR', 'TE', 'OL'].includes(p.position));
  if (offensiveRookies.length > 0) {
    const oroy = [...offensiveRookies].sort((a, b) => allLeagueScore(b) - allLeagueScore(a))[0];
    awards.push({ award: 'Offensive ROY', playerId: oroy.id, teamId: oroy.teamId! });
  }
  const defensiveRookies = rookies.filter(p => ['DL', 'LB', 'CB', 'S'].includes(p.position));
  if (defensiveRookies.length > 0) {
    const droy = [...defensiveRookies].sort((a, b) => allLeagueScore(b) - allLeagueScore(a))[0];
    awards.push({ award: 'Defensive ROY', playerId: droy.id, teamId: droy.teamId! });
  }

  return awards;
}

// ---------------------------------------------------------------------------
// In-season Award Race tracker (305mike 4/27 ask).
// Looser eligibility — show preliminary rankings from Week 2 onward so users
// can watch the race develop. Same scoring functions as the season-end logic
// so ranking and final winner agree.
// ---------------------------------------------------------------------------

export interface AwardRaceEntry {
  playerId: string;
  teamId: string;
  position: string;
  score: number;
  /** Pre-formatted display stat ("4,512 pass yds / 38 TDs / 8 INTs"). */
  keyStatLine: string;
}

export interface CoachAwardRaceEntry {
  coachId: string;
  teamId: string;
  role: 'HC' | 'OC' | 'DC';
  score: number;
  keyStatLine: string;
}

export interface AwardRaces {
  mvp: AwardRaceEntry[];
  opoy: AwardRaceEntry[];
  dpoy: AwardRaceEntry[];
  oroy: AwardRaceEntry[];
  droy: AwardRaceEntry[];
  coachOfTheYear: CoachAwardRaceEntry[];
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString();
}

function keyStatLine(p: Player): string {
  const s = p.stats;
  switch (p.position) {
    case 'QB':
      return `${fmtNum(s.passYards)} pass yds / ${s.passTDs} TD / ${s.interceptions} INT`;
    case 'RB':
      return `${fmtNum(s.rushYards)} rush yds / ${s.rushTDs} TD${s.receptions ? ` / ${s.receptions} rec` : ''}`;
    case 'WR':
    case 'TE':
      return `${s.receptions} rec / ${fmtNum(s.receivingYards)} yds / ${s.receivingTDs} TD`;
    case 'DL':
    case 'LB':
      return `${s.tackles} tkl / ${s.sacks.toFixed(1)} sk / ${s.defensiveINTs} INT${s.forcedFumbles ? ` / ${s.forcedFumbles} FF` : ''}`;
    case 'CB':
    case 'S':
      return `${s.tackles} tkl / ${s.defensiveINTs} INT / ${s.passDeflections ?? 0} PD`;
    default:
      return `${s.gamesPlayed} GP`;
  }
}

export function coachOfTheYearScore(state: LeagueState, coachId: string): number {
  // Find the team whose HC matches this coachId.
  const team = state.teams.find(t => t.coaches?.some(c => c.id === coachId && c.role === 'HC'));
  if (!team) return -Infinity;
  const wins = team.record.wins;
  const losses = team.record.losses;
  const ties = team.record.ties ?? 0;
  const gp = wins + losses + ties;
  if (gp < 4) return -Infinity; // weed out week-1 noise
  const winPct = (wins + ties * 0.5) / Math.max(1, gp);
  const pointDiff = (team.record.pointsFor ?? 0) - (team.record.pointsAgainst ?? 0);
  // Preseason projection isn't persisted yet — leave the term at 0 for v0.
  // TODO: wire this up after a preseason-projection persistence pass.
  const outperformanceBonus = 0;
  // "Made playoffs" is only known after season ends; treat winPct >= 0.55
  // as the in-season proxy.
  const playoffish = winPct >= 0.55 ? 25 : 0;
  return wins * 10
    + (winPct >= 0.65 ? 30 : winPct >= 0.50 ? 10 : -20)
    + pointDiff * 0.05
    + outperformanceBonus
    + playoffish;
}

function buildEntry(p: Player, score: number): AwardRaceEntry {
  return {
    playerId: p.id,
    teamId: p.teamId ?? '',
    position: p.position,
    score,
    keyStatLine: keyStatLine(p),
  };
}

export function computeAwardRaces(
  state: LeagueState,
  options?: { topN?: number; minGamesPlayed?: number },
): AwardRaces {
  const topN = options?.topN ?? 10;
  const minGames = options?.minGamesPlayed ?? 1;
  const active = state.players.filter(p => !p.retired && p.teamId && p.stats.gamesPlayed >= minGames);

  const offensiveSlots = ['QB', 'RB', 'WR', 'TE'];
  const defensiveSlots = ['DL', 'LB', 'CB', 'S'];

  const mvp = active
    .filter(p => offensiveSlots.includes(p.position))
    .map(p => buildEntry(p, mvpScore(p, state.teams)))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  const opoy = active
    .filter(p => offensiveSlots.includes(p.position))
    .map(p => buildEntry(p, opoyScore(p)))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  const dpoy = active
    .filter(p => defensiveSlots.includes(p.position))
    .map(p => buildEntry(p, dpoyScore(p, state.teams)))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  const rookies = active.filter(p => p.experience === 1);
  const oroy = rookies
    .filter(p => ['QB', 'RB', 'WR', 'TE', 'OL'].includes(p.position))
    .map(p => buildEntry(p, allLeagueScore(p)))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  const droy = rookies
    .filter(p => defensiveSlots.includes(p.position))
    .map(p => buildEntry(p, allLeagueScore(p)))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  const coachOfTheYear: CoachAwardRaceEntry[] = [];
  for (const team of state.teams) {
    const hc = team.coaches?.find(c => c.role === 'HC');
    if (!hc) continue;
    const score = coachOfTheYearScore(state, hc.id);
    if (!Number.isFinite(score)) continue;
    const wins = team.record.wins;
    const losses = team.record.losses;
    const pointDiff = (team.record.pointsFor ?? 0) - (team.record.pointsAgainst ?? 0);
    coachOfTheYear.push({
      coachId: hc.id,
      teamId: team.id,
      role: 'HC',
      score,
      keyStatLine: `${wins}-${losses} record / ${pointDiff >= 0 ? '+' : ''}${pointDiff} pt diff`,
    });
  }
  coachOfTheYear.sort((a, b) => b.score - a.score);

  return { mvp, opoy, dpoy, oroy, droy, coachOfTheYear: coachOfTheYear.slice(0, topN) };
}
