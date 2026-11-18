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

describe('feedback instant answers: answers must come from the sheet', () => {
  const SHEET = [
    '- To cut a player: open "Roster" in the sidebar, click "Actions ▾" at the right end of the row, then "Cut Player".',
    '- Not in the game: a difficulty setting, and sound or volume settings.',
    '- "God Mode" (commissioner): adds "Edit Player" on player cards and "+ Create Player" on the Roster page.',
  ].join('\n');
  const reply = (sheet_lines: unknown, answer: string) => JSON.stringify({ sheet_lines, kind: 'question', answer });

  it('keeps an answer whose quoted line is in the sheet', () => {
    const raw = reply(['To cut a player: open "Roster" in the sidebar, click "Actions ▾" at the right end of the row, then "Cut Player".'], 'Open "Roster", then "Actions ▾", then "Cut Player".');
    expect(parseAnswer(raw, SHEET)?.answer).toBe('Open "Roster", then "Actions ▾", then "Cut Player".');
  });

  it('still counts a line the model reworded at the start', () => {
    const raw = reply(['Cutting a player: open "Roster" in the sidebar, click "Actions ▾" at the right end of the row'], 'Open "Roster".');
    expect(parseAnswer(raw, SHEET)?.answer).toBe('Open "Roster".');
  });

  it('drops an answer with no quoted line, or a made-up one', () => {
    expect(parseAnswer(reply([], 'Open the Team Colors page.'), SHEET)).toEqual({ kind: 'question', answer: null });
    expect(parseAnswer(reply(['Team colors can be changed on the Team Colors page under Settings.'], 'Open the Team Colors page.'), SHEET)).toEqual({ kind: 'question', answer: null });
  });

  it('drops a "you can\'t" that no quoted line backs up', () => {
    // The real failure: "can i edit draft" answered "There isn't a way" from a line that never said so.
    const line = '"God Mode" (commissioner): adds "Edit Player" on player cards and "+ Create Player" on the Roster page.';
    expect(parseAnswer(reply([line], "There isn't a way to rename a player."), SHEET)).toEqual({ kind: 'question', answer: null });
    expect(parseAnswer(reply([line], 'You cannot edit the draft once it has started.'), SHEET)).toEqual({ kind: 'question', answer: null });
  });

  it('keeps a "you can\'t" when the quoted line says so', () => {
    const raw = reply(['Not in the game: a difficulty setting, and sound or volume settings.'], "There isn't a difficulty setting.");
    expect(parseAnswer(raw, SHEET)?.answer).toBe("There isn't a difficulty setting.");
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
