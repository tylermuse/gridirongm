'use client';

/**
 * ConfirmModal — branded replacement for `window.confirm()`.
 *
 * Round-2 feedback: native confirm() dialogs are un-styled, inconsistent with
 * the rest of the app, and on some mobile browsers block the page thread in
 * ways that read as a "freeze." Re-sign / walk flows now route here so the
 * confirm step matches the rest of BS Hoops' visual treatment, supports
 * keyboard interaction, and tints destructive actions red.
 *
 * The shape mirrors the in-house Modal: open / onClose, plus title, body,
 * confirm + cancel labels, and a `tone` for danger styling.
 */

import { Modal } from './Modal';
import type { ReactNode } from 'react';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  /** Header label shown in the modal title bar. */
  title: ReactNode;
  /** Body content — short prose, may include emphasis. */
  body: ReactNode;
  /** Label for the primary confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Confirm button accent. `danger` colors it red — used for walk / release. */
  tone?: 'default' | 'danger';
  /** Disable the confirm button while an async op runs. */
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmModal({
  open, onClose, title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  tone = 'default', loading = false, onConfirm,
}: ConfirmModalProps) {
  const dangerous = tone === 'danger';
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClass="max-w-md">
      <div className="text-sm text-[var(--text)] leading-relaxed">
        {body}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          onClick={onClose}
          disabled={loading}
          className="text-sm font-semibold rounded-lg border px-4 py-2 hover:bg-[var(--surface-2)] disabled:opacity-40"
          style={{ borderColor: 'var(--border)', color: 'var(--text-sec)' }}
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="text-sm font-bold rounded-lg px-4 py-2 text-white transition active:scale-95 disabled:opacity-40"
          style={{ background: dangerous ? '#dc2626' : 'var(--accent)' }}
        >
          {loading ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
