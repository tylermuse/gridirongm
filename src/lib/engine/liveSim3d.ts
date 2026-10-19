/**
 * Live 3D sim — maps a PlayEvent to the outcome the standalone chase-cam sim
 * (public/chase-cam/index.html, driven over postMessage in embed mode) should
 * picture. The 2D field and the engines stay the source of truth: the sim only
 * animates what already happened, with the real score / down / spot.
 *
 * Works with both engines (see gameplayClips.ts for the same split):
 *  - playByPlay.ts: TDs arrive as type 'touchdown'; rush vs pass only in the text.
 *  - liveCoachEngine.ts: TDs arrive as 'run' / 'pass_complete' with isScoring.
 * down / yardsToGo / fieldPos are PRE-snap; homeScore / awayScore are POST-play.
 */
import type { PlayEvent } from './playByPlay';
import { portraitFileFor } from '@/lib/portraits/portraitPool';
import portraitSkin from '@/lib/portraits/portraitSkin.json';

export interface SimPlayResult {
  kind: 'run' | 'complete' | 'incomplete' | 'sack' | 'int' | 'fg' | 'punt';
  yards?: number;
  depth?: 'short' | 'deep';
  good?: boolean;
  /** 'scramble': the QB drops, the pocket collapses and he takes off; 'screen': the back takes a soft throw behind the line with blockers out front */
  style?: 'scramble' | 'screen';
  /** the run ends in a lost fumble (the engine logs it as the next event): stripped at the tackle, the defense falls on it */
  fumble?: boolean;
}

export interface SimPlayMessage {
  type: 'bsgm:play';
  id: number;
  possession: 'home' | 'away';
  pre: { fieldPos: number; down: number; toGo: number; quarter: number; clock: number; homeScore: number; awayScore: number };
  res: SimPlayResult;
  /** who has the ball / makes the sack or pick, by number + skin (see whoMadeThePlay) */
  who?: SimWho;
}

/** Pre-snap situation for the idle sim (no play running): it re-forms at this spot with this scorebug. */
export interface SimStateMessage {
  type: 'bsgm:state';
  possession: 'home' | 'away';
  pre: { fieldPos: number; down: number; toGo: number; quarter: number; clock: number; homeScore: number; awayScore: number };
}

/** One man on the field: jersey number + skin tone (hex). */
export interface SimMan { n: number; s: string }
/** Starters by slot, depth-chart order (wr[0] = WR1 …). Missing slots fall back to the sim's defaults. */
export interface SimLineup {
  qb?: SimMan; rb?: SimMan; te?: SimMan; k?: SimMan; p?: SimMan;
  wr: SimMan[]; ol: SimMan[]; dl: SimMan[]; lb: SimMan[]; cb: SimMan[]; s: SimMan[];
}
export interface SimTeam { id: string; name: string; jersey: string; num: string; pants: string; helmet: string; stripe: string; lineup?: SimLineup }

const RUSH_TD_RE = /punches it in|crosses the goal line|-yard rush|stretches across|pylon|runs it in/i;
const SCRAMBLE_RE = /scramble/i;
const SCREEN_RE = /screen/i;
const TWO_POINT_RE = /^2-PT|two-point/i;
const KNEEL_RE = /takes a knee|kneels|victory formation/i;
const FAKE_RE = /FAKE PUNT|ONSIDE/i;
const NON_PLAY_RE = /timeout called|turnover on downs|^⏱/i;   // engine bookkeeping that rides on the 'run' type: no snap happened

/** "12:34" -> seconds; anything unparseable -> 900. */
export function clockSeconds(timeStr: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(timeStr ?? '');
  if (!m) return 900;
  return Math.max(0, Math.min(900, parseInt(m[1], 10) * 60 + parseInt(m[2], 10)));
}

/** Outcome the sim should animate, or null for plays it has no choreography for
 *  (kickoffs, fumbles, penalties, kneels, XPs, timeouts, quarter breaks, fakes). */
