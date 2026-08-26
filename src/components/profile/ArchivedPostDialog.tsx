"use client";

import { useEffect, useId, useRef } from "react";

type ArchivedPostDialogProps = {
  postTitle: string;
  busy?: boolean;
  onRestore: () => void;
  onDelete: () => void;
  onCancel: () => void;
};

export default function ArchivedPostDialog({
  postTitle,
  busy = false,
  onRestore,
  onDelete,
  onCancel,
}: ArchivedPostDialogProps) {
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
      className="forum-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="confirm-dialog archived-post-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="confirm-dialog__title">
          Archived post
        </h3>
        <p className="confirm-dialog__message">
          <strong>{postTitle}</strong> is archived. Restore it to the forum or
          delete it permanently.
        </p>
        <div className="archived-post-dialog__actions">
          <button
            type="button"
            className="brutal-btn brutal-btn-sm archived-post-dialog__restore"
            disabled={busy}
            onClick={onRestore}
          >
            {busy ? "Working…" : "Restore"}
          </button>
          <button
            type="button"
            className="brutal-btn brutal-btn-sm archived-post-dialog__delete"
            disabled={busy}
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
        <button
          ref={cancelRef}
          type="button"
          className="brutal-btn brutal-btn-sm confirm-dialog__cancel archived-post-dialog__cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
