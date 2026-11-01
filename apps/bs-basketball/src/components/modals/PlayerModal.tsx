'use client';

/**
 * PlayerModal — popover player card.
 *
 * Same content as /player/[playerId] (grouped ratings with bars) but rendered
 * inline as a modal so box scores / rosters can show a player without a full
 * navigation. The dedicated page stays for deep-linkable URLs. Body sections
 * (ratings, Rating History, Awards, Career Stats) live in PlayerCardSections
 * so the page and the card stay identical.
 *
 * Props: playerId (null = closed), onClose.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from './Modal';
import { ExtendModal } from './ExtendModal';
import { ReleaseModal } from './ReleaseModal';
import { isGodMode } from '@/lib/godMode/godMode';
import { GodModePlayerEditor } from '@/components/godMode/GodModePlayerEditor';
import { regularSeasonStatsByPlayer, statsForPlayer } from '@/lib/stats/seasonStats';
import { getInjuries, SEVERITY_LABEL, canPlayThrough } from '@/lib/injuries';
import { ratingHex } from '@/lib/ui/ratingColor';
import {
  AwardChipList,
  CareerStatsTable,
  OvrHistory,
  RatingGroups,
  careerStatRows,
  ovrHistoryPoints,
  playerAwardChips,
} from './PlayerCardSections';
import { resolveLineup } from '@/lib/lineup/lineup';
import { playerMood, moodFactors } from '@/lib/roster/mood';
import { contractYearsLeft } from '@/lib/roster/playerActions';
import { releasePreview } from '@/lib/roster/release';
import { tradeRequestBadge } from '@/lib/roster/tradeRequests';
import { getHeadCoach, coachScheme, schemeFit } from '@/lib/coaching/coaches';
import { fmtMoney } from '@/lib/dashboard/summary';
import { archetypeFor } from '@/lib/scouting/scoutingReport';
import type { BasketballPlayer, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

interface PlayerModalProps {
  playerId: string | null;
  onClose: () => void;
  /** Fired after a release from the card's Release action, so a page holding
   *  local lineup state (the roster editor) can drop the player. */
  onReleased?: (id: string) => void;
}

// Football's archetype chip ("🧠 Field General") — basketball derives the
// play-style archetype from ratings, the same label the scouting report uses.
const ARCHETYPE_EMOJI: Record<string, string> = {
  'Floor general': '🧠', 'Scoring lead guard': '🎯', 'Change-of-pace guard': '⚡',
  '3-and-D wing': '🔒', 'Microwave scorer': '🔥', 'Slashing guard': '🗡️',
  'Two-way athlete': '💪', 'Connector forward': '🔗', 'Stretch four': '🏹',
  'Defensive forward': '🛡️', 'Energy big': '🔋', 'Stretch five': '🏹',
  'Rim protector': '🚫', 'Rim-running big': '🏃',
};

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, c => c.toUpperCase());
}

const FIT_LABEL = { great: 'Great', good: 'Good', neutral: 'Neutral', poor: 'Poor' } as const;

