'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { evaluateTrade, isExecutable, type TradeSideInput } from '@/lib/trade';
import { findDealsForPlayer, incomingOffers, type DealSuggestion } from '@/lib/trade/finder';
import { teamStrategy, getTeamPicks, pickFromId, pickShort, pickValue } from '@/lib/trade';
import { getActiveRumors, rumorAccuracy, rumorPlayerMeta, type TradeRumor } from '@/lib/trade';
import { computeTradeGrade, getProposalHistory, type TradeGrade, type ProposalRecord } from '@/lib/trade';
import { tradeWindowClosed, TRADE_DEADLINE_DAY } from '@/lib/sim/simRange';
import { basketballTradeValue, type BasketballPlayer, type BasketballTeam, type TeamTradeOutcome, type TeamCapStatus } from '@bs/sport-basketball';

type League = NonNullable<ReturnType<typeof useLeagueOrHydrate>['league']>;

/**
 * /trade — two-team trade builder (Phase 2D-6, trade-system upgrade).
 *
 * Pick a partner (their strategy shows inline), assemble players AND draft picks
 * from each roster, and watch the live PTS-based evaluation: per-asset value, a
 * running total per side, a letter grade + Send/Get balance bar, post-trade
 * cap/apron impact, and any blocking salary-match errors. Propose when legal +
 * accepted.
 */
