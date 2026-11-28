'use client';

/**
 * Phone dashboard summary (mobile v2 design, screen 3a): this week's matchup,
 * three headline numbers and a short "Needs attention" list. Replaces the
 * team banner and the next-game / injury cards below `sm`; the rest of the
 * dashboard follows underneath unchanged.
 */

import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { M2Card, M2Label } from '@/components/mobile/m2';
import { formatRecord, findRivalry } from '@/types';

const ROUND_LABELS = ['', 'Wild Card', 'Divisional', 'Conference Championship', 'Championship'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function winPct(r: { wins: number; losses: number; ties?: number }): number {
  const gp = r.wins + r.losses + (r.ties ?? 0);
  return gp > 0 ? (r.wins + (r.ties ?? 0) * 0.5) / gp : 0;
}

type Tone = 'red' | 'blue' | 'amber';
const TAG_TONES: Record<Tone, string> = {
  red: 'bg-red-500/15 text-red-600',
  blue: 'bg-blue-500/15 text-blue-600',
  amber: 'bg-amber-500/15 text-amber-600',
};

interface AttentionItem {
  key: string;
  tag: string;
  tone: Tone;
  title: string;
  sub: string;
  href?: string;
  onClick?: () => void;
}

export function MobileHomeSummary({ onPlayerClick }: { onPlayerClick: (playerId: string) => void }) {
  const {
    teams, userTeamId, players, schedule, week, phase, playoffBracket,
    tradeProposals, rivalries, faDay, draftOrder, resigningPlayers,
  } = useGameStore();
  const userTeam = teams.find(t => t.id === userTeamId);
  if (!userTeam) return null;

  // ── This week's game (or the next playoff game) ──────────────────────
  let game: { id: string; homeTeamId: string; awayTeamId: string } | null =
    phase === 'regular'
      ? schedule.find(g => g.week === week && !g.played && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId)) ?? null
      : null;
  let gameLabel = `Week ${week}`;
  if (!game && phase === 'playoffs' && playoffBracket) {
    const m = playoffBracket.find(x => !x.winnerId && (x.homeTeamId === userTeamId || x.awayTeamId === userTeamId));
    if (m && m.homeTeamId && m.awayTeamId) {
      game = { id: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId };
      gameLabel = ROUND_LABELS[m.round] ?? 'Playoffs';
    }
  }
  const isHomeGame = game ? game.homeTeamId === userTeamId : false;
  const opp = game ? teams.find(t => t.id === (isHomeGame ? game!.awayTeamId : game!.homeTeamId)) : undefined;
  const away = game ? (isHomeGame ? opp : userTeam) : undefined;
  const home = game ? (isHomeGame ? userTeam : opp) : undefined;
  const rivalry = game && opp ? findRivalry(rivalries, userTeamId, opp.id) : undefined;
  const isBye = phase === 'regular' && !game
    && !schedule.some(g => g.week === week && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId));

  // ── Headline numbers ─────────────────────────────────────────────────
  const division = teams
    .filter(t => t.conference === userTeam.conference && t.division === userTeam.division)
    .sort((a, b) => winPct(b.record) - winPct(a.record) || b.record.wins - a.record.wins);
  const divisionRank = division.findIndex(t => t.id === userTeamId) + 1;
  const capRoom = Math.round((userTeam.salaryCap - userTeam.totalPayroll) * 10) / 10;
  const capTone = capRoom > 10 ? 'text-green-600' : capRoom > 0 ? 'text-amber-600' : 'text-red-600';

  // ── Needs attention ──────────────────────────────────────────────────
  const roster = players.filter(p => p.teamId === userTeamId && !p.retired);
  const items: AttentionItem[] = [];

  const activeCount = userTeam.roster?.length ?? 0;
  if (phase === 'regular' && activeCount > 53) {
    items.push({
      key: 'roster-over', tag: 'Roster', tone: 'red',
      title: `Cut ${activeCount - 53} to reach 53`,
      sub: `Active roster is ${activeCount}/53 — you can't sim until it's trimmed`,
      href: '/roster',
    });
  }

  const injured = roster
    .filter(p => p.injury)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);
  for (const p of injured.slice(0, 2)) {
    const weeks = p.injury?.weeksLeft ?? 0;
    items.push({
      key: `inj-${p.id}`, tag: 'Injury', tone: 'red',
      title: `${p.firstName[0]}. ${p.lastName} — ${p.injury?.type ?? 'injured'}`,
      sub: `Out ${weeks} week${weeks !== 1 ? 's' : ''} · ${p.position} · ${p.ratings.overall} OVR${p.onIR ? ' · IR' : ''}`,
      onClick: () => onPlayerClick(p.id),
    });
  }
  if (injured.length > 2) {
    items.push({
      key: 'inj-more', tag: 'Injury', tone: 'red',
      title: `${injured.length - 2} more injured`,
      sub: injured.slice(2, 5).map(p => `${p.firstName[0]}. ${p.lastName}`).join(', '),
      href: '/roster',
    });
  }

  const pending = tradeProposals.filter(p => p.status === 'pending');
  if (pending.length > 0) {
    const first = pending[0];
    const from = teams.find(t => t.id === first.proposingTeamId);
    const wanted = first.requestedPlayerIds
      .map(id => players.find(p => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map(p => `${p.firstName[0]}. ${p.lastName}`);
    items.push({
      key: 'trade', tag: 'Trade', tone: 'blue',
      title: pending.length === 1
        ? `Offer from ${from?.city ?? from?.abbreviation ?? 'a team'}`
        : `${pending.length} trade offers`,
      sub: pending.length === 1 && wanted.length > 0
        ? `They want ${wanted.slice(0, 2).join(', ')}${wanted.length > 2 ? '…' : ''}`
        : 'Review them before they expire',
      href: '/trades',
    });
  }

  if (phase === 'regular' || phase === 'playoffs') {
    const expiring = roster
      .filter(p => p.contract?.yearsLeft === 1)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);
    if (expiring.length > 0) {
      items.push({
        key: 'contracts', tag: 'Contract', tone: 'amber',
        title: `${expiring.length} deal${expiring.length !== 1 ? 's' : ''} expire${expiring.length === 1 ? 's' : ''} this year`,
        sub: expiring.slice(0, 3).map(p => `${p.firstName[0]}. ${p.lastName}`).join(', '),
        href: '/roster',
      });
    }
  } else if (phase === 'resigning' && resigningPlayers.length > 0) {
    items.push({
      key: 'resign', tag: 'Contract', tone: 'amber',
      title: `${resigningPlayers.length} player${resigningPlayers.length !== 1 ? 's' : ''} to re-sign`,
      sub: 'Anyone left unsigned hits free agency',
      href: '/re-sign',
    });
  }

  // ── What's next when there is no game ────────────────────────────────
  const offseasonCard: { label: string; title: string; sub: string; href: string } | null =
    phase === 'resigning' ? { label: 'Offseason', title: 'Re-signing window', sub: `${resigningPlayers.length} to re-sign`, href: '/re-sign' }
    : phase === 'freeAgency' ? { label: 'Offseason', title: 'Free agency', sub: `Day ${faDay} of 30`, href: '/free-agency' }
    : phase === 'draft' ? {
        label: 'Offseason', title: 'Draft',
        sub: draftOrder.length === 0 ? 'Complete' : draftOrder[0] === userTeamId ? "You're on the clock" : 'In progress',
        href: draftOrder.length === 0 ? '/draft-recap' : '/draft',
      }
    : null;

  return (
    <div className="sm:hidden order-first flex flex-col gap-3">
      {game && away && home && opp && (
        <Link href={`/game/${game.id}`} className="block">
          <M2Card className="px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <M2Label>{gameLabel} · {isHomeGame ? 'Home' : 'Away'}</M2Label>
              {rivalry
                ? <M2Label className="!text-red-600">Rivalry week</M2Label>
                : <M2Label>{opp.abbreviation} {formatRecord(opp.record)}</M2Label>}
            </div>
            <div className="mt-2.5 flex items-center gap-2.5">
              <TeamLogo abbreviation={away.abbreviation} primaryColor={away.primaryColor} secondaryColor={away.secondaryColor} logoUrl={away.logoUrl} size="lg" className="shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold leading-tight truncate">{away.name}</div>
                <div className="text-xs text-[var(--text-sec)]">{formatRecord(away.record)}</div>
              </div>
              <span className="text-xs text-[var(--text-sec)] font-semibold shrink-0">@</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="text-[15px] font-bold leading-tight truncate">{home.name}</div>
                <div className="text-xs text-[var(--text-sec)]">{formatRecord(home.record)}</div>
              </div>
              <TeamLogo abbreviation={home.abbreviation} primaryColor={home.primaryColor} secondaryColor={home.secondaryColor} logoUrl={home.logoUrl} size="lg" className="shrink-0 rounded-lg" />
            </div>
          </M2Card>
        </Link>
      )}

      {isBye && (
        <M2Card className="px-3.5 py-3">
          <M2Label>Week {week}</M2Label>
          <div className="mt-1 text-[15px] font-bold">Bye week</div>
          <div className="text-xs text-[var(--text-sec)]">No game for the {userTeam.name} — sim the week to move on.</div>
        </M2Card>
      )}

      {offseasonCard && (
        <Link href={offseasonCard.href} className="block">
          <M2Card className="px-3.5 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <M2Label>{offseasonCard.label}</M2Label>
              <div className="mt-1 text-[15px] font-bold">{offseasonCard.title}</div>
              <div className="text-xs text-[var(--text-sec)]">{offseasonCard.sub}</div>
            </div>
            <Chevron />
          </M2Card>
        </Link>
      )}

      <M2Card className="px-3.5 py-3 grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <M2Label>Record</M2Label>
          <div className="m2-num text-[22px] leading-tight mt-0.5">{formatRecord(userTeam.record).replace(/-/g, '–')}</div>
        </div>
        <div className="min-w-0">
          <M2Label>Division</M2Label>
          <div className="m2-num text-[22px] leading-tight mt-0.5">{divisionRank > 0 ? ordinal(divisionRank) : '—'}</div>
        </div>
        <div className="min-w-0">
          <M2Label>Cap room</M2Label>
          <div className={`m2-num text-[22px] leading-tight mt-0.5 ${capTone}`}>
            {capRoom < 0 ? '−' : ''}${Math.abs(capRoom).toFixed(1)}M
          </div>
        </div>
      </M2Card>

      {items.length > 0 && (
        <M2Card className="overflow-hidden">
          <M2Label className="px-3.5 pt-3 pb-1.5">Needs attention</M2Label>
          <ul className="divide-y divide-[var(--border)]">
            {items.map(item => {
              const row = (
                <div className="flex items-center gap-3 px-3.5 py-2.5 min-h-[52px] active:bg-[var(--surface-2)]">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TAG_TONES[item.tone]}`}>{item.tag}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-tight truncate">{item.title}</div>
                    <div className="text-xs text-[var(--text-sec)] truncate">{item.sub}</div>
                  </div>
                  <Chevron />
                </div>
              );
              return (
                <li key={item.key}>
                  {item.href
                    ? <Link href={item.href} className="block">{row}</Link>
                    : <button type="button" onClick={item.onClick} className="block w-full text-left">{row}</button>}
                </li>
              );
            })}
          </ul>
        </M2Card>
      )}
    </div>
  );
}

function Chevron() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0 text-[var(--text-sec)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
