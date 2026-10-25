/**
 * The Team Spotlight video show's view of the league (BS Hoops port of BS
 * Football's src/lib/spotlight). The show engine was written against the
 * football Team/Player types; these are the fields it actually reads, filled
 * from a Hoops league by `fromLeague` (adapters.ts).
 */

export interface ShowTeam {
  id: string;
  abbreviation: string;
  city: string;
  name: string;
  conference: string;
  division: string;
  record: { wins: number; losses: number; ties?: number; pointsFor: number; pointsAgainst: number };
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
}

/** Regular-season totals (same fields as BasketballStats). */
export interface ShowPlayerStats {
  gamesPlayed: number;
  minutes: number;
  points: number;
  totalRebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointsMade: number;
  threePointsAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
}

export interface ShowPlayer {
  id: string;
  firstName: string;
  lastName: string;
  teamId: string | null;
  /** PG / SG / SF / PF / C */
  position: string;
  age: number;
  potential: number;
  ratings: { overall: number };
  /** Salary in $M this season; seasons left including this one. */
  contract: { salary: number; yearsLeft: number } | null;
  /** This season's totals (null before he plays). */
  stats: ShowPlayerStats | null;
  /** Last season's totals, for between-season episodes. */
  lastSeasonStats?: ShowPlayerStats | null;
  imageUrl?: string;
}

/** A game on the season schedule (for the "road ahead" board). */
export interface ShowScheduleGame {
  week: number;
  season: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  played: boolean;
}
