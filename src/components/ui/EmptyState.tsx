'use client';
import Link from 'next/link';

export function EmptyState({ icon, title, description, cta, ctaHref }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta?: string;
  ctaHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center max-w-md mx-auto">
      <div className="w-20 h-20 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center mb-6 text-4xl">
        {icon}
      </div>
      <h2 className="text-xl font-bold text-[var(--text)] mb-2">{title}</h2>
      <p className="text-[var(--text-sec)] text-sm leading-relaxed mb-6">{description}</p>
      {cta && ctaHref && (
        <Link href={ctaHref} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition">
          {cta}
        </Link>
      )}
    </div>
  );
}
