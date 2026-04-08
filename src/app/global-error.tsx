'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>Something went wrong</h1>
          <p style={{ color: '#5a6a7e', marginBottom: '1.5rem', maxWidth: '400px' }}>
            BS Football hit an unexpected error. Your save data is safe — try refreshing or click below to recover.
          </p>
          <button
            onClick={reset}
            style={{ background: '#2563eb', color: 'white', padding: '0.75rem 2rem', borderRadius: '0.5rem', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}
          >
            Try Again
          </button>
          <a href="/" style={{ marginTop: '1rem', color: '#2563eb', textDecoration: 'underline', fontSize: '0.875rem' }}>
            Back to Home
          </a>
        </div>
      </body>
    </html>
  );
}
