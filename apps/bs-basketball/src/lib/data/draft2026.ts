/**
 * 2026 NBA Draft consensus big board.
 *
 * Imported BBGM files rate prospects by raw teen attributes, which ranks the
 * consensus #1 (AJ Dybantsa) below role players. Scouts agree on the top of a
 * class regardless of which team drafts whom, so we curate the consensus order
 * here (from public mock drafts) and use it to set a prospect's draft value —
 * current-OVR floor + ceiling — by name match. Names absent from the import are
 * simply unused; imported prospects not on this list keep their raw projection.
 */

export const CONSENSUS_2026_BIG_BOARD: string[] = [
  'AJ Dybantsa',
  'Darryn Peterson',
  'Cameron Boozer',
  'Caleb Wilson',
  'Nate Ament',
  'Darius Acuff Jr.',
  'Koa Peat',
  'Mikel Brown Jr.',
  'Karim Lopez',
  'Labaron Philon',
  'Yaxel Lendeborg',
  'Tahaad Pettiford',
  'Brayden Burries',
  'Chris Cenac Jr.',
  'Jayden Quaintance',
  'Bennett Stirtz',
  'Christian Anderson',
  'Dame Sarr',
  'Henri Veesaar',
  'JT Toppin',
  'Cayden Boozer',
  'Patrick Ngongba II',
  'Braden Smith',
  'Milos Uzan',
  'Nate Bittle',
  'Aday Mara',
  'Otega Oweh',
  'Ryan Conwell',
  'Morez Johnson Jr.',
  'Hannes Steinbach',
  'Joseph Tugler',
  'Tarris Reed Jr.',
  'Zuby Ejiofor',
  'Darrion Williams',
  'Milan Momcilovic',
  'Braylon Mullins',
  'Cameron Carr',
  'Tyler Tanner',
  'Isaiah Evans',
  'Boogie Fland',
];

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const RANK_BY_NAME = new Map<string, number>(
  CONSENSUS_2026_BIG_BOARD.map((n, i) => [normalize(n), i + 1]),
);

/** Consensus draft rank (1 = best), or null if the prospect isn't on the board. */
export function consensus2026Rank(name: string): number | null {
  return RANK_BY_NAME.get(normalize(name)) ?? null;
}

/** Draft value (current OVR floor + ceiling) implied by a consensus rank. */
export function consensus2026Value(rank: number): { overall: number; potential: number } {
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
  return {
    overall: clamp(73 - (rank - 1) * 0.7, 54, 73),
    potential: clamp(93 - (rank - 1) * 0.55, 72, 94),
  };
}