export function toSimResult(e: PlayEvent): SimPlayResult | null {
  if (FAKE_RE.test(e.description)) return null;
  const y = e.yardsGained ?? 0;
  const toGoal = 100 - e.fieldPos;
  const td = (yards: number) => Math.max(yards, toGoal);   // the sim scores when yards >= yards-to-goal
  switch (e.type) {
    case 'run':
      if (KNEEL_RE.test(e.description) || NON_PLAY_RE.test(e.description)) return null;
      return { kind: 'run', yards: e.isScoring ? td(y) : y, ...(SCRAMBLE_RE.test(e.description) ? { style: 'scramble' as const } : {}) };
    case 'pass_complete':
      return { kind: 'complete', depth: y >= 20 && !SCREEN_RE.test(e.description) ? 'deep' : 'short', yards: e.isScoring ? td(y) : y, ...(SCREEN_RE.test(e.description) ? { style: 'screen' as const } : {}) };
    case 'pass_incomplete':
      return { kind: 'incomplete', depth: /deep|bomb|downfield|long/i.test(e.description) ? 'deep' : 'short', ...(SCREEN_RE.test(e.description) ? { style: 'screen' as const } : {}) };
    case 'touchdown':
      return RUSH_TD_RE.test(e.description)
        ? { kind: 'run', yards: td(y) }
        : SCREEN_RE.test(e.description)
          ? { kind: 'complete', depth: 'short', yards: td(y), style: 'screen' as const }   // a screen that scores is still a screen (goal line)
          : { kind: 'complete', depth: Math.max(y, toGoal) >= 20 ? 'deep' : 'short', yards: td(y) };   // a screen that scores is still a screen (goal line)
    case 'sack':
      return { kind: 'sack', yards: y };
    case 'interception':
      return { kind: 'int', depth: /deep|downfield|long/i.test(e.description) ? 'deep' : 'short' };
    case 'field_goal_good':
      return { kind: 'fg', good: true };
    case 'field_goal_miss':
      return { kind: 'fg', good: false };
    case 'punt':
      return { kind: 'punt' };
    case 'extra_point':
      // an XP is a 33-yard kick from the 15; the result of a two-point try is already pictured by the play itself
      if (TWO_POINT_RE.test(e.description)) return null;
      return { kind: 'fg', good: /GOOD/.test(e.description) && !/no good/i.test(e.description) };
    default:
      return null;
  }
}

/** Points this event put on the board, so the sim can show the pre-snap score. */
function pointsScored(e: PlayEvent): number {
  if (e.type === 'field_goal_good') return 3;
  if (e.type === 'extra_point') return /GOOD/.test(e.description) && !/no good/i.test(e.description) ? 1 : 0;
  if (TWO_POINT_RE.test(e.description) && e.isScoring) return 2;
  if (e.type === 'touchdown' || e.isScoring) return 6;   // the XP is its own event
  return 0;
}

