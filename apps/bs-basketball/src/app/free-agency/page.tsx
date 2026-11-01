'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { FreeAgentTable } from '@/components/freeAgency/FreeAgentTable';
import { OfferSalaryInput, OfferYearsPicker } from '@/components/freeAgency/OfferSalaryInput';
import { PlayerName } from '@/components/modals/PlayerModalProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  freeAgentPool,
  capRoom,
  signingBudget,
  signingChannels,
  channelForSalary,
  teamAppeal,
  rosterCount,
  acceptanceProbability,
  bestCompetingOffer,
  getFaDay,
  isSeasonUnderway,
  faPhase,
  faPriceDecay,
  FA_DAYS,
  getMaxRoster,
  type FreeAgentInfo,
  type CounterOffer,
  type OfferResult,
} from '@/lib/freeAgency';
import { OffseasonStepper } from '@/components/shell/OffseasonStepper';
import { positionNeeds } from '@/lib/draft/needs';
import type { BasketballPlayer, BasketballPosition, BasketballTeam } from '@bs/sport-basketball';
import { getDraft } from '@/lib/draft';

/**
 * /free-agency — sign players from the free-agent pool (Phase 2D-5).
 *
 * Pool list (last team, OVR, pos, age, Bird rights, market ask) on the left;
 * an offer panel on the right with years + salary, a projected acceptance
 * estimate, competing-interest note, and a release selector when the roster is
 * full. Offers resolve against simplified multi-team bidding.
 *
 * Football parity: the offer panel carries its own message feed + outcome
 * banners (SIGNED! / REJECTED) so the result lands where you made the offer —
 * including inside the mobile bottom sheet, which used to hide a page-top
 * banner. Offseason-only chrome (stepper, day clock, Skip Day/Week) hides once
 * the season is underway.
 */

type PosFilter = 'ALL' | BasketballPosition;
const POS_OPTIONS: ReadonlyArray<{ value: PosFilter; label: string }> = [
  { value: 'ALL', label: 'ALL' },
  { value: 'PG', label: 'PG' },
  { value: 'SG', label: 'SG' },
  { value: 'SF', label: 'SF' },
  { value: 'PF', label: 'PF' },
  { value: 'C', label: 'C' },
];

type FeedTone = 'neutral' | 'counter' | 'signed' | 'rejected' | 'system';
interface FeedMsg { from: 'you' | 'player' | 'system'; tone: FeedTone; text: string }
const BUBBLE: Record<FeedTone, string> = {
  neutral: 'bg-[var(--surface)] text-[var(--text)]',
  counter: 'bg-amber-500/10 border border-amber-500/30 text-amber-600',
  signed: 'bg-green-500/10 border border-green-500/30 text-green-600',
  rejected: 'bg-red-500/10 border border-red-500/30 text-red-600',
  system: 'bg-blue-500/10 border border-blue-500/30 text-blue-600',
};

/** A resolved offer, snapshotted so the panel can keep showing the result
 *  after a signed player leaves the pool (until the user hits Done). */
interface OfferOutcome {
  kind: OfferResult['outcome'];
  message: string;
  info: FreeAgentInfo;
  years: number;
  salaryPerYear: number;
}

/** Ring classes for the "your click landed" pulse on the offer panel. */
const PULSE = ['ring-2', 'ring-[var(--accent)]'];

/** A player's ask in $M, rounded UP to the $0.1M the offer input works in, so
 *  "Match" never lands a hair under his number. */
function askM(f: FreeAgentInfo): number {
  return Math.ceil(f.marketSalary / 100_000) / 10;
}

