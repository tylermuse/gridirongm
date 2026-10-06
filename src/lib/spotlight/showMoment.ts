/**
 * Where the season is when an episode is made. The writer needs it (an
 * offseason episode must never talk about "the rest of the way"), and the
 * cold-open title line is built from it.
 */
export interface EpisodeMoment {
  phase: 'preseason' | 'regular' | 'playoffs' | 'resigning' | 'draft' | 'freeAgency';
  narrative: 'preseason' | 'tradeDeadline' | 'playoffsStart' | 'seasonOver' | 'weekly';
}

const PHASES = new Set<string>(['preseason', 'regular', 'playoffs', 'resigning', 'draft', 'freeAgency']);
const NARRATIVES = new Set<string>(['preseason', 'tradeDeadline', 'playoffsStart', 'seasonOver', 'weekly']);

export function sanitizeMoment(raw: unknown): EpisodeMoment | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { phase, narrative } = raw as Record<string, unknown>;
  if (typeof phase !== 'string' || !PHASES.has(phase)) return undefined;
  return { phase: phase as EpisodeMoment['phase'], narrative: (typeof narrative === 'string' && NARRATIVES.has(narrative) ? narrative : 'weekly') as EpisodeMoment['narrative'] };
}

export const isOffseason = (phase?: string): boolean => phase === 'resigning' || phase === 'draft' || phase === 'freeAgency';

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function numberWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
}

/** "6-11" → "six and eleven"; "9-7-1" → "nine, seven and one" (how hosts say it). */
export function recordWords(record?: string | null): string | null {
  const m = record?.match(/^(\d+)-(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const [w, l, t] = [m[1], m[2], m[3]].map(x => (x == null ? null : numberWords(Number(x))));
  return t ? `${w}, ${l} and ${t}` : `${w} and ${l}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The cold-open line Marcus says over the title card, right after the welcome. */
export function hookLine(teamName: string, record?: string | null, m?: EpisodeMoment): string {
  const r = recordWords(record);
  const today = `Today, the ${teamName}.`;
  if (!m) return `And today we're breaking down the ${teamName}.`;
  if (isOffseason(m.phase)) return r ? `${cap(r)} last season, and now it's decision time. ${today}` : `It's decision time. ${today}`;
  if (m.phase === 'preseason') return `A brand new season, and a lot to sort out. ${today}`;
  if (m.narrative === 'tradeDeadline') return r ? `${cap(r)} at the trade deadline. Buy, sell, or sit tight? ${today}` : `It's trade deadline week. ${today}`;
  if (m.narrative === 'playoffsStart') return r ? `${cap(r)}, and now it's win or go home. ${today}` : `It's win or go home. ${today}`;
  if (m.narrative === 'seasonOver') return r ? `The season's in the books at ${r}. ${today}` : `The season's in the books. ${today}`;
  if (m.narrative === 'preseason') return `Week one is done. ${today}`;
  return r ? `Sitting at ${r}. ${today}` : `And today we're breaking down the ${teamName}.`;
}

/** The writer's MOMENT line: what's true about the calendar right now. */
export function momentNote(m: EpisodeMoment | undefined, record?: string | null): string {
  if (!m) return 'Regular season.';
  const rec = record ? ` ${record}` : '';
  if (isOffseason(m.phase)) {
    const step = m.phase === 'resigning' ? 'the re-signing window' : m.phase === 'draft' ? 'the draft' : 'free agency';
    return `OFFSEASON — ${step}. The${rec} record is LAST season's final mark; no games are left and none are scheduled yet. Never talk about the rest of the season, playoff races, games back, streaks, injuries that affect upcoming games, or an upcoming opponent. Talk about the season that ended and the decisions now (re-signings, the draft, free agency, the roster for next year).`;
  }
  if (m.phase === 'preseason') return 'PRESEASON — no games have been played yet this season. Talk about expectations and questions, not results.';
  if (m.phase === 'playoffs') return m.narrative === 'seasonOver' ? `PLAYOFFS — the team's season just ended (eliminated, or won it all — see the notes). Final record${rec}.` : `PLAYOFFS — the team is still alive; the next game is win or go home. Record${rec}.`;
  if (m.narrative === 'seasonOver') return `END OF REGULAR SEASON — the team missed the playoffs. Final record${rec}.`;
  if (m.narrative === 'tradeDeadline') return `REGULAR SEASON — trade deadline week. Record so far${rec}.`;
  return `REGULAR SEASON. Record so far${rec}.`;
}