export function toSimPlay(
  e: PlayEvent,
  rosters?: { home: SimNamedPlayer[]; away: SimNamedPlayer[]; photoSkins?: Record<string, string> },
  next?: PlayEvent | null,
): SimPlayMessage | null {
  const res = toSimResult(e);
  if (!res) return null;
  // The engine logs a lost fumble as its own event right after the run ("Fumble! X loses the ball — recovered by Y"):
  // picture both as one play — the run ends with the strip and the defense on the ball.
  const fumbleNext = !!next && next.type === 'fumble' && res.kind === 'run' && !e.isScoring;
  if (fumbleNext) res.fumble = true;
  const pts = pointsScored(e);
  return {
    type: 'bsgm:play',
    id: e.id,
    possession: e.possession,
    pre: {
      fieldPos: e.type === 'extra_point' ? 85 : e.fieldPos,
      down: e.down,
      toGo: e.yardsToGo,
      quarter: e.quarter,
      clock: clockSeconds(e.timeStr),
      homeScore: e.homeScore - (e.possession === 'home' ? pts : 0),
      awayScore: e.awayScore - (e.possession === 'away' ? pts : 0),
    },
    res,
    ...(rosters ? { who: withRecoverer(whoMadeThePlay(e, e.possession === 'home' ? rosters.home : rosters.away, e.possession === 'home' ? rosters.away : rosters.home, rosters.photoSkins),
      fumbleNext ? next : null, e.possession === 'home' ? rosters.away : rosters.home, rosters.photoSkins) } : {}),
  };
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const SKIN = portraitSkin as Record<string, string>;
const SKIN_TONES = Object.values(SKIN);

/** FNV-1a: small, stable string hash. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface SimPlayerLike { id: string; position: string; jerseyNumber?: number; photoUrl?: string; portraitSeedOverride?: string }

/** Skin tone for the 3D player: measured from the same generated headshot the
 *  rest of the game shows for him (scripts: portraitSkin.json, cheeks + nose
 *  bridge, beard/shadow/highlights dropped). Players with an imported photo get
 *  a stable tone drawn from the pool's real distribution. */
export function skinToneFor(p: SimPlayerLike, photoSkins?: Record<string, string>): string {
  const seed = p.portraitSeedOverride ?? p.id;
  if (p.photoUrl && photoSkins?.[p.photoUrl]) return photoSkins[p.photoUrl];
  if (!p.photoUrl) {
    const file = portraitFileFor(seed, p.position);
    if (file && SKIN[file]) return SKIN[file];
  }
  return SKIN_TONES.length ? SKIN_TONES[hash(seed) % SKIN_TONES.length] : '#b07a55';
}

/** A real headshot worth measuring (not the blank-face placeholder some imports carry). */
export function isRealPhoto(url: string | undefined): url is string {
  return !!url && /^https?:\/\//.test(url) && !/blank-face/i.test(url);
}

/** Skin tone read from a real headshot in the browser: cheeks + nose bridge of
 *  a centred, cut-out portrait (ESPN / NFL style); transparent, non-skin, shadow
 *  and highlight pixels dropped, median of the rest. Null when the image can't
 *  be read (no CORS, load error) — the caller keeps the fallback tone. */
export function sampleSkinFromPhoto(url: string): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onerror = () => resolve(null);
    im.onload = () => {
      try {
        const W = im.naturalWidth, H = im.naturalHeight;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d'); if (!g) return resolve(null);
        g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, W, H).data;
        const px: [number, number, number][] = [];
        for (const [x0, y0, x1, y1] of [[.33, .40, .42, .47], [.58, .40, .67, .47], [.46, .36, .54, .43]]) {
          for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y++) for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x++) {
            const i = (y * W + x) * 4; if (d[i + 3] < 200) continue; px.push([d[i], d[i + 1], d[i + 2]]);
          }
        }
        const lum = (p: [number, number, number]) => .3 * p[0] + .59 * p[1] + .11 * p[2];
        let sel = px.filter(p => p[0] >= p[1] - 4 && p[1] >= p[2] - 8 && lum(p) > 25 && lum(p) < 245);
        if (sel.length < 50) sel = px;
        if (sel.length < 20) return resolve(null);
        const ls = sel.map(lum).sort((a, b) => a - b);
        const lo = ls[Math.floor(ls.length * .05)], hi = ls[Math.floor(ls.length * .55)];   // studio key light lifts cheeks: the lower half reads truer, most of all on dark skin
        sel = sel.filter(p => lum(p) >= lo && lum(p) <= hi);
        const med = (k: 0 | 1 | 2) => { const v = sel.map(p => p[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
        resolve('#' + ([0, 1, 2] as const).map(k => Math.round(med(k)).toString(16).padStart(2, '0')).join(''));
      } catch { resolve(null); }   // tainted canvas: the host doesn't allow CORS
    };
    im.src = url;
  });
}

/** Starters for the sim from a roster already in depth-chart order. */
export function toSimLineup(players: SimPlayerLike[], photoSkins?: Record<string, string>): SimLineup {
  const used = new Set<number>();
  const man = (p: SimPlayerLike | undefined): SimMan | undefined => {
    if (!p) return undefined;
    let n = Number(p.jerseyNumber ?? -1);
    if (!Number.isInteger(n)) n = -1;
    if (n < 0 || n > 99 || used.has(n)) n = -1;          // no number (or a duplicate): the sim keeps its default for that slot
    if (n >= 0) used.add(n);
    return n >= 0 ? { n, s: skinToneFor(p, photoSkins) } : undefined;
  };
  const at = (pos: string, k: number) => players.filter(p => p.position === pos).slice(0, k).map(man).filter((m): m is SimMan => !!m);
  const one = (pos: string) => man(players.find(p => p.position === pos));
  return { qb: one('QB'), rb: one('RB'), te: one('TE'), k: one('K'), p: one('P'),
    wr: at('WR', 3), ol: at('OL', 5), dl: at('DL', 4), lb: at('LB', 3), cb: at('CB', 2), s: at('S', 2) };
}

