'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { getDraft, currentSlot, recommendedProspectId, buildLotteryReveal, buildLotteryBoard } from '@/lib/draft';
import { LotteryBoard } from '@/components/draft/LotteryBoard';
import type { DraftPickSlot, DraftState } from '@/lib/draft';
import { LotteryRevealCeremony } from '@/components/draft/LotteryReveal';
import { perceivedPotential, projectionGrade, isScouted, scoutsLeft, GRADE_LABEL } from '@/lib/scouting';
import type { BasketballPlayer, BasketballRatings, BasketballTeam } from '@bs/sport-basketball';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'overall' | 'potential'>('overall');
  const [showCeremony, setShowCeremony] = useState(false);

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
  const onClockTeam = slot ? teamById.get(slot.teamId) : null;
  const userOnClock = !!slot && slot.teamId === league.userTeamId;
  const recommendedId = !draft.complete ? recommendedProspectId(league, draft) : null;

  // POT sorting uses what the GM can actually see: true potential once scouted,
  // otherwise the noisy perceived estimate.
  const potFor = (p: BasketballPlayer) =>
    isScouted(draft, p.id) ? p.development.potential : perceivedPotential(p, draft.season);
  const pool = draft.poolIds
    .map(id => playerById[id])
    .filter(Boolean)
    .sort((a, b) =>
      sortKey === 'overall'
        ? b.ratings.overall - a.ratings.overall
        : potFor(b) - potFor(a),
    );

  const shown =
    (selectedId && pool.find(p => p.id === selectedId)) ||
    (recommendedId ? playerById[recommendedId] : null) ||
    pool[0] ||
    null;

  async function handleStartSeason(dest: string) {
    // Finalizes rosters (overflow → free-agent pool) and tips into the
    // preseason. We route to free agency by default since that's the next step.
    const next = await store.startNextSeason();
    if (next) router.push(dest);
  }

  return (
    <Shell season={draft.season}>
      {/* Status + controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {draft.complete ? (
          <>
            <div className="font-bold">🏁 Draft complete — {draft.picks.length} picks in.</div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" disabled={store.loading} onClick={() => void handleStartSeason('/')}>
                Skip to season
              </Button>
              <Button variant="primary" disabled={store.loading} onClick={() => void handleStartSeason('/free-agency')}>
                {store.loading ? 'Working…' : 'Sign Free Agents →'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs uppercase tracking-widest opacity-60">
                R{slot?.round} · Pick {slot?.overall}
              </span>
              {onClockTeam && (
                <span className="flex items-center gap-1.5 font-bold truncate">
                  <TeamLogo abbreviation={onClockTeam.abbreviation} primaryColor={onClockTeam.primaryColor} secondaryColor={onClockTeam.secondaryColor} size="xs" />
                  {onClockTeam.city} {userOnClock && <span style={{ color: 'var(--accent)' }}>(You)</span>}
                </span>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ background: 'var(--surface-2)', color: 'var(--text-sec)' }} title="Scouts reveal a prospect's true potential">
                🔍 {scoutsLeft(draft)} scouts left
              </span>
              {!userOnClock && (
                <Button variant="secondary" disabled={store.loading} onClick={() => void store.simDraftPick()}>
                  Sim Pick
                </Button>
              )}
              {league.userTeamId && (
                <Button variant="secondary" disabled={store.loading} onClick={() => void store.simDraftToUser()}>
                  Sim to My Pick
                </Button>
              )}
              <Button variant="ghost" disabled={store.loading} onClick={() => void store.simDraftAll()}>
                Sim Whole Draft
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Reviewable lottery results: odds + slated seed vs. where teams landed. */}
      <LotteryBoard cards={buildLotteryBoard(draft, teamById, league.userTeamId)} />

      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6">
        {/* Board */}
        <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <h2 className="px-3 py-2 font-bold border-b text-sm" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
            Draft Board
          </h2>
          <ol className="max-h-[34rem] overflow-y-auto">
            {draft.picks.map((p, i) => (
              <BoardRow
                key={p.overall}
                slot={p}
                team={teamById.get(p.teamId)}
                prospect={p.prospectId ? playerById[p.prospectId] : null}
                isCurrent={i === draft.currentPick && !draft.complete}
                isUser={p.teamId === league.userTeamId}
              />
            ))}
          </ol>
        </section>

        {/* Prospects + scouting */}
        <section className="space-y-4">
          {shown && (
            <ScoutingPanel
              prospect={shown}
              draft={draft}
              isRecommended={shown.id === recommendedId}
              canDraft={userOnClock && !draft.complete}
              loading={store.loading}
              onScout={() => void store.scoutProspect(shown.id)}
              onDraft={() => {
                void (async () => {
                  const ok = await store.draftPick(shown.id);
                  if (ok) setSelectedId(null);
                })();
              }}
            />
          )}

          <div className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
              <h2 className="font-bold text-sm">Available ({pool.length})</h2>
              <div className="flex gap-1 text-xs">
                <SortTab label="OVR" active={sortKey === 'overall'} onClick={() => setSortKey('overall')} />
                <SortTab label="POT" active={sortKey === 'potential'} onClick={() => setSortKey('potential')} />
              </div>
            </div>
            <ul className="max-h-[26rem] overflow-y-auto">
              {pool.map(p => (
                <ProspectRow
                  key={p.id}
                  prospect={p}
                  draft={draft}
                  selected={shown?.id === p.id}
                  isRecommended={p.id === recommendedId}
                  onSelect={() => setSelectedId(p.id)}
                />
              ))}
            </ul>
          </div>
        </section>
      </div>
    </Shell>
  );
}

