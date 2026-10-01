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

  it('only considers the topic’s players', () => {
    expect(playerNamedIn('Bench Callahan', { playerIds: ['wr'] }, players)).toBeNull();
  });

  it('keeps the last player named in the topic; falls back to a single-player topic', () => {
    const lines = ['Bench Callahan.', 'The defense is the problem.'];
    expect(playerForLine(lines, 1, topic, players)).toBe(qb);
    expect(playerForLine(['No names here.'], 0, { playerIds: ['wr'] }, players)).toBe(wr);
    expect(playerForLine(['No names here.'], 0, topic, players)).toBeNull();
  });
});