/** Uniform palette for the sim from a team's two colours. Home wears its primary;
 *  away wears white with its primary as the number / helmet colour (NFL convention). */
export function toSimTeam(
  t: { abbreviation: string; name: string; primaryColor: string; secondaryColor: string },
  side: 'home' | 'away',
  players?: SimPlayerLike[],
  photoSkins?: Record<string, string>,
): SimTeam {
  const kit = simKit(t, side);
  return players && players.length ? { ...kit, lineup: toSimLineup(players, photoSkins) } : kit;
}

function simKit(
  t: { abbreviation: string; name: string; primaryColor: string; secondaryColor: string },
  side: 'home' | 'away',
): SimTeam {
  const p = t.primaryColor, s = t.secondaryColor;
  const light = luminance(p) > 0.6;
  if (side === 'home') {
    return { id: t.abbreviation, name: t.name, jersey: p, num: light ? '#1a1a1a' : '#ffffff', pants: light ? s : '#e6e8ec', helmet: p, stripe: s };
  }
  return { id: t.abbreviation, name: t.name, jersey: '#f4f1ea', num: light ? s : p, pants: '#f4f1ea', helmet: light ? s : p, stripe: light ? p : s };
}

/** The man who has the ball on the play (runner / target) and, for a sack or a
 *  pick, the defender who makes it — found by name in the play-by-play line
 *  ("J. Hurts completes to D. Smith for 11 yards."), so the 3D player making
 *  the play wears his number and skin. */
export interface SimWho { ball?: SimMan & { pos: string }; def?: SimMan & { pos: string } }
export interface SimNamedPlayer extends SimPlayerLike { firstName: string; lastName: string }

function namesIn(desc: string, roster: SimNamedPlayer[]): { p: SimNamedPlayer; at: number }[] {
  const out: { p: SimNamedPlayer; at: number }[] = [];
  for (const p of roster) {
    if (!p.firstName || !p.lastName) continue;
    const tag = `${p.firstName[0]}. ${p.lastName}`;
    const at = desc.indexOf(tag);
    if (at < 0) continue;
    const next = desc[at + tag.length];
    if (next && /[A-Za-z]/.test(next)) continue;            // "J. Smith" inside "J. Smithson"
    if (!out.some(o => o.at === at)) out.push({ p, at });   // two men with the same initial + name: depth chart order wins
  }
  return out.sort((a, b) => a.at - b.at);
}

export function whoMadeThePlay(
  e: PlayEvent, offense: SimNamedPlayer[], defense: SimNamedPlayer[], photoSkins?: Record<string, string>,
): SimWho | undefined {
  const man = (p: SimNamedPlayer) => {
    const n = Number(p.jerseyNumber);
    return Number.isInteger(n) && n >= 0 && n <= 99 ? { n, s: skinToneFor(p, photoSkins), pos: p.position } : undefined;
  };
  const who: SimWho = {};
  if (e.type === 'sack' || e.type === 'interception') {
    const d = namesIn(e.description, defense)[0]; if (d) who.def = man(d.p);
  }
  if (e.type !== 'sack' && e.type !== 'interception') {
    const o = namesIn(e.description, offense);
    // the passer is named first on a throw; the man with the ball is the last non-QB named (or the QB himself on a keeper)
    const ball = [...o].reverse().find(x => x.p.position !== 'QB') ?? (o.length === 1 ? o[0] : undefined);
    if (ball) who.ball = man(ball.p);
  }
  return who.ball || who.def ? who : undefined;
}

/** The defender who falls on a fumble (named in the fumble line) goes in who.def. */
function withRecoverer(who: SimWho | undefined, fumble: PlayEvent | null | undefined, defense: SimNamedPlayer[], photoSkins?: Record<string, string>): SimWho | undefined {
  if (!fumble) return who;
  const rec = namesIn(fumble.description, defense)[0]?.p;
  const n = Number(rec?.jerseyNumber);
  if (!rec || !Number.isInteger(n)) return who;
  return { ...(who ?? {}), def: { n, s: skinToneFor(rec, photoSkins), pos: rec.position } };
}
