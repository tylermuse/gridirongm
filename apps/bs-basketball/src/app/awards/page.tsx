'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { computeSeasonAwards, computeHonors, type SeasonAwards, type SeasonHonors, type AllLeagueTeam } from '@/lib/awards';
import { getBracket } from '@/lib/playoffs';
import { perGame, emptyBasketballStats, type BasketballPlayer, type BasketballTeam } from '@bs/sport-basketball';
import type { AwardResult } from '@bs/sport-basketball';

/**
 * /awards — season-end ceremony (Phase 2D-2).
 *
 * Seven trophies, each a card with the winner's avatar, team, season stat line,
 * and finalists. Unlocks once the playoffs crown a champion (Finals MVP needs
 * it). Everything is computed lazily from box scores via computeSeasonAwards.
 */

interface AwardDef {
  key: keyof SeasonAwards['winners'];
  label: string;
  emoji: string;
  stats: 'season' | 'finals' | 'none';
  defensive?: boolean;
  coach?: boolean;
}

const AWARDS: AwardDef[] = [
  { key: 'mvp', label: 'Most Valuable Player', emoji: '🏆', stats: 'season' },
  { key: 'finalsMvp', label: 'Finals MVP', emoji: '👑', stats: 'finals' },
  { key: 'dpoy', label: 'Defensive Player of the Year', emoji: '🛡️', stats: 'season', defensive: true },
  { key: 'roy', label: 'Rookie of the Year', emoji: '🌟', stats: 'season' },
  { key: 'sixthMan', label: 'Sixth Man of the Year', emoji: '🔥', stats: 'season' },
  { key: 'mip', label: 'Most Improved Player', emoji: '📈', stats: 'season' },
  { key: 'coy', label: 'Coach of the Year', emoji: '🎯', stats: 'none', coach: true },
];

const NOT_AWARDED_REASON: Partial<Record<AwardDef['key'], string>> = {
  mip: 'Needs prior-season stats — awarded from next season on.',
  roy: 'No qualifying rookie this season.',
  finalsMvp: 'Awarded once the Finals are decided.',
};

