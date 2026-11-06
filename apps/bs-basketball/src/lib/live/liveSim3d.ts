/**
 * Court Cam (live 3D sim) adapter — turns one play-log possession into the
 * message the standalone three.js sim (public/court-cam/index.html, driven over
 * postMessage in embed mode) animates. The engine's log stays the source of
 * truth: the sim pictures the real shooter at the real spot with the real
 * result, the real five on the floor, and the real score afterwards.
 *
 * Slots are positions in a side's five (PG SG SF PF C — the engine logs the
 * lineup in that order), which is how the sim addresses bodies.
 */
import type { BasketballPlayer, PlayLog, PlayLogEntry, PlayLogFieldCode } from '@bs/sport-basketball';

type Players = Record<string, BasketballPlayer>;
type PossessionEntry = Extract<PlayLogEntry, { k: 'p' }>;

export interface SimPlayerSpec { id: string; name: string; num: number; skin?: string; heightFt: number; pos: string }
export interface SimTeamSpec { id: string; name: string; abbr: string; jersey: string; num: string; shorts: string; trim: string; floorKey: string; players: SimPlayerSpec[] }

export interface SimPossession {
  id: number;
  off: 0 | 1;
  pt: string;
  st?: 'three' | 'midrange' | 'at_rim' | 'post';
  zone?: string;
  shooter?: number | null;
  assister?: number | null;
  made?: boolean;
  pts: number;
  h: number; a: number;
  contested?: boolean;
  dunk?: boolean;
  blk?: number | null;
  orb?: number | null;
  drb?: number | null;
  to?: number | null;
  stl?: number | null;
  fouled?: boolean;
  fta?: number; ftm?: number; ftMakes?: boolean[];
  bonusFt?: boolean; fouler?: number; ftShooter?: number;
  /** Non-shooting foul before the shot with no free throws (not in the bonus): defender slot. */
  foul?: number | null;
  q: number;
  /** Seconds left in the period when the possession started / ended. */
  clockStart: number; clockEnd: number; secs: number;
  lineups: { home: SimPlayerSpec[]; away: SimPlayerSpec[] };
}

export interface SimPossessionMessage { type: 'bsh:poss'; id: number; p: SimPossession }

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const SKINS = ['#8d5524', '#c68642', '#e0ac69', '#5c3a21', '#a86b3c', '#f1c27d', '#6f4325', '#3b2314'];

export function isRealPhoto(url: string | undefined): url is string {
  return !!url && /^https?:\/\//.test(url) && !/blank-face/i.test(url);
}

/** Skin tone read from a headshot in the browser (centre-of-face sample; BBGM
 *  portraits are centred head-and-shoulders). Null when the image can't be read
 *  cross-origin — the caller keeps the hashed fallback tone. */
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
        for (const [x0, y0, x1, y1] of [[.36, .38, .46, .5], [.54, .38, .64, .5], [.45, .3, .55, .4]]) {
          for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y++) for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x++) {
            const i = (y * W + x) * 4; if (d[i + 3] < 200) continue; px.push([d[i], d[i + 1], d[i + 2]]);
          }
        }
        const lum = (p: [number, number, number]) => .3 * p[0] + .59 * p[1] + .11 * p[2];
        let sel = px.filter(p => p[0] >= p[1] - 4 && p[1] >= p[2] - 8 && lum(p) > 25 && lum(p) < 245);
        if (sel.length < 50) sel = px;
        if (sel.length < 20) return resolve(null);
        const ls = sel.map(lum).sort((a, b) => a - b);
        const lo = ls[Math.floor(ls.length * .05)], hi = ls[Math.floor(ls.length * .55)];
        sel = sel.filter(p => lum(p) >= lo && lum(p) <= hi);
        const med = (k: 0 | 1 | 2) => { const v = sel.map(p => p[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
        resolve('#' + ([0, 1, 2] as const).map(k => Math.round(med(k)).toString(16).padStart(2, '0')).join(''));
      } catch { resolve(null); }
    };
    im.src = url;
  });
}

