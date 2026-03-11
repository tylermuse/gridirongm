'use client';

import { useState, useEffect } from 'react';
import { useGameStore } from '@/lib/engine/store';

const STORAGE_KEY = 'gridiron-gm-feedback';
const MIN_GAMES = 5;
const COOLDOWN_DAYS = 7;
const MAX_SHOWS = 3;

interface FeedbackState {
  lastDismissed: number; // timestamp
  showCount: number;
  submittedAt: number | null;
}

function getState(): FeedbackState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { lastDismissed: 0, showCount: 0, submittedAt: null };
}

function saveState(s: FeedbackState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function FeedbackPopup() {
  const [visible, setVisible] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const schedule = useGameStore(s => s.schedule);
  const season = useGameStore(s => s.season);
  const phase = useGameStore(s => s.phase);

  // Count played games
  const gamesPlayed = schedule.filter(g => g.played).length;

  useEffect(() => {
    const state = getState();

    // Already submitted — never show again
    if (state.submittedAt) return;

    // Shown max times — stop nagging
    if (state.showCount >= MAX_SHOWS) return;

    // Not enough games played
    if (gamesPlayed < MIN_GAMES) return;

    // Cooldown check
    const now = Date.now();
    const daysSinceLast = (now - state.lastDismissed) / (1000 * 60 * 60 * 24);
    if (daysSinceLast < COOLDOWN_DAYS) return;

    // Only show during natural break points (start of phase transitions)
    const breakPhases = ['draft', 'freeAgency', 'preseason'];
    if (!breakPhases.includes(phase)) return;

    // Small delay so it doesn't appear instantly
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [gamesPlayed, phase, season]);

  function handleDismiss() {
    const state = getState();
    state.lastDismissed = Date.now();
    state.showCount += 1;
    saveState(state);
    setVisible(false);
  }

  function handleSubmit() {
    const state = getState();
    state.submittedAt = Date.now();
    saveState(state);

    // Store feedback locally (could be sent to API later)
    try {
      const existing = JSON.parse(localStorage.getItem('gridiron-gm-feedback-responses') || '[]');
      existing.push({
        rating,
        comment,
        season,
        gamesPlayed,
        timestamp: Date.now(),
      });
      localStorage.setItem('gridiron-gm-feedback-responses', JSON.stringify(existing));
    } catch { /* ignore */ }

    setSubmitted(true);
    setTimeout(() => setVisible(false), 2000);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 animate-in slide-in-from-bottom-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 px-4 py-3 flex items-center justify-between">
          <span className="text-white text-sm font-bold">How&apos;s Gridiron GM?</span>
          <button
            onClick={handleDismiss}
            className="text-white/70 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          {submitted ? (
            <div className="text-center py-4">
              <span className="text-2xl">🙏</span>
              <p className="text-sm font-semibold text-[var(--text)] mt-2">Thanks for the feedback!</p>
              <p className="text-xs text-[var(--text-sec)]">It helps us improve the game.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-[var(--text-sec)]">
                Quick feedback to help us improve. Takes 10 seconds!
              </p>

              {/* Star rating */}
              <div>
                <div className="text-xs text-[var(--text-sec)] mb-1.5">Rate your experience</div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className={`text-2xl transition-all ${
                        rating !== null && star <= rating
                          ? 'text-amber-400 scale-110'
                          : 'text-gray-300 hover:text-amber-300'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment */}
              <div>
                <div className="text-xs text-[var(--text-sec)] mb-1.5">What could be better? <span className="opacity-60">(optional)</span></div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="More realistic trades, better UI..."
                  className="w-full h-16 px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] placeholder:text-[var(--text-sec)]/50 resize-none focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* Submit */}
              <div className="flex gap-2">
                <button
                  onClick={handleDismiss}
                  className="flex-1 px-3 py-2 text-xs font-semibold text-[var(--text-sec)] bg-[var(--surface-2)] rounded-lg hover:bg-[var(--border)] transition-all"
                >
                  Maybe later
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!rating}
                  className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Send Feedback
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
