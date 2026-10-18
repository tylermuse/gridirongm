/** Settings-page card: a titled, described section on the theme surface. */
export function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section
      className="mb-4 rounded-xl border bg-[var(--surface)] p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2 className="font-bold">{title}</h2>
      <p className="text-sm text-[var(--text-sec)] mt-0.5 mb-3">{desc}</p>
      {children}
    </section>
  );
}