export default function FreeAgencyPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();
  const router = useRouter();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [years, setYears] = useState(2);
  const [salaryM, setSalaryM] = useState(5);
  const [releaseId, setReleaseId] = useState<string>('');
  const [counter, setCounter] = useState<CounterOffer | null>(null);
  const [feed, setFeed] = useState<FeedMsg[]>([]);
  const [outcome, setOutcome] = useState<OfferOutcome | null>(null);
  const [posFilter, setPosFilter] = useState<PosFilter>('ALL');
  const [affordableOnly, setAffordableOnly] = useState(false);
  // Per-button work flags, so only the clicked button shows the spinner.
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);

  // Every Offer/Negotiate click bumps this nonce: bring the panel into view
  // (desktop) and pulse it so the click visibly lands (football parity).
  const panelRef = useRef<HTMLDivElement>(null);
  const [pulseNonce, setPulseNonce] = useState(0);
  useEffect(() => {
    if (!pulseNonce) return;
    const el = panelRef.current;
    if (!el) return;
    // Desktop: a sticky side column — scroll only if it's out of view. Phones:
    // it's a fixed bottom sheet, already on screen.
    if (window.matchMedia('(min-width: 1024px)').matches) {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    el.classList.add(...PULSE);
    const t = setTimeout(() => el.classList.remove(...PULSE), 900);
    return () => {
      clearTimeout(t);
      el.classList.remove(...PULSE);
    };
  }, [pulseNonce]);

  // Keep the newest negotiation message in view.
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.length]);

  const allPool = useMemo<FreeAgentInfo[]>(() => (league ? freeAgentPool(league) : []), [league]);
  // Who the user can realistically sign: anyone whose ask fits the signing
  // budget. `signingBudget` already returns at least LEAGUE_MINIMUM_SALARY for
  // any team (BUG-17 — minimum-exception availability is always guaranteed),
  // so an over-cap team still sees their minimum-tier players in this filter.
  //
  // BUG-23: previously the predicate also added `(openSpot && uncontested)` as
  // a "vet-minimum safety valve". At Day 0 every player is uncontested, so
  // any team with an open roster spot saw EVERY free agent (including $45M
  // superstars) flagged as affordable — making the filter a no-op. The vet-
  // minimum signing path in resolveUserOffer still works at sign-time; the
  // filter just shouldn't claim a $45M ask is affordable on a $10M budget.
  const affordableIds = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (!league?.userTeamId) return set;
    const bud = signingBudget(league, league.userTeamId);
    for (const f of allPool) {
      if (f.marketSalary <= bud) set.add(f.player.id);
    }
    return set;
  }, [league, allPool]);
  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  const userTeamId = league.userTeamId;
  const userTeam = userTeamId ? (teamById.get(userTeamId) ?? null) : null;
  const room = userTeamId ? capRoom(league, userTeamId) : 0;
  // What the team can actually spend on one signing — cap room, or a Mid-Level /
  // minimum exception when over the cap. Over-cap teams can ALWAYS sign minimums
  // with an open roster spot (BUG-17), so "affordable" keys off this, not raw room.
  const budget = userTeamId ? signingBudget(league, userTeamId) : 0;
  const appeal = userTeamId ? teamAppeal(league, userTeamId) : 0.5;
  const count = userTeamId ? rosterCount(league, userTeamId) : 0;
  const maxRoster = getMaxRoster(league);
  const rosterFull = count >= maxRoster;
  // Mid-season = the explicit tip-off flag, or (for saves that predate it)
  // games already played outside the offseason draft window. The FA window
  // itself runs on a fresh schedule with nothing played yet.
  const inSeason = isSeasonUnderway(league) || (!getDraft(league) && league.games.some(g => g.status === 'played'));
  const faDay = getFaDay(league);
  const phase = faPhase(faDay);
  const faClosed = faDay >= FA_DAYS;
  const decay = faPriceDecay(faDay);
  const decayPct = Math.round(decay * 100);

  const pool = allPool.filter(f =>
    (posFilter === 'ALL' || f.player.sportData.position === posFilter) &&
    (!affordableOnly || affordableIds.has(f.player.id)),
  );

  // Looked up in the whole pool, so changing a filter doesn't close an open offer.
  const selected = selectedId ? allPool.find(f => f.player.id === selectedId) ?? null : null;
  // What the panel shows: the live pick, or — once he's signed and left the
  // pool — the snapshot from the result, until Done.
  const panelInfo = selected ?? outcome?.info ?? null;
  const panelOpen = !!panelInfo && !!userTeamId;
  const offer = { years, salaryPerYear: Math.round(salaryM * 1_000_000) };
  const competing = selected ? bestCompetingOffer(league, selected) : null;
  const acceptPct = selected ? Math.round(acceptanceProbability(selected, offer, competing?.total ?? 0, appeal) * 100) : 0;
  // The exception this offer would spend — mirrors resolveUserOffer exactly, so
  // the UI and the engine agree on which channel (cap room / Mid-Level / minimum /
  // Bird) covers it, and whether anything covers it at all.
  const isBirdSelected = !!selected && selected.birdRights !== 'none' && selected.lastTeamId === userTeamId;
  const offerChannel = selected && userTeamId
    ? channelForSalary(league, userTeamId, offer.salaryPerYear, { isBird: isBirdSelected, birdMax: selected.marketSalary })
    : null;
  const overBudget = !!selected && !offerChannel;
  // Exceptions still in hand (the always-on minimum isn't worth listing).
  const remainingChannels = userTeamId
    ? signingChannels(league, userTeamId).filter(c => !c.used && c.id !== 'minimum')
    : [];
  const bestRemaining = Math.max(room > 0 ? room : 0, ...remainingChannels.map(c => c.max), 0);
  const selectedAskM = selected ? askM(selected) : 0;
  // Slider range: football's 2× ask (≥ $5M), never wider than the old $60M+ rail.
  const salaryMaxM = selected
    ? Math.round(Math.min(Math.max(selectedAskM * 2, 5), Math.max(60, Math.ceil(selectedAskM) + 10)) * 10) / 10
    : 60;

  function selectFa(f: FreeAgentInfo) {
    // Re-clicking the player already in talks keeps the conversation; it just
    // pulses the panel so the click reads as landed.
    const sameTalks = f.player.id === selectedId && !outcome;
    if (!sameTalks) {
      setSelectedId(f.player.id);
      setYears(f.desiredYears);
      setSalaryM(askM(f));
      setReleaseId('');
      setCounter(null);
      setOutcome(null);
      setFeed([{
        from: 'player',
        tone: 'neutral',
        text: `Looking for ${money(f.marketSalary)}/yr over ${f.desiredYears} year${f.desiredYears === 1 ? '' : 's'}.`,
      }]);
    }
    setPulseNonce(n => n + 1);
  }

  function closePanel() {
    setSelectedId(null);
    setOutcome(null);
    setCounter(null);
    setFeed([]);
    setReleaseId('');
  }

  function resetFilters() {
    setPosFilter('ALL');
    setAffordableOnly(false);
  }

  function pickPosition(pos: BasketballPosition) {
    setPosFilter(cur => (cur === pos ? 'ALL' : pos));
  }

  async function makeOffer() {
    if (!selected) return;
    const info = selected;
    const sent = offer;
    setFeed(f => [...f, {
      from: 'you',
      tone: 'neutral',
      text: `${sent.years}yr at ${money(sent.salaryPerYear)}/yr (${money(sent.salaryPerYear * sent.years)} total).`,
    }]);
    setSubmitting(true);
    const neg = await store.negotiateFreeAgent(info.player.id, sent, rosterFull ? releaseId || undefined : undefined);
    setSubmitting(false);
    if (!neg) {
      const err = useLeagueStore.getState().error;
      setFeed(f => [...f, { from: 'system', tone: 'system', text: err ?? 'That offer didn’t go through — try again.' }]);
      return;
    }
    if (neg.kind === 'counter') {
      setCounter(neg.counter);
      setFeed(f => [...f, { from: 'player', tone: 'counter', text: neg.counter.message }]);
      return;
    }
    const r = neg.result;
    setCounter(null);
    setFeed(f => [...f, { from: 'player', tone: r.outcome === 'signed' ? 'signed' : 'rejected', text: r.message }]);
    setOutcome({ kind: r.outcome, message: r.message, info, years: sent.years, salaryPerYear: sent.salaryPerYear });
  }

  function meetDemand() {
    if (!counter) return;
    setYears(counter.years);
    setSalaryM(Math.round(counter.salaryPerYear / 100_000) / 10);
    setCounter(null);
  }

  const capColor = room > 10_000_000 ? '#10b981' : room > 0 ? '#d97706' : '#dc2626';
  const playerLabel = panelInfo ? `${panelInfo.player.firstName} ${panelInfo.player.lastName}` : '';

  return (
    <main className="max-w-6xl mx-auto p-3 sm:p-5 md:p-8">
      {!inSeason && <OffseasonStepper active="fa" />}
      <PageHeader
        title={inSeason ? 'Sign Free Agents' : 'Free Agency'}
        subtitle={
          <>
            {!inSeason && <span className="font-semibold text-[var(--accent)]">Day {faDay} of {FA_DAYS} · </span>}
            {allPool.length} free agent{allPool.length === 1 ? '' : 's'} available
            {inSeason && ' · In-season signings'}
            {decay < 1 && <span className="text-amber-600"> · Prices at {decayPct}%</span>}
            {userTeam && (
              <span className={rosterFull ? 'text-red-600 font-semibold' : undefined}> · Roster {count}/{maxRoster}</span>
            )}
          </>
        }
        right={
          <>
            {userTeam && (
              <div className="text-right mr-1">
                {/* Over-the-cap teams have negative "cap space" — that's normal
                    (most rosters are over the cap). Frame it as such and surface
                    what they CAN still spend via exceptions, instead of a bare
                    red minus that reads like an error. */}
                <div className="text-2xl font-black tabular-nums leading-tight" style={{ color: capColor }}>{money(Math.abs(room))}</div>
                {room < 0 ? (
                  <>
                    <div className="text-[10px] uppercase tracking-wide opacity-60">Over the cap</div>
                    <div className="text-[10px] text-[var(--text-sec)]">~{money(budget)}/yr to spend via exceptions</div>
                  </>
                ) : (
                  <div className="text-[10px] uppercase tracking-wide opacity-60">Cap Space</div>
                )}
              </div>
            )}
            {!inSeason && (
              <>
                <Button size="sm" variant="secondary" disabled={store.loading || faClosed} onClick={() => { void store.advanceFreeAgency(1); }}>Skip Day →</Button>
                <Button size="sm" variant="secondary" disabled={store.loading || faClosed} onClick={() => { void store.advanceFreeAgency(7); }}>Skip Week ⏩</Button>
              </>
            )}
            {!inSeason && !league.games.some(g => g.status === 'played') && (
              <Button
                variant="primary"
                size="sm"
                busy={starting}
                disabled={store.loading}
                onClick={() => {
                  setStarting(true);
                  void store.beginRegularSeason().then(ok => {
                    setStarting(false);
                    if (ok) router.push('/');
                  });
                }}
              >
                Start the Season →
              </Button>
            )}
          </>
        }
      />

      {/* Roster needs — count gaps + quality (upgrade) gaps, so you don't have to
          flip back to Roster & Lineup to see where you're thin. Each tile filters
          the pool to that position. */}
      {userTeam && (
        <RosterNeeds
          players={league.players as Record<string, BasketballPlayer>}
          team={userTeam}
          active={posFilter}
          onPick={pickPosition}
        />
      )}

      {/* FA day clock + price-decay phase — offseason window only. */}
      {!inSeason && (
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-bold tabular-nums" style={{ color: 'var(--accent)' }}>Day {faDay} of {FA_DAYS}</span>
            <span className="font-bold" style={{ color: phase.color }}>
              {phase.label} · prices at {decayPct}%{faClosed ? ' · window closed' : ''}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${(faDay / FA_DAYS) * 100}%`, background: phase.color }} />
          </div>
        </div>
      )}

      {allPool.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState
            icon="🧑‍💼"
            title="Camp's quiet right now"
            message="The pool fills up in the offseason — waived vets and undrafted prospects wash up here after the draft. Check back."
          />
        </div>
      ) : (
        <>
          {/* Position filter + affordable toggle. Clicking the active position
              returns to ALL. */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <SegmentedControl
              size="sm"
              options={POS_OPTIONS}
              value={posFilter}
              onChange={v => setPosFilter(v === posFilter ? 'ALL' : v)}
            />
            {userTeam && (
              <button
                type="button"
                onClick={() => setAffordableOnly(v => !v)}
                aria-pressed={affordableOnly}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors ${
                  affordableOnly
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)] hover:bg-[var(--accent-strong)]'
                    : 'bg-[var(--surface)] text-[var(--text-sec)] border-[var(--border)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                }`}
              >
                {affordableOnly ? 'Showing affordable' : 'Show affordable only'}
              </button>
            )}
          </div>

          <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
            {/* Pool */}
            <section className="rounded-xl border bg-[var(--surface)] overflow-hidden self-start min-w-0" style={{ borderColor: 'var(--border)' }}>
              <h2 className="px-3 py-2 font-bold border-b text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                Available ({pool.length}{pool.length !== allPool.length ? ` of ${allPool.length}` : ''})
              </h2>
              {pool.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-[var(--text-sec)] space-y-2">
                  <div>No free agents match your filters.</div>
                  {affordableOnly && (
                    <div className="text-xs">Nobody left fits your {money(budget)}/yr signing budget{posFilter !== 'ALL' ? ` at ${posFilter}` : ''}.</div>
                  )}
                  <button type="button" onClick={resetFilters} className="text-xs font-bold text-[var(--accent)] hover:underline">
                    Show all free agents
                  </button>
                </div>
              ) : (
                <FreeAgentTable
                  league={league}
                  pool={pool}
                  room={room}
                  budget={budget}
                  appeal={appeal}
                  selectedId={selectedId}
                  onSelect={selectFa}
                  showActions={!!userTeamId}
                  priceDecay={decay}
                />
              )}
            </section>

            {/* Offer panel — a bottom sheet on phones/tablets (so tapping Offer
                brings it up in place, results included), a sticky side column
                on desktop. */}
            {panelOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={closePanel} />}
            <section
              className={panelOpen
                ? 'max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:max-h-[85vh] max-lg:overflow-y-auto max-lg:rounded-t-2xl max-lg:border-t max-lg:shadow-2xl max-lg:p-3 max-lg:bg-[var(--surface)] lg:sticky lg:top-32 lg:self-start'
                : 'lg:sticky lg:top-32 lg:self-start'}
              style={panelOpen ? { borderColor: 'var(--border)' } : undefined}
            >
              <div ref={panelRef} className="rounded-xl transition-shadow scroll-mt-32">
                {!userTeamId ? (
                  <div className="rounded-xl border bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-sec)]" style={{ borderColor: 'var(--border)' }}>
                    You&apos;re spectating — pick a team to sign free agents.
                  </div>
                ) : !panelInfo ? (
                  <div className="rounded-xl border bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-sec)]" style={{ borderColor: 'var(--border)' }}>
                    Select a free agent to make an offer.
                  </div>
                ) : (
                  <div className="rounded-xl border bg-[var(--surface)] p-4" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-start gap-3 mb-3">
                      <PlayerAvatar firstName={panelInfo.player.firstName} lastName={panelInfo.player.lastName} primaryColor="#444" secondaryColor="#fff" photoUrl={panelInfo.player.sportData.photoUrl} size="lg" />
                      <div className="min-w-0 flex-1">
                        <PlayerName playerId={panelInfo.player.id} firstName={panelInfo.player.firstName} lastName={panelInfo.player.lastName} className="font-bold truncate max-w-full hover:text-[var(--accent)] transition-colors" />
                        <div className="text-xs text-[var(--text-sec)]">
                          {panelInfo.player.sportData.position} · Age {panelInfo.player.age} · {panelInfo.player.ratings.overall} OVR
                        </div>
                        <div className="text-xs mt-0.5">
                          <span className="text-[var(--text-sec)]">Asking </span>
                          <span className="font-bold tabular-nums">{money(panelInfo.marketSalary)}/yr · {panelInfo.desiredYears}y</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={closePanel}
                        aria-label="Close offer panel"
                        className="shrink-0 -mr-1 -mt-1 rounded-md px-2 py-1 text-lg leading-none text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Message feed */}
                    {feed.length > 0 && (
                      <div ref={feedRef} className="bg-[var(--surface-2)] rounded-lg p-3 mb-3 max-h-48 overflow-y-auto space-y-2">
                        {feed.map((m, i) => (
                          <div key={i} className={`text-sm rounded-lg px-3 py-2 ${BUBBLE[m.tone]}`}>
                            <span className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] block mb-0.5">
                              {m.from === 'you' ? 'You' : m.from === 'player' ? playerLabel : 'Front office'}
                            </span>
                            {m.text}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Outcome banners */}
                    {outcome?.kind === 'signed' && (
                      <div className="border border-green-600 rounded-lg p-4 text-center mb-3 bg-green-500/10">
                        <div className="text-lg font-black text-green-600">SIGNED!</div>
                        <div className="text-sm text-green-600">
                          {playerLabel} signed for {money(outcome.salaryPerYear)}/yr for {outcome.years} year{outcome.years === 1 ? '' : 's'}.
                        </div>
                        <Button size="sm" variant="secondary" onClick={closePanel} className="mt-3">Done</Button>
                      </div>
                    )}
                    {outcome && outcome.kind !== 'signed' && (
                      <div className="border border-red-600 rounded-lg p-4 text-center mb-3 bg-red-500/10">
                        <div className="text-lg font-black text-red-600">{outcome.kind === 'signed_elsewhere' ? 'SIGNED ELSEWHERE' : 'REJECTED'}</div>
                        <div className="text-sm text-red-600">{outcome.message}</div>
                        <div className="mt-3 flex justify-center gap-2">
                          {/* A plain rejection leaves him on the market — let the
                              user come back with a better number. */}
                          {outcome.kind === 'rejected' && selected && (
                            <Button size="sm" variant="secondary" onClick={() => setOutcome(null)}>Revise Offer</Button>
                          )}
                          <Button size="sm" variant={outcome.kind === 'rejected' && selected ? 'ghost' : 'secondary'} onClick={closePanel}>Dismiss</Button>
                        </div>
                      </div>
                    )}

                    {/* Offer controls — while talks are live */}
                    {!outcome && selected && (
                      <div className="space-y-3">
                        {counter && (
                          <div className="rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2" style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
                            <Button size="sm" onClick={meetDemand}>
                              Meet their ask — {counter.years}yr · {money(counter.salaryPerYear)}/yr
                            </Button>
                            <span className="text-[11px] text-[var(--text-sec)]">or adjust your offer and counter back.</span>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs text-[var(--text-sec)] mb-1">
                            Salary: <span className="font-mono font-bold text-[var(--text)]">${salaryM.toFixed(1)}M/yr</span>
                          </label>
                          <OfferSalaryInput
                            key={selected.player.id}
                            askingSalary={selectedAskM}
                            value={salaryM}
                            onChange={setSalaryM}
                            minSalary={1}
                            maxSalary={salaryMaxM}
                          />
                          <div className="text-[10px] text-[var(--text-sec)] mt-1">
                            Asking: <span className="text-amber-600 font-medium">{money(selected.marketSalary)}/yr</span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-[var(--text-sec)] mb-1">Years</label>
                          <OfferYearsPicker value={years} onChange={setYears} preferred={selected.desiredYears} />
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <Stat label="Total offer" value={money(offer.salaryPerYear * years)} />
                          <Stat label="Projected accept" value={`${acceptPct}%`} accent={acceptPct >= 50} />
                        </div>

                        {competing && (
                          <div className="text-xs text-[var(--text-sec)]">
                            🔥 {teamById.get(competing.teamId)?.city ?? 'A rival'} is also interested (~{money(competing.total)} total).
                          </div>
                        )}
                        {/* Which exception this signing spends — kept in lockstep
                            with resolveUserOffer via channelForSalary. Over the cap
                            you sign through an exception (Mid-Level, etc.), capped
                            at `budget`; resolveUserOffer rejects anything above. */}
                        {overBudget ? (
                          <div className="text-xs" style={{ color: '#dc2626' }}>
                            Over budget — your remaining channels top out at {money(bestRemaining)}/yr for {selected.player.lastName}. Lower the salary{room <= 0 ? ', use cap room,' : ''} or free up room.
                          </div>
                        ) : offerChannel ? (
                          <div className="text-xs text-[var(--text-sec)]">
                            Signs via <span className="font-semibold text-[var(--text)]">{offerChannel.label}</span>
                            {offerChannel.consumable ? ` (${money(offerChannel.max)} max)` : offerChannel.id === 'cap_room' ? ` (${money(room)} room)` : ''}
                            {offerChannel.hardCaps && <span style={{ color: '#d97706' }}> · hard-caps you at the first apron</span>}
                          </div>
                        ) : null}

                        {/* Exceptions still available this offseason. */}
                        {remainingChannels.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {remainingChannels.map(c => (
                              <span key={c.id} className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-sec)' }}>
                                {c.label} · {money(c.max)}
                              </span>
                            ))}
                          </div>
                        )}

                        {rosterFull && (
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">
                              Roster full — release to make room
                            </label>
                            <select
                              value={releaseId}
                              onChange={e => setReleaseId(e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface)] text-sm hover:border-[var(--text-sec)] transition-colors"
                              style={{ borderColor: 'var(--border)' }}
                            >
                              <option value="">Select a player…</option>
                              {[...(userTeam?.playerIds ?? [])]
                                .map(id => league.players[id] as BasketballPlayer)
                                .filter(Boolean)
                                .sort((a, b) => a.ratings.overall - b.ratings.overall)
                                .map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.firstName} {p.lastName} ({p.sportData.position} · {p.ratings.overall})
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}

                        <Button
                          variant="primary"
                          className="w-full"
                          busy={submitting}
                          disabled={store.loading || (rosterFull && !releaseId) || overBudget}
                          onClick={() => void makeOffer()}
                        >
                          {overBudget ? 'Over budget' : counter ? 'Counter Offer' : 'Make Offer'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </main>
  );
}

// ===========================================================================
// Bits
// ===========================================================================

/**
 * Roster-needs strip: per-position depth + best OVR, flagging count gaps (thin)
 * and quality gaps (enough bodies but no starter-grade option). Count side reuses
 * the draft's positionNeeds; quality is best-OVR < starter threshold. Each tile
 * is a button that filters the pool to that position (again → back to ALL).
 */
const STARTER_OVR = 75;
function RosterNeeds({ players, team, active, onPick }: {
  players: Record<string, BasketballPlayer>;
  team: BasketballTeam;
  active: PosFilter;
  onPick: (pos: BasketballPosition) => void;
}) {
  const POS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const needs = positionNeeds(team, players);
  const countByPos = new Map(needs.map(n => [n.position, n.count] as const));
  const bestOvr: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const id of team.playerIds) {
    const p = players[id];
    if (p) bestOvr[p.sportData.position] = Math.max(bestOvr[p.sportData.position], p.ratings.overall);
  }

  const items = POS.map(pos => {
    const count = countByPos.get(pos) ?? 0;
    const best = bestOvr[pos];
    let kind: 'count' | 'quality' | 'ok';
    let note: string;
    if (count <= 1) { kind = 'count'; note = count === 0 ? 'empty' : 'thin'; }
    else if (count === 2) { kind = 'count'; note = 'shallow'; }
    else if (best < STARTER_OVR) { kind = 'quality'; note = 'upgrade'; }
    else { kind = 'ok'; note = 'set'; }
    const color = kind === 'count' ? (count <= 1 ? '#dc2626' : '#d97706') : kind === 'quality' ? '#2563eb' : '#10b981';
    const bg = kind === 'ok' ? 'var(--surface-2)' : `color-mix(in srgb, ${color} 14%, transparent)`;
    return { pos, count, best, kind, note, color, bg };
  });
  const gaps = items.filter(i => i.kind !== 'ok');

  return (
    <div className="rounded-xl border bg-[var(--surface)] px-4 py-3 mb-5" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-sec)]">Roster needs</span>
        <span className="text-xs text-[var(--text-sec)]">
          {gaps.length === 0
            ? 'balanced across all five spots'
            : gaps.map(g => g.kind === 'quality' ? `${g.pos} (upgrade)` : g.pos).join(' · ')}
        </span>
        <span className="text-[10px] text-[var(--text-sec)] opacity-70 ml-auto hidden sm:inline">Tap a spot to filter</span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {items.map(i => {
          const on = active === i.pos;
          return (
            <button
              key={i.pos}
              type="button"
              onClick={() => onPick(i.pos)}
              aria-pressed={on}
              title={on ? 'Show all positions' : `Show ${i.pos} free agents`}
              className={`rounded-lg px-2 py-1.5 text-center border transition-colors ${on ? '' : 'border-transparent hover:border-[var(--border)]'}`}
              style={on
                ? { background: 'color-mix(in srgb, var(--accent) 20%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)' }
                : { background: i.bg }}
            >
              <div className="text-xs font-black" style={{ color: on ? 'var(--accent)' : i.kind === 'ok' ? 'var(--text)' : i.color }}>{i.pos}</div>
              <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-sec)' }}>{i.count} · {i.best || '—'} OVR</div>
              <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: i.kind === 'ok' ? 'var(--text-sec)' : i.color }}>{i.note}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
      <div className="font-bold tabular-nums" style={{ color: accent ? 'var(--accent)' : undefined }}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest opacity-60">{label}</div>
    </div>
  );
}

function money(n: number): string {
  // Format on the magnitude so negatives (over-cap) still convert to millions
  // and the sign sits outside the $ — e.g. -$35.0M, not $-35039K.
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}$${Math.round(abs / 1000)}K`;
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Go to the dashboard</Link>
    </main>
  );
}
