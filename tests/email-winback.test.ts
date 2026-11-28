import { describe, expect, it } from 'vitest';
import { FOOTER_ADDRESS, isCampaignLive } from '@/lib/server/email/config';
import { buildWinbackEmail } from '@/lib/server/email/templates/winback';

const TOKEN = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
const base = { token: TOKEN, team_name: 'Dallas Cowboys', wins: 41, losses: 27, championships: 1 };

describe('buildWinbackEmail', () => {
  it('personalizes the subject and opener', () => {
    const email = buildWinbackEmail(base);
    expect(email.subject).toBe('Your Dallas Cowboys are still 41–27');
    expect(email.text).toContain('Your Dallas Cowboys are right where you left them: 41–27 all time, 1 title.');
  });

  it('carries the unsubscribe link and mailing address in html and text', () => {
    const email = buildWinbackEmail(base);
    for (const body of [email.html, email.text]) {
      expect(body).toContain(`https://bs-football.com/unsubscribe?t=${TOKEN}`);
      expect(body).toContain(FOOTER_ADDRESS);
    }
  });

  it('tags the play link with the campaign', () => {
    expect(buildWinbackEmail(base).html).toContain('utm_campaign=winback_v1');
  });

  it('shows one 3D sim screenshot with an absolute URL and alt text', () => {
    const { html } = buildWinbackEmail(base);
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain('src="https://bs-football.com/email/winback-3d-sim.jpg"');
    expect(html).toContain('alt="A pass play developing in the BS Football live 3D sim"');
  });

  it('escapes a custom team name', () => {
    const email = buildWinbackEmail({ ...base, team_name: '<b>Hackers</b>' });
    expect(email.html).not.toContain('<b>Hackers</b>');
    expect(email.html).toContain('&lt;b&gt;Hackers&lt;/b&gt;');
  });

  it('handles a missing team name, a singular name and no titles', () => {
    expect(buildWinbackEmail({ ...base, team_name: null, championships: 0 }).text).toContain(
      'Your franchise is right where you left it: 41–27 all time.',
    );
    expect(buildWinbackEmail({ ...base, team_name: 'Miami Heat' }).subject).toBe('Your Miami Heat is still 41–27');
    expect(buildWinbackEmail({ ...base, championships: 3 }).text).toContain('3 titles');
  });
});

describe('isCampaignLive', () => {
  it('is off unless the campaign is listed', () => {
    expect(isCampaignLive('winback_v1', undefined)).toBe(false);
    expect(isCampaignLive('winback_v1', '')).toBe(false);
    expect(isCampaignLive('winback_v1', 'weekly')).toBe(false);
    expect(isCampaignLive('winback_v1', 'weekly, winback_v1')).toBe(true);
  });
});