// ===========================================================================
// Components
// ===========================================================================

function BoardRow({
  slot, team, prospect, isCurrent, isUser,
}: {
  slot: DraftPickSlot;
  team?: BasketballTeam;
  prospect: BasketballPlayer | null;
  isCurrent: boolean;
  isUser: boolean;
}) {
  return (
    <li
      className="flex items-center gap-2 px-3 py-1.5 border-t text-sm"
      style={{
        borderColor: 'var(--border)',
        background: isCurrent
          ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
          : isUser
          ? 'color-mix(in srgb, var(--accent) 7%, transparent)'
          : undefined,
        animation: slot.isLottery ? 'bs-fade-in 0.4s ease both' : undefined,
        animationDelay: slot.isLottery ? `${slot.overall * 55}ms` : undefined,
      }}
    >
      <span className="w-6 text-xs tabular-nums opacity-50 text-right">{slot.overall}</span>
      {team && (
        <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />
      )}
      <span className="w-9 text-xs font-semibold">{team?.abbreviation}</span>
      {prospect ? (
        <span className="truncate">
          <span className="font-semibold">{prospect.firstName[0]}. {prospect.lastName}</span>
          <span className="opacity-50 ml-1 text-xs">{prospect.sportData.position} · {prospect.ratings.overall}</span>
        </span>
      ) : isCurrent ? (
        <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>On the clock</span>
      ) : (
        <span className="text-xs opacity-30">—</span>
      )}
    </li>
  );
}

function ProspectRow({
  prospect, draft, selected, isRecommended, onSelect,
}: {
  prospect: BasketballPlayer;
  draft: DraftState;
  selected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
}) {
  const scouted = isScouted(draft, prospect.id);
  const grade = projectionGrade(perceivedPotential(prospect, draft.season));
  return (
    <li>
      <button
        onClick={onSelect}
        className="w-full flex items-center gap-2 px-3 py-1.5 border-t text-left text-sm hover:bg-[var(--surface-2)] transition-colors"
        style={{ borderColor: 'var(--border)', background: selected ? 'var(--surface-2)' : undefined }}
      >
        <span className="font-semibold truncate flex-1">{prospect.firstName} {prospect.lastName}</span>
        {isRecommended && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#fff' }}>
            REC
          </span>
        )}
        <span className="text-xs opacity-60 w-6">{prospect.sportData.position}</span>
        <span className="text-xs tabular-nums w-7 text-right font-bold">{prospect.ratings.overall}</span>
        {/* POT column: true potential once scouted, otherwise a projection grade. */}
        <span className="text-xs tabular-nums w-7 text-right" style={{ opacity: scouted ? 0.5 : 1, fontWeight: scouted ? 400 : 700 }}>
          {scouted ? prospect.development.potential : grade}
        </span>
      </button>
    </li>
  );
}

