"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isValidHandle, sanitizeHandle } from "@/lib/handle";
import { validateDisplayName } from "@/lib/profanity";
import { LEGAL_ROUTES } from "@/lib/legal";
import LegalLinks from "@/components/LegalLinks";

export type AuthMode = "signin" | "signup";

type AuthPanelProps = {
  defaultMode?: AuthMode;
  /** Called after a session is established (sign-in or signup with session). */
  onSuccess?: () => void;
  /**
   * When true, stay on the current page after auth (no router navigation).
   * Use on the dub end screen so takes are not unmounted.
   */
  embedded?: boolean;
  /** Path used for email-confirm redirect and non-embedded navigation. */
  nextPath?: string;
  /** Navigate after success when not embedded. */
  navigateOnSuccess?: (path: string) => void;
  showLegalLinks?: boolean;
  footer?: ReactNode;
  titleOverride?: { signin: string; signup: string };
  subOverride?: string;
  /** Shown once on mount (e.g. failed email confirmation). */
  initialError?: string | null;
};

export default function AuthPanel({
  defaultMode = "signin",
  onSuccess,
  embedded = false,
  nextPath = "/",
  navigateOnSuccess,
  showLegalLinks = true,
  footer,
  titleOverride,
  subOverride,
  initialError = null,
}: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cleanHandle = sanitizeHandle(handle);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);

    try {
      const supabase = createClient();

      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
        onSuccess?.();
        if (!embedded) {
          navigateOnSuccess?.(nextPath);
        }
        return;
      }

      const name = displayName.trim();
      const nameError = validateDisplayName(name);
      if (nameError) {
        setError(nameError);
        return;
      }
      if (!isValidHandle(handle)) {
        setError("Handle must be 3–32 characters: letters, numbers, or _.");
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: name,
            handle: cleanHandle,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.user) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            display_name: name,
            handle: cleanHandle,
          })
          .eq("id", data.user.id);

        if (profileError) {
          if (profileError.code === "23505") {
            setError("That @handle is taken — try another.");
            return;
          }
          if (data.session) {
            setError(profileError.message);
            return;
          }
        }
      }

      if (data.session) {
        onSuccess?.();
        if (!embedded) {
          navigateOnSuccess?.(nextPath);
        }
        return;
      }

      setInfo(
        embedded
          ? "Check your email to confirm, then sign in here. Your dub will stay on this screen."
          : "Check your email to confirm your account, then sign in."
      );
      setMode("signin");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Sign in failed. Try again.";
      setError(
        message.includes("NEXT_PUBLIC_SUPABASE")
          ? "Auth isn’t configured on this deploy. Add Supabase env vars in Vercel and redeploy."
          : message
      );
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "signin"
      ? (titleOverride?.signin ?? "Sign in")
      : (titleOverride?.signup ?? "Create account");

  return (
    <div className={embedded ? "auth-card auth-card--embedded" : "auth-card"}>
      {!embedded ? (
        <p className="auth-card__eyebrow">Imitation Star</p>
      ) : null}
      <h2 className="auth-card__title">{title}</h2>
      <p className="auth-card__sub">
        {subOverride ??
          (embedded
            ? "Create an account or sign in to publish. Your take stays here."
            : "Email accounts for now — Google and Apple come later.")}
      </p>

      {error ? (
        <p className="auth-card__error" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="auth-card__info" role="status">
          {info}
        </p>
      ) : null}

      <form className="auth-form" onSubmit={onSubmit}>
        {mode === "signup" ? (
          <>
            <label className="auth-field">
              <span>Display name</span>
              <input
                type="text"
                name="displayName"
                autoComplete="nickname"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your stage name"
                maxLength={40}
              />
            </label>

            <label className="auth-field">
              <span>Handle</span>
              <div className="auth-handle">
                <span className="auth-handle__at" aria-hidden="true">
                  @
                </span>
                <input
                  type="text"
                  name="handle"
                  autoComplete="username"
                  required
                  value={handle}
                  onChange={(e) => setHandle(sanitizeHandle(e.target.value))}
                  placeholder="yourname"
                  minLength={3}
                  maxLength={32}
                  spellCheck={false}
                />
              </div>
              <span className="auth-field__hint">
                Your @ name in the app
                {cleanHandle ? ` — @${cleanHandle}` : ""}
              </span>
            </label>
          </>
        ) : null}

        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            name="password"
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </label>

        <button
          type="submit"
          className="brutal-btn bg-es-brand text-white w-full"
          disabled={busy}
        >
          {busy
            ? "Working…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>

        {mode === "signup" ? (
          <p className="auth-card__legal">
            By creating an account, you agree to our{" "}
            <Link href={LEGAL_ROUTES.terms}>Terms of Service</Link> and{" "}
            <Link href={LEGAL_ROUTES.privacy}>Privacy Policy</Link>.
          </p>
        ) : null}
      </form>

      <p className="auth-card__switch">
        {mode === "signin" ? (
          <>
            New here?{" "}
            <button
              type="button"
              className="auth-link"
              onClick={() => {
                setMode("signup");
                setError(null);
                setInfo(null);
              }}
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className="auth-link"
              onClick={() => {
                setMode("signin");
                setError(null);
                setInfo(null);
              }}
            >
              Sign in
            </button>
          </>
        )}
      </p>

      {showLegalLinks ? (
        <LegalLinks className="mt-4" layout="stack" />
      ) : null}

      {footer}
    </div>
  );
}
