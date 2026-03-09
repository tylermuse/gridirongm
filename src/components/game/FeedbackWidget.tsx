'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const pathname = usePathname();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  // Reset after closing
  useEffect(() => {
    if (!open && status === 'sent') {
      const t = setTimeout(() => {
        setMessage('');
        setStatus('idle');
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open, status]);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setStatus('sending');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, page: pathname }),
      });
      if (res.ok) {
        setStatus('sent');
        setTimeout(() => setOpen(false), 1500);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-5 right-5 z-50 w-11 h-11 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
        title="Send feedback"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Feedback panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Send Feedback</h3>
            <p className="text-xs text-gray-500 mt-0.5">Bug reports, feature ideas, anything!</p>
          </div>

          <div className="p-4">
            {status === 'sent' ? (
              <div className="text-center py-6">
                <div className="text-2xl mb-2">&#10003;</div>
                <p className="text-sm font-medium text-gray-900">Thanks for your feedback!</p>
              </div>
            ) : (
              <>
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={4}
                  maxLength={2000}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleSubmit();
                    }
                  }}
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] text-gray-400">
                    {message.length > 0 && `${message.length}/2000`}
                  </span>
                  <button
                    onClick={handleSubmit}
                    disabled={!message.trim() || status === 'sending'}
                    className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {status === 'sending' ? 'Sending...' : status === 'error' ? 'Retry' : 'Send'}
                  </button>
                </div>
                {status === 'error' && (
                  <p className="text-xs text-red-500 mt-2">Failed to send. Please try again.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