export function PlayerModal({ playerId, onClose, onReleased }: PlayerModalProps) {
  const league = useLeagueStore(s => s.league);
  const router = useRouter();
  const [extendId, setExtendId] = useState<string | null>(null);
  const [releaseId, setReleaseId] = useState<string | null>(null);

  const player = playerId && league
    ? ((league.players as Record<string, BasketballPlayer>)[playerId] ?? null)
    : null;

  const team: BasketballTeam | null =
    player?.rosterSlot && league
      ? ((league.teams.find(t => t.id === player.rosterSlot!.teamId) as BasketballTeam | undefined) ?? null)
      : null;

  // Current-season averages (aggregated lazily from box scores).
  const seasonStats: BasketballStats | null =
    player && league ? statsForPlayer(regularSeasonStatsByPlayer(league), player.id) : null;

  // OVR trend vs the pre-offseason snapshot.
  const ovrDelta = player
    ? player.ratings.overall - (player.sportData.prevRatings?.overall ?? player.ratings.overall)
    : 0;

  // Injury status (current day = league.currentTick).
  const injuries = league ? getInjuries(league) : {};
  const injury = player ? injuries[player.id] : undefined;
  const day = league?.currentTick ?? 0;
  const injuryActive = !!injury && injury.returnDay > day;

  // "Trade for this player" — only for players on another team while managing.
  const canTradeFor =
    !!player?.rosterSlot &&
    !!league?.userTeamId &&
    player.rosterSlot.teamId !== league.userTeamId;

  const season = league?.currentSeason ?? 0;
  const isOnUserTeam =
    !!player?.rosterSlot &&
    !!league?.userTeamId &&
    player.rosterSlot.teamId === league.userTeamId;

  // Contract line — AAV over the remaining years (matches the roster column).
  const yearsLeft = player ? contractYearsLeft(player, season) : 0;
  const remainingYears = player?.contract?.years.filter(y => y.season >= season) ?? [];
  const aav = remainingYears.length
    ? remainingYears.reduce((s, y) => s + y.baseSalary + y.proratedBonus, 0) / remainingYears.length
    : 0;

  // Mood is derived (no morale model) from role vs talent + contract + form,
  // exactly as the roster column computes it.
  let mood: ReturnType<typeof playerMood> | null = null;
  let moodReasons: string[] = [];
  if (player && team && league) {
    const players = league.players as Record<string, BasketballPlayer>;
    const teamRoster = team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p);
    const isStarter = resolveLineup(team, teamRoster).starters.includes(player.id);
    const talentRank = [...teamRoster].sort((a, b) => b.ratings.overall - a.ratings.overall).findIndex(p => p.id === player.id);
    const moodOpts = { player, team, talentRank: talentRank < 0 ? 99 : talentRank, isStarter, yearsLeft };
    mood = playerMood(moodOpts);
    moodReasons = moodFactors(moodOpts).map(f => f.label.charAt(0).toUpperCase() + f.label.slice(1));
  }

  // Scheme fit against YOUR head coach's system — useful on trade / FA targets too.
  const userCoach = league?.userTeamId ? getHeadCoach(league, league.userTeamId) : null;
  const fit = player && userCoach ? schemeFit(player, coachScheme(userCoach)) : null;

  const tradeReq = player ? tradeRequestBadge(player, season) : null;
  const release = player && isOnUserTeam ? releasePreview(player, season) : null;
  const archetype = player ? archetypeFor(player) : null;
  const tierChip = archetype ? { emoji: ARCHETYPE_EMOJI[archetype] ?? '🏀', label: titleCase(archetype) } : null;
  const yrs = player?.sportData.yearsInLeague ?? 0;

  // Body sections (shared with the full player page).
  const ovrPoints = player ? ovrHistoryPoints(player) : [];
  const awardChips = player && league ? playerAwardChips(league, player.id) : [];
  const careerRows = player ? careerStatRows(player, { season, stats: seasonStats }) : [];

  return (
    <>
    <Modal
      open={!!playerId}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      title={<span className="text-sm font-bold uppercase tracking-wide text-[var(--text-sec)]">Player Card</span>}
    >
      {!player ? (
        <p className="text-[var(--text-sec)] py-8 text-center">Player not found.</p>
      ) : (
        <>
          {/* Header — football's PlayerModal layout: avatar column (headshot,
              team logo, position) beside name / bio / contract / mood / fit,
              with the front-office actions inline for your own players. */}
          <header className="flex items-start gap-4 sm:gap-5 mb-5">
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              {/* BUG-38: real headshot for imported NBA players, initials badge
                  in the team's colors otherwise. */}
              <PlayerAvatar
                firstName={player.firstName}
                lastName={player.lastName}
                primaryColor={team?.primaryColor ?? 'var(--accent)'}
                secondaryColor={team?.secondaryColor ?? '#fff'}
                photoUrl={(player.sportData as { photoUrl?: string }).photoUrl}
                size="xl"
              />
              {team && (
                <TeamLogo
                  abbreviation={team.abbreviation}
                  primaryColor={team.primaryColor}
                  secondaryColor={team.secondaryColor}
                  size="sm"
                />
              )}
              <div className="text-[10px] font-black text-[var(--text-sec)]">
                {player.sportData.position}
                {player.sportData.secondaryPosition && (
                  <span className="ml-1 font-bold opacity-70">/ {player.sportData.secondaryPosition}</span>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-black leading-tight">{player.firstName} {player.lastName}</h2>
                  {tierChip && (
                    <div className="mt-0.5">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium"
                        style={{
                          background: 'color-mix(in srgb, #6366f1 10%, transparent)',
                          borderColor: 'color-mix(in srgb, #6366f1 35%, transparent)',
                          color: '#6366f1',
                        }}
                      >
                        <span aria-hidden>{tierChip.emoji}</span> {tierChip.label}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                    <Badge>{player.sportData.position}</Badge>
                    <span className="text-sm text-[var(--text-sec)]">
                      {Math.floor(player.ratings.height / 12)}&apos;{player.ratings.height % 12}&quot; · {player.ratings.wingspan}&quot; wing
                    </span>
                    <span className="text-sm text-[var(--text-sec)]">Age {player.age}</span>
                    <span className="text-sm text-[var(--text-sec)]">{yrs === 0 ? 'Rookie' : `Yr ${yrs}`}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-sm text-[var(--text-sec)]">
                    <span>{team ? `${team.city} ${team.name}` : 'Free Agent'}</span>
                    {player.sportData.draftYear && player.sportData.draftPick && (
                      <span>· {player.sportData.draftYear} draft, #{player.sportData.draftPick}</span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-center">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center shadow-sm"
                    style={{ background: ratingHex(player.ratings.overall) }}
                    title="Overall rating"
                  >
                    <span className="text-2xl font-black text-white tabular-nums">{player.ratings.overall}</span>
                  </div>
                  <div className="text-xs text-[var(--text-sec)] mt-1">Overall</div>
                  <OvrTrend delta={ovrDelta} />
                </div>
              </div>

              {/* Contract + potential + mood */}
              <div className="flex flex-wrap items-start gap-x-4 gap-y-1 mt-2">
                {yearsLeft > 0 && aav > 0 ? (
                  <span className="text-sm">
                    <span className="font-semibold tabular-nums">{fmtMoney(aav)}/yr</span>
                    <span className="text-[var(--text-sec)]"> · {yearsLeft} yr{yearsLeft !== 1 ? 's' : ''} left</span>
                  </span>
                ) : (
                  <span className="text-sm text-[var(--text-sec)]">{team ? 'Expiring contract' : 'Unsigned'}</span>
                )}
                <span
                  className="text-sm font-semibold tabular-nums"
                  style={{ color: ratingHex(player.development.potential) }}
                  title={`Potential ceiling: ${player.development.potential} OVR`}
                >
                  POT: {player.development.potential}
                </span>
                {mood && (
                  <div className="min-w-0">
                    <span className="text-sm font-semibold" style={{ color: mood.color }}>{mood.emoji} {mood.label}</span>
                    {moodReasons.length > 0 && (
                      <div className="text-[10px] text-[var(--text-sec)] mt-0.5">{moodReasons.join(' · ')}</div>
                    )}
                  </div>
                )}
              </div>

              {fit && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: fit.color }} />
                  <span className="text-xs text-[var(--text-sec)]">
                    {FIT_LABEL[fit.tier]} Scheme Fit
                    {fit.delta > 0 && <span className="ml-1 font-bold text-green-600">(+{fit.delta} OVR)</span>}
                    {fit.delta < 0 && <span className="ml-1 font-bold text-red-600">({fit.delta} OVR)</span>}
                  </span>
                </div>
              )}

              {/* Status chips — development arc, two-way, injury, trade request. */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant={trajectoryVariant(player.development.currentTrajectory)}>
                  {player.development.currentTrajectory}
                </Badge>
                {player.sportData.isTwoWay && <Badge variant="amber">Two-way</Badge>}
                {tradeReq && <Badge variant="red">{tradeReq.emoji} {tradeReq.label}</Badge>}
                {injuryActive && injury && (
                  canPlayThrough(injury) ? (
                    <Badge variant="amber">
                      {`GTD: ${injury.bodyPart} · ${injury.returnDay - day}d (${SEVERITY_LABEL[injury.severity]})`}
                    </Badge>
                  ) : (
                    <Badge variant="red">
                      {injury.returnDay >= 50_000
                        ? `Out for season (${injury.bodyPart})`
                        : `Out: ${injury.bodyPart} · ${injury.returnDay - day}d (${SEVERITY_LABEL[injury.severity]})`}
                    </Badge>
                  )
                )}
              </div>

              {/* Front-office actions on your own players. */}
              {isOnUserTeam && (
                <div className="mt-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      onClick={() => {
                        onClose();
                        router.push(`/trade?block=${player.id}`);
                      }}
                    >
                      Add to Trading Block
                    </Button>
                    <button
                      type="button"
                      onClick={() => setExtendId(player.id)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-green-500/40 text-green-600 hover:bg-green-500/10 transition-colors"
                    >
                      Extend Contract
                    </button>
                    <Button size="sm" variant="ghost" onClick={() => setReleaseId(player.id)}>
                      Release Player
                    </Button>
                  </div>
                  {release && release.remainingGuaranteed > 0 && (
                    <div className="text-xs mt-1 text-red-600 tabular-nums">
                      Dead cap if released: {fmtMoney(release.waiveThisYear)} this season
                      {release.years > 1 && ` (${fmtMoney(release.remainingGuaranteed)} total)`}
                    </div>
                  )}
                </div>
              )}

              {canTradeFor && player.rosterSlot && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    onClick={() => {
                      onClose();
                      router.push(`/trade?target=${player.rosterSlot!.teamId}&getPlayer=${player.id}`);
                    }}
                  >
                    Trade for this player
                  </Button>
                </div>
              )}
            </div>
          </header>

          {/* Current-season line (shooting splits + minutes); prior seasons
              live in the Career Stats table below. */}
          {seasonStats && seasonStats.gamesPlayed > 0 && (
            <div
              className="mb-5 p-3 rounded-lg"
              style={{ background: 'var(--surface-2)' }}
            >
              <StatLine
                label="This season"
                ppg={per(seasonStats.points, seasonStats.gamesPlayed)}
                rpg={per(seasonStats.totalRebounds, seasonStats.gamesPlayed)}
                apg={per(seasonStats.assists, seasonStats.gamesPlayed)}
                fgPct={pct(seasonStats.fieldGoalsMade, seasonStats.fieldGoalsAttempted)}
                tpPct={pct(seasonStats.threePointsMade, seasonStats.threePointsAttempted)}
                gp={seasonStats.gamesPlayed}
                mpg={per(seasonStats.minutes, seasonStats.gamesPlayed)}
              />
            </div>
          )}

          <RatingGroups player={player} variant="modal" />

          {/* Rating History — OVR by season, football's sparkline + values. */}
          {ovrPoints.length >= 2 && (
            <section className="mt-4 p-4 rounded-lg" style={{ background: 'var(--surface-2)' }}>
              <h3 className="text-xs font-bold uppercase tracking-wide mb-2 text-[var(--text-sec)]">Rating History</h3>
              <OvrHistory points={ovrPoints} />
            </section>
          )}

          {/* Awards — counted from the league's season archive. */}
          {awardChips.length > 0 && (
            <section className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wide mb-2 text-[var(--text-sec)]">Awards</h3>
              <AwardChipList chips={awardChips} />
            </section>
          )}

          {/* Career Stats — year-by-year from the rollover log + this season. */}
          {careerRows.length > 0 && (
            <section className="mt-4 p-4 rounded-lg" style={{ background: 'var(--surface-2)' }}>
              <h3 className="text-xs font-bold uppercase tracking-wide mb-2 text-[var(--text-sec)]">Career Stats</h3>
              <CareerStatsTable rows={careerRows} />
            </section>
          )}

          {/* Keyed on id + a state fingerprint so a saved edit re-seeds the form. */}
          {isGodMode(league) && (
            <GodModePlayerEditor
              key={`${player.id}|${player.ratings.overall}|${player.age}|${player.sportData.position}|${player.contract?.years.length ?? 0}|${player.contract?.years[0]?.baseSalary ?? 0}`}
              player={player}
            />
          )}

          <div className="mt-5 text-center">
            <Link
              href={`/player/${player.id}`}
              onClick={onClose}
              className="text-sm font-semibold hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              Open full player page →
            </Link>
          </div>
        </>
      )}
    </Modal>
    {/* Rendered after the card so they portal on top of it. */}
    <ExtendModal playerId={extendId} onClose={() => setExtendId(null)} />
    <ReleaseModal
      playerId={releaseId}
      onClose={() => setReleaseId(null)}
      onReleased={id => {
        setReleaseId(null);
        onReleased?.(id);
        onClose();
      }}
    />
    </>
  );
}

/** OVR delta indicator vs the pre-offseason snapshot. Nothing when delta is 0. */
function OvrTrend({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className="text-xs font-bold tabular-nums"
      style={{ color: up ? '#10b981' : '#dc2626' }}
      title="Change vs last season"
    >
      {up ? '▲' : '▼'} {up ? '+' : ''}{delta}
    </span>
  );
}

function StatLine({
  label, ppg, rpg, apg, fgPct, tpPct, gp, mpg,
}: {
  label: string;
  ppg: string;
  rpg: string;
  apg: string;
  fgPct?: string;
  tpPct?: string;
  gp: number;
  mpg?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
      <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-sec)] w-20">{label}</span>
      <span><strong className="tabular-nums">{ppg}</strong> <span className="text-[var(--text-sec)] text-xs">PPG</span></span>
      <span><strong className="tabular-nums">{rpg}</strong> <span className="text-[var(--text-sec)] text-xs">RPG</span></span>
      <span><strong className="tabular-nums">{apg}</strong> <span className="text-[var(--text-sec)] text-xs">APG</span></span>
      {fgPct && <span><strong className="tabular-nums">{fgPct}</strong> <span className="text-[var(--text-sec)] text-xs">FG</span></span>}
      {tpPct && <span><strong className="tabular-nums">{tpPct}</strong> <span className="text-[var(--text-sec)] text-xs">3P</span></span>}
      <span className="text-[var(--text-sec)] text-xs tabular-nums">{gp} GP{mpg ? ` · ${mpg} MPG` : ''}</span>
    </div>
  );
}

function per(total: number, games: number): string {
  if (!games) return '0.0';
  return (total / games).toFixed(1);
}

function pct(made: number, att: number): string {
  if (!att) return '—';
  return `${Math.round((made / att) * 100)}%`;
}

function trajectoryVariant(t: string): 'green' | 'red' | 'default' {
  if (t === 'breakout' || t === 'rising') return 'green';
  if (t === 'declining' || t === 'cliff') return 'red';
  return 'default';
}
