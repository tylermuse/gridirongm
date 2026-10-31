'use client';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  /** Work in flight: disables the button and shows a spinner beside the
   *  (unchanged) label, so analytics still see the same button text. */
  busy?: boolean;
  className?: string;
}

const variants = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20',
  secondary: 'bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)]',
  ghost: 'hover:bg-[var(--surface-2)] text-[var(--text-sec)]',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  children, onClick, variant = 'primary', size = 'md', disabled, busy = false, className = '',
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`
        inline-flex items-center justify-center gap-2 font-semibold rounded-lg
        transition-all duration-150 active:scale-[0.98]
        ${busy ? 'opacity-75 cursor-progress' : 'disabled:opacity-40 disabled:pointer-events-none'}
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]
        ${variants[variant]} ${sizes[size]} ${className}
      `}
    >
      {busy && (
        // CSS transform animation runs on the compositor, so it keeps
        // spinning while a synchronous sim blocks the main thread.
        <span
          aria-hidden="true"
          className="inline-block w-3 h-3 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin"
        />
      )}
      {children}
    </button>
  );
}
