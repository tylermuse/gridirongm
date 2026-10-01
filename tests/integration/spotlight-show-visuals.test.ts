import { describe, it, expect } from 'vitest';
import { playerForLine, playerNamedIn, topicTeam } from '@/lib/spotlight/showVisuals';
import type { Player, Team } from '@/types';

const team = { id: 'ne', abbreviation: 'NE' } as Team;
const buf = { id: 'buf', abbreviation: 'BUF' } as Team;
const qb = { id: 'qb', firstName: 'Drew', lastName: 'Callahan', position: 'QB', teamId: 'ne' } as Player;
const wr = { id: 'wr', firstName: 'Malik', lastName: 'Brooks', position: 'WR', teamId: 'ne' } as Player;
const players = [qb, wr];

describe('topicTeam', () => {
  it('pictures the other team a topic is about, else the spotlight team', () => {
    expect(topicTeam({ teamIds: ['ne', 'buf'] }, team, [team, buf])).toBe(buf);
    expect(topicTeam({ teamIds: ['ne'] }, team, [team, buf])).toBe(team);
    expect(topicTeam(undefined, team, [team, buf])).toBe(team);
  });
});

describe('player pictures', () => {
  const topic = { playerIds: ['qb', 'wr'] };

  it('matches full names, then last names as whole words', () => {
    expect(playerNamedIn('Get Malik Brooks the ball', topic, players)).toBe(wr);
    expect(playerNamedIn("Callahan's completion rate", topic, players)).toBe(qb);
    expect(playerNamedIn('The Brooksville crowd', topic, players)).toBeNull();
  });

  it('only considers the topic’s players, unless given rosters to search', () => {
    expect(playerNamedIn('Bench Callahan', { playerIds: ['wr'] }, players)).toBeNull();
    expect(playerNamedIn('Bench Callahan', { playerIds: ['wr'] }, players, ['ne'])).toBe(qb);
  });

  it('knows a player by a unique first name on the roster', () => {
    expect(playerNamedIn("Since we're on Drew, look at the line", undefined, players, ['ne'])).toBe(qb);
    expect(playerNamedIn('Malik Brooks, lights get bright', undefined, players, ['ne'])).toBe(wr);
    expect(playerNamedIn('Andrew is not Drew-ish', undefined, players, ['buf'])).toBeNull();
  });

  it('keeps the last player named in the topic; falls back to a single-player topic', () => {
    const lines = ['Bench Callahan.', 'The defense is the problem.'];
    expect(playerForLine(lines, 1, topic, players)).toBe(qb);
    expect(playerForLine(['No names here.'], 0, { playerIds: ['wr'] }, players)).toBe(wr);
    expect(playerForLine(['No names here.'], 0, topic, players)).toBeNull();
  });
});

describe('team names vs player names', () => {
  const dallasWilson = { id: 'dw', firstName: 'Dallas', lastName: 'Wilson', position: 'WR', teamId: 'ne' } as Player;
  it('"the Dallas defense" is the team, not Dallas Wilson', () => {
    expect(playerNamedIn('the Dallas defense held twice', undefined, [dallasWilson], ['ne'], new Set(['dallas', 'cowboys']))).toBeNull();
    expect(playerNamedIn('Dallas Wilson had four catches', undefined, [dallasWilson], ['ne'], new Set(['dallas', 'cowboys']))).toBe(dallasWilson);
  });
});