export default function TradePage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();

  const [targetId, setTargetId] = useState<string>('');
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [theirs, setTheirs] = useState<Set<string>>(new Set());
  const [myPicks, setMyPicks] = useState<Set<string>>(new Set());
  const [theirPicks, setTheirPicks] = useState<Set<string>>(new Set());
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tab, setTab] = useState<'build' | 'finder' | 'offers'>('build');
  const [finderId, setFinderId] = useState('');

  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  const userTeamId = league?.userTeamId ?? null;

  const sides = useMemo<TradeSideInput[]>(() => {
    if (!userTeamId || !targetId) return [];
    return [
      { teamId: userTeamId as TradeSideInput['teamId'], playerIds: [...mine] as TradeSideInput['playerIds'], pickIds: [...myPicks] },
      { teamId: targetId as TradeSideInput['teamId'], playerIds: [...theirs] as TradeSideInput['playerIds'], pickIds: [...theirPicks] },
    ];
  }, [userTeamId, targetId, mine, theirs, myPicks, theirPicks]);

  const evaluation = useMemo(
    () => (league && sides.length === 2 ? evaluateTrade(league, sides) : null),
    [league, sides],
  );

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  if (!userTeamId) {
    return (
      <Shell>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="🔁" title="Spectating" message="Pick a team to build and propose trades." />
        </div>
      </Shell>
    );
  }

  const userTeam = teamById.get(userTeamId)!;
  const targetTeam = targetId ? teamById.get(targetId) : null;
  const playerById = league.players as Record<string, BasketballPlayer>;
  const season = league.currentSeason;
  const window = tradeWindowClosed(league);
  const hasAssets = (mine.size + myPicks.size > 0) && (theirs.size + theirPicks.size > 0);
  const accepted = !!evaluation && isExecutable(evaluation, sides);
  // You can SEND any legal deal (the AI may still decline); illegal salary
  // matching is hard-blocked.
  const canSend = !window.closed && hasAssets && !!evaluation && evaluation.legal;

  // Running side totals (PTS), computed from the live selection.
  const sendValue =
    [...mine].reduce((s, id) => s + (playerById[id] ? basketballTradeValue(playerById[id], { season }) : 0), 0) +
    [...myPicks].reduce((s, id) => s + pickValueById(league, id), 0);
  const receiveValue =
    [...theirs].reduce((s, id) => s + (playerById[id] ? basketballTradeValue(playerById[id], { season }) : 0), 0) +
    [...theirPicks].reduce((s, id) => s + pickValueById(league, id), 0);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
    setResultMsg(null);
  }

  function addTo(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    if (set.has(id)) return;
    const next = new Set(set);
    next.add(id);
    setter(next);
    setResultMsg(null);
  }

  function clearAll() {
    setMine(new Set()); setTheirs(new Set()); setMyPicks(new Set()); setTheirPicks(new Set());
  }

  // Drag a roster row onto the trade block — routed by the dragstart payload.
  function onDropDeal(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const { id, side, kind } = JSON.parse(raw) as { id: string; side: 'mine' | 'theirs'; kind: 'player' | 'pick' };
      if (kind === 'pick') {
        if (side === 'mine') addTo(myPicks, setMyPicks, id);
        else addTo(theirPicks, setTheirPicks, id);
      } else {
        if (side === 'mine') addTo(mine, setMine, id);
        else addTo(theirs, setTheirs, id);
      }
    } catch {
      /* malformed payload — ignore */
    }
  }

  async function propose() {
    const partnerName = targetTeam?.city ?? 'They';
    const result = await store.proposeTrade(sides);
    if (!result) return;
    if (result.accepted) {
      setResultMsg('✅ Trade accepted and executed.');
      clearAll();
      setTargetId('');
    } else {
      setResultMsg(`❌ ${partnerName} declined: ${result.reason}`);
    }
  }

  async function proposeDeal(d: DealSuggestion) {
    const s: TradeSideInput[] = [
      { teamId: userTeamId as TradeSideInput['teamId'], playerIds: d.giveIds as TradeSideInput['playerIds'] },
      { teamId: d.partnerTeamId as TradeSideInput['teamId'], playerIds: d.getIds as TradeSideInput['playerIds'] },
    ];
    const result = await store.proposeTrade(s);
    if (result?.accepted) { setResultMsg('✅ Trade accepted and executed.'); setTab('build'); }
  }

  // Load a suggested/offered deal into the builder for tweaking (counter-offer).
  function loadDeal(d: DealSuggestion) {
    setTargetId(d.partnerTeamId);
    setMine(new Set(d.giveIds));
    setTheirs(new Set(d.getIds));
    setMyPicks(new Set());
    setTheirPicks(new Set());
    setResultMsg(null);
    setTab('build');
  }

  const userOutcome = evaluation?.perTeam.find(t => t.teamId === userTeamId) ?? null;
  const targetOutcome = evaluation && targetId ? evaluation.perTeam.find(t => t.teamId === targetId) ?? null : null;
  const strategy = targetId ? teamStrategy(league, targetId as TradeSideInput['teamId']) : null;

  return (
    <Shell>
      <RumorsPanel league={league} />

      <div className="mb-4 inline-flex rounded-lg border overflow-hidden text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
        {([['build', 'Build trade'], ['finder', 'Trade finder'], ['offers', 'Offers']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5" style={tab === k ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-sec)' }}>{l}</button>
        ))}
      </div>

      <DeadlineBanner league={league} window={window} />

      {tab === 'finder' && (
        <TradeFinderPanel league={league} userTeam={userTeam} teamById={teamById} playerById={playerById} season={season} finderId={finderId} setFinderId={setFinderId} onPropose={proposeDeal} onLoad={loadDeal} loading={store.loading} />
      )}
      {tab === 'offers' && (
        <OffersPanel league={league} teamById={teamById} playerById={playerById} season={season} onPropose={proposeDeal} onLoad={loadDeal} loading={store.loading} />
      )}

      {tab === 'build' && (
      <>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-2 font-bold">
          <TeamLogo abbreviation={userTeam.abbreviation} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} size="xs" />
          {userTeam.city}
        </div>
        <span className="opacity-50">↔</span>
        <select
          value={targetId}
          onChange={e => { setTargetId(e.target.value); setTheirs(new Set()); setTheirPicks(new Set()); setResultMsg(null); }}
          className="px-2 py-1.5 rounded-lg border bg-[var(--surface)] text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <option value="">Select a trade partner…</option>
          {league.teams
            .filter(t => t.id !== userTeamId)
            .sort((a, b) => a.city.localeCompare(b.city))
            .map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
        </select>
        {strategy && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-sec)' }} title="The partner's posture drives what they'll accept">
            🧭 {strategy.blurb}
          </span>
        )}
      </div>

      {resultMsg && (
        <div className="mb-5 px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
          {resultMsg}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_1fr_0.95fr] gap-5">
        <RosterColumn league={league} team={userTeam} playerById={playerById} season={season} selected={mine} selectedPicks={myPicks} onToggle={id => toggle(mine, setMine, id)} onTogglePick={id => toggle(myPicks, setMyPicks, id)} side="mine" />
        {targetTeam ? (
          <RosterColumn league={league} team={targetTeam} playerById={playerById} season={season} selected={theirs} selectedPicks={theirPicks} onToggle={id => toggle(theirs, setTheirs, id)} onTogglePick={id => toggle(theirPicks, setTheirPicks, id)} side="theirs" />
        ) : (
          <div className="rounded-xl border bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-sec)]" style={{ borderColor: 'var(--border)' }}>
            Select a trade partner to see their roster and picks.
          </div>
        )}

        <div className="space-y-4 self-start">
          {/* Trade block (drop zone) */}
          <section
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDropDeal}
            className="rounded-xl border-2 border-dashed p-4 transition-colors"
            style={{
              borderColor: dragOver ? 'var(--accent)' : 'var(--border)',
              background: dragOver ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-sm">Trade block</h2>
              {hasAssets && (
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--text-sec)' }}>
                  Send <span style={{ color: '#dc2626' }}>{fmtPts(sendValue)}</span> · Receive <span style={{ color: '#10b981' }}>{fmtPts(receiveValue)}</span> trade pts
                </span>
              )}
            </div>
            <DealHalf label={`${userTeam.city} send`} playerIds={[...mine]} pickIds={[...myPicks]} league={league} playerById={playerById} accent="#dc2626" onRemovePlayer={id => toggle(mine, setMine, id)} onRemovePick={id => toggle(myPicks, setMyPicks, id)} />
            <DealHalf label={`${targetTeam ? targetTeam.city + ' send' : 'You receive'}`} playerIds={[...theirs]} pickIds={[...theirPicks]} league={league} playerById={playerById} accent="#10b981" onRemovePlayer={id => toggle(theirs, setTheirs, id)} onRemovePick={id => toggle(theirPicks, setTheirPicks, id)} />
            {!hasAssets && (
              <p className="text-xs text-[var(--text-sec)] mt-1">Drag players or picks here — or tap them in the rosters.</p>
            )}
          </section>

          {/* Evaluation */}
          <section className="rounded-xl border bg-[var(--surface)] p-4" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-bold text-sm mb-3">Evaluation</h2>
            {!evaluation || !hasAssets ? (
              <p className="text-sm text-[var(--text-sec)]">Add assets from each side to evaluate.</p>
            ) : (
              <>
                <GradeHeader receiveValue={receiveValue} sendValue={sendValue} />
                <TradeValueBar receiveValue={receiveValue} sendValue={sendValue} />
                {userOutcome && <CapImpactLine outcome={userOutcome} />}

                <div
                  className="text-xs font-semibold mt-3 mb-3 px-2 py-1.5 rounded"
                  style={{
                    background: !evaluation.legal
                      ? 'color-mix(in srgb, #dc2626 14%, transparent)'
                      : evaluation.allAccept
                      ? 'color-mix(in srgb, #10b981 16%, transparent)'
                      : 'color-mix(in srgb, #f59e0b 16%, transparent)',
                  }}
                >
                  {evaluation.summary}
                </div>

                {userOutcome && <OutcomeBlock label={`${userTeam.city} (You)`} outcome={userOutcome} />}
                {targetOutcome && targetTeam && <OutcomeBlock label={targetTeam.city} outcome={targetOutcome} />}

                {evaluation.warnings.map((w, i) => (
                  <p key={i} className="text-xs mt-2" style={{ color: '#f59e0b' }}>⚠ {w}</p>
                ))}

                {!evaluation.legal && (
                  <SalaryHint evaluation={evaluation} teamById={teamById} />
                )}
                {window.closed && (
                  <p className="text-xs mt-3" style={{ color: '#dc2626' }}>🔒 {window.reason} You can browse, but new trades can&apos;t be executed.</p>
                )}

                <Button variant="primary" className="w-full mt-4" disabled={!canSend || store.loading} onClick={() => void propose()}>
                  {store.loading ? 'Processing…' : !evaluation.legal ? 'Salary doesn’t match' : accepted ? 'Propose Trade' : 'Send Offer'}
                </Button>
                {canSend && !accepted && (
                  <p className="text-[11px] text-center mt-1.5 opacity-60">They&apos;ll likely decline — send anyway to make your case.</p>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      <HistoryPanel league={league} />
      </>
      )}
    </Shell>
  );
}

// ===========================================================================
// Salary hint + past proposals
// ===========================================================================

function SalaryHint({ evaluation, teamById }: { evaluation: ReturnType<typeof evaluateTrade>; teamById: Map<string, BasketballTeam> }) {
  const fail = evaluation.perTeam.find(t => !t.capCompliant);
  if (!fail) return null;
  const over = Math.max(0, fail.capDetail.incomingSalary - fail.capDetail.maxIncomingAllowed);
  const name = teamById.get(fail.teamId)?.city ?? 'They';
  return (
    <p className="text-xs mt-3" style={{ color: '#dc2626' }}>
      ⚠ Salary doesn&apos;t match — {name} can take back at most {money(fail.capDetail.maxIncomingAllowed)} for {money(fail.capDetail.outgoingSalary)} sent. Trim {money(over)} of incoming salary, or send more salary the other way.
    </p>
  );
}

function HistoryPanel({ league }: { league: League }) {
  const history = useMemo(() => getProposalHistory(league), [league]);
  const [open, setOpen] = useState(false);
  if (history.length === 0) return null;
  return (
    <section className="mt-6 rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left" style={{ background: 'var(--muted)' }}>
        <span className="font-bold text-sm">Past proposals ({history.length})</span>
        <span className="ml-auto text-xs opacity-60">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {history.map(rec => <HistoryRow key={rec.id} rec={rec} />)}
        </ul>
      )}
    </section>
  );
}

