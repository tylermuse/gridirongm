/**
 * McAfee Mode — Special Teams Rating & Labels
 */
import type { Player } from '@/types';

export function getBestReturner(roster: Player[]): Player | null {
  return roster
    .filter(p => ['WR', 'RB', 'CB'].includes(p.position) && (!p.injury || p.injury.weeksLeft === 0))
    .sort((a, b) => {
      const aScore = (a.ratings.speed * 2 + a.ratings.agility) / 3;
      const bScore = (b.ratings.speed * 2 + b.ratings.agility) / 3;
      return bScore - aScore;
    })[0] ?? null;
}

export function teamSpecialTeamsRating(roster: Player[]): {
  overall: number;
  kicker: { player: Player | null; rating: number; label: string };
  punter: { player: Player | null; rating: number; label: string };
  returner: { player: Player | null; rating: number };
} {
  const kicker = roster.find(p => p.position === 'K' && (!p.injury || p.injury.weeksLeft === 0)) ?? null;
  const punter = roster.find(p => p.position === 'P' && (!p.injury || p.injury.weeksLeft === 0)) ?? null;
  const returner = getBestReturner(roster);

  const kRating = kicker?.ratings.kicking ?? 40;
  const pRating = punter?.ratings.kicking ?? 40;
  const retRating = returner ? Math.round((returner.ratings.speed * 2 + returner.ratings.agility) / 3) : 40;

  const kLabel = kRating >= 88 ? 'Money' : kRating >= 78 ? 'Reliable' : kRating >= 65 ? 'Average' : 'Liability';
  const pLabel = pRating >= 85 ? 'Punt God' : pRating >= 75 ? 'Weapon' : pRating >= 62 ? 'Average' : 'Liability';

  const overall = Math.round(kRating * 0.4 + pRating * 0.35 + retRating * 0.25);

  return {
    overall,
    kicker: { player: kicker, rating: kRating, label: kLabel },
    punter: { player: punter, rating: pRating, label: pLabel },
    returner: { player: returner, rating: retRating },
  };
}
