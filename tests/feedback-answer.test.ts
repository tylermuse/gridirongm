import { describe, expect, it } from 'vitest';
import { parseAnswer } from '../src/lib/feedback/answer';
import { HELP_SHEET } from '../src/lib/feedback/helpSheet';
import { HELP_SHEET as HOOPS_HELP_SHEET } from '../apps/bs-basketball/src/lib/feedback/helpSheet';

describe('feedback instant answers: parseAnswer', () => {
  it('reads a question with an answer', () => {
    expect(parseAnswer('{"kind":"question","answer":" Open Roster. "}')).toEqual({ kind: 'question', answer: 'Open Roster.' });
  });

  it('tolerates code fences and stray text around the JSON', () => {
    expect(parseAnswer('```json\n{"kind":"question","answer":"Yes."}\n```')).toEqual({ kind: 'question', answer: 'Yes.' });
  });

  it('never returns an answer for a bug, idea or other', () => {
    for (const kind of ['bug', 'idea', 'other']) {
      expect(parseAnswer(JSON.stringify({ kind, answer: 'Sorry about that, fixed soon!' }))).toEqual({ kind, answer: null });
    }
  });

  it('treats a blank or missing answer as no answer', () => {
    expect(parseAnswer('{"kind":"question","answer":"  "}')).toEqual({ kind: 'question', answer: null });
    expect(parseAnswer('{"kind":"question","answer":null}')).toEqual({ kind: 'question', answer: null });
    expect(parseAnswer('{"kind":"question"}')).toEqual({ kind: 'question', answer: null });
  });

  it('rejects unknown kinds and non-JSON', () => {
    expect(parseAnswer('{"kind":"spam","answer":"x"}')).toBeNull();
    expect(parseAnswer('I cannot help with that.')).toBeNull();
    expect(parseAnswer('')).toBeNull();
  });
});

describe('feedback instant answers: help sheet', () => {
  it('stays small enough to ride in every prompt', () => {
    expect(HELP_SHEET.length).toBeGreaterThan(2000);
    // ~4 chars per token: keep the sheet under roughly 6K tokens.
    expect(HELP_SHEET.length).toBeLessThan(24000);
  });

  it('keeps the BS Hoops sheet within the same budget', () => {
    expect(HOOPS_HELP_SHEET.length).toBeGreaterThan(2000);
    expect(HOOPS_HELP_SHEET.length).toBeLessThan(24000);
  });
});