function HistoryRow({ rec }: { rec: ProposalRecord }) {
  const assets = (a: { players: string[]; picks: string[] }) => [...a.players, ...a.picks.map(p => `🎟️ ${p}`)].join(', ') || 'nothing';
  return (
    <li className="px-4 py-2.5 text-xs border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2">
        <span className="font-bold">vs {rec.partnerName}</span>
        <span className="text-[10px] uppercase tracking-wide opacity-50">Day {rec.day}</span>
        <span className="text-lg font-black leading-none ml-1" style={{ color: gradeColor(rec.grade) }}>{rec.grade}</span>
        <span className="ml-auto font-semibold" style={{ color: rec.outcome === 'accepted' ? '#10b981' : '#dc2626' }}>
          {rec.outcome === 'accepted' ? 'Accepted' : 'Rejected'}
        </span>
      </div>
      <div className="mt-0.5 opacity-80">
        <span style={{ color: '#dc2626' }}>Sent:</span> {assets(rec.sent)} · <span style={{ color: '#10b981' }}>Got:</span> {assets(rec.received)}
      </div>
      {rec.reason && <div className="opacity-50 mt-0.5">{rec.reason}</div>}
    </li>
  );
}

// ===========================================================================
// Trade rumors (P2.1)
// ===========================================================================

