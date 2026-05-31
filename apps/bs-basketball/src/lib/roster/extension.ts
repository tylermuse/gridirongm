/**
 * Contract extension negotiation — the on-roster analogue of free agency.
 *
 * No competing bidders (the player is already yours), so acceptance is purely
 * "is this a fair deal vs my market value", with a small loyalty discount: a
 * player will re-up for a bit under what they'd command on the open market.
 */

import {
  basketballMarketSalary,
  basketballMarketContractYears,
  type BasketballPlayer,
} from '@bs/sport-basketball';
import type { BaseContract } from '@bs/core/adapter';
import type { Offer } from '@/lib/freeAgency';

export interface ExtensionMarket {
  /** Salary $/yr the player is looking for. */
  marketSalary: number;
  /** Years the player wants. */
  desiredYears: number;
  /** First season the extension years begin (after the current deal ends). */
  startSeason: number;
  /** Last season of the current contract. */
  expiringSeason: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function extensionMarket(player: BasketballPlayer, season: number): ExtensionMarket {
  const marketSalary = basketballMarketSalary(player, { season, noiseSeed: `ext-${player.id}-${season}` });
  const desiredYears = basketballMarketContractYears(player);
  const existing = player.contract?.years ?? [];
  const expiringSeason = existing.length ? Math.max(...existing.map(y => y.season)) : season - 1;
  return { marketSalary, desiredYears, startSeason: expiringSeason + 1, expiringSeason };
}

/** Projected chance the player accepts (heuristic, for the UI slider). */
export function extensionAcceptance(market: ExtensionMarket, offer: Offer): number {
  const marketTotal = market.marketSalary * market.desiredYears;
  const offerTotal = offer.salaryPerYear * offer.years;
  if (marketTotal <= 0) return 1;
  // Loyalty: accepts a bit under market — 0 at 55% of market value, 1 at 110%.
  return clamp((offerTotal / marketTotal - 0.55) / 0.55, 0, 1);
}

/** Deterministic accept/reject so the negotiation outcome is predictable. */
export function extensionAccepted(market: ExtensionMarket, offer: Offer): boolean {
  return extensionAcceptance(market, offer) >= 0.5;
}

/** Append the agreed years onto the end of the current deal. */
export function buildExtension(player: BasketballPlayer, offer: Offer, market: ExtensionMarket): BaseContract {
  const existing = player.contract?.years ?? [];
  const newYears = Array.from({ length: offer.years }, (_, i) => ({
    season: market.startSeason + i,
    baseSalary: offer.salaryPerYear,
    proratedBonus: 0,
    guaranteed: true,
  }));
  const years = [...existing, ...newYears];
  return {
    years,
    signedSeason: player.contract?.signedSeason ?? market.startSeason,
    guaranteedAtSigning: years.reduce((s, y) => s + y.baseSalary, 0),
    modifications: player.contract?.modifications ?? [],
    sportData: player.contract?.sportData ?? {},
  };
}
