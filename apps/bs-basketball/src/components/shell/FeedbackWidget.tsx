'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Floating "Send feedback" button (parity with BS Football's FeedbackWidget).
 * Posts to /api/feedback, tagged app = 'bs-hoops'; messages show up in the
 * admin analytics view on bs-football.com. Sits at z-30 so modals, the mobile
 * nav drawer and bottom sheets (z-40/50) cover it.
 */
export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const pathname = usePathname();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  // Reset after closing a sent message.
  useEffect(() => {
    if (open || status !== 'sent') return;
    const t = setTimeout(() => { setMessage(''); setStatus('idle'); }, 300);
    return () => clearTimeout(t);
  }, [open, status]);

  async function submit() {
    if (!message.trim() || status === 'sending') return;
    setStatus('sending');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, page: pathname }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus('sent');
      setTimeout(() => setOpen(false), 1500);
    } catch {
      setStatus('error');
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Close feedback' : 'Send feedback'}
        title="Send feedback"
        className="fixed bottom-5 right-5 z-30 w-11 h-11 rounded-full text-white shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
        style={{ background: 'var(--accent)' }}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Send feedback"
          className="fixed bottom-20 right-5 z-30 w-[min(20rem,calc(100vw-2.5rem))] rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden bs-animate-fade"
        >
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-bold">Send feedback</h3>
            <p className="text-xs text-[var(--text-sec)] mt-0.5">Bug reports, feature ideas, anything!</p>
          </div>
          <div className="p-4">
            {status === 'sent' ? (
              <div className="text-center py-6">
                <div className="text-2xl mb-2" aria-hidden>✓</div>
                <p className="text-sm font-medium">Thanks for your feedback!</p>
              </div>
            ) : (
              <>
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(); }}
                  placeholder="What's on your mind?"
                  rows={4}
                  maxLength={2000}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] text-[var(--text-sec)]">{message.length > 0 && `${message.length}/2000`}</span>
                  <button
                    onClick={() => void submit()}
                    disabled={!message.trim() || status === 'sending'}
                    className="px-4 py-1.5 text-xs font-semibold rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'var(--accent)' }}
                  >
                    {status === 'sending' ? 'Sending…' : status === 'error' ? 'Retry' : 'Send'}
                  </button>
                </div>
                {status === 'error' && <p className="text-xs text-red-500 mt-2">Failed to send. Please try again.</p>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
