'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useGameStore, flushToStorage } from '@/lib/engine/store';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { getItem as idbGetItem, removeItem as idbRemoveItem } from '@bs/core/storage';
import { formatRecord } from '@/types';

const NAV_SECTIONS = [
  {
    label: 'League',
    items: [
      { href: '/', label: 'Dashboard', icon: '🏟️' },
      { href: '/standings', label: 'Standings', icon: '📊' },
      { href: '/playoffs', label: 'Playoffs', icon: '🏆' },
      { href: '/stats', label: 'Stats', icon: '📈' },
      { href: '/gm-rankings', label: 'Rankings', icon: '🏆' },
      { href: '/players', label: 'Player Search', icon: '🔍' },
      { href: '/news', label: 'News', icon: '📰' },
      { href: '/history', label: 'History', icon: '🗃️' },
    ],
  },
  {
    label: 'Team',
    items: [
      { href: '/roster', label: 'Roster', icon: '👥' },
      { href: '/staff', label: 'Staff', icon: '🧑‍💼' },
      { href: '/finances', label: 'Finances', icon: '💰' },
    ],
  },
  {
    label: 'Players',
    items: [
      { href: '/re-sign', label: 'Re-signing', icon: '✍️' },
      { href: '/draft-preview', label: 'Draft Preview', icon: '🔭' },
      { href: '/draft', label: 'Draft', icon: '🎯' },
      { href: '/draft-recap', label: 'Draft Recap', icon: '📋' },
      { href: '/free-agency', label: 'Free Agency', icon: '🖊️' },
      { href: '/trades', label: 'Trades', icon: '🔄' },
    ],
  },
  {
    label: 'Other',
    items: [
      { href: '/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
];

// Flat list for backward compatibility
const NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items);

const PHASE_LABELS: Record<string, string> = {
  preseason: 'Preseason',
  regular: 'Regular Season',
  playoffs: 'Playoffs',
  resigning: 'Re-signing',
  draft: 'Draft',
  freeAgency: 'Free Agency',
  offseason: 'Offseason',
};

type SlotMeta = { season: number; teamAbbr: string; wins: number; losses: number } | null;
const SAVE_SLOTS = [1, 2, 3, 4, 5];

function SaveSlotPanel({ onClose }: { onClose: () => void }) {
  const { saveToSlot, loadFromSlot } = useGameStore();
  const [refreshKey, setRefreshKey] = useState(0);
  const [slotMetas, setSlotMetas] = useState<SlotMeta[]>(SAVE_SLOTS.map(() => null));
  const [slotNames, setSlotNames] = useState<(string | null)[]>(SAVE_SLOTS.map(() => null));
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteSlot, setConfirmDeleteSlot] = useState<number | null>(null);

  useEffect(() => {
    async function loadMetas() {
      const metas = await Promise.all(
        SAVE_SLOTS.map(async (slot): Promise<SlotMeta> => {
          try {
            const raw = await idbGetItem(`gridiron-gm-save-${slot}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const state = parsed.state ?? parsed;
            return {
              season: state.season,
              teamAbbr: state.teams?.find((t: { id: string; abbreviation: string }) => t.id === state.userTeamId)?.abbreviation ?? '???',
              wins: state.teams?.find((t: { id: string; record: { wins: number; losses: number } }) => t.id === state.userTeamId)?.record?.wins ?? 0,
              losses: state.teams?.find((t: { id: string; record: { wins: number; losses: number } }) => t.id === state.userTeamId)?.record?.losses ?? 0,
            };
          } catch {
            return null;
          }
        })
      );
      setSlotMetas(metas);

      // Load custom slot names
      const names = await Promise.all(
        SAVE_SLOTS.map(async (slot) => {
          try {
            return await idbGetItem(`gridiron-gm-save-${slot}-name`);
          } catch {
            return null;
          }
        })
      );
      setSlotNames(names);
    }
    loadMetas();
  }, [refreshKey]);

  async function handleDelete(slot: number) {
    await idbRemoveItem(`gridiron-gm-save-${slot}`);
    await idbRemoveItem(`gridiron-gm-save-${slot}-name`);
    setConfirmDeleteSlot(null);
    setRefreshKey(k => k + 1);
  }

  async function handleRename(slot: number) {
    const name = editName.trim();
    if (name) {
      const { setItem } = await import('@bs/core/storage');
      await setItem(`gridiron-gm-save-${slot}-name`, name);
    } else {
      await idbRemoveItem(`gridiron-gm-save-${slot}-name`);
    }
    setEditingSlot(null);
    setRefreshKey(k => k + 1);
  }

  function getSlotLabel(slot: number) {
    const meta = slotMetas[slot - 1];
    const customName = slotNames[slot - 1];
    if (!meta) return 'Empty';
    if (customName) return customName;
    return `${meta.teamAbbr} S${meta.season} (${meta.wins}-${meta.losses})`;
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 shadow-xl z-50 max-h-[60vh] overflow-y-auto">
      <div className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider mb-2">Save Slots</div>
      {SAVE_SLOTS.map(slot => {
        const meta = slotMetas[slot - 1];
        return (
          <div key={slot} className="mb-2">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs text-[var(--text-sec)] font-medium shrink-0">Slot {slot}:</span>
              {editingSlot === slot ? (
                <input
                  autoFocus
                  className="flex-1 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text)] outline-none focus:border-blue-500"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(slot); if (e.key === 'Escape') setEditingSlot(null); }}
                  onBlur={() => handleRename(slot)}
                  placeholder={meta ? `${meta.teamAbbr} S${meta.season}` : 'Name...'}
                />
              ) : (
                <>
                  <span className="text-xs text-[var(--text-sec)] truncate flex-1">{getSlotLabel(slot)}</span>
                  {meta && (
                    <button
                      onClick={() => { setEditingSlot(slot); setEditName(slotNames[slot - 1] ?? ''); }}
                      className="text-[10px] text-[var(--text-sec)] hover:text-blue-500 transition-colors shrink-0"
                      title="Rename save"
                    >
                      ✏️
                    </button>
                  )}
                </>
              )}
            </div>
            {confirmDeleteSlot === slot ? (
              <div className="flex gap-1">
                <button
                  onClick={() => handleDelete(slot)}
                  className="flex-1 text-xs py-1 rounded bg-red-600/20 text-red-600 hover:bg-red-600/30 transition-colors font-medium"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setConfirmDeleteSlot(null)}
                  className="flex-1 text-xs py-1 rounded bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-1">
                <button
                  onClick={async () => { await saveToSlot(slot); setRefreshKey(k => k + 1); }}
                  className="flex-1 text-xs py-1 rounded bg-blue-600/20 text-blue-600 hover:bg-blue-600/30 transition-colors"
                >
                  Save
                </button>
                {meta && (
                  <>
                    <button
                      onClick={() => loadFromSlot(slot)}
                      className="flex-1 text-xs py-1 rounded bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => setConfirmDeleteSlot(slot)}
                      className="text-xs py-1 px-2 rounded bg-red-600/10 text-red-500 hover:bg-red-600/20 hover:text-red-600 transition-colors"
                      title="Delete this save"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            )}
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

function AccountSection() {
  const { user, tier, isAdmin, isFoundingMember, signOut } = useSubscription();

  if (!user) {
    return (
      <div className="p-3 border-t border-[var(--border)]">
        <Link
          href="/login"
          className="flex items-center justify-center gap-1 w-full text-xs py-1.5 rounded-lg bg-blue-600/10 text-blue-600 hover:bg-blue-600/20 transition-colors font-medium"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="p-3 border-t border-[var(--border)]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
          {user.email?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{user.email}</div>
          {isFoundingMember && (
            <div className="text-[9px] font-bold text-amber-600">⭐ Founding Member</div>
          )}
        </div>
      </div>
      {isAdmin && (
        <Link
          href="/admin/analytics"
          className="block text-[10px] text-center py-1 mb-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors font-medium"
        >
          📊 Analytics
        </Link>
      )}
      <div className="flex gap-1">
        {isAdmin && (
          <Link
            href="/admin/analytics"
            className="flex-1 text-[10px] text-center py-1 rounded bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors font-medium"
          >
            Analytics
          </Link>
        )}
        <button
          onClick={async () => {
            try { await signOut(); } catch { /* ignore sign out errors */ }
            window.location.href = '/login';
          }}
          className="flex-1 text-[10px] text-center py-1 rounded bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    season, week, phase, teams, userTeamId, resetLeague,
    newsItems, resigningPlayers, tradeProposals, freeAgents, draftOrder, draftResults,
    leagueSettings, expansionDraft, newsLastReadWeek, newsLastReadSeason,
  } = useGameStore();
  const userTeam = teams.find(t => t.id === userTeamId);
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const unreadNews = newsItems.filter(n =>
    n.isUserTeam && (n.season > newsLastReadSeason || (n.season === newsLastReadSeason && n.week > newsLastReadWeek))
  ).length;
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
    <aside className="w-[260px] min-w-[260px] shrink-0 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-[var(--border)]">
        <h1 className="text-xl font-extrabold tracking-tight">
          <span className="text-blue-600">BS</span>
          <span className="text-[var(--text-sec)]"> Football</span>
        </h1>
      </div>

      {userTeam && (
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-1">
            <TeamLogo
              abbreviation={userTeam.abbreviation}
              primaryColor={userTeam.primaryColor}
              secondaryColor={userTeam.secondaryColor} logoUrl={userTeam.logoUrl}
              size="md"
            />
            <div>
              <div className="text-sm font-bold">{userTeam.city}</div>
              <div className="text-xs text-[var(--text-sec)]">{userTeam.name}</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-[var(--text-sec)]">
            {formatRecord(userTeam.record)}
            {userTeam.record.ties > 0 ? `-${userTeam.record.ties}` : ''}
          </div>
        </div>
      )}

      <div className="p-3 border-b border-[var(--border)] text-xs">
        <div className="text-[var(--text-sec)]">
          Season {season} · Week {week} · <span style={{ color: 'var(--team-primary)' }}>{PHASE_LABELS[phase] ?? phase}</span>
        </div>
      </div>

      <nav className="flex-1 p-2 overflow-y-auto">
        {NAV_SECTIONS.map(section => {
          const visibleItems = section.items.filter(item => {
            if (item.href === '/trades') {
              if (phase === 'playoffs') return false;
              const deadlineWeek = leagueSettings?.tradeDeadlineWeek ?? 12;
              if (phase === 'regular' && week > deadlineWeek + 1) return false;
            }
            if (item.href === '/draft-recap' && draftResults.length === 0) return false;
            return true;
          });
          // Inject QB Pyramid link into League section when BS Mode is active
          if (section.label === 'League' && leagueSettings?.bsMode) {
            visibleItems.push({ href: '/qb-pyramid', label: 'QB Pyramid', icon: '🔺' });
          }
          // Inject Expansion link into Other section during offseason
          if (section.label === 'Other') {
            const isOffseason = ['resigning', 'freeAgency', 'offseason', 'draft'].includes(phase);
            if (isOffseason || expansionDraft) {
              visibleItems.unshift({ href: '/expansion', label: 'Expansion', icon: '🏗️' });
            }
          }
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.label} className="mb-2">
              <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-sec)]/50 px-3 pt-2 pb-1">{section.label}</div>
              {visibleItems.map(item => {
          // Some entries cover multiple URLs via shared tab bars — highlight
          // the parent nav entry whichever sibling URL the user is on.
          const sharedRankings = item.href === '/gm-rankings' && (pathname === '/awards' || pathname === '/power-rankings');
          const sharedNews = item.href === '/news' && pathname === '/recap';
          const active = pathname === item.href || sharedRankings || sharedNews;
          const badge = getBadge(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium mb-0.5
                transition-colors
                ${active
                  ? 'bg-[var(--team-primary-light)] text-[var(--team-primary)]'
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
            </div>
          );
        })}
      </nav>

      {/* Community links */}
      <div className="px-2 pb-2">
        <a
          href="https://discord.gg/RMtusS2GKW"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold bg-[#5865F2]/10 text-[#5865F2] hover:bg-[#5865F2]/20 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          <span>Join the Community</span>
        </a>
      </div>

      {/* Account section */}
      <AccountSection />

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
              onClick={async () => {
                // Explicit nuke: in-memory reset, persisted-state wipe, then a
                // hard navigation so the homepage mounts fresh and can't see
                // any rehydrated remnants of the old league.
                resetLeague();
                setConfirmReset(false);
                try {
                  await flushToStorage();
                  // Belt-and-suspenders: also clear the persist middleware's
                  // own storage record so onRehydrateStorage can't bring back
                  // the old userTeamId on a future load.
                  await (useGameStore as unknown as { persist?: { clearStorage?: () => Promise<void> | void } })
                    .persist?.clearStorage?.();
                } catch (err) {
                  console.error('[New League] storage clear failed', err);
                }
                // Hard navigate (not router.push) so React/Zustand don't
                // carry over any in-memory state from the previous mount —
                // some users were getting routed back to their old team.
                window.location.href = '/';
              }}
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
        <div className="text-center text-[9px] text-[var(--text-sec)]/40 py-1">v0.13</div>
      </div>
    </aside>
  );
}
