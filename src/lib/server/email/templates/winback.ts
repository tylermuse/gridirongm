import { SITE_URL, trackedUrl, unsubscribePageUrl } from '../config';
import { bulletList, button, escapeHtml, image, paragraph, renderLayout, textFooter } from '../layout';

export const WINBACK_CAMPAIGN = 'winback_v1';

export type WinbackRecipient = {
  token: string;
  team_name: string | null;
  wins: number;
  losses: number;
  championships: number;
};

export type BuiltEmail = { subject: string; html: string; text: string };

/** What changed in the game. Only list things that are live in production. */
const WHATS_NEW = [
  'Leagues start from the real 2026 NFL season, refreshed every Wednesday with real rosters and injuries',
  'Every team has its real head coach',
  'The live 3D sim moves a lot more like real football',
  'New: a 2027 mock draft simulator and a playoff machine',
];

function recordLine(r: WinbackRecipient): string {
  const record = `${r.wins}–${r.losses} all time`;
  if (r.championships === 1) return `${record}, 1 title`;
  if (r.championships > 1) return `${record}, ${r.championships} titles`;
  return record;
}

export function buildWinbackEmail(r: WinbackRecipient): BuiltEmail {
  const team = (r.team_name ?? '').trim() || 'franchise';
  const hasTeam = Boolean((r.team_name ?? '').trim());
  const possessive = hasTeam ? `Your ${team}` : 'Your franchise';
  const verb = hasTeam && !team.endsWith('s') ? 'is' : hasTeam ? 'are' : 'is';
  const subject = `${possessive} ${verb} still ${r.wins}–${r.losses}`;
  const playUrl = trackedUrl('/', WINBACK_CAMPAIGN);
  const unsubscribeUrl = unsubscribePageUrl(r.token);
  const opener = `${possessive} ${verb} right where you left ${hasTeam && verb === 'are' ? 'them' : 'it'}: ${recordLine(r)}.`;

  const bodyHtml = [
    paragraph('Hey GM,'),
    paragraph(escapeHtml(opener)),
    paragraph('A few things changed while you were gone:'),
    bulletList(WHATS_NEW.map(escapeHtml)),
    image({
      src: `${SITE_URL}/email/winback-3d-sim.jpg`,
      alt: 'A pass play developing in the BS Football live 3D sim',
      href: playUrl,
      width: 502,
      height: 283,
    }),
    button('Pick up where you left off', playUrl),
    paragraph('Tyler<br>BS Football'),
  ].join('\n');

  const html = renderLayout({
    preheader: 'Real 2026 rosters, real head coaches and a better 3D sim are waiting.',
    bodyHtml,
    unsubscribeUrl,
  });

  const text = [
    'Hey GM,',
    '',
    opener,
    '',
    'A few things changed while you were gone:',
    ...WHATS_NEW.map((line) => `- ${line}`),
    '',
    `Pick up where you left off: ${playUrl}`,
    '',
    'Tyler',
    'BS Football',
    '',
    textFooter(unsubscribeUrl),
  ].join('\n');

  return { subject, html, text };
}
