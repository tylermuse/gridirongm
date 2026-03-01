'use client';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'green' | 'red' | 'amber' | 'blue';
  size?: 'sm' | 'md';
}

const variantClasses = {
  default: 'bg-[var(--surface-2)] text-[var(--text-sec)]',
  green: 'bg-green-900/40 text-green-400',
  red: 'bg-red-900/40 text-red-400',
  amber: 'bg-amber-900/40 text-amber-400',
  blue: 'bg-blue-900/40 text-blue-400',
};

export function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center font-semibold rounded-full
        ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}
        ${variantClasses[variant]}
      `}
    >
      {children}
    </span>
  );
}
