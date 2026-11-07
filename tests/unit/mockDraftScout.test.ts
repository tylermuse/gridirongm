import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  POSITION_RATINGS,
  RATING_LABELS,
  findTeamBySlug,
  scoutFit,
  type MockDraftData,
  type ScoutData,
} from '@/lib/mockDraft/engine';

const read = <T,>(file: string): T => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/mock', file), 'utf8'));
const data = read<MockDraftData>('nfl-2027.json');
const scout = read<ScoutData>('scout-2027.json');

describe('mock draft scout data (scout-2027.json)', () => {
  it('covers every prospect on the board, from the same build', () => {
    expect(scout.asOf).toBe(data.asOf);
    for (const p of data.prospects) {
      const entry = scout.prospects[String(p.pid)];
      expect(entry, `${p.firstName} ${p.lastName}`).toBeDefined();
      // Every prospect shows at least one rating for his position (a few FBGM prospects have 0 in the top one).
      expect(POSITION_RATINGS[p.pos].some((key) => (entry.ratings[key] ?? 0) > 0), `${p.pid} ${p.pos}`).toBe(true);
    }
    expect(Object.keys(scout.prospects)).toHaveLength(data.prospects.length);
  });

  it('has written profiles for the top of the board, in a shape the panel can render', () => {
    const top = data.prospects.slice(0, 30);
    expect(top.filter((p) => scout.prospects[String(p.pid)].profile).length).toBeGreaterThanOrEqual(28);
    for (const entry of Object.values(scout.prospects)) {
      const profile = entry.profile;
      if (!profile) continue;
      expect(profile.summary.length).toBeGreaterThan(20);
      expect(Array.isArray(profile.strengths) && Array.isArray(profile.weaknesses)).toBe(true);
      for (const url of profile.sources) expect(() => new URL(url)).not.toThrow();
    }
  });

  it('labels every rating it can show', () => {
    for (const keys of Object.values(POSITION_RATINGS)) for (const key of keys) expect(RATING_LABELS[key]).toBeTruthy();
  });

  it('calls a prospect at a need position a fit', () => {
    const chi = findTeamBySlug(data, 'bears')!;
    const wr = data.prospects.find((p) => p.pos === 'WR')!;
    expect(scoutFit(data, chi, wr).fit).toBe('need');
    const qb = data.prospects.find((p) => p.pos === 'QB')!;
    expect(scoutFit(data, chi, qb).fit).not.toBe('need');
  });
});
