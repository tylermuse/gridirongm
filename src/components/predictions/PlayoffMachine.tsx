'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { TeamLogo } from '@/components/ui/TeamLogo';
import {
  decodeScenario,
  encodeScenario,
  favoritePicks,
  gameKey,
  projectSeason,
  runPlayoffMachine,
  type MachineGame,
  type MachineResult,
  type MachineTeam,
  type Picks,
} from '@/lib/predictions/playoffMachine';

export interface PlayoffMachineTeam extends MachineTeam {
  slug: string;
  color: string;
  color2: string;
  logo: string;
}

interface Props {
  teams: PlayoffMachineTeam[];
  games: MachineGame[];
}

/**
 * Layout
 * - Desktop (lg+): games on the left; a sticky panel on the right with the
 *   biggest swings from your picks plus the playoff picture / standings, so
 *   every pick visibly moves something without scrolling.
 * - Mobile: a sticky bar under the site header with Games / Picture /
 *   Standings tabs, the week chips and a live strip of the biggest swings.
 *   (Kept at the top so it never sits under the fixed Feedback button.)
 */

const SIMS = 2000;
const CONFS = ['AFC', 'NFC'] as const;
type Conf = (typeof CONFS)[number];
type View = 'games' | 'picture' | 'standings';

function pct(v: number): string {
  if (v >= 99.95) return '100';
  if (v <= 0) return '0';
  if (v < 1) return '<1';
  if (v > 99) return '>99';
  return `${Math.round(v)}`;
}

/** Dark or light text for a team-color fill. */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#111827' : '#ffffff';
}

const TZ = 'America/New_York';
const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'numeric', day: 'numeric' });
const fmtLong = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' });

