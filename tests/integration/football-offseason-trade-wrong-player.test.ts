/**
 * Regression: offseason trading block must move ONLY the blocked player.
 *
 * Reporter tofftanaut (#bug-reports): in the offseason, putting Trevon Diggs on
 * the block and accepting an AI offer removed a DIFFERENT rostered player
 * (Jalen Milroe). Roster-integrity bug — the user loses an asset they never
 * agreed to move.
 *
 * This test drives the real block -> AI proposal -> accept path through the
 * store and asserts the invariant: exactly the blocked player leaves the user
 * roster, and no other rostered player changes teams.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/lib/engine/store';
import type { Player, Team, Position } from '@/types';
import { DEFAULT_LEAGUE_SETTINGS } from '@/types';

let pidCounter = 0;
function P(firstName: string, lastName: string, position: Position, overall: number, teamId: string, opts: Partial<Player> = {}): Player {
  pidCounter += 1;
  return {
    id: `player-${pidCounter}`,
    firstName,
    lastName,
    position,
    subPosition: position,
    age: 26,
    experience: 4,
    potential: overall,
    ratings: { overall } as Player['ratings'],
    contract: { salary: 8, yearsLeft: 3, guaranteed: 12, totalYears: 3 },
    teamId,
    draftYear: 2022,
    draftPick: 40,
    retired: false,
    injury: null,
    onIR: false,
    mood: 70,
    stats: {} as Player['stats'],
    careerStats: {} as Player['careerStats'],
    seasonLog: [],
    ...opts,
  } as unknown as Player;
}

function team(id: string, roster: Player[]): Team {
  return {
    id,
    abbreviation: id.toUpperCase().slice(0, 3),
    city: id,
    name: id,
    conference: 'AFC',
    division: 'East',
    roster: roster.map(p => p.id),
    depthChart: {} as Team['depthChart'],
    draftPicks: [],
    salaryCap: 300,
    totalPayroll: roster.reduce((s, p) => s + p.contract.salary, 0),
    record: { wins: 8, losses: 8, ties: 0 },
    deadCap: [],
  } as unknown as Team;
}

describe('offseason trading block — wrong-player regression', () => {
  beforeEach(() => {
    pidCounter = 0;
  });

  it('moves ONLY the blocked player when accepting an AI trading-block offer (offseason)', () => {
    // User team (BUF): Diggs is the intended trade chip; Milroe must NOT move.
    const diggs = P('Trevon', 'Diggs', 'CB', 84, 'buf');
    const milroe = P('Jalen', 'Milroe', 'QB', 78, 'buf');
    const userFiller = P('Filler', 'One', 'WR', 70, 'buf');
    // AI team (mia) with a player it can send back.
    const aiSend = P('Jaylen', 'Waddle', 'WR', 86, 'mia');
    const aiFiller = P('Filler', 'Two', 'S', 72, 'mia');

    const players = [diggs, milroe, userFiller, aiSend, aiFiller];
    const buf = team('buf', [diggs, milroe, userFiller]);
    const mia = team('mia', [aiSend, aiFiller]);

    useGameStore.setState({
      players,
      teams: [buf, mia],
      userTeamId: 'buf',
      phase: 'resigning', // an offseason phase
      week: 0,
      season: 2026,
      leagueSettings: { ...DEFAULT_LEAGUE_SETTINGS },
      tradeProposals: [],
    } as never);

    const store = useGameStore.getState();

    // Solicit real AI proposals for Diggs on the block.
    store.solicitTradingBlockProposals([diggs.id], [], [], false);

    let proposals = useGameStore.getState().tradeProposals.filter(p => p.status === 'pending');
    // The AI interest roll is random; if no proposal was generated, construct a
    // deterministic one that mirrors what solicit produces (requested = blocked).
    if (proposals.length === 0) {
      useGameStore.setState({
        tradeProposals: [{
          id: 'prop-test',
          season: 2026,
          week: 0,
          proposingTeamId: 'mia',
          offeredPlayerIds: [aiSend.id],
          offeredPickIds: [],
          requestedPlayerIds: [diggs.id],
          requestedPickIds: [],
          status: 'pending',
          valueAssessment: 'fair',
        }],
      } as never);
      proposals = useGameStore.getState().tradeProposals.filter(p => p.status === 'pending');
    }

    const proposal = proposals[0];
    expect(proposal.requestedPlayerIds).toEqual([diggs.id]);

    const ok = useGameStore.getState().respondToTradeProposal(proposal.id, true);
    expect(ok).toBe(true);

    const after = useGameStore.getState().players;
    const diggsAfter = after.find(p => p.id === diggs.id)!;
    const milroeAfter = after.find(p => p.id === milroe.id)!;
    const fillerAfter = after.find(p => p.id === userFiller.id)!;

    // The blocked player leaves the user team.
    expect(diggsAfter.teamId).toBe('mia');
    // No other user player moves.
    expect(milroeAfter.teamId).toBe('buf');
    expect(fillerAfter.teamId).toBe('buf');

    // Exactly the players in the accepted proposal changed teams.
    const movedOffUser = after.filter(p => ['buf'].includes(String(p.teamId)) === false && [diggs.id, milroe.id, userFiller.id].includes(p.id));
    expect(movedOffUser.map(p => p.id).sort()).toEqual(proposal.requestedPlayerIds.slice().sort());
  });

  it('fails safe (no roster change) if a corrupted save has two players sharing an id', () => {
    // The runtime fingerprint of the reported bug: a duplicate player id would
    // let a single blocked id drag an unrelated rostered player along. The
    // executeTrade integrity guard must refuse rather than corrupt the roster.
    const diggs = P('Trevon', 'Diggs', 'CB', 84, 'buf', { id: 'player-DUP' });
    const milroe = P('Jalen', 'Milroe', 'QB', 78, 'buf', { id: 'player-DUP' }); // same id
    const aiSend = P('Jaylen', 'Waddle', 'WR', 86, 'mia');

    const players = [diggs, milroe, aiSend];
    useGameStore.setState({
      players,
      teams: [team('buf', [diggs, milroe]), team('mia', [aiSend])],
      userTeamId: 'buf',
      phase: 'resigning',
      week: 0,
      season: 2026,
      leagueSettings: { ...DEFAULT_LEAGUE_SETTINGS },
      tradeProposals: [],
    } as never);

    const result = useGameStore.getState().executeTrade(['player-DUP'], [], [aiSend.id], [], 'mia', true);
    expect(result.success).toBe(false);

    // Nothing moved: both user players stay, the AI player stays.
    const after = useGameStore.getState().players;
    expect(after.filter(p => p.teamId === 'buf')).toHaveLength(2);
    expect(after.find(p => p.id === aiSend.id)!.teamId).toBe('mia');
  });
});
