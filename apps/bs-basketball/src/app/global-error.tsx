'use client';

import { useEffect } from 'react';
import { recordCrash } from '@/lib/diagnostics/breadcrumbs';

/** Last-resort boundary (root layout itself failed) — no app CSS is loaded here. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { recordCrash(error, 'root'); }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f3f4f7', color: '#16181d', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: '0 0 0.75rem' }}>Something went wrong</h1>
          <p style={{ color: '#5a6272', maxWidth: 420, margin: '0 0 1.5rem' }}>
            BS Hoops hit an unexpected error. Your saves are stored in this browser and are safe — refresh or try again.
          </p>
          <button onClick={reset} style={{ background: '#E66B00', color: '#fff', border: 0, borderRadius: 8, padding: '0.7rem 2rem', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }}>
            Try again
          </button>
          {/* Full reload on purpose: the app shell itself failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ marginTop: '1rem', color: '#c75a00', fontSize: '0.875rem' }}>Back to home</a>
        </div>
      </body>
    </html>
  );
}
