"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppBackButton from "@/components/AppBackButton";
import AuthPanel from "@/components/auth/AuthPanel";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNativeApp = useIsNativeApp();

  const nextPath = useMemo(() => {
    const next = searchParams.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    return isNativeApp ? "/play" : "/";
  }, [searchParams, isNativeApp]);

  const authError = searchParams.get("error");

  return (
    <div className="auth-page">
      <AuthPanel
        nextPath={nextPath}
        initialError={
          authError
            ? "Couldn’t finish email confirmation. Try signing in again."
            : null
        }
        navigateOnSuccess={(path) => {
          router.replace(path);
          router.refresh();
        }}
        footer={
          <AppBackButton href={isNativeApp ? "/play" : "/"}>
            {isNativeApp ? "← Game menu" : "← Back to home"}
          </AppBackButton>
        }
      />
    </div>
  );
}
