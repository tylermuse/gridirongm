/**
 * OwnerMeter — a small, read-only owner-satisfaction badge for the GM hub.
 *
 * Pure computed: compares the team's actual win% against an expectation
 * derived from roster strength (OVR / 100), nudged by owner personality.
 * No store reads, no save changes. Caller decides when to render it
 * (GM hub only shows it during the regular season).
 */

type OwnerPersonality = 'frugal' | 'balanced' | 'win-now' | undefined;

const TIERS = [
  { key: 'thrilled', label: 'Thrilled', emoji: '🤩', min: 0.2, color: '#22c55e' },
  { key: 'pleased', label: 'Pleased', emoji: '😀', min: 0.07, color: '#84cc16' },
  { key: 'patient', label: 'Patient', emoji: '😐', min: -0.07, color: '#eab308' },
  { key: 'frustrated', label: 'Frustrated', emoji: '😠', min: -0.2, color: '#f97316' },
  { key: 'hotseat', label: 'Hot Seat', emoji: '🔥', min: -Infinity, color: '#ef4444' },
] as const;

export function ownerSatisfaction(
  wins: number,
  losses: number,
  teamOvr: number,
  ownerPersonality?: OwnerPersonality,
) {
  const gamesPlayed = wins + losses;
  // Expectation from roster strength, nudged by owner appetite.
  const personalityShift =
    ownerPersonality === 'win-now' ? 0.05 : ownerPersonality === 'frugal' ? -0.05 : 0;
  const expectedW = Math.min(0.95, Math.max(0.05, teamOvr / 100 + personalityShift));
  // Before any games, owners reserve judgment.
  const actualW = gamesPlayed > 0 ? wins / gamesPlayed : expectedW;
  const diff = actualW - expectedW;
  return TIERS.find(t => diff >= t.min) ?? TIERS[TIERS.length - 1];
}

export default function OwnerMeter({
  wins,
  losses,
  teamOvr,
  ownerPersonality,
}: {
  wins: number;
  losses: number;
  teamOvr: number;
  ownerPersonality?: OwnerPersonality;
}) {
  const tier = ownerSatisfaction(wins, losses, teamOvr, ownerPersonality);
  return (
    <span
      title={`Owner is ${tier.label.toLowerCase()} with the direction of the franchise (based on your record vs. roster expectations).`}
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold whitespace-nowrap"
      style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: tier.color }}
    >
      <span aria-hidden>{tier.emoji}</span>
      <span>Owner: {tier.label}</span>
    </span>
  );
}