export default function AwardsPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

  const awards = useMemo<SeasonAwards | null>(
    () => (league ? computeSeasonAwards(league) : null),
    [league],
  );
  const honors = useMemo<SeasonHonors | null>(
    () => (league ? computeHonors(league) : null),
    [league],
  );
  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  const bracket = getBracket(league);
  const playerById = league.players as Record<string, BasketballPlayer>;

  return (
    <main className="max-w-6xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">
        ← Home
      </Link>
      <div className="mt-2">
        <Link href="/award-race" className="text-sm font-semibold hover:underline" style={{ color: 'var(--accent)' }}>📊 Live Award Race →</Link>
      </div>

      <header className="flex flex-wrap items-baseline gap-3 mt-2 mb-6">
        <h1 className="text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>
          Awards
        </h1>
        <p className="text-sm opacity-70">Season {league.currentSeason}</p>
      </header>

      {!awards || !league.games.some(g => g.status === 'played') ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState
            icon="🏆"
            title="The race hasn't started"
            message="Sim some games — the live award race fills in as players stack up numbers, and the trophies (plus Finals MVP) are handed out once a champion is crowned."
            action={undefined}
          />
        </div>
      ) : !bracket?.complete ? (
        <>
          <div className="mb-4 rounded-lg border px-4 py-2.5 text-sm" style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
            🏁 <b>Award Race</b> — live leaders, updating as you sim. Finals MVP and the ceremony unlock once a champion is crowned.
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AWARDS.filter(def => def.key !== 'finalsMvp').map(def => (
              <AwardCard
                key={def.key}
                def={def}
                winner={awards.winners[def.key]}
                awards={awards}
                league={league}
                teamById={teamById}
                playerById={playerById}
                onPlayerClick={setModalPlayerId}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AWARDS.map(def => (
              <AwardCard
                key={def.key}
                def={def}
                winner={awards.winners[def.key]}
                awards={awards}
                league={league}
                teamById={teamById}
                playerById={playerById}
                onPlayerClick={setModalPlayerId}
              />
            ))}
          </div>

          {honors && (
            <>
              <AllLeagueSection title="All-NBA" teams={honors.allNBA} teamById={teamById} onPlayerClick={setModalPlayerId} userTeamId={league.userTeamId} />
              <AllLeagueSection title="All-Defensive" teams={honors.allDefensive} teamById={teamById} onPlayerClick={setModalPlayerId} userTeamId={league.userTeamId} />
              <AllLeagueSection title="All-Rookie" teams={honors.allRookie} teamById={teamById} onPlayerClick={setModalPlayerId} userTeamId={league.userTeamId} />

              {honors.retirements.length > 0 && (
                <section className="mt-8">
                  <h2 className="text-lg font-bold mb-3">🎩 Retiring this offseason ({honors.retirements.length})</h2>
                  <div className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                    {honors.retirements.map(r => {
                      const team = r.teamId ? teamById.get(r.teamId) : null;
                      const isUser = !!league.userTeamId && r.teamId === league.userTeamId;
                      return (
                        <button
                          key={r.playerId}
                          onClick={() => setModalPlayerId(r.playerId)}
                          className="w-full flex items-center gap-2 px-4 py-2 border-t first:border-t-0 text-left text-sm hover:bg-[var(--surface-2)]"
                          style={{ borderColor: 'var(--border)', background: isUser ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}
                        >
                          <span className="w-7 text-xs font-mono text-[var(--text-sec)]">{r.position}</span>
                          <span className="font-semibold truncate flex-1">{r.name}</span>
                          {isUser && <span className="text-[10px] font-black" style={{ color: 'var(--accent)' }}>YOU</span>}
                          {team && <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />}
                          <span className="text-xs text-[var(--text-sec)] tabular-nums">{r.overall} OVR · age {r.age}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </main>
  );
}

// ===========================================================================
// Cards
// ===========================================================================

function AwardCard({
  def, winner, awards, league, teamById, playerById, onPlayerClick,
}: {
  def: AwardDef;
  winner: AwardResult | null;
  awards: SeasonAwards;
  league: ReturnType<typeof useLeagueOrHydrate>['league'];
  teamById: Map<string, BasketballTeam>;
  playerById: Record<string, BasketballPlayer>;
  onPlayerClick: (id: string) => void;
}) {
  // Coach of the Year — no coach entities yet, so honor the best team's staff.
  if (def.coach) {
    const topTeam = [...(league?.teams ?? [])]
      .sort((a, b) => b.record.wins - a.record.wins)[0] as BasketballTeam | undefined;
    return (
      <Shell def={def}>
        {topTeam ? (
          <div className="flex items-center gap-3">
            <TeamLogo
              abbreviation={topTeam.abbreviation}
              primaryColor={topTeam.primaryColor}
              secondaryColor={topTeam.secondaryColor}
              size="lg"
            />
            <div className="min-w-0">
              <div className="font-bold truncate">{topTeam.city} coaching staff</div>
              <div className="text-xs text-[var(--text-sec)]">
                {topTeam.city} {topTeam.name} · {topTeam.record.wins}–{topTeam.record.losses}
              </div>
            </div>
          </div>
        ) : (
          <NotAwarded def={def} />
        )}
      </Shell>
    );
  }

  if (!winner) {
    return <Shell def={def}><NotAwarded def={def} /></Shell>;
  }

  const player = playerById[winner.winnerId];
  if (!player) return <Shell def={def}><NotAwarded def={def} /></Shell>;
  const team = player.rosterSlot ? teamById.get(player.rosterSlot.teamId) : undefined;

  const statsMap = def.stats === 'finals' ? awards.finalsStats : awards.seasonStats;
  const pg = perGame(statsMap?.get(player.id) ?? emptyBasketballStats());

  const statline: { label: string; value: string }[] = def.defensive
    ? [
        { label: 'PPG', value: (pg.points ?? 0).toFixed(1) },
        { label: 'SPG', value: (pg.steals ?? 0).toFixed(1) },
        { label: 'BPG', value: (pg.blocks ?? 0).toFixed(1) },
      ]
    : [
        { label: 'PPG', value: (pg.points ?? 0).toFixed(1) },
        { label: 'RPG', value: (pg.totalRebounds ?? 0).toFixed(1) },
        { label: 'APG', value: (pg.assists ?? 0).toFixed(1) },
      ];

  return (
    <Shell def={def}>
      <button
        onClick={() => onPlayerClick(player.id)}
        className="flex items-center gap-3 w-full text-left group"
      >
        <PlayerAvatar
          firstName={player.firstName}
          lastName={player.lastName}
          primaryColor={team?.primaryColor ?? '#999'}
          secondaryColor={team?.secondaryColor ?? '#fff'}
          size="lg"
        />
        <div className="min-w-0">
          <div className="font-bold truncate group-hover:underline">
            {player.firstName} {player.lastName}
          </div>
          {team && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-sec)]">
              <TeamLogo
                abbreviation={team.abbreviation}
                primaryColor={team.primaryColor}
                secondaryColor={team.secondaryColor}
                size="xs"
              />
              {team.city} · {player.sportData.position}
            </div>
          )}
        </div>
      </button>

      <div className="flex gap-4 mt-3">
        {statline.map(s => (
          <div key={s.label}>
            <div className="text-lg font-black tabular-nums" style={{ color: 'var(--accent)' }}>
              {s.value}
            </div>
            <div className="text-[10px] uppercase tracking-widest opacity-60">{s.label}</div>
          </div>
        ))}
      </div>

      {winner.finalists.length > 0 && (
        <div className="mt-3 pt-3 border-t text-xs text-[var(--text-sec)]" style={{ borderColor: 'var(--border)' }}>
          <span className="opacity-60">Finalists: </span>
          {winner.finalists
            .map(id => playerById[id])
            .filter(Boolean)
            .map(p => `${p.firstName[0]}. ${p.lastName}`)
            .join(', ') || '—'}
        </div>
      )}
    </Shell>
  );
}

function AllLeagueSection({
  title, teams, teamById, onPlayerClick, userTeamId,
}: {
  title: string;
  teams: AllLeagueTeam[];
  teamById: Map<string, BasketballTeam>;
  onPlayerClick: (id: string) => void;
  userTeamId: string | null;
}) {
  if (teams.length === 0 || teams.every(t => t.players.length === 0)) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold mb-3">{title}</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map(team => (
          <div key={team.name} className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="px-3 py-2 border-b text-[10px] font-bold uppercase tracking-widest opacity-70" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
              {team.name}
            </div>
            <ul>
              {team.players.map(pl => {
                const t = pl.teamId ? teamById.get(pl.teamId) : null;
                const isUser = !!userTeamId && pl.teamId === userTeamId;
                return (
                  <li key={pl.playerId}>
                    <button
                      onClick={() => onPlayerClick(pl.playerId)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 border-t first:border-t-0 text-left text-sm hover:bg-[var(--surface-2)]"
                      style={{ borderColor: 'var(--border)', background: isUser ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}
                    >
                      <span className="w-6 text-xs font-mono text-[var(--text-sec)]">{pl.position}</span>
                      <span className="font-semibold truncate flex-1">{pl.name}</span>
                      {isUser && <span className="text-[10px] font-black" style={{ color: 'var(--accent)' }}>YOU</span>}
                      {t && <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="xs" />}
                      <span className="text-[10px] text-[var(--text-sec)] tabular-nums">{pl.statline}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Shell({ def, children }: { def: AwardDef; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-[var(--surface)] p-4" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl leading-none" aria-hidden>{def.emoji}</span>
        <h2 className="text-xs uppercase tracking-widest font-bold opacity-70">{def.label}</h2>
      </div>
      {children}
    </section>
  );
}

function NotAwarded({ def }: { def: AwardDef }) {
  return (
    <div className="text-sm text-[var(--text-sec)] py-2">
      {NOT_AWARDED_REASON[def.key] ?? 'Not awarded this season.'}
    </div>
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
