import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayCallMenu } from '@/components/game/PlayCallMenu';

// QA 11/8 (3D sim pass, bug 3): 4th & 3 at your own 38 offered "Field Goal" — a 79-yard try.
function menu(fieldPos: number, down: number) {
  return renderToStaticMarkup(createElement(PlayCallMenu, {
    state: {
      quarter: 1, timeStr: '3:45', homeScore: 0, awayScore: 0, homeAbbr: 'NE', awayAbbr: 'DAL',
      down, yardsToGo: 3, fieldPos, fieldDescription: '',
    },
    isFourthDown: down === 4,
    onPlayCall: () => {}, onAutoSimRest: () => {}, onToggleOff: () => {},
  }));
}

describe('PlayCallMenu field goal range', () => {
  it('hides the FG on 4th down from your own 38 (79 yards)', () => {
    const html = menu(38, 4);
    expect(html).not.toContain('Field Goal');
    expect(html).toContain('Punt');
    expect(html).toContain('Go For It');
  });

  it('offers the FG on 4th down in range, with its distance', () => {
    expect(menu(70, 4)).toContain('Field Goal (47 yds)');
    expect(menu(55, 4)).toContain('Field Goal (62 yds)');
    expect(menu(54, 4)).not.toContain('Field Goal');
  });

  it('keeps the any-down FG button on the same range', () => {
    expect(menu(55, 2)).toContain('Kick Field Goal (62 yds)');
    expect(menu(54, 2)).not.toContain('Kick Field Goal');
  });
});
