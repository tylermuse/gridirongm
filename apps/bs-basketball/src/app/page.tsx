import { basketballAdapter } from '@bs/sport-basketball';

/**
 * BS Hoops landing page (2C-1 shell verification).
 *
 * This page proves the engine wiring works:
 *   - apps/bs-basketball/ resolves @bs/sport-basketball from packages/
 *   - basketballAdapter satisfies the SportAdapter contract
 *   - Calendar phases, rating fields, and award definitions render
 *
 * Future 2C slices replace this with the real home page (new game,
 * continue, settings).
 */
export default function HomePage() {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <header className="border-b pb-4 mb-8" style={{ borderColor: 'var(--accent)' }}>
        <h1
          className="text-5xl font-extrabold tracking-tight"
          style={{ color: 'var(--accent)' }}
        >
          {basketballAdapter.brandName}
        </h1>
        <p className="text-lg mt-1 opacity-70">
          Build your dynasty. Run the franchise.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-3">Engine wired</h2>
        <p className="mb-2">
          Adapter <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">sportId</code>:{' '}
          <strong>{basketballAdapter.sportId}</strong>
        </p>
        <p className="mb-2">
          Positions:{' '}
          <strong>{basketballAdapter.positions.join(' / ')}</strong>
        </p>
        <p className="mb-2">
          Roster size: <strong>{basketballAdapter.rosterRules.activeRosterSize}</strong> active +{' '}
          {basketballAdapter.rosterRules.buckets
            .filter(b => b.name !== 'active')
            .map(b => `${b.capacity === Infinity ? '∞' : b.capacity} ${b.label.toLowerCase()}`)
            .join(' + ')}
        </p>
        <p>
          Calendar: <strong>{basketballAdapter.seasonCalendar.ticksPerSeason}</strong> ticks across{' '}
          <strong>{basketballAdapter.seasonCalendar.phases.length}</strong> phases
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-3">Season phases</h2>
        <ul className="space-y-1">
          {basketballAdapter.seasonCalendar.phases.map(phase => (
            <li key={phase.name} className="flex items-baseline gap-3">
              <span
                className="font-semibold w-40"
                style={{ color: 'var(--accent-alt)' }}
              >
                {phase.label}
              </span>
              <span className="opacity-70 text-sm">
                ticks {phase.startTick}–{phase.endTick}
                {phase.hasGames ? '' : ' · no games'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-3">Awards</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {basketballAdapter.awards.definitions.map(a => (
            <div
              key={a.id}
              className="p-3 rounded border"
              style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}
            >
              <div className="font-bold">{a.name}</div>
              <div className="text-xs opacity-60">{a.description}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-3">Coaching schemes</h2>
        <ul className="flex flex-wrap gap-2">
          {basketballAdapter.coachingSystem.schemes.HC.map(s => (
            <li
              key={s}
              className="px-3 py-1 rounded-full text-sm font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {s}
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-12 pt-4 border-t opacity-60 text-sm" style={{ borderColor: 'var(--border)' }}>
        2C-1 shell · adapter assembled · {basketballAdapter.competitions.length} competition(s)
      </footer>
    </main>
  );
}
