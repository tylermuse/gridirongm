'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: '🏟️' },
  { href: '/roster', label: 'Roster', icon: '👥' },
  { href: '/standings', label: 'Standings', icon: '📊' },
  { href: '/playoffs', label: 'Playoffs', icon: '🏆' },
  { href: '/re-sign', label: 'Re-signing', icon: '✍️' },
  { href: '/draft', label: 'Draft', icon: '🎯' },
  { href: '/free-agency', label: 'Free Agency', icon: '🖊️' },
  { href: '/trades', label: 'Trades', icon: '🔄' },
  { href: '/finances', label: 'Finances', icon: '💰' },
  { href: '/stats', label: 'Stats', icon: '📈' },
  { href: '/news', label: 'News', icon: '📰' },
  { href: '/history', label: 'History', icon: '🗃️' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

const PHASE_LABELS: Record<string, string> = {
  preseason: 'Preseason',
  regular: 'Regular Season',
  playoffs: 'Playoffs',
  resigning: 'Re-signing',
  draft: 'Draft',
  freeAgency: 'Free Agency',
  offseason: 'Offseason',
};

function SaveSlotPanel({ onClose }: { onClose: () => void }) {
  const { saveToSlot, loadFromSlot } = useGameStore();

  function getSlotMeta(slot: 1 | 2) {
    try {
      const raw = localStorage.getItem(`gridiron-gm-save-${slot}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const state = parsed.state ?? parsed;
      return {
        season: state.season,
        teamAbbr: state.teams?.find((t: { id: string; abbreviation: string }) => t.id === state.userTeamId)?.abbreviation,
        wins: state.teams?.find((t: { id: string; record: { wins: number; losses: number } }) => t.id === state.userTeamId)?.record?.wins ?? 0,
        losses: state.teams?.find((t: { id: string; record: { wins: number; losses: number } }) => t.id === state.userTeamId)?.record?.losses ?? 0,
      };
    } catch {
      return null;
    }
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 shadow-xl z-50">
      <div className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider mb-2">Save Slots</div>
      {([1, 2] as const).map(slot => {
        const meta = getSlotMeta(slot);
        return (
          <div key={slot} className="mb-2">
            <div className="text-xs text-[var(--text-sec)] mb-1">Slot {slot}: {meta ? `${meta.teamAbbr} S${meta.season} (${meta.wins}-${meta.losses})` : 'Empty'}</div>
            <div className="flex gap-1">
              <button
                onClick={() => { saveToSlot(slot); onClose(); }}
                className="flex-1 text-xs py-1 rounded bg-blue-600/20 text-blue-600 hover:bg-blue-600/30 transition-colors"
              >
                Save
              </button>
              {meta && (
                <button
                  onClick={() => loadFromSlot(slot)}
                  className="flex-1 text-xs py-1 rounded bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
                >
                  Load
                </button>
              )}
            </div>
          </div>
        );
      })}
      <button
        onClick={onClose}
        className="w-full text-xs py-1 rounded text-[var(--text-sec)] hover:text-[var(--text)] transition-colors mt-1"
      >
        Close
      </button>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    season, week, phase, teams, userTeamId, resetLeague,
    newsItems, resigningPlayers, tradeProposals, freeAgents, draftOrder,
    leagueSettings,
  } = useGameStore();
  const userTeam = teams.find(t => t.id === userTeamId);
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const unreadNews = newsItems.filter(n => n.isUserTeam).length;
  const pendingTrades = tradeProposals.filter(p => p.status === 'pending').length;

  function getBadge(href: string): { text: string; variant: 'blue' | 'red' | 'amber' } | null {
    if (href === '/news' && unreadNews > 0) return { text: String(unreadNews > 99 ? '99+' : unreadNews), variant: 'blue' };
    if (href === '/trades' && pendingTrades > 0) return { text: String(pendingTrades), variant: 'red' };
    if (href === '/re-sign' && phase === 'resigning' && resigningPlayers.length > 0)
      return { text: String(resigningPlayers.length), variant: 'amber' };
    if (href === '/draft' && phase === 'draft' && draftOrder[0] === userTeamId)
      return { text: 'Your Pick!', variant: 'red' };
    if (href === '/free-agency' && phase === 'freeAgency' && freeAgents.length > 0)
      return { text: 'FA Open', variant: 'amber' };
    return null;
  }

  return (
    <aside className="w-56 shrink-0 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-[var(--border)]">
        <h1 className="text-xl font-extrabold tracking-tight">
          <span className="text-blue-600">GRIDIRON</span>
          <span className="text-[var(--text-sec)]"> GM</span>
        </h1>
      </div>

      {userTeam && (
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white"
              style={{ backgroundColor: userTeam.primaryColor }}
            >
              {userTeam.abbreviation}
            </div>
            <div>
              <div className="text-sm font-bold">{userTeam.city}</div>
              <div className="text-xs text-[var(--text-sec)]">{userTeam.name}</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-[var(--text-sec)]">
            {userTeam.record.wins}-{userTeam.record.losses}
            {userTeam.record.ties > 0 ? `-${userTeam.record.ties}` : ''}
          </div>
        </div>
      )}

      <div className="p-3 border-b border-[var(--border)] text-xs">
        <div className="text-[var(--text-sec)]">
          Season {season} · Week {week} · <span className="text-blue-600">{PHASE_LABELS[phase] ?? phase}</span>
        </div>
      </div>

      <nav className="flex-1 p-2 overflow-y-auto">
        {NAV_ITEMS.filter(item => {
          // Hide Trades link only during playoffs and after regular-season trade deadline
          if (item.href === '/trades') {
            if (phase === 'playoffs') return false;
            const deadlineWeek = leagueSettings?.tradeDeadlineWeek ?? 12;
            if (phase === 'regular' && week > deadlineWeek + 1) return false;
          }
          return true;
        }).map(item => {
          const active = pathname === item.href;
          const badge = getBadge(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5
                transition-colors
                ${active
                  ? 'bg-blue-600/15 text-blue-600'
                  : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'}
              `}
            >
              <span className="text-base">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {badge && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-bold ${
                  badge.variant === 'red' ? 'bg-red-600 text-white' :
                  badge.variant === 'amber' ? 'bg-amber-500 text-black' :
                  'bg-blue-600 text-white'
                }`}>
                  {badge.text}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer: save/reset controls */}
      <div className="p-3 border-t border-[var(--border)] relative">
        {showSavePanel && <SaveSlotPanel onClose={() => setShowSavePanel(false)} />}

        <div className="flex gap-1">
          <button
            onClick={() => setShowSavePanel(v => !v)}
            className="flex-1 text-xs py-1.5 rounded-lg bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
          >
            Save/Load
          </button>
          {confirmReset ? (
            <button
              onClick={() => { resetLeague(); setConfirmReset(false); router.push('/'); }}
              className="flex-1 text-xs py-1.5 rounded-lg bg-red-600/20 text-red-600 hover:bg-red-600/30 transition-colors"
            >
              Confirm?
            </button>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="flex-1 text-xs py-1.5 rounded-lg bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
            >
              New League
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
