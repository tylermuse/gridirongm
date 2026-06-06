'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { getDraft, currentSlot, recommendedProspectId, buildLotteryReveal, buildLotteryBoard } from '@/lib/draft';
import { LotteryBoard } from '@/components/draft/LotteryBoard';
import { OnTheClockSection } from '@/components/draft/OnTheClockSection';
import { DraftBoardCard } from '@/components/draft/DraftBoardCard';
import { DraftResultsCard } from '@/components/draft/DraftResultsCard';
import { DraftFooter } from '@/components/draft/DraftFooter';
import { DraftRecapInline } from '@/components/draft/DraftRecapInline';
import { TradePickModal } from '@/components/draft/TradePickModal';
import { LotteryRevealCeremony } from '@/components/draft/LotteryReveal';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * /draft — the NBA draft board (Phase 2D-4).
 *
 * Lottery reveal → 60-pick board. The team on the clock auto-picks (AI) via the
 * Sim controls; when the user's team is up they pick from the prospect list with
 * a scouting panel and an AI recommendation. When all 60 are in, finalize the
 * offseason and tip off the next season.
 */
export default function DraftPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();
  const router = useRouter();
  const [showCeremony, setShowCeremony] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);

  const draft = league ? getDraft(league) : null;
  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  const playerById = league.players as Record<string, BasketballPlayer>;

  // --- No draft right now ---
  if (!draft) {
    return (
      <Shell season={league.currentSeason + 1}>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState
            icon="🎟️"
            title="No draft on the clock"
            message="The draft runs in the offseason, once a champion is crowned. Finish the playoffs, then enter the offseason from the home dashboard."
          />
          <div className="pb-6 text-center">
            <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
              ← Home
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  // --- Lottery reveal gate ---
  if (!draft.lotteryRevealed) {
    const revealCards = buildLotteryReveal(draft, teamById, league.userTeamId);
    // Closing the ceremony (or skipping) is what flips the persisted flag and
    // opens the board. Older saves with no seeding fall back to an instant reveal.
    const finishReveal = () => {
      setShowCeremony(false);
      void store.revealLottery();
    };
    return (
      <Shell season={draft.season}>
        <div className="rounded-xl border-2 p-8 text-center" style={{ borderColor: 'var(--accent)' }}>
          <div className="text-5xl mb-3">🎰</div>
          <h2 className="text-xl font-black mb-1">The Draft Lottery</h2>
          <p className="text-sm text-[var(--text-sec)] max-w-md mx-auto mb-6">
            Fourteen envelopes, fourteen non-playoff teams. Reveal the order live — pick by pick, #14 down to #1 — and watch who jumped the odds and who fell.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {draft.picks.slice(0, 14).map(p => (
              <div
                key={p.overall}
                className="w-12 h-16 rounded-lg border flex items-center justify-center text-2xl"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
              >
                🔒
              </div>
            ))}
          </div>
          <Button
            variant="primary"
            size="lg"
            disabled={store.loading}
            onClick={() => (revealCards.length ? setShowCeremony(true) : finishReveal())}
          >
            {store.loading ? 'Revealing…' : 'Start the Lottery Reveal →'}
          </Button>
        </div>
        {showCeremony && revealCards.length > 0 && (
          <LotteryRevealCeremony cards={revealCards} onClose={finishReveal} />
        )}
      </Shell>
    );
  }

  // --- Active draft ---
  const slot = currentSlot(draft);
  const userOnClock = !!slot && slot.teamId === league.userTeamId;
  const resignCount = (league.sportData as { pendingResign?: string[] }).pendingResign?.length ?? 0;
  const recommendedId = !draft.complete ? recommendedProspectId(league, draft) : null;

  const pool = draft.poolIds
    .map(id => playerById[id])
    .filter(Boolean)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);

  async function handleStartSeason(dest: string) {
    // An imported league's inaugural draft tips straight into the current
    // season's preseason (no year roll); a normal draft rolls the season.
    if (draft?.inaugural) {
      await store.finishInauguralDraft();
      router.push(dest);
      return;
    }
    // Finalizes rosters (overflow → free-agent pool) and tips into the
    // preseason. We route to free agency by default since that's the next step.
    const next = await store.startNextSeason();
    if (next) router.push(dest);
  }

  return (
    <Shell season={draft.season}>
      {/* Draft-complete: tip into the season. */}
      {draft.complete && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="font-bold">🏁 Draft complete — {draft.picks.length} picks in.</div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" disabled={store.loading} onClick={() => void handleStartSeason('/')}>
              Skip to season
            </Button>
            <Button variant="primary" disabled={store.loading} onClick={() => void handleStartSeason('/free-agency')}>
              {store.loading ? 'Working…' : 'Sign Free Agents →'}
            </Button>
          </div>
        </div>
      )}

      {/* On-the-clock hero — team-color band, needs, best-available/fit/scouts, next pick. */}
      <div className="mb-4">
        <OnTheClockSection
          league={league}
          draft={draft}
          teamById={teamById}
          loading={store.loading}
          onSimPick={() => void store.simDraftPick()}
          onSimToUser={() => void store.simDraftToUser()}
          onSimAll={() => void store.simDraftAll()}
          onOpenTrade={() => setTradeOpen(true)}
          onSelectProspect={() => { /* the board below is the prospect surface */ }}
          onDraftProspect={(id) => { void store.draftPick(id); }}
        />
      </div>

      {/* Scouting + recap surfaces. */}
      <div className="flex flex-wrap gap-3 mb-4 text-sm font-semibold">
        <Link href="/draft-preview" className="hover:underline" style={{ color: 'var(--accent)' }}>🔭 Big Board →</Link>
        {draft.complete && <Link href="/draft-recap" className="hover:underline" style={{ color: 'var(--accent)' }}>🎬 Draft Recap →</Link>}
        {resignCount > 0 && (
          <Link href="/re-sign" className="hover:underline" style={{ color: '#b45309' }}>🖊️ Re-sign {resignCount} expiring player{resignCount === 1 ? '' : 's'} →</Link>
        )}
      </div>

      {/* Reviewable lottery results: odds + slated seed vs. where teams landed. */}
      <LotteryBoard cards={buildLotteryBoard(draft, teamById, league.userTeamId)} />

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6">
        {/* Prospect board (search/filter/scout + inline expansion) */}
        <DraftBoardCard
          league={league}
          draft={draft}
          pool={pool}
          recommendedId={recommendedId}
          userOnClock={userOnClock && !draft.complete}
          loading={store.loading}
          onScout={(id) => void store.scoutProspect(id)}
          onDraft={(id) => { void store.draftPick(id); }}
        />

        {/* Draft results running board */}
        <DraftResultsCard league={league} draft={draft} teamById={teamById} playerById={playerById} />
      </div>

      {/* Your needs + recent picks */}
      <DraftFooter league={league} draft={draft} teamById={teamById} playerById={playerById} />

      {/* Team grades, once the board's complete. */}
      {draft.complete && <DraftRecapInline league={league} />}

      {tradeOpen && <TradePickModal onClose={() => setTradeOpen(false)} />}
    </Shell>
  );
}

// ===========================================================================
// Components
// ===========================================================================

function Shell({ season, children }: { season: number; children: React.ReactNode }) {
  return (
    <main className="max-w-6xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">
        ← Home
      </Link>
      <h1 className="text-4xl font-extrabold mt-2 mb-6" style={{ color: 'var(--accent)' }}>
        {season} Draft
      </h1>
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
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        ← Home
      </Link>
    </main>
  );
}
