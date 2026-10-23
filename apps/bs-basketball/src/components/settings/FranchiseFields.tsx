'use client';

/**
 * Franchise identity form fields — shared by the God Mode relocate/rebrand panel
 * (Settings) and the expansion team creator (/expansion).
 */

export function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide opacity-60">{label}</span>
      <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface-2)] text-sm" style={{ borderColor: 'var(--border)' }} />
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-8 w-10 rounded border" style={{ borderColor: 'var(--border)' }} />
      <span className="text-[10px] uppercase tracking-wide opacity-60">{label}</span>
    </label>
  );
}
