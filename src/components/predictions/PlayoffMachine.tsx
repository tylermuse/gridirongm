'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { TeamLogo } from '@/components/ui/TeamLogo';
import {
  decodePicks,
  encodePicks,
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

const SIMS = 2000;
const CONFS = ['AFC', 'NFC'] as const;

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

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'numeric', day: 'numeric' });

const H = 'text-[11px] font-bold uppercase tracking-wider text-gray-500';

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

  const [picks, setPicks] = useState<Picks>({});
  const [focus, setFocus] = useState<string>('');
  const [week, setWeek] = useState<number>(weeks[0] ?? 0);
  const [standingsConf, setStandingsConf] = useState<'AFC' | 'NFC'>('AFC');
  const [copied, setCopied] = useState(false);
  const loaded = useRef(false);

  const baseline = useMemo(() => runPlayoffMachine(teams, games, {}, SIMS), [teams, games]);
  const baseBy = useMemo(() => new Map(baseline.teams.map((t) => [t.abbrev, t])), [baseline]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const fromUrl = decodePicks(games, q.get('p'));
    const team = (q.get('team') ?? '').toUpperCase();
    // Reading the address bar is a one-time sync from outside React; it can't
    // happen during render without breaking hydration of the static page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Object.keys(fromUrl).length) setPicks(fromUrl);
    if (byAbbrev.has(team)) {
      setFocus(team);
      setStandingsConf(byAbbrev.get(team)!.conference === 'NFC' ? 'NFC' : 'AFC');
    }
    loaded.current = true;
  }, [games, byAbbrev]);

  // Odds re-simulate on a deferred copy so the tapped team fills immediately.
  const deferredPicks = useDeferredValue(picks);
  const busy = deferredPicks !== picks;
  const result: MachineResult | null = useMemo(
    () => (Object.keys(deferredPicks).length ? runPlayoffMachine(teams, games, deferredPicks, SIMS) : null),
    [deferredPicks, teams, games],
  );
  const proj = useMemo(() => projectSeason(teams, games, picks), [teams, games, picks]);

  useEffect(() => {
    if (!loaded.current) return;
    const q = new URLSearchParams(window.location.search);
    const enc = encodePicks(games, picks);
    if (enc) q.set('p', enc); else q.delete('p');
    if (focus) q.set('team', focus.toLowerCase()); else q.delete('team');
    const s = q.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
  }, [picks, focus, games]);

  const odds = new Map((result ?? baseline).teams.map((t) => [t.abbrev, t]));
  const pickCount = Object.keys(picks).length;

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
  const chooseFocus = (abbrev: string) => {
    setFocus(abbrev);
    const t = byAbbrev.get(abbrev);
    if (t) setStandingsConf(t.conference === 'NFC' ? 'NFC' : 'AFC');
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
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the address bar already has the link */ }
  };

  const logo = (abbrev: string, size: 'xs' | 'sm' | 'md' | 'lg' = 'sm') => {
    const t = byAbbrev.get(abbrev);
    return <TeamLogo abbreviation={abbrev} primaryColor={t?.color || '#6b7280'} secondaryColor={t?.color2 || '#ffffff'} logoUrl={t?.logo || undefined} logoOnWhite size={size} />;
  };
  const recStr = (r: { w: number; l: number; t: number }) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`;

  /** Playoff % with change vs. no picks, e.g. "64  +12". */
  const oddsCell = (abbrev: string) => {
    const o = odds.get(abbrev)!;
    const d = o.playoffs - (baseBy.get(abbrev)?.playoffs ?? o.playoffs);
    return (
      <span className="tabular-nums whitespace-nowrap">
        <span className="text-gray-900">{pct(o.playoffs)}</span>
        <span className={`inline-block w-8 text-right text-[11px] ${d > 0 ? 'text-green-700' : 'text-red-700'}`}>
          {Math.abs(d) >= 1 ? `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d))}` : ''}
        </span>
      </span>
    );
  };

  // ─── Bracket ──────────────────────────────────────────────────────────

  const slot = (abbrev: string, seed: number) => {
    const t = byAbbrev.get(abbrev)!;
    const p = proj.teams.get(abbrev)!;
    const on = focus === abbrev;
    return (
      <button
        type="button"
        onClick={() => chooseFocus(abbrev)}
        className="w-full flex items-center gap-2 h-9 pr-2 text-left bg-white hover:bg-gray-50"
        style={{ boxShadow: `inset 3px 0 0 ${t.color || '#9ca3af'}` }}
      >
        <span className="w-6 pl-2 text-xs font-bold tabular-nums text-gray-400">{seed}</span>
        {logo(abbrev, 'xs')}
        <span className={`flex-1 min-w-0 truncate text-sm ${on ? 'font-bold text-gray-900 underline decoration-2 underline-offset-2' : 'font-semibold text-gray-900'}`}>{t.name}</span>
        <span className="text-xs tabular-nums text-gray-500">{recStr(p)}</span>
      </button>
    );
  };

  const bracket = (c: 'AFC' | 'NFC') => {
    const s = proj.seeds[c] ?? [];
    if (s.length < 7) return null;
    const hunt = (proj.rest[c] ?? []).slice(0, 3);
    return (
      <div key={c}>
        <div className="flex items-baseline justify-between border-b-2 border-gray-900 pb-1 mb-2">
          <h3 className="text-sm font-extrabold tracking-wide text-gray-900">{c}</h3>
          <span className={H}>Wild Card round</span>
        </div>
        <div className="space-y-2">
          <div className="border border-gray-200 flex items-center">
            <div className="flex-1">{slot(s[0], 1)}</div>
            <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Bye</span>
          </div>
          {[[1, 6], [2, 5], [3, 4]].map(([hi, lo]) => (
            <div key={hi} className="border border-gray-200 divide-y divide-gray-100">
              {slot(s[lo], lo + 1)}
              {slot(s[hi], hi + 1)}
            </div>
          ))}
        </div>
        <div className={`${H} mt-3 mb-1`}>In the hunt</div>
        <div className="text-sm text-gray-600 leading-relaxed">
          {hunt.map((a, i) => (
            <button key={a} type="button" onClick={() => chooseFocus(a)} className="hover:text-gray-900 hover:underline">
              {i > 0 && <span className="text-gray-300 mx-1.5">/</span>}
              {byAbbrev.get(a)?.name} <span className="tabular-nums text-gray-400">{recStr(proj.teams.get(a)!)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  // ─── Game picker ──────────────────────────────────────────────────────

  const gameCard = (g: MachineGame, showWeek = false) => {
    const pick = picks[gameKey(g)];
    const pHome = g.homeWinProb ?? 0.5;
    const row = (abbrev: string, prob: number) => {
      const t = byAbbrev.get(abbrev);
      const on = pick === abbrev;
      const off = pick !== undefined && !on;
      const fill = t?.color || '#1f2937';
      const ink = inkOn(fill);
      return (
        <button
          type="button"
          onClick={() => toggle(g, abbrev)}
          aria-pressed={on}
          title={`Pick the ${t?.name ?? abbrev}`}
          className={`w-full flex items-center gap-2 h-10 px-2 text-left ${on ? '' : off ? 'bg-white text-gray-400' : 'bg-white hover:bg-gray-50'}`}
          style={on ? { backgroundColor: fill, color: ink } : undefined}
        >
          <span className={off ? 'opacity-40 grayscale' : ''}>{logo(abbrev, 'sm')}</span>
          <span className={`flex-1 min-w-0 truncate text-sm font-bold ${on || off ? '' : 'text-gray-900'}`}>{t?.name ?? abbrev}</span>
          <span className={`text-[11px] tabular-nums ${on ? '' : 'text-gray-400'}`}>{recStr(realRecord.get(abbrev)!)}</span>
          <span className={`w-9 text-right text-xs tabular-nums ${on ? 'font-bold' : off ? '' : 'text-gray-500'}`}>{Math.round(prob * 100)}%</span>
        </button>
      );
    };
    return (
      <div key={gameKey(g)} className="border border-gray-200 bg-white">
        <div className="flex items-center justify-between h-6 px-2 border-b border-gray-100 text-[11px] text-gray-500">
          <span>{showWeek ? `Wk ${g.week} · ` : ''}{fmtDay(g.date)}{g.neutral ? ' · Neutral' : ''}</span>
          {pick && <button type="button" onClick={() => toggle(g, pick)} className="hover:text-gray-900">Undo</button>}
        </div>
        {row(g.away, 1 - pHome)}
        <div className="h-px bg-gray-100" />
        {row(g.home, pHome)}
      </div>
    );
  };

  // ─── Standings ────────────────────────────────────────────────────────

  const standings = (c: 'AFC' | 'NFC') =>
    Object.keys(proj.divisions).filter((d) => d.startsWith(c)).sort().map((d) => (
      <table key={d} className="w-full text-sm mb-4">
        <thead>
          <tr className="border-b border-gray-300">
            <th className={`${H} text-left py-1`}>{d}</th>
            <th className={`${H} text-right py-1 w-14`}>W-L</th>
            <th className={`${H} text-right py-1 w-12`}>Seed</th>
            <th className={`${H} text-right py-1 w-20`} title="Chance to make the playoffs, and change from your picks">Playoff %</th>
          </tr>
        </thead>
        <tbody>
          {proj.divisions[d].map((a) => {
            const p = proj.teams.get(a)!;
            return (
              <tr key={a} onClick={() => chooseFocus(a)} className={`border-b border-gray-100 cursor-pointer ${focus === a ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}>
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    {logo(a, 'xs')}
                    <span className="font-semibold text-gray-900 truncate">{byAbbrev.get(a)?.name}</span>
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums text-gray-700">{recStr(p)}</td>
                <td className="py-1.5 text-right tabular-nums font-bold text-gray-900">{p.seed ?? <span className="font-normal text-gray-300">–</span>}</td>
                <td className="py-1.5 text-right">{oddsCell(a)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    ));

  if (!remaining.length) {
    return <p className="text-gray-600">The regular season is over, so there are no games left to pick. See the <Link href="/predictions" className="text-blue-600 hover:underline">final playoff odds</Link>.</p>;
  }

  const focusTeam = focus ? byAbbrev.get(focus) : undefined;
  const fp = focus ? proj.teams.get(focus) : undefined;
  const fo = focus ? odds.get(focus) : undefined;
  const fb = focus ? baseBy.get(focus) : undefined;
  const focusGames = focus ? remaining.filter((g) => g.home === focus || g.away === focus) : [];
  const fSeeds = focusTeam ? proj.seeds[focusTeam.conference] ?? [] : [];
  const opponentSeed = fp?.seed && fp.seed > 1 ? 9 - fp.seed : null; // 2v7, 3v6, 4v5
  const shownGames = remaining.filter((g) => g.week === week);
  const btn = 'h-8 px-3 text-sm font-semibold border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-40';

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-y border-gray-200 py-2 mb-6">
        <select
          aria-label="Follow a team"
          value={focus}
          onChange={(e) => (e.target.value ? chooseFocus(e.target.value) : setFocus(''))}
          className="h-8 border border-gray-300 bg-white px-2 text-sm font-semibold text-gray-900"
        >
          <option value="">Follow a team</option>
          {[...teams].sort((a, b) => a.city.localeCompare(b.city)).map((t) => (
            <option key={t.abbrev} value={t.abbrev}>{t.city} {t.name}</option>
          ))}
        </select>
        <button type="button" onClick={() => setWeekPicks('all', 'favorites')} className={btn}>Simulate favorites</button>
        <button type="button" onClick={() => setPicks({})} disabled={!pickCount} className={btn}>Reset</button>
        <div className="flex-1" />
        <span className="text-xs tabular-nums text-gray-500" aria-live="polite">
          {busy ? 'Simulating…' : `${pickCount}/${remaining.length} picked`}
        </span>
        <button type="button" onClick={copyLink} disabled={!pickCount && !focus} className="h-8 px-3 text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40">
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      </div>

      {/* Followed team */}
      {focusTeam && fp && fo && fb && (
        <section className="mb-8 border-t-4 pt-3" style={{ borderColor: focusTeam.color || '#111827' }}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3 min-w-0">
              {logo(focus, 'lg')}
              <div className="min-w-0">
                <h2 className="text-xl font-extrabold text-gray-900 leading-tight">{focusTeam.city} {focusTeam.name}</h2>
                <p className="text-sm text-gray-600">
                  {recStr(fp)} projected ·{' '}
                  {fp.seed
                    ? fp.seed === 1
                      ? '#1 seed, first-round bye'
                      : `#${fp.seed} seed, ${fp.seed <= 4 ? 'hosts' : 'at'} ${byAbbrev.get(fSeeds[opponentSeed! - 1])?.name}`
                    : fp.confRank === 8 ? `first team out, 8th in the ${focusTeam.conference}` : `misses the playoffs, ${fp.confRank}th in the ${focusTeam.conference}`}
                </p>
              </div>
            </div>
            <dl className="flex gap-6 ml-auto">
              {([['Playoffs', fo.playoffs, fb.playoffs], ['Div. title', fo.division, fb.division], ['Super Bowl', fo.champion, fb.champion]] as const).map(([label, now, base]) => {
                const d = now - base;
                return (
                  <div key={label}>
                    <dt className={H}>{label}</dt>
                    <dd className="text-2xl font-extrabold tabular-nums text-gray-900 leading-none mt-1">
                      {pct(now)}<span className="text-sm font-bold text-gray-400">%</span>
                      {Math.abs(d) >= 1 && <span className={`ml-1.5 text-xs font-bold ${d > 0 ? 'text-green-700' : 'text-red-700'}`}>{d > 0 ? '+' : '−'}{Math.round(Math.abs(d))}</span>}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
          {focusGames.length > 0 && (
            <>
              <div className="flex items-center gap-3 mt-4 mb-2">
                <span className={H}>Games left</span>
                <button type="button" onClick={winOut} className="text-xs font-bold uppercase tracking-wide text-gray-900 underline underline-offset-2 hover:text-blue-700">Win out</button>
                <Link href={`/predictions/${focusTeam.slug}`} className="text-xs text-gray-500 hover:text-gray-900 ml-auto">{focusTeam.name} outlook →</Link>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {focusGames.map((g) => <div key={gameKey(g)} className="w-60 shrink-0">{gameCard(g, true)}</div>)}
              </div>
            </>
          )}
        </section>
      )}

      {/* Playoff picture */}
      <section className="mb-10">
        <div className="flex flex-wrap items-baseline gap-x-3 mb-3">
          <h2 className="text-lg font-extrabold text-gray-900">Playoff picture</h2>
          <span className="text-xs text-gray-500">If the season ends with your picks and every other game goes to the favorite</span>
        </div>
        <div className="grid md:grid-cols-2 gap-x-10 gap-y-6 [&>*]:min-w-0">{CONFS.map((c) => bracket(c))}</div>
      </section>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-x-10 gap-y-8">
        {/* Games */}
        <section className="min-w-0">
          <div className="flex items-end border-b border-gray-300 overflow-x-auto">
            {weeks.map((wk) => {
              const n = remaining.filter((g) => g.week === wk && picks[gameKey(g)]).length;
              const total = remaining.filter((g) => g.week === wk).length;
              return (
                <button
                  key={wk}
                  type="button"
                  onClick={() => setWeek(wk)}
                  className={`shrink-0 px-3 pt-1 pb-1.5 text-sm font-bold border-b-[3px] -mb-px ${wk === week ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
                >
                  WK {wk}
                  {n > 0 && <span className={`ml-1 text-[10px] tabular-nums ${n === total ? 'text-green-700' : 'text-gray-400'}`}>{n}/{total}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 h-9 mb-2 text-xs">
            <span className="text-gray-500">{shownGames.length} games<span className="hidden sm:inline"> · % = model win chance</span></span>
            <div className="flex-1" />
            <button type="button" onClick={() => setWeekPicks(week, 'favorites')} className="font-semibold text-gray-700 hover:text-gray-900 hover:underline">Pick favorites</button>
            <button type="button" onClick={() => setWeekPicks(week, 'clear')} className="font-semibold text-gray-700 hover:text-gray-900 hover:underline">Clear week</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">{shownGames.map((g) => gameCard(g))}</div>
        </section>

        {/* Standings */}
        <section className="min-w-0">
          <div className="flex items-end justify-between border-b border-gray-300 mb-3">
            <h2 className="text-sm font-extrabold text-gray-900 pb-1.5">Standings</h2>
            <div className="flex">
              {CONFS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setStandingsConf(c)}
                  className={`px-3 pt-1 pb-1.5 text-sm font-bold border-b-[3px] -mb-px ${standingsConf === c ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          {standings(standingsConf)}
        </section>
      </div>
    </div>
  );
}
