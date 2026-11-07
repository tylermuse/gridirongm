'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { gradeColor } from '@/lib/engine/draftGrades';
import { ROSTER_LIMITS, type Position } from '@/types';
import {
  BOARD_POSITIONS,
  heightLabel,
  slotsForRounds,
  needLabel,
  teamDraftNeeds,
  type DraftSettings,
  type MadePick,
  type MockDraftData,
  type MockOrderEntry,
  type MockProspect,
  type MockTeam,
  type ReplayResult,
} from '@/lib/mockDraft/engine';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { Speed } from './SetupScreen';

const BOARD_PAGE_SIZE = 60;
type MobileTab = 'board' | 'picks' | 'mine';

function useTeamsById(data: MockDraftData) {
  return useMemo(() => new Map(data.teams.map((t) => [t.tid, t])), [data]);
}

const TeamBadge = ({ team, size = 'xs' }: { team: MockTeam; size?: 'xs' | 'sm' | 'md' }) => (
  <TeamLogo abbreviation={team.abbrev} primaryColor={team.colors[0]} secondaryColor={team.colors[1]} logoUrl={team.imgURL || undefined} logoOnWhite size={size} />
);

/* ─── Pick ticker ───────────────────────────────────────────── */

const TickerRow = memo(function TickerRow({
  slot,
  team,
  via,
  made,
  isCurrent,
}: {
  slot: MockOrderEntry;
  team: MockTeam;
  via: string | null;
  made: MadePick | null;
  isCurrent: boolean;
}) {
  return (
    <li
      data-current={isCurrent || undefined}
      aria-current={isCurrent ? 'step' : undefined}
      className={`flex items-start gap-2 px-3 py-2 border-b border-[var(--border)] last:border-b-0 ${
        isCurrent ? 'bg-blue-50 ring-1 ring-inset ring-blue-500' : made?.isUser ? 'bg-amber-50' : ''
      }`}
    >
      <span className="w-7 shrink-0 text-xs font-semibold tabular-nums text-[var(--text-sec)] pt-0.5">{slot.pick}</span>
      <TeamBadge team={team} />
      <div className="min-w-0 flex-1 text-sm">
        <div className="text-xs text-[var(--text-sec)]">
          {team.abbrev}
          {via && <span> via {via}</span>}
        </div>
        {made ? (
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="font-semibold text-[var(--text)] truncate">
              {made.prospect.firstName} {made.prospect.lastName}
            </span>
            <span className={`ml-auto text-xs font-bold shrink-0 ${gradeColor(made.grade)}`}>{made.grade}</span>
          </div>
        ) : (
          isCurrent && <div className="font-semibold text-blue-700">On the clock</div>
        )}
        {made && (
          <div className="text-xs text-[var(--text-sec)] truncate">
            {made.prospect.pos} · {made.prospect.college}
          </div>
        )}
      </div>
    </li>
  );
});

function PickTicker({
  data,
  settings,
  picks,
  visibleCount,
}: {
  data: MockDraftData;
  settings: DraftSettings;
  picks: MadePick[];
  visibleCount: number;
}) {
  const teams = useTeamsById(data);
  const slots = useMemo(() => slotsForRounds(data, settings.rounds), [data, settings.rounds]);
  const listRef = useRef<HTMLOListElement>(null);

  // Scroll the list only. scrollIntoView would also move the page.
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[data-current]');
    if (list && current) list.scrollTop = current.offsetTop - list.clientHeight / 2;
  }, [visibleCount]);

  return (
    <ol ref={listRef} className="relative lg:max-h-[calc(100vh-11rem)] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      {slots.map((slot, i) => {
        const team = teams.get(slot.tid);
        if (!team) return null;
        const via = slot.tid !== slot.originalTid ? teams.get(slot.originalTid)?.abbrev ?? null : null;
        return (
          <TickerRow
            key={slot.pick}
            slot={slot}
            team={team}
            via={via}
            made={i < visibleCount ? picks[i] : null}
            isCurrent={i === visibleCount}
          />
        );
      })}
    </ol>
  );
}

/* ─── Available board ───────────────────────────────────────── */

const BoardRow = memo(function BoardRow({
  prospect,
  teamColor,
  onDraft,
}: {
  prospect: MockProspect;
  teamColor: string;
  onDraft: (pid: number) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 border-b border-[var(--border)] last:border-b-0">
      <span className="w-7 shrink-0 text-xs font-semibold tabular-nums text-[var(--text-sec)]">{prospect.rank}</span>
      {/* No id: PlayerAvatar would give a real prospect with no headshot a made-up face. */}
      <PlayerAvatar
        player={{
          firstName: prospect.firstName,
          lastName: prospect.lastName,
          position: prospect.pos,
          photoUrl: prospect.imgURL || undefined,
        }}
        size="sm"
        teamColor={teamColor}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[var(--text)] truncate">
          {prospect.firstName} {prospect.lastName}
        </div>
        <div className="text-xs text-[var(--text-sec)] truncate">
          {prospect.college} · {heightLabel(prospect.hgt)}, {prospect.weight} lb
        </div>
      </div>
      <Badge variant="blue" className="shrink-0">
        {prospect.pos}
      </Badge>
      <Button size="sm" onClick={() => onDraft(prospect.pid)} className="shrink-0">
        Draft
      </Button>
    </li>
  );
});