/** Jersey numbers aren't modelled in BS Hoops: a stable number per player, unique within a five. */
function jerseyNumbers(ids: string[]): number[] {
  const used = new Set<number>(); const out: number[] = [];
  for (const id of ids) { let n = hash(id) % 56; while (used.has(n)) n = (n + 7) % 56; used.add(n); out.push(n); }
  return out;
}

export function toSimPlayers(ids: string[], players: Players, photoSkins: Record<string, string> = {}): SimPlayerSpec[] {
  const nums = jerseyNumbers(ids);
  return ids.map((id, i) => {
    const p = players[id];
    const photo = p?.sportData?.photoUrl;
    return {
      id, num: nums[i],
      name: p ? `${p.firstName[0]}. ${p.lastName}` : 'Player',
      heightFt: p ? Math.max(5.7, Math.min(7.6, p.ratings.height / 12)) : 6.6,
      pos: p?.sportData?.position ?? ['PG', 'SG', 'SF', 'PF', 'C'][i],
      skin: (photo && photoSkins[photo]) || SKINS[hash(id + 'skin') % SKINS.length],
    };
  });
}

type TeamLike = { id: string; abbreviation: string; name: string; city: string; primaryColor: string; secondaryColor: string };
function luminance(hex: string): number { const n = parseInt(hex.replace('#', ''), 16); if (Number.isNaN(n)) return .5; const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (.299 * r + .587 * g + .114 * b) / 255; }

/** Team kit for the sim: home wears its primary, away its secondary unless that's too close to the home colour. */
export function toSimTeam(t: TeamLike, side: 'home' | 'away', opp: TeamLike | null, five: SimPlayerSpec[]): SimTeamSpec {
  let jersey = side === 'home' ? t.primaryColor : t.secondaryColor;
  let trim = side === 'home' ? t.secondaryColor : t.primaryColor;
  if (side === 'away' && opp && Math.abs(luminance(jersey) - luminance(opp.primaryColor)) < .18) { jersey = t.primaryColor; trim = t.secondaryColor; }
  if (side === 'away' && opp && Math.abs(luminance(jersey) - luminance(opp.primaryColor)) < .12) { jersey = '#f4f4f4'; trim = t.primaryColor; }
  const num = luminance(jersey) > .55 ? '#111111' : '#ffffff';
  return { id: t.id, name: t.city || t.name, abbr: t.abbreviation, jersey, num, shorts: jersey, trim, floorKey: t.primaryColor, players: five };
}

/** The five on the floor per side at each log index (from the 's' entries). */
export function lineupsAt(playLog: PlayLog, idx: number): { home: string[]; away: string[] } {
  const out = { home: [] as string[], away: [] as string[] };
  for (let i = 0; i <= idx && i < playLog.entries.length; i++) { const e = playLog.entries[i]; if (e.k === 's') out[e.side === 'h' ? 'home' : 'away'] = e.ids.map(j => playLog.ids[j]); }
  return out;
}

const PERIOD_SECS = (q: number) => (q <= 4 ? 720 : 300);

