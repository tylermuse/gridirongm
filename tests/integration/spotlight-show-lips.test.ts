import { describe, expect, it } from 'vitest';
import { mp3Frames, mp3Slice, talkSrc, wantsLips, TALK_MIN, TALK_MAX } from '@/lib/spotlight/showLips';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ShowSegment } from '@/lib/spotlight/showScript';

/** N frames of MPEG-1 Layer III, 128 kbps, 44.1 kHz (417 bytes each), after
 *  an optional ID3v2 tag. */
function fakeMp3(n: number, id3 = 0): Buffer {
  const parts: Buffer[] = [];
  if (id3) {
    const tag = Buffer.alloc(10 + id3);
    tag.write('ID3', 0, 'latin1');
    tag[9] = id3 & 0x7f; tag[8] = (id3 >> 7) & 0x7f;
    parts.push(tag);
  }
  for (let i = 0; i < n; i++) {
    const f = Buffer.alloc(417, i % 251);
    f[0] = 0xff; f[1] = 0xfb; f[2] = 0x90; f[3] = 0x64;
    parts.push(f);
  }
  return Buffer.concat(parts);
}
const FRAME = 1152 / 44100;

describe('two-shot lip sync', () => {
  it('reads every frame, past an ID3 tag', () => {
    const frames = mp3Frames(fakeMp3(100, 300));
    expect(frames).toHaveLength(100);
    expect(frames[0].offset).toBe(310);
    expect(frames[99].time).toBeCloseTo(99 * FRAME, 6);
  });

  it('cuts a line out on frame boundaries, starting at or before it', () => {
    const buf = fakeMp3(200);
    const cut = mp3Slice(buf, 1.0, 2.0)!;
    expect(cut.start).toBeLessThanOrEqual(1.0);
    expect(1.0 - cut.start).toBeLessThan(FRAME);
    const frames = cut.bytes.length / 417;
    expect(Number.isInteger(frames)).toBe(true);
    expect(cut.start + frames * FRAME).toBeGreaterThanOrEqual(2.0);
    expect(cut.bytes[0]).toBe(0xff);
  });

  it('nothing to cut past the end', () => {
    expect(mp3Slice(fakeMp3(10), 5, 6)).toBeNull();
  });

  const line = (text: string, topicIdx = 2): ShowSegment => ({ kind: 'tts', speaker: 'tony', text, visual: 'graphic', topicIdx, headline: 'x', icon: 'x' });
  it('puts talk on camera, keeps numbers on the graphic', () => {
    expect(wantsLips(line("He really did settle in. You could see it."), 5)).toBe(true);
    expect(wantsLips(line('Brooks at 134 tackles and Simmons with 10 sacks.'), 5)).toBe(false);
    expect(wantsLips(line('Too short.'), 1.2)).toBe(false);
    expect(wantsLips(line('The show open.', -1), 5)).toBe(false);
  });

  it('footage cut to the line, and every length has a file', () => {
    expect(talkSrc('tony', 5.2)).toBe('/show/lips/talk_tony_6.mp4');
    expect(talkSrc('marcus', 1)).toBe('/show/lips/talk_marcus_3.mp4');
    expect(talkSrc('marcus', 40)).toBe('/show/lips/talk_marcus_16.mp4');
    for (const h of ['marcus', 'tony'] as const)
      for (let n = TALK_MIN; n <= TALK_MAX; n++) expect(existsSync(join(process.cwd(), 'public', `/show/lips/talk_${h}_${n}.mp4`))).toBe(true);
  });
});
