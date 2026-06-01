'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { buildRecap, type RecapAward, type SeasonRecap } from '@/lib/recap';
import { RecapShow } from '@/components/recap/RecapShow';
import type { BasketballTeam } from '@bs/sport-basketball';

/**
 * /recap — end-of-season storyboard (Phase 2E-7): champion, marquee awards,
 * scoring leader, and the season's notable moves, plus a shareable PNG export.
 */
export default function RecapPage() {
  const { league, loading, error } = useLeagueOrHydrate();

  const recap = useMemo<SeasonRecap | null>(() => (league ? buildRecap(league) : null), [league]);
  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  if (!recap) {
    return (
      <Shell>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="🎬" title="No story to tell yet" message="Play a season through the Finals and the recap writes itself right here." />
        </div>
      </Shell>
    );
  }

  const champ = recap.champion ? teamById.get(recap.champion) : null;
  const runner = recap.runnerUp ? teamById.get(recap.runnerUp) : null;

  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <p className="text-sm opacity-70">{recap.season} season in review</p>
        <Button variant="secondary" className="ml-auto" onClick={() => downloadRecapImage(recap, teamById)}>
          ⬇ Download image
        </Button>
      </div>

      {/* Champion hero */}
      <section
        className="rounded-2xl border-2 p-8 text-center mb-6"
        style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
      >
        <div className="text-5xl mb-2">🏆</div>
        <div className="text-xs uppercase tracking-widest opacity-60">{recap.season} Champions</div>
        {champ ? (
          <div className="flex items-center justify-center gap-3 mt-2">
            <TeamLogo abbreviation={champ.abbreviation} primaryColor={champ.primaryColor} secondaryColor={champ.secondaryColor} size="xl" />
            <span className="text-3xl font-black" style={{ color: 'var(--accent)' }}>{champ.city} {champ.name}</span>
          </div>
        ) : <div className="text-2xl font-bold mt-2">—</div>}
        {runner && (
          <div className="text-sm text-[var(--text-sec)] mt-3">
            defeated the {runner.city} {runner.name} in the Finals
          </div>
        )}
      </section>

      {/* Episodic recap show (#15) */}
      <RecapShow league={league} recap={recap} />

      {/* Marquee awards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {[recap.finalsMvp, recap.mvp, recap.scoringLeader].filter((a): a is RecapAward => !!a).map(a => (
          <AwardCard key={a.label} award={a} teamById={teamById} highlight />
        ))}
      </div>

      {recap.otherAwards.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {recap.otherAwards.map(a => <AwardCard key={a.label} award={a} teamById={teamById} />)}
        </div>
      )}

      {recap.notableMoves.length > 0 && (
        <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <h2 className="px-4 py-2 font-bold border-b text-sm" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
            Notable moves
          </h2>
          <ul>
            {recap.notableMoves.map((m, i) => (
              <li key={i} className="px-4 py-2.5 border-t first:border-t-0 text-sm" style={{ borderColor: 'var(--border)' }}>
                <span className="font-semibold">{m.summary}</span>
                <span className="text-xs text-[var(--text-sec)] ml-2">{m.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recap.source === 'history' && (
        <p className="text-xs text-[var(--text-sec)] mt-4">Showing the last completed season from the record book.</p>
      )}
    </Shell>
  );
}

// ===========================================================================
// Components
// ===========================================================================

function AwardCard({ award, teamById, highlight }: { award: RecapAward; teamById: Map<string, BasketballTeam>; highlight?: boolean }) {
  const team = award.teamId ? teamById.get(award.teamId) : null;
  return (
    <Link
      href={`/player/${award.playerId}`}
      className="rounded-xl border bg-[var(--surface)] p-4 block hover:bg-[var(--surface-2)] transition-colors"
      style={{ borderColor: highlight ? 'var(--accent)' : 'var(--border)' }}
    >
      <div className="text-[10px] uppercase tracking-widest opacity-60 mb-2">{award.label}</div>
      <div className="flex items-center gap-3">
        <PlayerAvatar firstName={award.name.split(' ')[0] ?? '?'} lastName={award.name.split(' ').slice(1).join(' ') || '?'} primaryColor={team?.primaryColor ?? '#444'} secondaryColor={team?.secondaryColor ?? '#fff'} size="md" />
        <div className="min-w-0">
          <div className="font-bold truncate">{award.name}</div>
          <div className="text-xs text-[var(--text-sec)] flex items-center gap-1">
            {team && <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />}
            {award.statline}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ===========================================================================
// Shareable image
// ===========================================================================

function downloadRecapImage(recap: SeasonRecap, teamById: Map<string, BasketballTeam>) {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 563;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const g = ctx.createLinearGradient(0, 0, 1000, 563);
  g.addColorStop(0, '#0c0b10');
  g.addColorStop(1, '#1c1510');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1000, 563);
  ctx.fillStyle = '#E66B00';
  ctx.fillRect(0, 0, 1000, 10);

  ctx.fillStyle = '#E66B00';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('BS HOOPS', 60, 80);
  ctx.fillStyle = '#9aa';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`${recap.season} SEASON RECAP`, 60, 112);

  const champ = recap.champion ? teamById.get(recap.champion) : null;
  ctx.fillStyle = '#888';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('CHAMPIONS', 60, 210);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 54px sans-serif';
  ctx.fillText(champ ? `${champ.city} ${champ.name}` : '—', 60, 268);

  let y = 370;
  const line = (label: string, value: string) => {
    ctx.fillStyle = '#E66B00';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(label, 60, y);
    ctx.fillStyle = '#fff';
    ctx.font = '26px sans-serif';
    ctx.fillText(value, 60, y + 32);
    y += 84;
  };
  if (recap.mvp) line('MVP', `${recap.mvp.name} · ${recap.mvp.statline}`);
  if (recap.finalsMvp) line('FINALS MVP', recap.finalsMvp.name);

  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `bs-hoops-${recap.season}-recap.png`;
  a.click();
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <h1 className="text-4xl font-extrabold mt-2 mb-6" style={{ color: 'var(--accent)' }}>Season Recap</h1>
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