function RumorsPanel({ league }: { league: League }) {
  const [open, setOpen] = useState(true);
  const rumors = useMemo(() => getActiveRumors(league), [league]);
  const acc = useMemo(() => rumorAccuracy(league), [league]);

  if (rumors.length === 0 && acc.resolved === 0) return null;

  return (
    <section className="mb-5 rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 border-b text-left" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        <span className="font-bold text-sm">📰 Trade Rumors</span>
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text-sec)' }}>
          {acc.resolved === 0
            ? 'Season Accuracy: — (no rumors resolved yet)'
            : `Season Accuracy: ${acc.accurate}/${acc.resolved} (${acc.pct}%)`}
        </span>
        <span className="ml-auto text-xs opacity-60">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        rumors.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--text-sec)]">The mill is quiet right now — sim toward the deadline and the rumors will heat up.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2 p-3">
            {rumors.map(r => <RumorCard key={r.id} league={league} rumor={r} />)}
          </div>
        )
      )}
    </section>
  );
}

function RumorCard({ league, rumor }: { league: League; rumor: TradeRumor }) {
  const meta = rumorPlayerMeta(league, rumor);
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={rumor.hot
            ? { background: 'color-mix(in srgb, #dc2626 18%, transparent)', color: '#dc2626' }
            : { background: 'color-mix(in srgb, #3b82f6 16%, transparent)', color: '#3b82f6' }}
        >
          {rumor.hot ? '🔥 Hot' : '❄ Cold'}
        </span>
        <span className="text-[10px] uppercase tracking-wide opacity-50">Day {rumor.day}</span>
      </div>
      <div className="font-semibold text-sm leading-snug">{rumor.headline}</div>
      <div className="text-xs text-[var(--text-sec)] mt-0.5">{rumor.detail}</div>
      {meta && <div className="text-[11px] mt-1.5 font-mono opacity-70">{meta}</div>}
    </div>
  );
}

// ===========================================================================
// Deadline / window banner (P2.2)
// ===========================================================================

