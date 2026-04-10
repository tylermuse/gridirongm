'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { useGameStore } from '@/lib/engine/store';
import { useSubscription } from '@/components/providers/SubscriptionProvider';

interface Nominee {
  userId: string;
  displayName: string;
  teamName: string | null;
  primaryStat: string;
  secondaryStat?: string;
}

interface NomineesData {
  season: number;
  categories: {
    gm_of_year: Nominee[];
    best_draft: Nominee[];
    best_rebuild: Nominee[];
  };
}

const CATEGORY_META = {
  gm_of_year: { label: 'GM of the Year', icon: '🏅', desc: 'Best overall season performance' },
  best_draft: { label: 'Best Draft Class', icon: '🎯', desc: 'Top haul from this offseason' },
  best_rebuild: { label: 'Best Rebuild', icon: '🔨', desc: 'Most improved team vs. last year' },
} as const;

type CategoryKey = keyof typeof CATEGORY_META;
const CATEGORIES: CategoryKey[] = ['gm_of_year', 'best_draft', 'best_rebuild'];

export function SeasonAwardsModal() {
  const { user } = useSubscription();
  const pendingAwardsVote = useGameStore(s => s.pendingAwardsVote);
  const dismissAwardsVote = useGameStore(s => s.dismissAwardsVote);

  const [nominees, setNominees] = useState<NomineesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [votes, setVotes] = useState<Partial<Record<CategoryKey, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [winners, setWinners] = useState<Record<string, string | null> | null>(null);

  const fetchNominees = useCallback(async (season: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gm/awards/nominees?season=${season}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load nominees');
      } else {
        setNominees(json);
      }
    } catch {
      setError('Failed to fetch nominees');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pendingAwardsVote !== undefined) {
      fetchNominees(pendingAwardsVote);
      setVotes({});
      setSubmitted(false);
      setWinners(null);
    }
  }, [pendingAwardsVote, fetchNominees]);

  if (pendingAwardsVote === undefined) return null;

  function handleVoteSelect(category: CategoryKey, nomineeUserId: string) {
    setVotes(prev => ({ ...prev, [category]: nomineeUserId }));
  }

  async function handleSubmit() {
    if (pendingAwardsVote === undefined) return;
    setLoading(true);

    // Submit each vote (only categories where the user actually voted)
    if (user) {
      for (const cat of CATEGORIES) {
        const nomineeId = votes[cat];
        if (!nomineeId) continue;
        try {
          await fetch('/api/gm/awards/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              season: pendingAwardsVote,
              awardType: cat,
              nomineeUserId: nomineeId,
            }),
          });
        } catch { /* ignore individual vote errors */ }
      }
    }

    // Finalize: counts votes and writes winners (or auto-awards if no votes)
    try {
      const res = await fetch('/api/gm/awards/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season: pendingAwardsVote }),
      });
      const json = await res.json();
      if (res.ok && json.winners) {
        setWinners(json.winners);
      }
    } catch { /* ignore */ }

    setSubmitted(true);
    setLoading(false);
  }

  function handleClose() {
    dismissAwardsVote();
  }

  // Show results screen after voting
  if (submitted && winners && nominees) {
    function nomineeName(userId: string | null): string {
      if (!userId) return '—';
      for (const cat of CATEGORIES) {
        const found = nominees!.categories[cat].find(n => n.userId === userId);
        if (found) return found.displayName;
      }
      return 'GM';
    }

    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] bg-amber-50">
            <h2 className="text-lg font-black flex items-center gap-2">
              <span>🏆</span> Season {pendingAwardsVote} Awards
            </h2>
            <p className="text-xs text-[var(--text-sec)] mt-0.5">And the winners are…</p>
          </div>

          <div className="px-5 py-5 space-y-3">
            {CATEGORIES.map(cat => {
              const winnerId = winners[cat];
              const meta = CATEGORY_META[cat];
              const isMe = winnerId && user?.id === winnerId;
              return (
                <div
                  key={cat}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${isMe ? 'bg-amber-50 border-amber-300' : 'bg-[var(--surface-2)] border-[var(--border)]'}`}
                >
                  <span className="text-3xl">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)]">{meta.label}</div>
                    <div className="text-sm font-bold truncate">
                      {nomineeName(winnerId)}
                      {isMe && <span className="ml-2 text-xs text-amber-700">(You!)</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-5 py-3 border-t border-[var(--border)] flex items-center justify-end bg-[var(--surface-2)]/30">
            <Button size="sm" onClick={handleClose}>Continue to Offseason →</Button>
          </div>
        </div>
      </div>
    );
  }

  // Voting screen
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 px-5 py-4 border-b border-[var(--border)] bg-[var(--surface)] z-10">
          <h2 className="text-lg font-black flex items-center gap-2">
            <span>🏆</span> Season {pendingAwardsVote} Awards
          </h2>
          <p className="text-xs text-[var(--text-sec)] mt-0.5">
            Cast your vote for each category. {user ? '' : 'Sign in to make your vote count.'}
          </p>
        </div>

        {loading && !nominees && (
          <div className="px-5 py-10 text-center text-[var(--text-sec)] text-sm">Loading nominees...</div>
        )}

        {error && (
          <div className="px-5 py-10 text-center text-red-600 text-sm">{error}</div>
        )}

        {nominees && (
          <div className="px-5 py-5 space-y-5">
            {CATEGORIES.map(cat => {
              const meta = CATEGORY_META[cat];
              const catNominees = nominees.categories[cat];
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{meta.icon}</span>
                    <div>
                      <div className="text-sm font-bold">{meta.label}</div>
                      <div className="text-[10px] text-[var(--text-sec)]">{meta.desc}</div>
                    </div>
                  </div>

                  {catNominees.length === 0 ? (
                    <div className="text-xs text-[var(--text-sec)] italic ml-7">No eligible nominees this season.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {catNominees.map(nom => {
                        const isSelected = votes[cat] === nom.userId;
                        return (
                          <button
                            key={nom.userId}
                            onClick={() => handleVoteSelect(cat, nom.userId)}
                            disabled={!user}
                            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                              isSelected
                                ? 'bg-blue-50 border-blue-300'
                                : 'bg-[var(--surface-2)] border-[var(--border)] hover:bg-[var(--surface-2)]/70'
                            } ${!user ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-bold truncate">
                                  {nom.displayName}
                                  {user?.id === nom.userId && <span className="ml-1.5 text-[10px] text-blue-600">(You)</span>}
                                </div>
                                <div className="text-[10px] text-[var(--text-sec)] truncate">{nom.teamName ?? '—'}</div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-xs font-bold tabular-nums">{nom.primaryStat}</div>
                                {nom.secondaryStat && (
                                  <div className="text-[10px] text-[var(--text-sec)] tabular-nums">{nom.secondaryStat}</div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="sticky bottom-0 px-5 py-3 border-t border-[var(--border)] flex items-center justify-end gap-2 bg-[var(--surface)]">
          <Button variant="ghost" size="sm" onClick={handleClose}>Skip</Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Submitting…' : user ? 'Submit Votes' : 'View Winners'}
          </Button>
        </div>
      </div>
    </div>
  );
}