const LABEL = 'text-[11px] font-bold uppercase tracking-wider text-gray-500';
const recStr = (r: { w: number; l: number; t: number }) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`;

function Delta({ d, className = '' }: { d: number; className?: string }) {
  if (Math.abs(d) < 1) return null;
  return (
    <span className={`tabular-nums font-bold ${d > 0 ? 'text-emerald-700' : 'text-red-600'} ${className}`}>
      {d > 0 ? '+' : '−'}{Math.round(Math.abs(d))}
    </span>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M3 8.5l3.2 3L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PlayoffMachine({ teams, games }: Props) {
  const byAbbrev = useMemo(() => new Map(teams.map((t) => [t.abbrev, t])), [teams]);
  const remaining = useMemo(() => games.filter((g) => !g.done), [games]);
  const weeks = useMemo(() => [...new Set(remaining.map((g) => g.week))].sort((a, b) => a - b), [remaining]);

  const realRecord = useMemo(() => {
    const m = new Map<string, { w: number; l: number; t: number }>();
    for (const t of teams) m.set(t.abbrev, { w: 0, l: 0, t: 0 });
    for (const g of games) {
      if (!g.done) continue;
      const h = m.get(g.home), a = m.get(g.away);
      if (!h || !a) continue;
      if (g.homePts === g.awayPts) { h.t++; a.t++; } else if (g.homePts > g.awayPts) { h.w++; a.l++; } else { a.w++; h.l++; }
    }
    return m;
  }, [teams, games]);

  // Every game starts picked for the model's favorite; the user flips or clears from there.
  const defaultPicks = useMemo(() => favoritePicks(games), [games]);
  const [picks, setPicks] = useState<Picks>(defaultPicks);
  const [focus, setFocus] = useState<string>('');
  const [week, setWeek] = useState<number>(weeks[0] ?? 0);
  const [conf, setConf] = useState<Conf>('AFC');
  const [view, setView] = useState<View>('games');
  const [copied, setCopied] = useState(false);
  // Simulated odds can differ by a point between Node and the browser
  // (floating-point), so they render only after hydration to avoid a
  // text mismatch that makes React throw away the server HTML.
  const [hydrated, setHydrated] = useState(false);
  const loaded = useRef(false);
  const focusRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Swings are measured against the default: favorites win out.
  const baseline = useMemo(() => runPlayoffMachine(teams, games, defaultPicks, SIMS), [teams, games, defaultPicks]);
  const baseBy = useMemo(() => new Map(baseline.teams.map((t) => [t.abbrev, t])), [baseline]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const hasScenario = q.has('p') || q.has('u');
    const fromUrl = hasScenario ? decodeScenario(games, q.get('p'), q.get('u')) : null;
    const team = (q.get('team') ?? '').toUpperCase();
    // Reading the address bar is a one-time sync from outside React; it can't
    // happen during render without breaking hydration of the static page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fromUrl) setPicks(fromUrl);
    if (byAbbrev.has(team)) {
      setFocus(team);
      setConf(byAbbrev.get(team)!.conference === 'NFC' ? 'NFC' : 'AFC');
    }
    loaded.current = true;
    setHydrated(true);
  }, [games, byAbbrev]);

  // Odds re-simulate on a deferred copy so the tapped team fills immediately.
  const deferredPicks = useDeferredValue(picks);
  const busy = deferredPicks !== picks;
  const result: MachineResult | null = useMemo(
    () => (deferredPicks === defaultPicks ? null : runPlayoffMachine(teams, games, deferredPicks, SIMS)),
    [deferredPicks, defaultPicks, teams, games],
  );
  const proj = useMemo(() => projectSeason(teams, games, picks), [teams, games, picks]);

  useEffect(() => {
    if (!loaded.current) return;
    const q = new URLSearchParams(window.location.search);
    const enc = encodeScenario(games, picks);
    if (enc.p) q.set('p', enc.p); else q.delete('p');
    if (enc.u) q.set('u', enc.u); else q.delete('u');
    if (focus) q.set('team', focus.toLowerCase()); else q.delete('team');
    const s = q.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
  }, [picks, focus, games]);

  const odds = new Map((result ?? baseline).teams.map((t) => [t.abbrev, t]));
  const delta = (a: string) => (odds.get(a)?.playoffs ?? 0) - (baseBy.get(a)?.playoffs ?? 0);
  const pickCount = Object.keys(picks).length;
  const enc = encodeScenario(games, picks);
  const changed = !!(enc.p || enc.u);
  const oddsPct = (a: string) => (hydrated ? pct(odds.get(a)?.playoffs ?? 0) : '–');

  /** Teams whose playoff odds your picks moved the most. */
  const movers = result
    ? result.teams
        .map((t) => ({ abbrev: t.abbrev, now: t.playoffs, d: t.playoffs - (baseBy.get(t.abbrev)?.playoffs ?? t.playoffs) }))
        .filter((m) => Math.abs(m.d) >= 1)
        .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
        .slice(0, 6)
    : [];

  // ─── Actions ──────────────────────────────────────────────────────────

  const toggle = (g: MachineGame, winner: string) => {
    const k = gameKey(g);
    setPicks((p) => {
      const next = { ...p };
      if (next[k] === winner) delete next[k]; else next[k] = winner;
      return next;
    });
  };
  const setWeekPicks = (wk: number | 'all', mode: 'favorites' | 'clear') => {
    setPicks((p) => {
      const next = { ...p };
      for (const g of remaining) {
        if (wk !== 'all' && g.week !== wk) continue;
        const k = gameKey(g);
        if (mode === 'clear') delete next[k];
        else next[k] = (g.homeWinProb ?? 0.5) >= 0.5 ? g.home : g.away;
      }
      return next;
    });
  };
  const chooseFocus = (abbrev: string, scroll = false) => {
    setFocus(abbrev);
    const t = byAbbrev.get(abbrev);
    if (t) setConf(t.conference === 'NFC' ? 'NFC' : 'AFC');
    if (scroll && abbrev) window.setTimeout(() => focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  const winOut = () => {
    if (!focus) return;
    setPicks((p) => {
      const next = { ...p };
      for (const g of remaining) if (g.home === focus || g.away === focus) next[gameKey(g)] = focus;
      return next;
    });
  };
  const copyLink = async () => {
    const url = window.location.href;
    // Phones get the native share sheet; desktop copies the link.
    if (typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: 'My NFL playoff scenario', url }); return; } catch { /* cancelled: fall back to copying */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the address bar already has the link */ }
  };
  const goWeek = (wk: number) => {
    setWeek(wk);
    // Keep the new week's first games in view (below the sticky bars).
    const el = topRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const logo = (abbrev: string, size: 'xs' | 'sm' | 'md' | 'lg' = 'sm') => {
    const t = byAbbrev.get(abbrev);
    return <TeamLogo abbreviation={abbrev} primaryColor={t?.color || '#6b7280'} secondaryColor={t?.color2 || '#ffffff'} logoUrl={t?.logo || undefined} logoOnWhite size={size} />;
  };

  if (!remaining.length) {
    return <p className="text-gray-600">The regular season is over, so there are no games left to pick. See the <Link href="/predictions" className="text-blue-600 hover:underline">final playoff odds</Link>.</p>;
  }

  // ─── Matchup card ─────────────────────────────────────────────────────

  const matchup = (g: MachineGame, opts: { showDate?: boolean } = {}) => {
    const k = gameKey(g);
    const pick = picks[k];
    const pHome = g.homeWinProb ?? 0.5;
    const involvesFocus = !!focus && (g.home === focus || g.away === focus);
    const awayColor = byAbbrev.get(g.away)?.color || '#9ca3af';
    const homeColor = byAbbrev.get(g.home)?.color || '#4b5563';

    const side = (abbrev: string, prob: number, align: 'left' | 'right') => {
      const t = byAbbrev.get(abbrev);
      const on = pick === abbrev;
      const off = pick !== undefined && !on;
      const fill = t?.color || '#1f2937';
      const ink = inkOn(fill);
      const fav = prob >= 0.5;
      return (
        <button
          type="button"
          onClick={() => toggle(g, abbrev)}
          aria-pressed={on}
          aria-label={`${on ? 'Unpick' : 'Pick'} the ${t?.city ?? ''} ${t?.name ?? abbrev}, ${Math.round(prob * 100)}% to win`}
          className={`group relative flex-1 min-w-0 flex items-center gap-2.5 py-2.5 transition-colors ${align === 'right' ? 'flex-row-reverse text-right pr-3 pl-5' : 'text-left pl-3 pr-5'} ${on ? '' : 'bg-white hover:bg-gray-50'}`}
          style={on ? { backgroundColor: fill, color: ink } : undefined}
        >
          <span className={`shrink-0 transition ${off ? 'opacity-35 grayscale' : ''}`}>{logo(abbrev, 'md')}</span>
          <span className="min-w-0 flex-1">
            <span className={`flex items-center gap-1 text-[15px] font-bold leading-tight ${align === 'right' ? 'justify-end' : ''} ${off ? 'text-gray-400' : on ? '' : 'text-gray-900'}`}>
              {on && align === 'right' && <Check />}
              <span className="truncate">{t?.name ?? abbrev}</span>
              {on && align === 'left' && <Check />}
            </span>
            <span className={`block text-xs tabular-nums mt-0.5 ${on ? 'opacity-85' : 'text-gray-400'}`}>
              {recStr(realRecord.get(abbrev)!)}
              <span className="mx-1 opacity-60">·</span>
              <span className={on ? 'font-bold' : off ? '' : fav ? 'font-bold text-gray-800' : 'text-gray-500'}>{Math.round(prob * 100)}%</span>
            </span>
          </span>
        </button>
      );
    };

    return (
      <div
        key={k}
        className={`relative bg-white rounded-lg border overflow-hidden ${involvesFocus ? 'border-transparent ring-2' : 'border-gray-200'}`}
        style={involvesFocus ? ({ '--tw-ring-color': byAbbrev.get(focus)?.color || '#111827' } as CSSProperties) : undefined}
      >
        {(opts.showDate || g.neutral) && (
          <div className="flex items-center justify-between px-3 pt-2 -mb-1 text-[11px] text-gray-500">
            <span>{opts.showDate ? `Wk ${g.week} · ${fmtShort(g.date)}` : ''}</span>
            {g.neutral && <span className="font-semibold uppercase tracking-wide">Neutral site</span>}
          </div>
        )}
        <div className="relative flex divide-x divide-gray-100">
          {side(g.away, 1 - pHome, 'left')}
          {side(g.home, pHome, 'right')}
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-gray-200 text-[10px] font-bold text-gray-400 flex items-center justify-center">
            {g.neutral ? 'vs' : '@'}
          </span>
        </div>
        {/* Win-chance bar: away share on the left, home on the right. */}
        <div className="flex h-1" aria-hidden>
          <span style={{ width: `${(1 - pHome) * 100}%`, backgroundColor: awayColor, opacity: pick && pick !== g.away ? 0.2 : 1 }} />
          <span style={{ width: `${pHome * 100}%`, backgroundColor: homeColor, opacity: pick && pick !== g.home ? 0.2 : 1 }} />
        </div>
      </div>
    );
  };

  // ─── Week navigation ──────────────────────────────────────────────────

  const weekStats = (wk: number) => {
    const list = remaining.filter((g) => g.week === wk);
    return { total: list.length, done: list.filter((g) => picks[gameKey(g)]).length };
  };

  const weekChips = (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
      {weeks.map((wk) => {
        const { total, done } = weekStats(wk);
        const active = wk === week;
        const complete = done === total;
        return (
          <button
            key={wk}
            type="button"
            onClick={() => goWeek(wk)}
            aria-current={active ? 'true' : undefined}
            className={`shrink-0 h-8 pl-3 pr-2.5 rounded-full text-sm font-bold flex items-center gap-1.5 border transition-colors ${
              active ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
            }`}
          >
            Wk {wk}
            {!complete && (
              <span className={`text-[11px] font-semibold tabular-nums ${active ? 'text-gray-300' : 'text-gray-400'}`}>{done}/{total}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  // ─── Swings (what your picks moved) ───────────────────────────────────

  const swingChips = movers.length ? (
    movers.map((m) => (
      <button
        key={m.abbrev}
        type="button"
        onClick={() => chooseFocus(m.abbrev)}
        className="shrink-0 h-7 pl-1 pr-2 rounded-full bg-white border border-gray-200 flex items-center gap-1 text-xs"
      >
        {logo(m.abbrev, 'xs')}
        <span className="font-semibold text-gray-900">{m.abbrev}</span>
        <Delta d={m.d} />
      </button>
    ))
  ) : (
    <span className="text-xs text-gray-500">Favorites are picked. Tap the other team for an upset.</span>
  );

  const swingsPanel = (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-extrabold text-gray-900">Biggest swings</h2>
        <span className="text-[11px] text-gray-500" aria-live="polite">{busy ? 'Simulating…' : 'Playoff odds vs. favorites winning out'}</span>
      </div>
      {movers.length ? (
        <ul className="divide-y divide-gray-100">
          {movers.slice(0, 5).map((m) => (
            <li key={m.abbrev}>
              <button type="button" onClick={() => chooseFocus(m.abbrev, true)} className="w-full flex items-center gap-2.5 py-1.5 text-left hover:bg-gray-50 -mx-1 px-1 rounded">
                {logo(m.abbrev, 'xs')}
                <span className="flex-1 text-sm font-semibold text-gray-900 truncate">{byAbbrev.get(m.abbrev)?.name}</span>
                <span className="text-xs tabular-nums text-gray-400">{pct(baseBy.get(m.abbrev)?.playoffs ?? 0)}% →</span>
                <span className="w-10 text-right text-sm font-bold tabular-nums text-gray-900">{pct(m.now)}%</span>
                <Delta d={m.d} className="w-9 text-right text-xs" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 leading-snug">Every game starts with the favorite picked. Flip an upset, or clear games to let them be simulated, and you&apos;ll see whose playoff odds it helps and hurts, right here.</p>
      )}
    </section>
  );

  // ─── Playoff picture ──────────────────────────────────────────────────

  const slot = (abbrev: string, seed: number) => {
    const t = byAbbrev.get(abbrev)!;
    const p = proj.teams.get(abbrev)!;
    const on = focus === abbrev;
    return (
      <button
        type="button"
        onClick={() => chooseFocus(abbrev, true)}
        className={`w-full flex items-center gap-2 h-10 pr-3 text-left transition-colors ${on ? 'bg-amber-50' : 'bg-white hover:bg-gray-50'}`}
        style={{ boxShadow: `inset 3px 0 0 ${t.color || '#9ca3af'}` }}
      >
        <span className="w-7 pl-2.5 text-xs font-bold tabular-nums text-gray-400">{seed}</span>
        {logo(abbrev, 'sm')}
        <span className="flex-1 min-w-0 truncate text-sm font-bold text-gray-900">{t.name}</span>
        <span className="text-xs tabular-nums text-gray-500">{recStr(p)}</span>
        <span className="w-12 text-right text-xs tabular-nums font-semibold text-gray-700" title="Playoff chance">{oddsPct(abbrev)}%</span>
      </button>
    );
  };

  const confToggle = (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="tablist" aria-label="Conference">
      {CONFS.map((c) => (
        <button
          key={c}
          type="button"
          role="tab"
          aria-selected={conf === c}
          onClick={() => setConf(c)}
          className={`h-7 px-3 rounded-md text-xs font-bold transition ${conf === c ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
        >
          {c}
        </button>
      ))}
    </div>
  );

  const picture = (c: Conf) => {
    const s = proj.seeds[c] ?? [];
    if (s.length < 7) return null;
    const hunt = (proj.rest[c] ?? []).slice(0, 3);
    return (
      <div>
        <div className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
          <div className="flex items-center bg-white">
            <div className="flex-1 min-w-0">{slot(s[0], 1)}</div>
          </div>
          <div className="px-3 py-1 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-400">#1 seed gets a first-round bye</div>
        </div>
        <div className={`${LABEL} mt-4 mb-1.5`}>Wild Card round</div>
        <div className="space-y-2">
          {[[1, 6], [2, 5], [3, 4]].map(([hi, lo]) => (
            <div key={hi} className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
              {slot(s[hi], hi + 1)}
              {slot(s[lo], lo + 1)}
            </div>
          ))}
        </div>
        {hunt.length > 0 && (
          <>
            <div className={`${LABEL} mt-4 mb-1.5`}>In the hunt</div>
            <div className="rounded-lg border border-dashed border-gray-300 divide-y divide-gray-100 overflow-hidden">
              {hunt.map((a) => (
                <button key={a} type="button" onClick={() => chooseFocus(a, true)} className="w-full flex items-center gap-2 h-9 px-3 text-left bg-white/60 hover:bg-white">
                  {logo(a, 'xs')}
                  <span className="flex-1 text-sm font-semibold text-gray-700">{byAbbrev.get(a)?.name}</span>
                  <span className="text-xs tabular-nums text-gray-400">{recStr(proj.teams.get(a)!)}</span>
                  <span className="w-12 text-right text-xs tabular-nums text-gray-600">{oddsPct(a)}%</span>
                </button>
              ))}
            </div>
          </>
        )}
        <p className="mt-3 text-[11px] leading-snug text-gray-500">
          Your picks, plus the favorite winning every game you haven&apos;t picked. % = playoff chance across {SIMS.toLocaleString('en-US')} simulated seasons.
        </p>
      </div>
    );
  };

  // ─── Standings ────────────────────────────────────────────────────────

  const standings = (c: Conf) => (
    <div className="space-y-4">
      {Object.keys(proj.divisions).filter((d) => d.startsWith(c)).sort().map((d) => (
        <table key={d} className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className={`${LABEL} text-left py-1.5`}>{d}</th>
              <th className={`${LABEL} text-right py-1.5 w-12`}>W-L</th>
              <th className={`${LABEL} text-center py-1.5 w-11`}>Seed</th>
              <th className={`${LABEL} text-right py-1.5 w-20`} title="Chance to make the playoffs, and change from your picks">Playoff %</th>
            </tr>
          </thead>
          <tbody>
            {proj.divisions[d].map((a) => {
              const p = proj.teams.get(a)!;
              return (
                <tr key={a} onClick={() => chooseFocus(a, true)} className={`border-b border-gray-100 cursor-pointer ${focus === a ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                  <td className="py-2">
                    <span className="flex items-center gap-2 min-w-0">
                      {logo(a, 'xs')}
                      <span className="font-semibold text-gray-900 truncate">{byAbbrev.get(a)?.name}</span>
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-600">{recStr(p)}</td>
                  <td className="py-2 text-center">
                    {p.seed ? (
                      <span className="inline-flex w-5 h-5 items-center justify-center rounded bg-gray-900 text-white text-[11px] font-bold tabular-nums">{p.seed}</span>
                    ) : (
                      <span className="text-gray-300">–</span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums whitespace-nowrap">
                    <span className="font-semibold text-gray-900">{oddsPct(a)}</span>
                    <span className="inline-block w-8 text-right text-[11px]"><Delta d={delta(a)} /></span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );

  // ─── Followed team ────────────────────────────────────────────────────

  const focusTeam = focus ? byAbbrev.get(focus) : undefined;
  const fp = focus ? proj.teams.get(focus) : undefined;
  const fo = focus ? odds.get(focus) : undefined;
  const fb = focus ? baseBy.get(focus) : undefined;
  const focusGames = focus ? remaining.filter((g) => g.home === focus || g.away === focus) : [];
  const fSeeds = focusTeam ? proj.seeds[focusTeam.conference] ?? [] : [];
  const opponentSeed = fp?.seed && fp.seed > 1 ? 9 - fp.seed : null; // 2v7, 3v6, 4v5
  const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

  const focusCard = focusTeam && fp && fo && fb && (
    <section ref={focusRef} className="scroll-mt-40 lg:scroll-mt-24 mb-6 rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="h-1.5" style={{ backgroundColor: focusTeam.color || '#111827' }} />
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {logo(focus, 'lg')}
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 leading-tight truncate">{focusTeam.city} {focusTeam.name}</h2>
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900 tabular-nums">{recStr(fp)}</span> projected ·{' '}
                {fp.seed
                  ? fp.seed === 1
                    ? '#1 seed, first-round bye'
                    : `#${fp.seed} seed, ${fp.seed <= 4 ? 'hosts' : 'at'} ${byAbbrev.get(fSeeds[opponentSeed! - 1])?.name}`
                  : fp.confRank === 8 ? `first team out, 8th in the ${focusTeam.conference}` : `misses the playoffs, ${ordinal(fp.confRank)} in the ${focusTeam.conference}`}
              </p>
            </div>
            <button type="button" onClick={() => setFocus('')} aria-label="Stop following" className="self-start -mr-1 w-8 h-8 shrink-0 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 sm:hidden">✕</button>
          </div>
          <dl className="grid grid-cols-3 gap-2 w-full sm:w-auto">
            {([['Playoffs', fo.playoffs, fb.playoffs], ['Div. title', fo.division, fb.division], ['Super Bowl', fo.champion, fb.champion]] as const).map(([label, now, base]) => (
              <div key={label} className="rounded-lg bg-gray-50 px-3 py-2 sm:min-w-24">
                <dt className={LABEL}>{label}</dt>
                <dd className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold tabular-nums text-gray-900 leading-none">{pct(now)}<span className="text-sm font-bold text-gray-400">%</span></span>
                  <Delta d={now - base} className="text-xs" />
                </dd>
              </div>
            ))}
          </dl>
          <button type="button" onClick={() => setFocus('')} className="hidden sm:block text-xs text-gray-400 hover:text-gray-700">Unfollow</button>
        </div>
        {focusGames.length > 0 && (
          <>
            <div className="flex items-center gap-3 mt-5 mb-2">
              <span className={LABEL}>Games left · {focusGames.length}</span>
              <button type="button" onClick={winOut} className="h-7 px-3 rounded-full text-xs font-bold text-white" style={{ backgroundColor: focusTeam.color || '#111827', color: inkOn(focusTeam.color || '#111827') }}>
                Win out
              </button>
              <Link href={`/predictions/${focusTeam.slug}`} className="text-xs font-semibold text-gray-500 hover:text-gray-900 ml-auto">{focusTeam.name} outlook →</Link>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-5 sm:px-5 pb-1 snap-x">
              {focusGames.map((g) => <div key={gameKey(g)} className="w-[17.5rem] shrink-0 snap-start">{matchup(g, { showDate: true })}</div>)}
            </div>
          </>
        )}
      </div>
    </section>
  );

  // ─── Games list for the selected week, grouped by day ─────────────────

  const shownGames = remaining.filter((g) => g.week === week);
  const days: Array<{ label: string; games: MachineGame[] }> = [];
  for (const g of shownGames) {
    const label = fmtLong(g.date);
    const last = days[days.length - 1];
    if (last && last.label === label) last.games.push(g); else days.push({ label, games: [g] });
  }
  const ws = weekStats(week);
  const nextWeek = weeks[weeks.indexOf(week) + 1];

  const gamesSection = (
    <section className="min-w-0">
      {/* Desktop week bar (mobile's lives in the sticky top bar). */}
      <div className="hidden lg:block sticky top-[65px] z-20 -mx-2 px-2 pt-2 pb-2 bg-[#f0f4f8]/95 backdrop-blur-sm">{weekChips}</div>
      <div className="flex items-center gap-2 sm:gap-4 mt-2 mb-3">
        <h2 className="text-lg font-extrabold text-gray-900 shrink-0">Week {week}</h2>
        <span className="hidden sm:inline text-sm text-gray-500 tabular-nums">{ws.done} of {ws.total} picked</span>
        <div className="flex-1" />
        <button type="button" onClick={() => setWeekPicks(week, 'favorites')} className="h-8 px-3 rounded-lg text-xs font-bold bg-white border border-gray-200 text-gray-800 hover:border-gray-400">Pick favorites</button>
        <button type="button" onClick={() => setWeekPicks(week, 'clear')} disabled={!ws.done} className="h-8 px-3 rounded-lg text-xs font-bold text-gray-600 hover:text-gray-900 disabled:opacity-40">Clear week</button>
      </div>
      <div className="space-y-5">
        {days.map((d) => (
          <div key={d.label}>
            <div className={`${LABEL} mb-2`}>{d.label}</div>
            <div className="grid sm:grid-cols-2 gap-2.5">{d.games.map((g) => matchup(g))}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">% = model win chance. Tap a picked team again to undo.</p>
      {nextWeek !== undefined && (
        <button
          type="button"
          onClick={() => goWeek(nextWeek)}
          className={`mt-4 w-full h-12 rounded-xl text-sm font-bold transition-colors ${ws.done === ws.total ? 'bg-gray-900 text-white hover:bg-gray-700' : 'bg-white border border-gray-200 text-gray-800 hover:border-gray-400'}`}
        >
          Next: Week {nextWeek} →
        </button>
      )}
    </section>
  );

  // ─── Layout ───────────────────────────────────────────────────────────

  const btn = 'h-10 px-3 rounded-lg text-sm font-semibold border border-gray-200 bg-white text-gray-800 hover:border-gray-400 disabled:opacity-40 disabled:hover:border-gray-200';
  const mobileTabs: Array<[View, string]> = [['games', 'Games'], ['picture', 'Picture'], ['standings', 'Standings']];
  const sideTab: View = view === 'standings' ? 'standings' : 'picture';

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-5">
        <div className="relative sm:w-72">
          {focus && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">{logo(focus, 'xs')}</span>}
          <select
            aria-label="Follow a team"
            value={focus}
            onChange={(e) => (e.target.value ? chooseFocus(e.target.value) : setFocus(''))}
            className={`w-full h-10 rounded-lg border border-gray-200 bg-white pr-8 text-sm font-semibold text-gray-900 hover:border-gray-400 ${focus ? 'pl-9' : 'pl-3'}`}
          >
            <option value="">Follow a team</option>
            {[...teams].sort((a, b) => a.city.localeCompare(b.city)).map((t) => (
              <option key={t.abbrev} value={t.abbrev}>{t.city} {t.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 sm:flex gap-2 sm:flex-1">
          <button type="button" onClick={() => setPicks(defaultPicks)} disabled={!changed} className={btn} title="Back to every favorite winning">Reset</button>
          <button type="button" onClick={() => setPicks({})} disabled={!pickCount} className={btn} title="Unpick every game so the rest of the season is simulated">Clear all</button>
          <div className="hidden sm:block flex-1" />
          <button
            type="button"
            onClick={copyLink}
            disabled={!changed && !focus}
            title="Get a link to this scenario: your picks and the team you follow"
            className="h-10 px-4 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600"
          >
            {copied ? 'Link copied' : 'Share picks'}
          </button>
        </div>
      </div>

      {focusCard}

      <div ref={topRef} className="scroll-mt-[65px]" />

      {/* Mobile sticky bar: view tabs + week chips + live swings. */}
      <div className="lg:hidden sticky top-[65px] z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-2 mb-3 bg-[#f0f4f8]/95 backdrop-blur-sm border-b border-gray-200">
        <div className="grid grid-cols-3 rounded-lg bg-gray-200/70 p-0.5" role="tablist" aria-label="View">
          {mobileTabs.map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`h-8 rounded-md text-sm font-bold transition ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {view === 'games' && <div className="mt-2">{weekChips}</div>}
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" aria-live="polite">
          <span className="shrink-0 text-[11px] font-bold tabular-nums text-gray-500 mr-1">{busy ? 'Simulating…' : `${pickCount}/${remaining.length} picked`}</span>
          {swingChips}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px] gap-x-8 gap-y-6 items-start">
        <div className={view === 'games' ? '' : 'hidden lg:block'}>{gamesSection}</div>

        <aside className={`min-w-0 lg:sticky lg:top-[81px] lg:max-h-[calc(100vh-97px)] lg:overflow-y-auto no-scrollbar space-y-4 ${view === 'games' ? 'hidden lg:block' : ''}`}>
          <div className="hidden lg:block">{swingsPanel}</div>
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="hidden lg:flex gap-4" role="tablist" aria-label="Panel">
                {([['picture', 'Playoff picture'], ['standings', 'Standings']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={sideTab === v}
                    onClick={() => setView(v)}
                    className={`text-sm font-extrabold pb-1 border-b-2 ${sideTab === v ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <h2 className="lg:hidden text-sm font-extrabold text-gray-900">{view === 'standings' ? 'Standings' : 'Playoff picture'}</h2>
              {confToggle}
            </div>
            {sideTab === 'standings' ? standings(conf) : picture(conf)}
          </section>
        </aside>
      </div>
    </div>
  );
}
