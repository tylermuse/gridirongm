import { describe, it, expect } from 'vitest';
import { generateHalftimeBreakdown, generateHalftimeAudioBreakdown, passVerdict } from '@/lib/engine/debate';
import type { Team, Player, PlayerStats } from '@/types';

const team = (id: string, abbreviation: string, city: string) => ({ id, abbreviation, city, name: id }) as unknown as Team;
const man = (id: string, teamId: string, firstName: string, lastName: string, position: string) =>
  ({ id, teamId, firstName, lastName, position, ratings: { overall: 70 } }) as unknown as Player;

const DAL = team('dal', 'DAL', 'Dallas');
const NE = team('ne', 'NE', 'New England');
const players = [
  man('dak', 'dal', 'Dak', 'Prescott', 'QB'),
  man('flo', 'dal', 'Ryan', 'Flournoy', 'WR'),
  man('drake', 'ne', 'Drake', 'Maye', 'QB'),
  man('tvh', 'ne', 'TreVeyon', 'Henderson', 'RB'),
];

// Tyler's screenshot: DAL 3 — 10 NE, Dak 11/22, 117 yds, 0 TD, 2 INT.
const screenshot: Record<string, Partial<PlayerStats>> = {
  dak: { passCompletions: 11, passAttempts: 22, passYards: 117, passTDs: 0, interceptions: 2 },
  flo: { receptions: 5, receivingYards: 73, receivingTDs: 0 },
  drake: { passCompletions: 8, passAttempts: 14, passYards: 96, passTDs: 1, interceptions: 0 },
  tvh: { rushAttempts: 9, rushYards: 61, rushTDs: 0 },
};

describe('halftime booth take', () => {
  it('a two-pick half is a rough half, not "the engine of the offense"', () => {
    const r = generateHalftimeBreakdown({ homeTeam: NE, awayTeam: DAL, homeScore: 10, awayScore: 3, stats: screenshot, players });
    const cole = r.exchanges[0].text;
    expect(cole).not.toMatch(/engine/);
    expect(cole).toMatch(/Dak Prescott's rough half — 11 of 22 for 117 yards and two picks\./);
    expect(cole).not.toMatch(/\btd\b|\bint\b/);   // no lower-cased stat abbreviations
    // the leaders panel keeps its compact line
    expect(r.leaders[0].statLine).toBe('11/22, 117 yds, 0 TD, 2 INT');
  });

  it('credits a genuinely good half as the engine', () => {
    const stats = { ...screenshot, dak: { passCompletions: 15, passAttempts: 20, passYards: 214, passTDs: 2, interceptions: 0 } };
    const r = generateHalftimeBreakdown({ homeTeam: NE, awayTeam: DAL, homeScore: 10, awayScore: 14, stats, players });
    expect(r.exchanges[0].text).toBe('Through two quarters the story is Dak Prescott — 15 of 20 for 214 yards and two touchdowns. That\'s the engine of the Dallas offense right now.');
  });

  it('a middling half gets neither praise nor a roast', () => {
    const stats: Record<string, Partial<PlayerStats>> = {
      dak: { passCompletions: 9, passAttempts: 15, passYards: 92, passTDs: 0, interceptions: 0 },
      tvh: { rushAttempts: 6, rushYards: 21, rushTDs: 0 },
    };
    const r = generateHalftimeBreakdown({ homeTeam: NE, awayTeam: DAL, homeScore: 3, awayScore: 3, stats, players });
    expect(r.exchanges[0].text).toMatch(/^Nobody's taken over this one yet\. Dak Prescott leads the way for Dallas with 9 of 15 for 92 yards/);
  });

  it('grades passing halves', () => {
    expect(passVerdict(screenshot.dak)).toBe('cold');
    expect(passVerdict({ passCompletions: 15, passAttempts: 20, passYards: 214, passTDs: 2, interceptions: 0 })).toBe('hot');
    expect(passVerdict({ passCompletions: 2, passAttempts: 3, passYards: 4, passTDs: 0, interceptions: 1 })).toBe('ok');   // too few throws to judge
  });

  it('the spoken breakdown never calls a two-pick QB the bright spot', () => {
    const lines = generateHalftimeAudioBreakdown({ homeTeam: NE, awayTeam: DAL, homeScore: 10, awayScore: 3, stats: screenshot, players });
    const text = lines.map(l => l.text).join(' ');
    expect(text).not.toMatch(/bright spot has been Prescott/);
    expect(text).toMatch(/Prescott already has 2 picks/);
  });
});
