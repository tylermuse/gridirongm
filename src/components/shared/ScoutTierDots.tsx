'use client';

export function ScoutTierDots({ tier }: { tier: 0 | 1 | 2 | 3 }) {
  const colors = ['bg-sky-400', 'bg-indigo-500', 'bg-violet-600'];
  return (
    <div className="flex gap-0.5">
      {[0, 1, 2].map(i => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < tier ? colors[i] : 'bg-gray-200'}`} />
      ))}
    </div>
  );
}
