/**
 * Team-logo registry. Imported leagues carry a per-team `logoUrl` (the roster
 * file's `imgURL`); created/parody leagues don't. TeamLogo only receives an
 * abbreviation, not the whole team, and it's used in ~36 places — so rather than
 * thread a logoUrl prop through every call site, the active league publishes its
 * abbreviation→logo map here and TeamLogo looks itself up. Cleared + repopulated
 * whenever the active league changes.
 */

const LOGOS = new Map<string, string>();

export function setTeamLogos(teams: ReadonlyArray<{ abbreviation: string; logoUrl?: string }>): void {
  LOGOS.clear();
  for (const t of teams) {
    if (t.logoUrl) LOGOS.set(t.abbreviation.toUpperCase(), t.logoUrl);
  }
}

export function getTeamLogo(abbreviation: string): string | undefined {
  return LOGOS.get(abbreviation.toUpperCase());
}
