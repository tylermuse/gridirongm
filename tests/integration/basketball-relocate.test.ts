/**
 * God Mode franchise relocation/rebrand (parity 3.4, contained slice): edits a
 * team's identity, keeps the league at 30, and is gated on God Mode.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { setGodMode } from '@/../apps/bs-basketball/src/lib/godMode/godMode';
import { relocateTeam } from '@/../apps/bs-basketball/src/lib/godMode/relocate';

describe('relocateTeam', () => {
  it('rebrands a team when God Mode is on (and uppercases the abbrev)', () => {
    const base = setGodMode(createNewBasketballLeague({ rngSeed: 'reloc' }), true);
    const id = base.teams[0].id;
    const after = relocateTeam(base, id, { city: 'Seattle', name: 'SuperSonics', abbreviation: 'sea', primaryColor: '#00654b' });
    const t = after.teams.find(x => x.id === id)!;
    expect(t.city).toBe('Seattle');
    expect(t.name).toBe('SuperSonics');
    expect(t.abbreviation).toBe('SEA');
    expect(t.primaryColor).toBe('#00654b');
    expect(after.teams).toHaveLength(30); // still 30 — no invariant broken
    // Unedited fields preserved.
    expect(t.secondaryColor).toBe(base.teams[0].secondaryColor);
  });

  it('is a no-op without God Mode', () => {
    const base = createNewBasketballLeague({ rngSeed: 'reloc-off' });
    const id = base.teams[0].id;
    const after = relocateTeam(base, id, { city: 'Vegas' });
    expect(after.teams.find(x => x.id === id)!.city).toBe(base.teams[0].city);
  });
});
