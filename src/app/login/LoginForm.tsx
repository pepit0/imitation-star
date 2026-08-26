"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isValidHandle, sanitizeHandle } from "@/lib/handle";
import { validateDisplayName } from "@/lib/profanity";

type Mode = "signin" | "signup";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nextPath = useMemo(() => {
    const next = searchParams.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    return "/";
  }, [searchParams]);

  const authError = searchParams.get("error");
  const cleanHandle = sanitizeHandle(handle);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);

    const supabase = createClient();

    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
        router.replace(nextPath);
        router.refresh();
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

      // Ensure profile row matches chosen name/handle (covers trigger races).
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
          // Session may be missing until email confirm; trigger still has metadata.
          if (data.session) {
            setError(profileError.message);
            return;
          }
        }
      }

      if (data.session) {
        router.replace(nextPath);
        router.refresh();
        return;
      }

      setInfo(
        "Check your email to confirm your account, then sign in. (You can also turn off email confirmation in the Supabase Auth settings while developing.)"
      );
      setMode("signin");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-card__eyebrow">Imitation Star</p>
        <h1 className="auth-card__title">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="auth-card__sub">
          Email accounts for now — Google and Apple come later.
        </p>

        {authError ? (
          <p className="auth-card__error" role="alert">
            Couldn’t finish email confirmation. Try signing in again.
          </p>
        ) : null}
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

        <Link href="/" className="auth-card__back">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
