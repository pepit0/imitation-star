"use client";

import { useEffect, useId, useRef } from "react";

type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Optional middle action (e.g. Export ZIP). */
  secondaryLabel?: string;
  tone?: "green" | "red" | "neutral";
  busy?: boolean;
  fixed?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onSecondary?: () => void;
};

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  secondaryLabel,
  tone = "neutral",
  busy = false,
  fixed = false,
  onConfirm,
  onCancel,
  onSecondary,
}: ConfirmDialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  return (
    <div
      className={`confirm-dialog-backdrop${fixed ? " confirm-dialog-backdrop--fixed" : ""}`}
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="confirm-dialog__title">
          {title}
        </h3>
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="brutal-btn brutal-btn-sm confirm-dialog__cancel"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          {secondaryLabel && onSecondary ? (
            <button
              type="button"
              className="brutal-btn brutal-btn-sm confirm-dialog__secondary"
              disabled={busy}
              onClick={onSecondary}
            >
              {busy ? "Working…" : secondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={`brutal-btn brutal-btn-sm confirm-dialog__confirm confirm-dialog__confirm--${tone}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