function ScoutingPanel({
  prospect, draft, isRecommended, canDraft, loading, onScout, onDraft,
}: {
  prospect: BasketballPlayer;
  draft: DraftState;
  isRecommended: boolean;
  canDraft: boolean;
  loading: boolean;
  onScout: () => void;
  onDraft: () => void;
}) {
  const c = composite(prospect.ratings);
  const scouted = isScouted(draft, prospect.id);
  const grade = projectionGrade(perceivedPotential(prospect, draft.season));
  const scoutsAvailable = scoutsLeft(draft) > 0;
  return (
    <div className="rounded-xl border bg-[var(--surface)] p-4" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-3">
        <PlayerAvatar firstName={prospect.firstName} lastName={prospect.lastName} primaryColor="#444" secondaryColor="#fff" size="lg" />
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate">{prospect.firstName} {prospect.lastName}</div>
          <div className="text-xs text-[var(--text-sec)]">
            {prospect.sportData.position} · Age {prospect.age} · {prospect.sportData.starTier}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black tabular-nums" style={{ color: 'var(--accent)' }}>{prospect.ratings.overall}</div>
          <div className="text-[10px] uppercase tracking-widest opacity-60">
            OVR · {scouted ? `${prospect.development.potential} POT` : `proj ${grade}`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        {Object.entries(c).map(([label, val]) => (
          <div key={label} className="rounded-lg bg-[var(--surface-2)] px-2 py-1.5">
            <div className="text-sm font-bold tabular-nums">{val}</div>
            <div className="text-[9px] uppercase tracking-wide opacity-60">{label}</div>
          </div>
        ))}
      </div>

      {/* Scouting: reveal true potential, or show the unscouted projection. */}
      <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--surface-2)' }}>
        {scouted ? (
          <span>🔍 Scouted — true potential <strong>{prospect.development.potential}</strong>.</span>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--text-sec)]">Projection <strong style={{ color: 'var(--text)' }}>{GRADE_LABEL[grade]}</strong> — ceiling unconfirmed.</span>
            <button
              onClick={onScout}
              disabled={!scoutsAvailable || loading}
              className="shrink-0 px-2 py-1 rounded-md font-semibold disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              🔍 Scout
            </button>
          </div>
        )}
      </div>

      {isRecommended && (
        <div className="text-xs mt-3 opacity-70">⭐ Top recommendation from your scouting staff for this pick.</div>
      )}

      <div className="mt-4">
        <Button variant="primary" disabled={!canDraft || loading} onClick={onDraft} className="w-full">
          {canDraft ? `Draft ${prospect.lastName}` : 'Not your pick'}
        </Button>
      </div>
    </div>
  );
}

function SortTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 rounded font-semibold transition-colors"
      style={{
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : 'var(--text-sec)',
      }}
    >
      {label}
    </button>
  );
}

function composite(r: BasketballRatings): Record<string, number> {
  const avg = (...xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return {
    Inside: avg(r.finishing, r.postScoring),
    Outside: avg(r.threePoint, r.midRange),
    Playmk: avg(r.passing, r.handles),
    Defense: avg(r.perimeterDefense, r.interiorDefense, r.steal, r.block),
    Athletic: avg(r.speed, r.vertical, r.strength),
    IQ: r.basketballIQ,
  };
}

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
