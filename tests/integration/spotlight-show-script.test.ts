import { buildShowScript, SHOW_CLIPS } from '@/lib/spotlight/showScript';
import fs from 'node:fs';
import path from 'node:path';

const topics = [
  { headline: 'Defense carrying the load', icon: '🛡️', exchanges: [
    { speakerId: 'stats', text: 'Line A1' },
    { speakerId: 'hottake', text: 'Line A2' },
    { speakerId: 'fans', text: 'ignored' },
    { speakerId: 'stats', text: 'Line A3' },
    { speakerId: 'hottake', text: 'Line A4' },
  ] },
  { headline: 'QB question', icon: '🏈', exchanges: [
    { speakerId: 'hottake', text: 'Line B1' },
  ] },
  { headline: 'Empty topic', icon: '❓', exchanges: [{ speakerId: 'fans', text: 'skip me' }] },
  { headline: 'Schedule', icon: '📅', exchanges: [{ speakerId: 'stats', text: 'Line D1' }] },
];

describe('buildShowScript', () => {
  const segs = buildShowScript(topics, 'Las Vegas Raiders');

  it('opens with the lip-synced intro, a TTS team-name title card, then Tony', () => {
    expect(segs[0]).toMatchObject({ kind: 'clip', clip: 'marcus_intro' });
    expect(segs[1]).toMatchObject({ kind: 'tts', speaker: 'marcus', visual: 'title', text: "And today we're breaking down the Las Vegas Raiders." });
    expect(segs[2]).toMatchObject({ kind: 'clip', clip: 'tony_intro' });
  });

  it('closes with both outro clips', () => {
    expect(segs.slice(-2).map(s => s.kind === 'clip' && s.clip)).toEqual(['marcus_outro', 'tony_outro']);
  });

  it('only voices stats/hottake lines, mapped to the right host', () => {
    const tts = segs.filter(s => s.kind === 'tts' && s.topicIdx >= 0);
    expect(tts.map(s => s.text)).toEqual(['Line A1', 'Line A2', 'Line A3', 'Line A4', 'Line B1', 'Line D1']);
    expect(tts.map(s => s.speaker)).toEqual(['marcus', 'tony', 'marcus', 'tony', 'tony', 'marcus']);
  });

  it('uses the transition rotation by topic index and skips empty topics', () => {
    const transitions = segs.filter(s => s.kind === 'clip' && s.clip.includes('transition')).map(s => s.kind === 'clip' && s.clip);
    // topic 1 → index 1, topic 2 empty (no transition), topic 3 → index 3
    expect(transitions).toEqual(['marcus_transition_shifting_gears', 'tony_transition_next_one']);
  });

  it('puts the first line of a topic on the graphic and cuts to reactions after', () => {
    const a = segs.filter(s => s.kind === 'tts' && s.topicIdx === 0).map(s => s.kind === 'tts' && s.visual);
    expect(a).toEqual(['graphic', 'reaction', 'reaction', 'graphic']);
  });

  it('references clip files that exist in /public', () => {
    for (const c of Object.values(SHOW_CLIPS)) {
      expect(fs.existsSync(path.join(process.cwd(), 'public', c.src))).toBe(true);
    }
  });
});
