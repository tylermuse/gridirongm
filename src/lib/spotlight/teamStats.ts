/**
 * Team stat line for the Spotlight show's on-screen graphics.
 *
 * Same formulas as the dashboard "Team Stats" card (GameApp), computed for
 * any team so the show can put real numbers + league ranks on screen, and a
 * keyword matcher so the stat a host is talking about gets highlighted.
 */
import type { Player, Team } from '@/types';

export type ShowStatKey = 'ppg' | 'pag' | 'pass' | 'rush' | 'yds';

export interface ShowStat {
  key: ShowStatKey;
  label: string;
  value: string;
  /** 1 = best in the league for this stat. */
  rank: number;
  of: number;
}

export interface ShowStatLine {
  record: string;
  stats: ShowStat[];
}

export function computeShowStatLine(team: Team, allTeams: Team[], allPlayers: Player[]): ShowStatLine | null {
  const gp = team.record.wins + team.record.losses;
  if (gp === 0) return null;

  const rows = allTeams.map(t => {
    const tgp = Math.max(1, t.record.wins + t.record.losses);
    let pass = 0;
    let rush = 0;
    for (const p of allPlayers) {
      if (p.teamId !== t.id) continue;
      pass += p.stats.passYards;
      rush += p.stats.rushYards;
    }
    return {
      id: t.id,
      ppg: t.record.pointsFor / tgp,
      pag: t.record.pointsAgainst / tgp,
      pass: pass / tgp,
      rush: rush / tgp,
      yds: (pass + rush) / tgp,
    };
  });
  const me = rows.find(r => r.id === team.id);
  if (!me) return null;

  const rank = (k: ShowStatKey, higherIsBetter = true) =>
    [...rows].sort((a, b) => (higherIsBetter ? b[k] - a[k] : a[k] - b[k])).findIndex(r => r.id === team.id) + 1;
  const of = rows.length;

  return {
    record: `${team.record.wins}-${team.record.losses}${team.record.ties ? `-${team.record.ties}` : ''}`,
    stats: [
      { key: 'ppg', label: 'PPG', value: me.ppg.toFixed(1), rank: rank('ppg'), of },
      { key: 'pag', label: 'Opp PPG', value: me.pag.toFixed(1), rank: rank('pag', false), of },
      { key: 'pass', label: 'Pass YDS/G', value: me.pass.toFixed(0), rank: rank('pass'), of },
      { key: 'rush', label: 'Rush YDS/G', value: me.rush.toFixed(0), rank: rank('rush'), of },
      { key: 'yds', label: 'Total YDS/G', value: me.yds.toFixed(0), rank: rank('yds'), of },
    ],
  };
}

const KEYWORDS: [ShowStatKey, RegExp][] = [
  ['rush', /\brush(ing|es|ed)?\b|\bground game\b|\brun game\b|\brunning game\b/i],
  ['pass', /\bpass(ing|es)?\b|\baerial\b|\bair attack\b|\bthrowing\b/i],
  ['pag', /\bdefen[cs]e\b|\ballow(ing|s|ed)?\b|\bgiving up\b|\bpoints against\b|\bopp(onent)?s? (are )?scor/i],
  ['ppg', /\boffen[cs]e\b|\bppg\b|\bpoints per game\b|\bscoring\b|\bputting up\b/i],
  ['yds', /\btotal yards\b|\byards per game\b/i],
];

/** Stats a line of commentary is talking about, in the order they're said. */
export function statsMentioned(text: string): ShowStatKey[] {
  return KEYWORDS
    .map(([k, re]) => [k, text.search(re)] as const)
    .filter(([, at]) => at >= 0)
    .sort((a, b) => a[1] - b[1])
    .map(([k]) => k);
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** 'good' = top third of the league, 'bad' = bottom third. */
export function rankTone(rank: number, of: number): 'good' | 'mid' | 'bad' {
  if (rank <= Math.ceil(of / 3)) return 'good';
  if (rank > of - Math.ceil(of / 3)) return 'bad';
  return 'mid';
}
