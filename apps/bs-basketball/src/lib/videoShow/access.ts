/** Who can watch the show (BS Football's spotlightAccess, the parts the video show uses). */
export type ListenState = 'checking' | 'signedOut' | 'locked' | 'exhausted' | 'ready';

export function listenState(a: {
  loading: boolean;
  signedIn: boolean;
  premium: boolean;
  /** -1 = uncapped (admin) */
  remaining: number;
}): ListenState {
  if (a.loading) return 'checking';
  if (!a.signedIn) return 'signedOut';
  if (!a.premium) return 'locked';
  if (a.remaining === 0) return 'exhausted';
  return 'ready';
}

/** When credits next reset: the stored reset time if still ahead, else the 1st of next month (UTC). */
export function nextCreditReset(resetAt: string | null, now: Date = new Date()): Date {
  if (resetAt) {
    const d = new Date(resetAt);
    if (d.getTime() > now.getTime()) return d;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function formatResetDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