function DeadlineBanner({ league, window }: { league: League; window: { closed: boolean; reason: string } }) {
  if (window.closed) {
    return (
      <div className="mb-5 px-4 py-2.5 rounded-lg text-sm border flex items-center gap-2" style={{ borderColor: '#dc2626', background: 'color-mix(in srgb, #dc2626 8%, transparent)' }}>
        🔒 <span className="font-semibold">Trade window closed.</span> {window.reason}
      </div>
    );
  }
  const daysLeft = Math.max(0, TRADE_DEADLINE_DAY - league.currentTick);
  return (
    <div className="mb-5 px-4 py-2.5 rounded-lg text-sm border flex flex-wrap items-center gap-x-3 gap-y-1" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <span className="font-semibold">📆 Trade deadline: Day {TRADE_DEADLINE_DAY}</span>
      <span className="text-[var(--text-sec)]">
        {daysLeft === 0 ? 'Deadline day — last chance to deal.' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left to make a move.`}
      </span>
    </div>
  );
}

// ===========================================================================
// Grade + balance bar (P1.3)
// ===========================================================================

function gradeColor(g: TradeGrade): string {
  if (g === 'A+' || g === 'A') return '#10b981';
  if (g === 'B+' || g === 'B') return '#22c55e';
  if (g === 'C') return '#f59e0b';
  if (g === 'D') return '#f97316';
  return '#dc2626';
}

// Grade badge palette mirrors football's trade summary (src/app/trades/page.tsx):
// A → green, B → blue, C → yellow, D/F → red. Inline hex keeps it consistent
// with this app's styling convention while matching football's exact colors.
function gradeBadgeStyle(g: TradeGrade): { color: string; background: string } {
  if (g.startsWith('A')) return { color: '#15803d', background: '#dcfce7' };
  if (g.startsWith('B')) return { color: '#1d4ed8', background: '#dbeafe' };
  if (g === 'C') return { color: '#a16207', background: '#fef9c3' };
  return { color: '#b91c1c', background: '#fee2e2' };
}

// Qualitative verdict tag — football's exact label set + thresholds
// (TradeValueBar in src/app/trades/page.tsx).
function verdictTag(receiveValue: number, sendValue: number): { label: string; color: string } {
  const total = Math.max(receiveValue + sendValue, 1);
  const diff = (receiveValue / total) * 100 - 50;
  if (diff > 5) return { label: 'Great Deal', color: '#10b981' };
  if (diff > -5) return { label: 'Fair Trade', color: 'var(--text-sec)' };
  if (diff > -15) return { label: 'Slight Overpay', color: '#d97706' };
  return { label: 'Bad Deal', color: '#dc2626' };
}

function GradeHeader({ receiveValue, sendValue }: { receiveValue: number; sendValue: number }) {
  const grade = computeTradeGrade(receiveValue, sendValue);
  const delta = receiveValue - sendValue;
  const maxVal = Math.max(receiveValue, sendValue, 1);
  // Football's exact phrasing + color logic: "You gain/lose ~N pts",
  // green when near-even (<10% of max), blue on a gain, amber on a loss.
  const deltaLabel = delta === 0 ? 'even value' : delta > 0 ? `You gain ~${fmtPts(delta)} pts` : `You lose ~${fmtPts(Math.abs(delta))} pts`;
  const deltaColor = Math.abs(delta) < maxVal * 0.1 ? '#10b981' : delta > 0 ? '#2563eb' : '#d97706';
  const badge = gradeBadgeStyle(grade);
  const verdict = verdictTag(receiveValue, sendValue);
  return (
    <div className="text-sm font-semibold flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        <span className="text-[var(--text-sec)] font-normal">Value: </span>
        <span className="tabular-nums">{fmtPts(sendValue)}</span>
        <span className="opacity-50"> → </span>
        <span className="tabular-nums">{fmtPts(receiveValue)} pts</span>
      </span>
      <span className="text-xs font-normal" style={{ color: deltaColor }}>({deltaLabel})</span>
      <span className="text-[10px] font-black px-1.5 py-0.5 rounded" style={{ color: badge.color, background: badge.background }}>{grade}</span>
      <span className="text-xs font-bold" style={{ color: verdict.color }}>{verdict.label}</span>
    </div>
  );
}

// Send/Get balance bars — matches football's main-builder layout exactly:
// a red "Send" bar over a green "Get" bar, each scaled to the larger side.
function TradeValueBar({ receiveValue, sendValue }: { receiveValue: number; sendValue: number }) {
  const maxBar = Math.max(receiveValue, sendValue, 1);
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--text-sec)] w-9">Send</span>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full" style={{ width: `${(sendValue / maxBar) * 100}%`, background: '#f87171' }} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--text-sec)] w-9">Get</span>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full" style={{ width: `${(receiveValue / maxBar) * 100}%`, background: '#4ade80' }} />
        </div>
      </div>
    </div>
  );
}

// User-team cap snapshot in football's compact form:
// "Cap impact: ±$X.XM   Post-trade space: $Y.YM". NBA apron detail stays in
// the per-team OutcomeBlock below; this is the at-a-glance line football shows.
function CapImpactLine({ outcome }: { outcome: TeamTradeOutcome }) {
  const impact = outcome.capDetail.outgoingSalary - outcome.capDetail.incomingSalary;
  const space = outcome.postCap.capRoom;
  const fM = (n: number) => `$${(Math.abs(n) / 1_000_000).toFixed(1)}M`;
  return (
    <div className="flex flex-wrap items-center gap-x-3 text-xs mt-2">
      <span className="text-[var(--text-sec)]">
        Cap impact: <span className="font-medium" style={{ color: impact >= 0 ? '#10b981' : '#dc2626' }}>{impact >= 0 ? '+' : '−'}{fM(impact)}</span>
      </span>
      <span className="text-[var(--text-sec)]">
        Post-trade space: <span className="font-medium" style={{ color: space < 0 ? '#dc2626' : '#10b981' }}>{space < 0 ? '−' : ''}{fM(space)}</span>
      </span>
    </div>
  );
}

// ===========================================================================
// Finder / Offers
// ===========================================================================

function TradeFinderPanel({
  league, userTeam, teamById, playerById, season, finderId, setFinderId, onPropose, onLoad, loading,
}: {
  league: League;
  userTeam: BasketballTeam;
  teamById: Map<string, BasketballTeam>;
  playerById: Record<string, BasketballPlayer>;
  season: number;
  finderId: string;
  setFinderId: (id: string) => void;
  onPropose: (d: DealSuggestion) => void;
  onLoad: (d: DealSuggestion) => void;
  loading: boolean;
}) {
  const roster = userTeam.playerIds.map(id => playerById[id]).filter(Boolean).sort((a, b) => b.ratings.overall - a.ratings.overall);
  const deals = useMemo(() => (finderId ? findDealsForPlayer(league, finderId) : []), [league, finderId]);
  return (
    <div>
      <p className="text-sm text-[var(--text-sec)] mb-2">Shop one of your players around — the engine surfaces legal deals other teams would actually accept.</p>
      <select value={finderId} onChange={e => setFinderId(e.target.value)} className="px-2 py-1.5 rounded-lg border bg-[var(--surface)] text-sm mb-4" style={{ borderColor: 'var(--border)' }}>
        <option value="">Select a player to shop…</option>
        {roster.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.sportData.position} · {p.ratings.overall})</option>)}
      </select>
      {finderId && (deals.length === 0
        ? <p className="text-sm text-[var(--text-sec)]">No team is biting on that player right now — try a different player, or build a custom offer.</p>
        : <div className="space-y-2">{deals.map((d, i) => <DealCard key={i} d={d} teamById={teamById} playerById={playerById} season={season} primaryLabel="Propose" secondaryLabel="Load & tweak" onPropose={onPropose} onLoad={onLoad} loading={loading} />)}</div>)}
    </div>
  );
}

function OffersPanel({
  league, teamById, playerById, season, onPropose, onLoad, loading,
}: {
  league: League;
  teamById: Map<string, BasketballTeam>;
  playerById: Record<string, BasketballPlayer>;
  season: number;
  onPropose: (d: DealSuggestion) => void;
  onLoad: (d: DealSuggestion) => void;
  loading: boolean;
}) {
  const offers = useMemo(() => incomingOffers(league), [league]);
  if (offers.length === 0) {
    return <p className="text-sm text-[var(--text-sec)]">No offers on the table — no rival is calling about your roster right now.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--text-sec)] mb-2">Rivals are interested in your players — accept the deal, or counter it in the builder.</p>
      {offers.map((d, i) => <DealCard key={i} d={d} teamById={teamById} playerById={playerById} season={season} primaryLabel="Accept" secondaryLabel="Counter" onPropose={onPropose} onLoad={onLoad} loading={loading} />)}
    </div>
  );
}

function DealCard({
  d, teamById, playerById, season, primaryLabel, secondaryLabel, onPropose, onLoad, loading,
}: {
  d: DealSuggestion;
  teamById: Map<string, BasketballTeam>;
  playerById: Record<string, BasketballPlayer>;
  season: number;
  primaryLabel: string;
  secondaryLabel: string;
  onPropose: (d: DealSuggestion) => void;
  onLoad: (d: DealSuggestion) => void;
  loading: boolean;
}) {
  const partner = teamById.get(d.partnerTeamId);
  const names = (ids: string[]) => ids.map(id => { const p = playerById[id]; return p ? `${p.firstName[0]}. ${p.lastName} (${p.ratings.overall})` : '—'; }).join(', ');
  const valOf = (ids: string[]) => ids.reduce((s, id) => s + (playerById[id] ? basketballTradeValue(playerById[id], { season }) : 0), 0);
  const getVal = valOf(d.getIds);
  const giveVal = valOf(d.giveIds);
  const grade = computeTradeGrade(getVal, giveVal);
  return (
    <div className="rounded-xl border bg-[var(--surface)] p-3 flex flex-wrap items-center gap-3" style={{ borderColor: 'var(--border)' }}>
      {partner && <TeamLogo abbreviation={partner.abbreviation} primaryColor={partner.primaryColor} secondaryColor={partner.secondaryColor} size="sm" />}
      <div className="min-w-0 text-sm flex-1">
        <div className="flex items-center gap-2">
          <span className="font-bold">{partner ? `${partner.city} ${partner.name}` : '—'}</span>
          <span className="text-sm font-black" style={{ color: gradeColor(grade) }}>{grade}</span>
          <span className="text-[11px] opacity-60">✓ cap-legal</span>
        </div>
        <div className="text-xs"><span className="font-semibold" style={{ color: '#10b981' }}>You get:</span> {names(d.getIds)} <span className="opacity-50 tabular-nums">· {fmtPts(getVal)} pts</span></div>
        <div className="text-xs"><span className="font-semibold" style={{ color: '#dc2626' }}>You give:</span> {names(d.giveIds)} <span className="opacity-50 tabular-nums">· {fmtPts(giveVal)} pts</span></div>
      </div>
      <div className="flex flex-col gap-1.5 ml-auto">
        <Button variant="primary" disabled={loading} onClick={() => onPropose(d)}>{primaryLabel}</Button>
        <Button variant="ghost" disabled={loading} onClick={() => onLoad(d)}>{secondaryLabel}</Button>
      </div>
    </div>
  );
}

// ===========================================================================
// Roster column (players + picks, with value)
// ===========================================================================

function RosterColumn({
  league, team, playerById, season, selected, selectedPicks, onToggle, onTogglePick, side,
}: {
  league: League;
  team: BasketballTeam;
  playerById: Record<string, BasketballPlayer>;
  season: number;
  selected: Set<string>;
  selectedPicks: Set<string>;
  onToggle: (id: string) => void;
  onTogglePick: (id: string) => void;
  side: 'mine' | 'theirs';
}) {
  const players = team.playerIds
    .map(id => playerById[id])
    .filter(Boolean)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);
  const picks = getTeamPicks(league, team.id);

  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <h2 className="px-3 py-2 font-bold border-b text-sm flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />
        {team.city}
      </h2>
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-1 text-[9px] uppercase tracking-wide opacity-50 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="w-3" aria-hidden />
        <span className="w-4" aria-hidden />
        <span className="flex-1">Player</span>
        <span className="w-6 text-right">POS</span>
        <span className="w-7 text-right">OVR</span>
        <span className="w-11 text-right">SAL</span>
        <span className="w-10 text-right">PTS</span>
      </div>
      <ul className="max-h-[30rem] overflow-y-auto">
        {players.map(p => {
          const sel = selected.has(p.id);
          const salary = contractSalary(p, season);
          const val = basketballTradeValue(p, { season });
          return (
            <li key={p.id}>
              <button
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('application/json', JSON.stringify({ id: p.id, side, kind: 'player' }));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onToggle(p.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 border-t text-left text-sm hover:bg-[var(--surface-2)] transition-colors cursor-grab active:cursor-grabbing"
                style={{ borderColor: 'var(--border)', background: sel ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined }}
                title="Drag onto the trade block, or tap to add"
              >
                <span className="w-3 text-center text-xs opacity-30 select-none" aria-hidden>⠿</span>
                <span className="w-4 text-center" style={{ color: sel ? 'var(--accent)' : 'var(--text-sec)' }}>{sel ? '✓' : '+'}</span>
                <span className="font-semibold truncate flex-1">{p.firstName} {p.lastName}</span>
                <span className="text-xs opacity-60 w-6 text-right">{p.sportData.position}</span>
                <span className="text-xs tabular-nums w-7 text-right font-bold">{p.ratings.overall}</span>
                <span className="text-[10px] tabular-nums w-11 text-right opacity-60">{salary > 0 ? money(salary) : '—'}</span>
                <span className="text-[11px] tabular-nums w-10 text-right font-bold" style={{ color: 'var(--accent)' }}>{fmtPts(val)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {/* Draft picks */}
      {picks.length > 0 && (
        <>
          <div className="px-3 py-1 text-[9px] uppercase tracking-wide opacity-50 border-t" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>Draft picks</div>
          <ul>
            {picks.map(pk => {
              const sel = selectedPicks.has(pk.id);
              const val = pickValue(league, pk);
              return (
                <li key={pk.id}>
                  <button
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('application/json', JSON.stringify({ id: pk.id, side, kind: 'pick' }));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => onTogglePick(pk.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 border-t text-left text-sm hover:bg-[var(--surface-2)] transition-colors cursor-grab active:cursor-grabbing"
                    style={{ borderColor: 'var(--border)', background: sel ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined }}
                    title="Drag onto the trade block, or tap to add"
                  >
                    <span className="w-3 text-center text-xs opacity-30 select-none" aria-hidden>⠿</span>
                    <span className="w-4 text-center" style={{ color: sel ? 'var(--accent)' : 'var(--text-sec)' }}>{sel ? '✓' : '+'}</span>
                    <span className="truncate flex-1">🎟️ {pickShort(league, pk)}</span>
                    <span className="text-[11px] tabular-nums w-10 text-right font-bold" style={{ color: 'var(--accent)' }}>{fmtPts(val)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

// ===========================================================================
// Trade block half + outcome
// ===========================================================================

function DealHalf({
  label, playerIds, pickIds, league, playerById, accent, onRemovePlayer, onRemovePick,
}: {
  label: string;
  playerIds: string[];
  pickIds: string[];
  league: League;
  playerById: Record<string, BasketballPlayer>;
  accent: string;
  onRemovePlayer: (id: string) => void;
  onRemovePick: (id: string) => void;
}) {
  const empty = playerIds.length === 0 && pickIds.length === 0;
  return (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">{label}</div>
      {empty ? (
        <div className="text-xs opacity-40">—</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {playerIds.map(id => {
            const p = playerById[id];
            if (!p) return null;
            return <Chip key={id} accent={accent} onRemove={() => onRemovePlayer(id)}>{p.firstName[0]}. {p.lastName}</Chip>;
          })}
          {pickIds.map(id => {
            const pk = pickFromId(league, id);
            return <Chip key={id} accent={accent} onRemove={() => onRemovePick(id)}>🎟️ {pk ? pickShort(league, pk) : id}</Chip>;
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ accent, onRemove, children }: { accent: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full pl-2 pr-1 py-0.5" style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)` }}>
      {children}
      <button onClick={onRemove} className="opacity-50 hover:opacity-100 px-0.5" title="Remove from deal">✕</button>
    </span>
  );
}

