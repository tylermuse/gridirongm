/**
 * Team stat line for the Spotlight show's on-screen graphics (basketball):
 * real numbers + league ranks for any team, and a keyword matcher so the stat
 * a host is talking about gets highlighted. BS Football's version ranks
 * passing/rushing yards; Hoops ranks scoring, defense, shooting and the glass.
 */
import type { ShowPlayer, ShowTeam } from './types';

export type ShowStatKey = 'ppg' | 'pag' | 'fg3' | 'reb' | 'ast';

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

export function computeShowStatLine(team: ShowTeam, allTeams: ShowTeam[], allPlayers: ShowPlayer[]): ShowStatLine | null {
  const gp = team.record.wins + team.record.losses;
  if (gp === 0) return null;

  const rows = allTeams.map(t => {
    const tgp = Math.max(1, t.record.wins + t.record.losses);
    let reb = 0, ast = 0, tpm = 0, tpa = 0;
    for (const p of allPlayers) {
      if (p.teamId !== t.id || !p.stats) continue;
      reb += p.stats.totalRebounds;
      ast += p.stats.assists;
      tpm += p.stats.threePointsMade;
      tpa += p.stats.threePointsAttempted;
    }
    return {
      id: t.id,
      ppg: t.record.pointsFor / tgp,
      pag: t.record.pointsAgainst / tgp,
      fg3: tpa > 0 ? (tpm / tpa) * 100 : 0,
      reb: reb / tgp,
      ast: ast / tgp,
    };
  });
  const me = rows.find(r => r.id === team.id);
  if (!me) return null;

  const rank = (k: ShowStatKey, higherIsBetter = true) =>
    [...rows].sort((a, b) => (higherIsBetter ? b[k] - a[k] : a[k] - b[k])).findIndex(r => r.id === team.id) + 1;
  const of = rows.length;

  return {
    record: `${team.record.wins}-${team.record.losses}`,
    stats: [
      { key: 'ppg', label: 'PPG', value: me.ppg.toFixed(1), rank: rank('ppg'), of },
      { key: 'pag', label: 'Opp PPG', value: me.pag.toFixed(1), rank: rank('pag', false), of },
      { key: 'fg3', label: '3P %', value: `${me.fg3.toFixed(1)}%`, rank: rank('fg3'), of },
      { key: 'reb', label: 'RPG', value: me.reb.toFixed(1), rank: rank('reb'), of },
      { key: 'ast', label: 'APG', value: me.ast.toFixed(1), rank: rank('ast'), of },
    ],
  };
}

const KEYWORDS: [ShowStatKey, RegExp][] = [
  ['fg3', /\bthree[- ]point|\bthrees\b|\bfrom (deep|three|downtown|outside)\b|\bperimeter shooting\b|\bthe arc\b|\b3[- ]?(pt|point)/i],
  ['reb', /\brebound|\bthe glass\b|\bboards\b|\bsecond[- ]chance\b/i],
  ['ast', /\bassists?\b|\bball movement\b|\bmoving the ball\b|\bpassing\b/i],
  ['pag', /\bdefen[cs]e\b|\ballow(ing|s|ed)?\b|\bgiving up\b|\bpoints against\b|\bopp(onent)?s? (are )?scor/i],
  ['ppg', /\boffen[cs]e\b|\bppg\b|\bpoints (per|a) game\b|\bscoring\b|\bputting up\b/i],
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