/** Build the sim's possession from log entry `idx`. Null when the entry isn't a possession. */
export function toSimPossession(playLog: PlayLog, idx: number, players: Players, photoSkins: Record<string, string> = {}): SimPossession | null {
  const e = playLog.entries[idx];
  if (!e || e.k !== 'p') return null;
  const p = e as PossessionEntry;
  const ids = playLog.ids;
  const five = lineupsAt(playLog, idx);
  const offSide = p.o === 'h' ? 'home' : 'away';
  const defSide = p.o === 'h' ? 'away' : 'home';
  // The engine occasionally rotates a body in without a logged sub (foul trouble, injury): anyone in this
  // possession's events who isn't in the logged five takes the slot of his position so the sim can picture him.
  const OFF_FIELDS = new Set(['fga', 'fgm', '3pa', '3pm', 'fta', 'ftm', 'pts', 'ast', 'to', 'orb', 'a1']);
  const POSN = ['PG', 'SG', 'SF', 'PF', 'C'];
  for (const [pi, code] of p.e) {
    const id = ids[pi]; const side = OFF_FIELDS.has(code) ? offSide : defSide;
    if (five[side].includes(id)) continue;
    if (five[side].length < 5) { five[side].push(id); continue; }
    const pos = players[id]?.sportData?.position; let slot = POSN.indexOf(pos ?? '');
    if (slot < 0) slot = five[side].findIndex(x => !p.e.some(ev => ids[ev[0]] === x)); if (slot < 0) slot = 4;
    five[side] = five[side].map((x, i) => (i === slot ? id : x));
  }
  const slotIn = (side: 'home' | 'away', id: string | undefined): number | null => { if (!id) return null; const i = five[side].indexOf(id); return i >= 0 ? i : null; };
  const by = (code: PlayLogFieldCode) => p.e.filter(x => x[1] === code).map(x => ids[x[0]]);
  const fga = by('fga')[0];
  const made = by('fgm').length > 0;
  const firstFga = p.e.findIndex(x => x[1] === 'fga' || x[1] === 'blk');
  const shotStart = firstFga === -1 ? p.e.length : firstFga;
  const shootingFoul = p.e.slice(shotStart).some(x => x[1] === 'pf');
  const preFoul = p.e.slice(0, shotStart).filter(x => x[1] === 'pf').map(x => ids[x[0]])[0];
  const fta = by('fta').length, ftm = by('ftm').length;
  // FT make order as logged (fta then ftm pairs in sequence)
  const ftMakes: boolean[] = []; { let pending = 0; for (const x of p.e) { if (x[1] === 'fta') { pending++; ftMakes.push(false); } else if (x[1] === 'ftm' && pending > 0) { ftMakes[ftMakes.length - 1] = true; pending--; } } }
  // clock: the previous entry's t in the same period is when this possession started
  let clockStart = PERIOD_SECS(p.q);
  for (let i = idx - 1; i >= 0; i--) { const pe = playLog.entries[i]; if (pe.q !== p.q) break; if (pe.k === 'p') { clockStart = pe.t; break; } }
  const base = {
    id: idx, off: (p.o === 'h' ? 0 : 1) as 0 | 1, pts: p.pts, h: p.h, a: p.a, q: p.q,
    clockStart, clockEnd: p.t, secs: Math.max(2, clockStart - p.t),
    lineups: { home: toSimPlayers(five.home, players, photoSkins), away: toSimPlayers(five.away, players, photoSkins) },
    pt: p.pt ?? 'pnr',
  };
  const to = by('to')[0];
  if (to) return { ...base, to: slotIn(offSide, to) ?? 0, stl: slotIn(defSide, by('stl')[0]), shooter: null, assister: null };
  if (!fga) {
    // bonus free throws (non-shooting foul) or a bare foul line
    const shooterAtLine = by('fta')[0];
    if (!shooterAtLine) return null;
    return { ...base, bonusFt: true, fouler: slotIn(defSide, preFoul) ?? 0, ftShooter: slotIn(offSide, shooterAtLine) ?? 0, fta, ftm, ftMakes, shooter: null };
  }
  const shooter = slotIn(offSide, fga) ?? 0;
  return {
    ...base,
    st: p.st ?? 'midrange', zone: p.z, shooter, assister: slotIn(offSide, by('ast')[0]),
    made, contested: !!p.c, dunk: !!p.d,
    blk: slotIn(defSide, by('blk')[0]), orb: slotIn(offSide, by('orb')[0]), drb: slotIn(defSide, by('drb')[0]),
    fouled: shootingFoul && fta > 0, fta, ftm, ftMakes,
    foul: !shootingFoul && fta === 0 && preFoul ? slotIn(defSide, preFoul) : null,
  };
}