function OutcomeBlock({ label, outcome }: { label: string; outcome: TeamTradeOutcome }) {
  return (
    <div className="mb-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold">{label}{outcome.disposition ? <span className="ml-1.5 font-normal opacity-50">· Strategy: {outcome.disposition}</span> : null}</span>
        <span style={{ color: outcome.willAccept ? '#10b981' : '#dc2626' }}>
          {outcome.willAccept ? 'accepts' : 'rejects'}{!outcome.capCompliant ? ' · cap ✗' : ''}
        </span>
      </div>
      <div className="text-[var(--text-sec)]">{outcome.reasoning}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 opacity-70">
        <span>out {money(outcome.capDetail.outgoingSalary)}</span>
        <span>in {money(outcome.capDetail.incomingSalary)}</span>
        <span>max {money(outcome.capDetail.maxIncomingAllowed)}</span>
      </div>
      <CapLine post={outcome.postCap} />
    </div>
  );
}

function CapLine({ post }: { post: TeamCapStatus }) {
  const tag =
    post.isOverSecondApron ? { t: '2nd apron', c: '#dc2626' } :
    post.isOverFirstApron ? { t: '1st apron', c: '#f97316' } :
    post.isOverTax ? { t: 'luxury tax', c: '#f59e0b' } :
    post.isOverCap ? { t: 'over cap', c: 'var(--text-sec)' } :
    { t: `${money(Math.max(0, post.capRoom))} room`, c: '#10b981' };
  return (
    <div className="flex items-center gap-2 mt-0.5">
      <span className="opacity-70">post-trade {money(post.payroll)}</span>
      <span className="font-semibold px-1.5 py-0.5 rounded text-[10px]" style={{ color: tag.c, background: 'var(--surface-2)' }}>{tag.t}</span>
      {post.taxBill > 0 && <span className="opacity-60">tax {money(post.taxBill)}</span>}
    </div>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function pickValueById(league: League, id: string): number {
  const pk = pickFromId(league, id);
  return pk ? pickValue(league, pk) : 0;
}

function fmtPts(n: number): string {
  const r = Math.round(n);
  return `${r < 0 ? '-' : ''}${Math.abs(r).toLocaleString()}`;
}

function contractSalary(p: BasketballPlayer, season: number): number {
  if (!p.contract) return 0;
  const y = p.contract.years.find(yr => yr.season === season);
  return y ? y.baseSalary + y.proratedBonus : 0;
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n > 0) return `$${Math.round(n / 1000)}K`;
  return '$0';
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-6xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <h1 className="text-4xl font-extrabold mt-2 mb-6" style={{ color: 'var(--accent)' }}>Trade Center</h1>
      {children}
    </main>
  );
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
    </main>
  );
}
