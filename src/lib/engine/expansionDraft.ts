import type { Player, Team, Position, DraftPick, ExpansionTeamConfig } from '@/types';
import { POSITIONS, ROSTER_LIMITS, emptyRecord } from '@/types';
import { generatePlayer } from './playerGen';
import { generateCoachingStaff } from './coaching';
import { defaultApproval } from './approval';

function uuid(): string { return crypto.randomUUID(); }

export function computeProtectionLimit(rosterSize: number): number {
  if (rosterSize > 45) return 15;
  if (rosterSize > 40) return 12;
  return 10;
}

export function autoProtectPlayers(teamId: string, players: Player[]): string[] {
  const roster = players
    .filter(p => p.teamId === teamId && !p.retired)
    .sort((a, b) => {
      const qbA = a.position === 'QB' ? 100 : 0;
      const qbB = b.position === 'QB' ? 100 : 0;
      const youthA = a.age <= 26 ? 5 : 0;
      const youthB = b.age <= 26 ? 5 : 0;
      return (b.ratings.overall + qbB + youthB) - (a.ratings.overall + qbA + youthA);
    });
  return roster.slice(0, computeProtectionLimit(roster.length)).map(p => p.id);
}

export function createExpansionTeamObject(config: ExpansionTeamConfig, season: number, numTeams: number): Team {
  const teamId = uuid();
  const draftPicks: DraftPick[] = [];
  for (let y = 0; y < 3; y++) {
    for (let r = 1; r <= 7; r++) {
      draftPicks.push({ id: uuid(), year: season + y + 1, round: r, originalTeamId: teamId, ownerTeamId: teamId });
    }
  }
  const depthChart = POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => { acc[pos] = []; return acc; }, {} as Record<Position, string[]>);
  return {
    id: teamId, city: config.city, name: config.name, abbreviation: config.abbreviation,
    conference: config.conference, division: config.division,
    primaryColor: config.primaryColor, secondaryColor: config.secondaryColor,
    record: emptyRecord(), salaryCap: 300, totalPayroll: 0, roster: [], draftPicks, depthChart,
    deadCap: [], franchiseTagUsed: false, coaches: generateCoachingStaff(),
    revenue: { tickets: 0, merchandise: 0, tvDeal: 0, total: 0 }, approval: defaultApproval(),
  };
}

export interface ExpansionDraftResult {
  picks: { expansionTeamId: string; fromTeamId: string; playerId: string }[];
  fillerPlayers: Player[];
  updatedPlayers: Player[];
  updatedTeams: Team[];
}

export function runExpansionDraft(
  existingTeams: Team[], expansionTeamIds: string[], allTeams: Team[],
  players: Player[], protectedPlayers: Record<string, string[]>, season: number,
): ExpansionDraftResult {
  let currentPlayers = [...players];
  const picks: ExpansionDraftResult['picks'] = [];
  const fillerPlayers: Player[] = [];
  const fullProtection = { ...protectedPlayers };
  for (const team of existingTeams) {
    if (!fullProtection[team.id]) fullProtection[team.id] = autoProtectPlayers(team.id, currentPlayers);
  }
  const protectedSet = new Set(Object.values(fullProtection).flat());

  for (let expIdx = 0; expIdx < expansionTeamIds.length; expIdx++) {
    const expTeamId = expansionTeamIds[expIdx];
    const pickedFromThisRound = new Set<string>();
    const posCounts: Record<string, number> = {};
    for (const p of currentPlayers.filter(p => p.teamId === expTeamId && !p.retired)) posCounts[p.position] = (posCounts[p.position] || 0) + 1;

    let teamOrder = [...existingTeams];
    if (expIdx === 1) teamOrder = teamOrder.reverse();

    for (const fromTeam of teamOrder) {
      if (pickedFromThisRound.has(fromTeam.id)) continue;
      const available = currentPlayers
        .filter(p => p.teamId === fromTeam.id && !p.retired && !protectedSet.has(p.id))
        .sort((a, b) => {
          const aNeed = (posCounts[a.position] || 0) < (ROSTER_LIMITS[a.position]?.min ?? 1) ? 10 : 0;
          const bNeed = (posCounts[b.position] || 0) < (ROSTER_LIMITS[b.position]?.min ?? 1) ? 10 : 0;
          return (b.ratings.overall + bNeed) - (a.ratings.overall + aNeed);
        });
      if (available.length === 0) continue;
      const topN = available.slice(0, 3);
      const weights = topN.map((_, i) => Math.max(1, 10 - i * 3));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * totalWeight;
      let selected = topN[0];
      for (let i = 0; i < weights.length; i++) { roll -= weights[i]; if (roll <= 0) { selected = topN[i]; break; } }

      currentPlayers = currentPlayers.map(p => p.id === selected.id ? { ...p, teamId: expTeamId, acquiredVia: 'trade' as const, acquiredSeason: season } : p);
      posCounts[selected.position] = (posCounts[selected.position] || 0) + 1;
      pickedFromThisRound.add(fromTeam.id);
      protectedSet.add(selected.id);
      picks.push({ expansionTeamId: expTeamId, fromTeamId: fromTeam.id, playerId: selected.id });
    }
  }

  for (const expTeamId of expansionTeamIds) {
    const expRoster = currentPlayers.filter(p => p.teamId === expTeamId && !p.retired);
    const posCounts: Record<string, number> = {};
    for (const p of expRoster) posCounts[p.position] = (posCounts[p.position] || 0) + 1;
    const needed: Position[] = [];
    for (const pos of POSITIONS) { const have = posCounts[pos] || 0; for (let i = have; i < ROSTER_LIMITS[pos].min; i++) needed.push(pos); }
    const totalAfterFill = expRoster.length + needed.length;
    if (totalAfterFill < 53) {
      const padPositions: Position[] = ['WR', 'OL', 'DL', 'LB', 'CB', 'S', 'RB'];
      let padIdx = 0;
      for (let i = totalAfterFill; i < 53; i++) { needed.push(padPositions[padIdx % padPositions.length]); padIdx++; }
    }
    for (const pos of needed) {
      const ovr = 55 + Math.floor(Math.random() * 8);
      const p = generatePlayer(pos, ovr, { age: 24 + Math.floor(Math.random() * 5), experience: 1 + Math.floor(Math.random() * 4), teamId: expTeamId });
      p.acquiredVia = 'free-agency'; p.acquiredSeason = season;
      currentPlayers.push(p); fillerPlayers.push(p);
    }
  }

  const updatedTeams = allTeams.map(team => {
    const teamRoster = currentPlayers.filter(p => p.teamId === team.id && !p.retired);
    const depthChart = POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
      acc[pos] = teamRoster.filter(p => p.position === pos).sort((a, b) => b.ratings.overall - a.ratings.overall).map(p => p.id);
      return acc;
    }, {} as Record<Position, string[]>);
    return { ...team, roster: teamRoster.map(p => p.id), depthChart, totalPayroll: Math.round(teamRoster.reduce((s, p) => s + p.contract.salary, 0) * 10) / 10 };
  });
  return { picks, fillerPlayers, updatedPlayers: currentPlayers, updatedTeams };
}
