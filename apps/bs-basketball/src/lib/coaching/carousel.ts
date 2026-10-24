/**
 * Staff backfill + the AI offseason coaching carousel.
 *
 * `ensureCoachingStaff` gives every team exactly one head coach and one
 * player-development coach, each on a contract. Idempotent; used by league
 * creation, the v1→v2 save migration, and defensively at rollover.
 *
 * `runCoachingCarousel` runs inside enterOffseason (after development, so the
 * staff that coached the season is the staff that developed the roster):
 *   1. Stamp each coach's résumé line for the season just played.
 *   2. Age coaches; long-unemployed veterans retire.
 *   3. AI teams: head coaches on an expiring deal are re-signed or let go;
 *      coaches under contract may be fired after a bad season (dead money).
 *      Vacancies are filled from the market (unemployed coaches + fresh
 *      candidates). Dev coaches: expiring deals re-signed if good, else replaced.
 *   4. The user's team is never touched — the user decides on /staff.
 * All randomness comes from a per-save, per-season seed.
 */

import { createRng, type BasketballTeam, type Rng } from '@bs/sport-basketball';
import type { BaseCoach, BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { appendTransaction } from '../transactions/transactions';
import type { SeasonHistoryEntry } from '../history/history';
import {
  coachData,
  coachOverall,
  generateCoach,
  getTeamCoach,
  unemployedCoaches,
  withCoachData,
  ROLE_LABELS,
  type CoachSeasonLog,
  type StaffRole,
} from './coaches';
import {
  buildCoachContract,
  coachMarketSalary,
  contractEnd,
  firePreview,
  installCoach,
  isExpired,
  removeCoach,
  signCoach,
} from './contracts';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const ROLES: StaffRole[] = ['HC', 'PDC'];
const fmtM = (n: number) => `$${(n / 1e6).toFixed(1)}M`;

// ===========================================================================
// Staff backfill (creation + old-save migration)
// ===========================================================================

export function ensureCoachingStaff(league: LeagueState): LeagueState {
  if (!Array.isArray(league.teams) || league.teams.length === 0) return league;
  const coaches = { ...((league.coaches ?? {}) as Record<string, BaseCoach>) };
  let changed = !league.coaches;
  const season = league.currentSeason;
  const teams = league.teams.map(t => {
    let coachIds = [...(t.coachIds ?? [])];
    for (const role of ROLES) {
      const ids = coachIds.filter(id => coaches[id]?.role === role);
      // Exactly one per role: drop duplicates (keep the first).
      if (ids.length > 1) {
        for (const extra of ids.slice(1)) coaches[extra] = { ...coaches[extra], teamId: null, contract: null };
        coachIds = coachIds.filter(id => !ids.slice(1).includes(id));
        changed = true;
      }
      // Salted with the season + coach count so a backfill never regenerates
      // (and clobbers) an earlier coach's id.
      const rng = createRng(`${league.id}-staff-${t.id}-${role}-${season}-${Object.keys(coaches).length}`);
      let coach = ids[0] ? coaches[ids[0]] : undefined;
      if (!coach) {
        coach = generateCoach(role, t.id, rng);
        coachIds.push(coach.id);
        changed = true;
      }
      if (!coach.contract) {
        // Legacy coaches: a deal of 1–4 seasons remaining, starting this season.
        const years = 1 + Math.floor(rng.random() * 4);
        coach = { ...coach, contract: buildCoachContract(coachMarketSalary(coach, season), years, season) };
        changed = true;
      }
      if (coach.teamId !== t.id) { coach = { ...coach, teamId: t.id }; changed = true; }
      if (coachData(coach).hiredSeason == null) { coach = withCoachData(coach, { hiredSeason: season }); changed = true; }
      coaches[coach.id] = coach;
    }
    // Dangling ids (coach records missing) are dropped.
    const clean = coachIds.filter(id => !!coaches[id]);
    if (clean.length !== (t.coachIds ?? []).length || clean.some((id, i) => id !== t.coachIds[i])) changed = true;
    return { ...t, coachIds: clean } as typeof t;
  });
  return changed ? { ...league, coaches, teams } : league;
}

// ===========================================================================
// Carousel
// ===========================================================================

function stampSeasonLogs(league: LeagueState, entry: SeasonHistoryEntry | null): LeagueState {
  const coaches = { ...((league.coaches ?? {}) as Record<string, BaseCoach>) };
  const coyId = entry?.awards?.coy?.id;
  for (const t of league.teams) {
    for (const role of ROLES) {
      const c = getTeamCoach(league, t.id, role);
      if (!c) continue;
      const gp = t.record.wins + t.record.losses;
      if (gp === 0) continue;
      const log: CoachSeasonLog = {
        season: league.currentSeason,
        teamId: t.id,
        wins: t.record.wins,
        losses: t.record.losses,
        playoffRound: entry?.playoffRound?.[t.id] ?? 0,
        ...(entry?.champion === t.id ? { champion: true } : {}),
        ...(role === 'HC' && coyId === c.id ? { coy: true } : {}),
      };
      const prev = (coachData(c).seasons ?? []).filter(s => s.season !== log.season);
      coaches[c.id] = withCoachData(c, { seasons: [...prev, log] });
    }
  }
  return { ...league, coaches };
}

/** Unemployed coaches kept on the market per role; the weakest beyond this retire
 *  (keeps the save bounded over long careers). */
const MAX_UNEMPLOYED = 12;

function ageAndRetire(league: LeagueState): LeagueState {
  const coaches: Record<string, BaseCoach> = {};
  for (const [id, c] of Object.entries((league.coaches ?? {}) as Record<string, BaseCoach>)) {
    if (coachData(c).retired) { coaches[id] = c; continue; }
    const aged = { ...c, age: c.age + 1 };
    coaches[id] = !aged.teamId && aged.age >= 68 ? withCoachData(aged, { retired: true }) : aged;
  }
  for (const role of ROLES) {
    const idle = Object.values(coaches)
      .filter(c => c.role === role && !c.teamId && !coachData(c).retired)
      .sort((a, b) => coachOverall(b) - coachOverall(a));
    for (const c of idle.slice(MAX_UNEMPLOYED)) {
      // Never-employed candidates vanish; ex-coaches retire (keeps résumés for history).
      if ((coachData(c).seasons ?? []).length === 0) delete coaches[c.id];
      else coaches[c.id] = withCoachData(c, { retired: true });
    }
  }
  return { ...league, coaches };
}

/** Last season's win % for an AI decision (falls back to .500). */
function winPct(team: BasketballTeam): number {
  const gp = team.record.wins + team.record.losses;
  return gp > 0 ? team.record.wins / gp : 0.5;
}

/** Seasons in charge of this team (résumé lines with this team since hire). */
function tenure(coach: BaseCoach, teamId: string): number {
  const hired = coachData(coach).hiredSeason ?? -Infinity;
  return (coachData(coach).seasons ?? []).filter(s => s.teamId === teamId && s.season >= hired).length;
}

/** Chance an AI owner fires a head coach who is still under contract. */
export function fireChance(pct: number, seasons: number, madePlayoffs: boolean, ovr: number): number {
  let p = 0;
  if (pct < 0.3) p = seasons >= 1 ? 0.55 : 0.25;
  else if (pct < 0.4) p = seasons >= 2 ? 0.35 : 0.12;
  else if (pct < 0.5 && !madePlayoffs && seasons >= 3) p = 0.18;
  if (ovr >= 82) p *= 0.6; // owners are slower to fire a respected coach
  return p;
}

/** Pick a hire from the pool: best overall with a little noise (taste). */
function pickHire(pool: BaseCoach[], rng: Rng): BaseCoach | null {
  if (!pool.length) return null;
  let best = 0;
  let bestScore = -Infinity;
  pool.forEach((c, i) => {
    const s = coachOverall(c) + (rng.random() - 0.5) * 8;
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return pool.splice(best, 1)[0];
}

export interface CarouselChange {
  teamId: TeamId;
  role: StaffRole;
  kind: 'fired' | 'let_go' | 'hired' | 're_signed';
  coachId: string;
  deadMoney?: number;
}

/**
 * Run the AI coaching carousel for the offseason that follows
 * `league.currentSeason`. Call with the league whose team records still hold
 * the season just played (enterOffseason does this).
 */
export function runCoachingCarousel(
  input: LeagueState,
  entry: SeasonHistoryEntry | null,
  nextSeason: number,
): { league: LeagueState; changes: CarouselChange[] } {
  let league = ensureCoachingStaff(input);
  league = stampSeasonLogs(league, entry);
  league = ageAndRetire(league);
  const changes: CarouselChange[] = [];
  const news: { teamIds: TeamId[]; summary: string; detail: string }[] = [];
  const rng = createRng(`${league.id}-carousel-${nextSeason}`);

  // Market: unemployed coaches + fresh candidates. Fresh ones are generated on
  // demand so the pool never runs dry.
  const pools: Record<StaffRole, BaseCoach[]> = {
    HC: unemployedCoaches(league, 'HC'),
    PDC: unemployedCoaches(league, 'PDC'),
  };
  for (const role of ROLES) for (let i = 0; i < 6; i++) pools[role].push(generateCoach(role, null, rng));

  const teamName = (t: BasketballTeam) => `${t.city} ${t.name}`;
  const nameOf = (c: BaseCoach) => `${c.firstName} ${c.lastName}`;

  for (const raw of league.teams) {
    const t = raw as BasketballTeam;
    if (t.id === league.userTeamId) continue;
    const pct = winPct(t);
    const madePlayoffs = (entry?.playoffRound?.[t.id] ?? 0) > 0;

    for (const role of ROLES) {
      const coach = getTeamCoach(league, t.id, role);
      if (!coach) continue;
      const ovr = coachOverall(coach);
      const expiring = isExpired(coach, nextSeason);
      const interim = !!coachData(coach).interim;
      let vacate: 'fired' | 'let_go' | null = null;

      if (role === 'HC') {
        if (interim) vacate = 'let_go';
        else if (expiring) {
          const keep = coach.age < 70 && (pct >= 0.5 || (ovr >= 75 && pct >= 0.4) || madePlayoffs);
          if (keep) {
            const re = signCoach(coach, nextSeason, rng);
            league = { ...league, coaches: { ...league.coaches, [coach.id]: re } };
            changes.push({ teamId: t.id, role, kind: 're_signed', coachId: coach.id });
            news.push({ teamIds: [t.id], summary: `${t.abbreviation} re-signs HC ${nameOf(coach)}`,
              detail: `The ${teamName(t)} brought back head coach ${nameOf(coach)} on a ${contractLen(re)}-year deal (${fmtM(re.contract!.years[0].baseSalary)}/yr).` });
          } else vacate = 'let_go';
        } else if (rng.random() < fireChance(pct, tenure(coach, t.id), madePlayoffs, ovr)) {
          vacate = 'fired';
        }
      } else {
        // Dev coach: re-sign good ones when the deal is up; replace weak ones.
        if (expiring) {
          if (coach.ratings.development >= 60 && coach.age < 70) {
            const re = signCoach(coach, nextSeason, rng);
            league = { ...league, coaches: { ...league.coaches, [coach.id]: re } };
            changes.push({ teamId: t.id, role, kind: 're_signed', coachId: coach.id });
          } else vacate = 'let_go';
        } else if (coach.ratings.development < 50 && pct < 0.4 && rng.random() < 0.3) {
          vacate = 'fired';
        }
      }

      if (!vacate) continue;
      const dead = vacate === 'fired' ? firePreview(coach, nextSeason).total : 0;
      league = removeCoach(league, t.id, role, vacate === 'fired', nextSeason).league;
      if (coach.age >= 70) {
        league = { ...league, coaches: { ...league.coaches, [coach.id]: withCoachData(league.coaches[coach.id], { retired: true }) } };
      }
      changes.push({ teamId: t.id, role, kind: vacate, coachId: coach.id, deadMoney: dead });
      const record = `${t.record.wins}-${t.record.losses}`;
      if (role === 'HC') {
        news.push({
          teamIds: [t.id],
          summary: vacate === 'fired'
            ? `${t.abbreviation} fires HC ${nameOf(coach)}`
            : `${t.abbreviation} parts ways with HC ${nameOf(coach)}`,
          detail: vacate === 'fired'
            ? `After a ${record} season the ${teamName(t)} fired head coach ${nameOf(coach)}${dead > 0 ? `, eating ${fmtM(dead)} in remaining salary` : ''}.`
            : `${nameOf(coach)}'s contract with the ${teamName(t)} was not renewed after a ${record} season.`,
        });
      } else if (vacate === 'fired') {
        news.push({ teamIds: [t.id], summary: `${t.abbreviation} dismisses dev coach ${nameOf(coach)}`,
          detail: `The ${teamName(t)} let go of ${ROLE_LABELS.PDC.toLowerCase()} coach ${nameOf(coach)}.` });
      }

      // Fill the vacancy (never re-hire the coach who just left).
      const pool = pools[role].filter(c => c.id !== coach.id);
      const hire = pickHire(pool, rng) ?? generateCoach(role, null, rng);
      pools[role] = pools[role].filter(c => c.id !== hire.id);
      if (pools[role].length < 4) pools[role].push(generateCoach(role, null, rng));
      league = installCoach(league, t.id, hire, rng, { season: nextSeason });
      const signed = getTeamCoach(league, t.id, role)!;
      changes.push({ teamId: t.id, role, kind: 'hired', coachId: signed.id });
      news.push({
        teamIds: [t.id],
        summary: `${t.abbreviation} hires ${role === 'HC' ? 'HC' : 'dev coach'} ${nameOf(signed)}`,
        detail: `The ${teamName(t)} named ${nameOf(signed)} (${coachOverall(signed)} OVR) their new ${ROLE_LABELS[role].toLowerCase()}${role === 'HC' ? '' : ' coach'} — ${contractLen(signed)} years, ${fmtM(signed.contract?.years[0]?.baseSalary ?? 0)}/yr.`,
      });
    }
  }

  for (const n of news) {
    league = appendTransaction(league, { kind: 'coaching', season: nextSeason, ...n });
  }
  return { league, changes };
}

function contractLen(c: BaseCoach): number {
  return c.contract?.years.length ?? 0;
}

/**
 * The user's coaches whose deals are up for `season` (shown as a prompt on
 * /staff and as a toast when the offseason opens).
 */
export function userExpiringCoaches(league: LeagueState, season: number): BaseCoach[] {
  if (!league.userTeamId) return [];
  return ROLES
    .map(r => getTeamCoach(league, league.userTeamId!, r))
    .filter((c): c is BaseCoach => !!c && isExpired(c, season));
}

/**
 * Season start: any user coach whose deal lapsed without a decision stays on a
 * one-year market deal (so the team always has its staff), logged as a move.
 */
export function renewLapsedUserCoaches(league: LeagueState, season: number): LeagueState {
  let next = league;
  for (const c of userExpiringCoaches(league, season)) {
    const salary = coachMarketSalary(c, season);
    const renewed = { ...c, contract: buildCoachContract(salary, 1, season) };
    next = { ...next, coaches: { ...next.coaches, [c.id]: renewed } };
    const t = next.teams.find(x => x.id === league.userTeamId);
    next = appendTransaction(next, {
      kind: 'coaching', season, teamIds: [league.userTeamId!],
      summary: `${t?.abbreviation ?? ''} keeps ${c.role === 'HC' ? 'HC' : 'dev coach'} ${c.firstName} ${c.lastName} on a 1-year deal`,
      detail: `${c.firstName} ${c.lastName}'s contract had lapsed; he stays on for ${season} at ${fmtM(salary)}.`,
    });
  }
  return next;
}

/** Remaining contract end for display (null-safe re-export for pages). */
export { contractEnd };
