'use client';

/**
 * @bs/core/feedback/client — the "Feedback & questions" modal for both apps.
 *
 * Mount <FeedbackModal /> once (root layout); open it from anywhere with
 * openFeedback() — the sidebar entry, the mobile header button, the floating
 * bubble on content pages. One modal, many doors, so in-game screens (where
 * the Booth owns the bottom-right corner) still have an obvious way in.
 *
 * Posts to /api/feedback with a kind (bug / idea / question), an optional
 * reply email, and light context (page, season/phase, screen size). It's
 * anonymous unless the player ticks "include my account".
 *
 * Styled with the theme tokens both apps define (--surface, --surface-2,
 * --border, --text, --text-sec, --accent).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type FeedbackKind = 'bug' | 'idea' | 'question';

const OPEN_EVENT = 'bs:feedback-open';

type ContextFn = () => Record<string, unknown>;
let registeredContext: ContextFn | null = null;

/**
 * Let the in-game shell describe the league (season, week, phase…) without
 * the root layout importing the game store. Returns an unregister function.
 */
export function setFeedbackContext(fn: ContextFn) {
  registeredContext = fn;
  return () => { if (registeredContext === fn) registeredContext = null; };
}

/** Open the feedback modal (optionally pre-selecting a kind). */
export function openFeedback(kind?: FeedbackKind) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { kind } }));
}

const KINDS: { id: FeedbackKind; label: string; icon: string; placeholder: string }[] = [
  {
    id: 'bug',
    label: 'Report a bug',
    icon: '🐞',
    placeholder: 'What happened, and what did you expect? e.g. "I traded away a pick I\'d already used in the draft."',
  },
  {
    id: 'idea',
    label: 'Suggest an idea',
    icon: '💡',
    placeholder: 'What would make the game better? e.g. "Add a stat records page."',
  },
  {
    id: 'question',
    label: 'Ask a question',
    icon: '❓',
    placeholder: 'What are you trying to do? e.g. "How do I use pro-level scouting?"',
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface FeedbackModalProps {
  /** Shown in the heading, e.g. "BS Football". */
  appName: string;
  /** Discord invite shown as the "rather chat?" option. */
  discordUrl?: string;
}

export function FeedbackModal({ appName, discordUrl }: FeedbackModalProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [includeAccount, setIncludeAccount] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const reset = useCallback(() => {
    setMessage('');
    setEmail('');
    setIncludeAccount(false);
    setStatus('idle');
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const k = (e as CustomEvent<{ kind?: FeedbackKind }>).detail?.kind;
      if (k) setKind(k);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Clear a sent message once the modal has closed.
  useEffect(() => {
    if (open || status !== 'sent') return;
    const t = setTimeout(reset, 300);
    return () => clearTimeout(t);
  }, [open, status, reset]);

  const emailOk = email.trim() === '' || EMAIL_RE.test(email.trim());
  const canSend = message.trim().length > 0 && emailOk && status !== 'sending';

  async function submit() {
    if (!canSend) return;
    setStatus('sending');
    let context: Record<string, unknown> = {};
    try { context = registeredContext?.() ?? {}; } catch { /* context is best-effort */ }
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          kind,
          contact: email.trim() || null,
          includeAccount,
          page: window.location.pathname,
          context: {
            ...context,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            ua: navigator.userAgent.slice(0, 200),
          },
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  if (!open) return null;
  const active = KINDS.find(k => k.id === kind) ?? KINDS[0];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bs-feedback-title"
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 id="bs-feedback-title" className="text-base font-bold">Help us make {appName} better</h2>
            <p className="text-xs text-[var(--text-sec)] mt-1">
              Bugs, ideas, questions: they go straight to the developer, and every one gets read.
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="-mr-2 -mt-1 w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {status === 'sent' ? (
          <div className="px-5 pb-6 pt-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center text-xl text-white" style={{ background: 'var(--accent)' }}>✓</div>
            <p className="text-sm font-semibold mt-3">Got it. Thank you!</p>
            <p className="text-xs text-[var(--text-sec)] mt-1">
              {email.trim()
                ? "We'll reply to your email when we have an answer."
                : 'Fixes and new features ship most days. Watch the Discord announcements to see yours land.'}
            </p>
            <div className="flex gap-2 justify-center mt-5">
              <button onClick={reset} className="px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)]">
                Send another
              </button>
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-xs font-semibold rounded-lg text-white hover:brightness-110" style={{ background: 'var(--accent)' }}>
                Back to the game
              </button>
            </div>
          </div>
        ) : (
          <div className="px-5 pb-5 space-y-3">
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Type of message">
              {KINDS.map(k => {
                const on = k.id === kind;
                return (
                  <button
                    key={k.id}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setKind(k.id)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 text-[11px] font-semibold transition-colors ${on ? '' : 'border-[var(--border)] text-[var(--text-sec)] hover:bg-[var(--surface-2)]'}`}
                    style={on ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' } : undefined}
                  >
                    <span className="text-lg leading-none" aria-hidden="true">{k.icon}</span>
                    {k.label}
                  </button>
                );
              })}
            </div>

            <textarea
              ref={textareaRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={active.placeholder}
              rows={5}
              maxLength={2000}
              aria-label="Your message"
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] placeholder:text-[var(--text-sec)]/70 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(); }}
            />

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-sec)] mb-1" htmlFor="bs-feedback-email">
                {kind === 'question' ? 'Email for a reply' : 'Want a reply? Your email'} <span className="opacity-70">(optional)</span>
              </label>
              <input
                id="bs-feedback-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                maxLength={200}
                className={`w-full px-3 py-2 text-sm rounded-lg border bg-[var(--surface)] text-[var(--text)] placeholder:text-[var(--text-sec)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 ${emailOk ? 'border-[var(--border)]' : 'border-red-500'}`}
              />
              {!emailOk && <p className="text-[11px] text-red-600 mt-1">That email doesn&apos;t look right.</p>}
            </div>

            <label className="flex items-start gap-2 text-[11px] text-[var(--text-sec)] cursor-pointer">
              <input
                type="checkbox"
                checked={includeAccount}
                onChange={e => setIncludeAccount(e.target.checked)}
                className="mt-0.5"
                style={{ accentColor: 'var(--accent)' }}
              />
              <span>
                Include my account if I&apos;m signed in (helps with save or account problems).
                Otherwise this is sent anonymously.
              </span>
            </label>

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-[10px] text-[var(--text-sec)]">
                {message.length > 0 ? `${message.length}/2000` : 'Sends the page you’re on and your league’s season.'}
              </span>
              <button
                onClick={() => void submit()}
                disabled={!canSend}
                className="shrink-0 px-5 py-2 text-sm font-bold rounded-lg text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--accent)' }}
              >
                {status === 'sending' ? 'Sending…' : status === 'error' ? 'Try again' : 'Send'}
              </button>
            </div>
            {status === 'error' && (
              <p className="text-xs text-red-600">That didn&apos;t send. Check your connection and try again.</p>
            )}

            {discordUrl && (
              <p className="text-[11px] text-[var(--text-sec)] border-t border-[var(--border)] pt-3">
                Rather chat? <a href={discordUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: 'var(--accent)' }}>Join the Discord</a>, where other GMs and the developer answer questions.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
