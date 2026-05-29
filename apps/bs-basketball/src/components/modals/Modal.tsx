'use client';

/**
 * Modal shell for BS Hoops.
 *
 * Ports bs-football's overlay pattern: a portal-rendered backdrop +
 * centered panel with
 *   - fade-in backdrop (semi-transparent black, slight blur)
 *   - scale-from-95 panel animation (~150ms)
 *   - ESC + click-outside + explicit ✕ to close
 *   - focus trap (Tab cycles within the panel)
 *   - scrollable body when content exceeds the viewport
 *
 * Render-on-mount only (createPortal needs document); SSR renders nothing.
 */

import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible title; rendered in the header next to the ✕ button. */
  title?: ReactNode;
  children: ReactNode;
  /** Tailwind max-width class for the panel. Defaults to max-w-2xl. */
  maxWidthClass?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, maxWidthClass = 'max-w-2xl' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  // Remember the trigger element, move focus into the panel, restore on close.
  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    // Defer so the panel is in the DOM before we focus it.
    const id = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }, 0);
    // Lock background scroll while open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prevOverflow;
      lastFocused.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        el => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  // Modals only open via client-side interaction, so document is available
  // by the time `open` flips true — no SSR mount guard needed.
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="bs-animate-fade fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={onKeyDown}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className={`bs-animate-modal w-full ${maxWidthClass} max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl outline-none`}
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between gap-4 px-5 py-3 border-b backdrop-blur"
          style={{
            borderColor: 'var(--border)',
            background: 'color-mix(in srgb, var(--surface) 90%, transparent)',
          }}
        >
          <div className="min-w-0 font-bold text-lg truncate">{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-lg text-[var(--text-sec)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
