'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  decodePicks,
  encodePicks,
  gameKey,
  recordWithPicks,
  runPlayoffMachine,
  type MachineGame,
  type MachineResult,
  type MachineTeam,
  type Picks,
} from '@/lib/predictions/playoffMachine';

export interface PlayoffMachineTeam extends MachineTeam {
  slug: string;
  color: string;
}

interface Props {
  teams: PlayoffMachineTeam[];
  games: MachineGame[];
}

const SIMS = 2000;

function pct(v: number): string {
  if (v >= 99.95) return '100%';
  if (v <= 0) return '0%';
  if (v < 1) return '<1%';
  if (v > 99) return '>99%';
  return `${Math.round(v)}%`;
}

function delta(now: number, base: number): { text: string; cls: string } | null {
  const d = now - base;
  if (Math.abs(d) < 1) return null;
  return { text: `${d > 0 ? '+' : ''}${Math.round(d)}`, cls: d > 0 ? 'text-green-700' : 'text-red-700' };
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });

export default function PlayoffMachine({ teams, games }: Props) {
  const byAbbrev = useMemo(() => new Map(teams.map((t) => [t.abbrev, t])), [teams]);
  const remaining = useMemo(() => games.filter((g) => !g.done), [games]);
  const weeks = useMemo(() => [...new Set(remaining.map((g) => g.week))].sort((a, b) => a - b), [remaining]);

  const [picks, setPicks] = useState<Picks>({});
  const [focus, setFocus] = useState<string>('');
  const [week, setWeek] = useState<number>(weeks[0] ?? 0);
  const [copied, setCopied] = useState(false);
  const loaded = useRef(false);

  const baseline = useMemo(() => runPlayoffMachine(teams, games, {}, SIMS), [teams, games]);
  const baseBy = useMemo(() => new Map(baseline.teams.map((t) => [t.abbrev, t])), [baseline]);

  // Read a shared scenario (?p=…&team=…) once, after hydration.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const fromUrl = decodePicks(games, q.get('p'));
    const team = (q.get('team') ?? '').toUpperCase();
    // Reading the address bar is a one-time sync from outside React; it can't
    // happen during render without breaking hydration of the static page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Object.keys(fromUrl).length) setPicks(fromUrl);
    if (byAbbrev.has(team)) setFocus(team);
    loaded.current = true;
  }, [games, byAbbrev]);

  // Re-simulate on a deferred copy of the picks, so the tapped button updates
  // immediately and the odds catch up a moment later.
  const deferredPicks = useDeferredValue(picks);
  const busy = deferredPicks !== picks;
  const result: MachineResult | null = useMemo(
    () => (Object.keys(deferredPicks).length ? runPlayoffMachine(teams, games, deferredPicks, SIMS) : null),
    [deferredPicks, teams, games],
  );

  // Keep the URL shareable without adding history entries.
  useEffect(() => {
    if (!loaded.current) return;
    const q = new URLSearchParams(window.location.search);
    const enc = encodePicks(games, picks);
    if (enc) q.set('p', enc); else q.delete('p');
    if (focus) q.set('team', focus.toLowerCase()); else q.delete('team');
    const s = q.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
  }, [picks, focus, games]);

  const current = result ?? baseline;
  const curBy = new Map(current.teams.map((t) => [t.abbrev, t]));
  const pickCount = Object.keys(picks).length;

  const toggle = (g: MachineGame, winner: string) => {
    const k = gameKey(g);
    setPicks((p) => {
      const next = { ...p };
      if (next[k] === winner) delete next[k]; else next[k] = winner;
      return next;
    });
  };

  const setWeekPicks = (wk: number, mode: 'favorites' | 'clear') => {
    setPicks((p) => {
      const next = { ...p };
      for (const g of remaining) {
        if (g.week !== wk) continue;
        const k = gameKey(g);
        if (mode === 'clear') delete next[k];
        else next[k] = (g.homeWinProb ?? 0.5) >= 0.5 ? g.home : g.away;
      }
      return next;
    });
  };

  const focusWinOut = () => {
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
    } catch { /* clipboard blocked: the URL bar already has the link */ }
  };

  const focusTeam = focus ? byAbbrev.get(focus) : undefined;
  const focusRes = focus ? curBy.get(focus) : undefined;
  const focusBase = focus ? baseBy.get(focus) : undefined;
  const focusGames = focus ? remaining.filter((g) => g.home === focus || g.away === focus) : [];
  const shownGames = remaining.filter((g) => g.week === week);

  const renderGame = (g: MachineGame, showWeek = false) => {
    const pick = picks[gameKey(g)];
    const pHome = g.homeWinProb ?? 0.5;
    const side = (abbrev: string, prob: number, label: string) => {
      const t = byAbbrev.get(abbrev);
      const on = pick === abbrev;
      const off = pick !== undefined && !on;
      return (
        <button
          type="button"
          onClick={() => toggle(g, abbrev)}
          aria-pressed={on}
          title={`Pick the ${t?.name ?? abbrev} to win`}
          className={`flex-1 min-w-0 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
            on ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : off ? 'border-gray-200 bg-white opacity-50' : 'border-gray-200 bg-white hover:border-blue-300'
          } ${focus === abbrev ? 'font-semibold' : ''}`}
        >
          <span className="h-6 w-1.5 rounded-full shrink-0" style={{ backgroundColor: t?.color || '#9ca3af' }} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-gray-900 truncate">
              <span className="sm:hidden">{abbrev}</span>
              <span className="hidden sm:inline">{t?.name ?? abbrev}</span>
              <span className="text-gray-400 font-normal"> {label}</span>
            </span>
          </span>
          <span className="text-xs tabular-nums text-gray-500">{on ? 'W' : `${Math.round(prob * 100)}%`}</span>
        </button>
      );
    };
    return (
      <li key={gameKey(g)} className="flex items-center gap-2">
        {showWeek && <span className="w-10 shrink-0 text-xs text-gray-500 tabular-nums">Wk {g.week}</span>}
        {side(g.away, 1 - pHome, '')}
        <span className="text-xs text-gray-400 shrink-0">{g.neutral ? 'vs' : '@'}</span>
        {side(g.home, pHome, g.neutral ? '' : '(home)')}
      </li>
    );
  };

  const renderConf = (conference: string) => {
    const rows = teams
      .filter((t) => t.conference === conference)
      .map((t) => ({ t, r: curBy.get(t.abbrev)!, b: baseBy.get(t.abbrev)! }))
      .sort((a, b) => b.r.playoffs - a.r.playoffs || b.r.projectedWins - a.r.projectedWins);
    return (
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 text-sm font-bold text-gray-900">{conference}</div>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500">
            <tr>
              <th className="text-left font-semibold px-3 py-1.5">Team</th>
              <th className="text-right font-semibold px-2 py-1.5">Playoffs</th>
              <th className="text-right font-semibold px-2 py-1.5 hidden sm:table-cell">Div.</th>
              <th className="text-right font-semibold px-2 py-1.5 hidden sm:table-cell">#1</th>
              <th className="text-right font-semibold px-3 py-1.5">SB</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, r, b }, i) => {
              const d = delta(r.playoffs, b.playoffs);
              const rec = recordWithPicks(t.abbrev, games, picks);
              return (
                <tr
                  key={t.abbrev}
                  onClick={() => setFocus(focus === t.abbrev ? '' : t.abbrev)}
                  className={`border-t border-gray-100 cursor-pointer ${focus === t.abbrev ? 'bg-blue-50' : 'hover:bg-gray-50'} ${i === 7 ? 'border-t-2 border-t-gray-300' : ''}`}
                >
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className="font-medium text-gray-900">{t.name}</span>
                    <span className="text-xs text-gray-500 ml-1.5 tabular-nums">{rec.w}-{rec.l}{rec.t ? `-${rec.t}` : ''}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-900">
                    {pct(r.playoffs)}
                    {d && <span className={`ml-1 text-xs font-normal ${d.cls}`}>{d.text}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-600 hidden sm:table-cell">{pct(r.division)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-600 hidden sm:table-cell">{pct(r.topSeed)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{pct(r.champion)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (!remaining.length) {
    return <p className="text-gray-600">The regular season is over, so there are no games left to pick. See the <Link href="/predictions" className="text-blue-600 hover:underline">final playoff odds</Link>.</p>;
  }

  const likelySeed = focusRes ? focusRes.seeds.reduce((best, v, i, arr) => (v > arr[best] ? i : best), 0) : 0;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="text-sm text-gray-600" htmlFor="pm-team">Your team</label>
        <select
          id="pm-team"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900"
        >
          <option value="">Pick a team…</option>
          {[...teams].sort((a, b) => a.city.localeCompare(b.city)).map((t) => (
            <option key={t.abbrev} value={t.abbrev}>{t.city} {t.name}</option>
          ))}
        </select>
        <div className="flex-1" />
        <span className="text-xs text-gray-500" aria-live="polite">
          {busy ? 'Simulating…' : `${pickCount} game${pickCount === 1 ? '' : 's'} picked · ${SIMS.toLocaleString('en-US')} sims`}
        </span>
        <button type="button" onClick={() => setPicks({})} disabled={!pickCount} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40">
          Reset
        </button>
        <button type="button" onClick={copyLink} disabled={!pickCount && !focus} className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-40">
          {copied ? 'Link copied' : 'Share scenario'}
        </button>
      </div>

      {/* Focus team summary */}
      {focusTeam && focusRes && focusBase && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 sm:p-5 mb-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-xl font-bold text-gray-900">{focusTeam.city} {focusTeam.name}</h2>
            <span className="text-sm text-gray-600">
              {(() => { const r = recordWithPicks(focus, games, picks); return `${r.w}-${r.l}${r.t ? `-${r.t}` : ''} with your picks`; })()}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Make playoffs', now: focusRes.playoffs, base: focusBase.playoffs },
              { label: `Win ${focusTeam.division}`, now: focusRes.division, base: focusBase.division },
              { label: '#1 seed', now: focusRes.topSeed, base: focusBase.topSeed },
              { label: 'Win Super Bowl', now: focusRes.champion, base: focusBase.champion },
            ].map((c) => {
              const d = delta(c.now, c.base);
              return (
                <div key={c.label} className="rounded-xl bg-white border border-gray-200 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{c.label}</div>
                  <div className="text-2xl font-bold text-gray-900 tabular-nums">{pct(c.now)}</div>
                  <div className="text-xs text-gray-500">{d ? <span className={d.cls}>{d.text} pts vs. no picks</span> : `No picks: ${pct(c.base)}`}</div>
                </div>
              );
            })}
          </div>
          {focusRes.playoffs > 0 && (
            <p className="text-sm text-gray-700 mt-3">
              Most likely finish: <strong>#{likelySeed + 1} seed</strong> ({pct(focusRes.seeds[likelySeed])} of sims). Projected {focusRes.projectedWins.toFixed(1)} wins.
            </p>
          )}
          {focusGames.length > 0 && (
            <>
              <div className="flex items-center gap-2 mt-4 mb-2">
                <h3 className="text-sm font-bold text-gray-900">Their remaining games</h3>
                <button type="button" onClick={focusWinOut} className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                  Win out
                </button>
                <Link href={`/predictions/${focusTeam.slug}`} className="text-xs text-blue-600 hover:underline ml-auto">Full {focusTeam.name} outlook →</Link>
              </div>
              <ul className="space-y-1.5">{focusGames.map((g) => renderGame(g, true))}</ul>
            </>
          )}
        </section>
      )}

      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6">
        {/* Picker */}
        <section>
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
            {weeks.map((wk) => {
              const n = remaining.filter((g) => g.week === wk && picks[gameKey(g)]).length;
              return (
                <button
                  key={wk}
                  type="button"
                  onClick={() => setWeek(wk)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-sm border ${wk === week ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'}`}
                >
                  Wk {wk}{n ? <span className={`ml-1 text-xs ${wk === week ? 'text-blue-100' : 'text-blue-600'}`}>·{n}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 mt-2 mb-3">
            <h2 className="text-lg font-bold text-gray-900">Week {week}</h2>
            <span className="text-xs text-gray-500">{shownGames[0] ? fmtDay(shownGames[0].date) : ''}</span>
            <div className="flex-1" />
            <button type="button" onClick={() => setWeekPicks(week, 'favorites')} className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">Pick favorites</button>
            <button type="button" onClick={() => setWeekPicks(week, 'clear')} className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">Clear week</button>
          </div>
          <ul className="space-y-1.5">{shownGames.map((g) => renderGame(g))}</ul>
          <p className="text-xs text-gray-500 mt-3">Tap a team to pick it. Tap again to undo. Games you don&apos;t pick are simulated using the model&apos;s win chance.</p>
        </section>

        {/* Odds */}
        <section className="space-y-4">
          {renderConf('AFC')}
          {renderConf('NFC')}
          <p className="text-xs text-gray-500">The line under the 7th team marks the playoff cutoff. Click a team to follow it. Small +/- numbers show the change from your picks.</p>
        </section>
      </div>
    </div>
  );
}
