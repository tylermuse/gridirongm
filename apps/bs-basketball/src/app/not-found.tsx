import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
      <div className="text-6xl font-black mb-1" style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>404</div>
      <h2 className="text-xl font-black mb-2">Air ball.</h2>
      <p className="text-sm text-[var(--text-sec)] max-w-sm mb-5">That page doesn&rsquo;t exist — it may have been traded.</p>
      <Link href="/" className="rounded-lg px-5 py-2 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
        Back to the gym
      </Link>
    </main>
  );
}
