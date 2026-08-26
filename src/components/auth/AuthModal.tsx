"use client";

import { useEffect, useId, useRef } from "react";
import AuthPanel, { type AuthMode } from "@/components/auth/AuthPanel";

type AuthModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultMode?: AuthMode;
  nextPath?: string;
};

export default function AuthModal({
  open,
  onClose,
  onSuccess,
  defaultMode = "signup",
  nextPath = "/play",
}: AuthModalProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="auth-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="auth-modal__top">
          <span id={titleId} className="sr-only">
            Sign in to publish
          </span>
          <button
            ref={closeRef}
            type="button"
            className="auth-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <AuthPanel
          key={defaultMode}
          embedded
          defaultMode={defaultMode}
          nextPath={nextPath}
          showLegalLinks={false}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  );
}
