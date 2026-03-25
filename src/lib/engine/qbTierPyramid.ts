import type { Player, Team, QBTier } from '@/types';

export function computeQBTier(qb: Player): QBTier {
  const ovr = qb.ratings.overall;
  const age = qb.age;
  if (ovr >= 88 && age <= 33) return 'Elite';
  if (ovr >= 80 && age <= 35) return 'Franchise';
  if (ovr >= 72 || (age >= 33 && ovr >= 68)) return 'Bridge';
  if (ovr >= 62) return 'Game Manager';
  if (ovr >= 50) return 'Backup';
  return 'Camp Arm';
}

export function getQBTierModifier(tier: QBTier): number {
  switch (tier) {
    case 'Elite': return 2;
    case 'Franchise': return 1;
    case 'Bridge': return 0;
    case 'Game Manager': return 0;
    case 'Backup': return -1;
    case 'Camp Arm': return -2;
  }
}

export function computeLeagueQBTiers(teams: Team[], players: Player[]): Record<string, { playerId: string; tier: QBTier }> {
  const result: Record<string, { playerId: string; tier: QBTier }> = {};
  for (const team of teams) {
    const qbIds = team.depthChart?.QB ?? [];
    const starter = qbIds.length > 0 ? players.find(p => p.id === qbIds[0]) : null;
    if (starter) {
      result[team.id] = { playerId: starter.id, tier: computeQBTier(starter) };
    }
  }
  return result;
}

export const QB_TIER_COLORS: Record<QBTier, string> = {
  'Elite': 'text-purple-600',
  'Franchise': 'text-blue-600',
  'Bridge': 'text-amber-600',
  'Game Manager': 'text-[var(--text-sec)]',
  'Backup': 'text-orange-500',
  'Camp Arm': 'text-red-500',
};