function NeedsStrip({ data, team, counts }: { data: MockDraftData; team: MockTeam; counts: Record<Position, number> }) {
  // Live counts, so a need the user has just drafted for drops off the list.
  const needs = teamDraftNeeds(data, team, counts);
  const needByPos = new Map(needs.map((n) => [n.pos, n]));
  // K and P are left out: the data file doesn't carry a real count for them (see teamNeeds).
  const positions = BOARD_POSITIONS.filter((pos) => pos !== 'K' && pos !== 'P');
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold text-[var(--text-sec)] mb-1">
        {team.abbrev} needs: {needs.length > 0 ? needs.map((n) => n.pos).join(', ') : 'no glaring holes, best player available'}
      </div>
      <div className="flex flex-wrap gap-1">
        {positions.map((pos) => {
          const need = needByPos.get(pos);
          return (
            <span
              key={pos}
              title={need ? needLabel(need, data.teams.length) : `${counts[pos]} on the roster, minimum ${ROSTER_LIMITS[pos].min}`}
              className={`px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums ${
                need ? 'bg-red-100 text-red-700' : 'bg-[var(--surface-2)] text-[var(--text-sec)]'
              }`}
            >
              {pos} {counts[pos]}
            </span>
          );
        })}
      </div>
      {needs.length > 0 && (
        <ul className="mt-1.5 text-xs text-[var(--text-sec)] space-y-0.5">
          {needs.slice(0, 3).map((need) => (
            <li key={need.pos}>{needLabel(need, data.teams.length)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AvailableBoard({
  available,
  team,
  onDraft,
}: {
  available: MockProspect[];
  team: MockTeam;
  onDraft: (pid: number) => void;
}) {
  const [position, setPosition] = useState<Position | null>(null);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(BOARD_PAGE_SIZE);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return available.filter(
      (p) =>
        (!position || p.pos === position) &&
        (!term || `${p.firstName} ${p.lastName}`.toLowerCase().includes(term) || p.college.toLowerCase().includes(term)),
    );
  }, [available, position, search]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="p-3 border-b border-[var(--border)] space-y-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by position">
          {BOARD_POSITIONS.map((pos) => (
            <button
              key={pos}
              type="button"
              aria-pressed={position === pos}
              onClick={() => {
                setPosition(position === pos ? null : pos);
                setLimit(BOARD_PAGE_SIZE);
              }}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                position === pos ? 'bg-blue-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(BOARD_PAGE_SIZE);
          }}
          placeholder="Search by name or college"
          aria-label="Search prospects by name or college"
          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text)]"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="p-6 text-center text-sm text-[var(--text-sec)]">No prospects match.</p>
      ) : (
        <ul className="lg:max-h-[calc(100vh-22rem)] overflow-y-auto">
          {filtered.slice(0, limit).map((p) => (
            <BoardRow key={p.pid} prospect={p} teamColor={team.colors[0]} onDraft={onDraft} />
          ))}
          {filtered.length > limit && (
            <li className="p-3 text-center">
              <Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + BOARD_PAGE_SIZE)}>
                Show more ({filtered.length - limit} left)
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** What fills the center column while the AI is picking. */
function LatestPicks({ data, picks }: { data: MockDraftData; picks: MadePick[] }) {
  const teams = useTeamsById(data);
  const latest = picks.slice(-6).reverse();
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-sm font-bold text-[var(--text)] mb-2">Latest picks</h2>
      {latest.length === 0 ? (
        <p className="text-sm text-[var(--text-sec)]">The draft is about to start.</p>
      ) : (
        <ul className="space-y-2">
          {latest.map((p) => {
            const team = teams.get(p.slot.tid);
            return (
              <li key={p.slot.pick} className="flex items-center gap-2 text-sm">
                <span className="w-7 shrink-0 text-xs font-semibold tabular-nums text-[var(--text-sec)]">{p.slot.pick}</span>
                {team && <TeamBadge team={team} size="sm" />}
                <span className="min-w-0 flex-1 truncate text-[var(--text)]">
                  <span className="font-semibold">
                    {p.prospect.firstName} {p.prospect.lastName}
                  </span>{' '}
                  <span className="text-[var(--text-sec)]">
                    {p.prospect.pos}, {p.prospect.college}
                  </span>
                </span>
                <span className={`text-xs font-bold shrink-0 ${gradeColor(p.grade)}`}>{p.grade}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ─── The user's picks ──────────────────────────────────────── */

function MyPicks({ data, settings, picks }: { data: MockDraftData; settings: DraftSettings; picks: MadePick[] }) {
  const teams = useTeamsById(data);
  const mine = picks.filter((p) => p.isUser);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 lg:max-h-[calc(100vh-11rem)] overflow-y-auto">
      <h2 className="text-sm font-bold text-[var(--text)] mb-2">Your picks</h2>
      {settings.userTids.length === 0 ? (
        <p className="text-sm text-[var(--text-sec)]">You&apos;re watching this one. The AI is making every pick.</p>
      ) : mine.length === 0 ? (
        <p className="text-sm text-[var(--text-sec)]">You haven&apos;t drafted anyone yet.</p>
      ) : (
        <ul className="space-y-2">
          {mine.map((p) => {
            const team = teams.get(p.slot.tid);
            return (
              <li key={p.slot.pick} className="flex items-center gap-2 text-sm">
                {team && <TeamBadge team={team} />}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[var(--text)] truncate">
                    {p.prospect.firstName} {p.prospect.lastName}
                  </span>
                  <span className="block text-xs text-[var(--text-sec)] truncate">
                    #{p.slot.pick} · {p.prospect.pos} · {p.prospect.college}
                  </span>
                </span>
                <span className={`text-sm font-bold shrink-0 ${gradeColor(p.grade)}`}>{p.grade}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ─── Screen ────────────────────────────────────────────────── */

export function DraftScreen({
  data,
  settings,
  replay,
  visibleCount,
  speed,
  paused,
  canUndo,
  onDraft,
  onSimToUser,
  onTogglePause,
  onUndo,
  onRestart,
}: {
  data: MockDraftData;
  settings: DraftSettings;
  replay: ReplayResult;
  visibleCount: number;
  speed: Speed;
  paused: boolean;
  canUndo: boolean;
  onDraft: (pid: number) => void;
  onSimToUser: () => void;
  onTogglePause: () => void;
  onUndo: () => void;
  onRestart: () => void;
}) {
  const [tab, setTab] = useState<MobileTab>('board');
  const teams = useTeamsById(data);
  const slots = useMemo(() => slotsForRounds(data, settings.rounds), [data, settings.rounds]);

  const onClockSlot = visibleCount >= replay.picks.length ? replay.onClock : null;
  const currentSlot = slots[visibleCount] ?? null;
  const currentTeam = currentSlot ? teams.get(currentSlot.tid) ?? null : null;
  const viaTeam = currentSlot && currentSlot.tid !== currentSlot.originalTid ? teams.get(currentSlot.originalTid) : null;
  const counts = onClockSlot ? replay.countsByTeam.get(onClockSlot.tid) : undefined;

  const hasUserPickLeft = settings.userTids.length > 0 && slots.slice(visibleCount).some((s) => settings.userTids.includes(s.tid));

  const TABS: { id: MobileTab; label: string }[] = [
    { id: 'board', label: onClockSlot ? 'Board' : 'Latest' },
    { id: 'picks', label: 'All picks' },
    { id: 'mine', label: 'Your picks' },
  ];
  const showOn = (id: MobileTab) => (tab === id ? 'block' : 'hidden lg:block');

  return (
    <div>
      <div className="sticky top-16 z-20 -mx-4 sm:mx-0 mb-3 px-4 py-2 sm:rounded-xl border-y sm:border border-[var(--border)] bg-[var(--surface)] flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 min-w-0 flex-1 basis-56">
          {currentTeam && <TeamBadge team={currentTeam} size="md" />}
          {currentSlot && currentTeam && (
            <div className="min-w-0" aria-live="polite">
              <div className="text-sm font-bold text-[var(--text)] truncate">
                {currentTeam.region} {currentTeam.name} {onClockSlot ? 'are on the clock' : 'picking'}
              </div>
              <div className="text-xs text-[var(--text-sec)]">
                Round {currentSlot.round}, pick {currentSlot.pickInRound} (#{currentSlot.pick})
                {viaTeam && ` · via ${viaTeam.abbrev}`}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {speed !== 'instant' && (
            <Button variant="secondary" size="sm" disabled={Boolean(onClockSlot)} onClick={onTogglePause}>
              {paused ? 'Resume' : 'Pause'}
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={Boolean(onClockSlot)} onClick={onSimToUser}>
            {hasUserPickLeft ? 'Sim to my next pick' : 'Sim to the end'}
          </Button>
          <Button variant="secondary" size="sm" disabled={!canUndo} onClick={onUndo}>
            Undo last pick
          </Button>
          <Button variant="ghost" size="sm" onClick={onRestart}>
            Restart
          </Button>
        </div>
      </div>

      <div className="lg:hidden mb-3 grid grid-cols-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`py-1.5 text-sm font-semibold rounded-md ${tab === id ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)_260px] lg:gap-4 lg:items-start">
        <div className={showOn('picks')}>
          <PickTicker data={data} settings={settings} picks={replay.picks} visibleCount={visibleCount} />
        </div>

        <div className={showOn('board')}>
          {onClockSlot && currentTeam && counts ? (
            <>
              <NeedsStrip data={data} team={currentTeam} counts={counts} />
              <AvailableBoard key={onClockSlot.pick} available={replay.available} team={currentTeam} onDraft={onDraft} />
            </>
          ) : (
            <LatestPicks data={data} picks={replay.picks.slice(0, visibleCount)} />
          )}
        </div>

        <div className={showOn('mine')}>
          <MyPicks data={data} settings={settings} picks={replay.picks.slice(0, visibleCount)} />
        </div>
      </div>
    </div>
  );
}
