'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', padding: '2rem', textAlign: 'center' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.75rem' }}>Something went wrong</h2>
      <p style={{ color: '#5a6a7e', marginBottom: '1.5rem', maxWidth: '400px', fontSize: '0.875rem' }}>
        This page hit an error. Your game is still saved.
      </p>
      <button
        onClick={reset}
        style={{ background: '#2563eb', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '0.5rem', border: 'none', fontWeight: 700, cursor: 'pointer' }}
      >
        Try Again
      </button>
    </div>
  );
}
