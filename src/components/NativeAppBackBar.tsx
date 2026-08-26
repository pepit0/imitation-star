"use client";

import AppBackButton from "@/components/AppBackButton";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { usePathname } from "next/navigation";

/**
 * Top back bar for Forum / Profile / Login when the site Header is hidden.
 */
export default function NativeAppBackBar() {
  const isNativeApp = useIsNativeApp();
  const pathname = usePathname();

  if (!isNativeApp) return null;
  if (pathname === "/play" || pathname?.startsWith("/play/")) return null;

  return (
    <div className="app-back-bar">
      <AppBackButton href="/play">← Game menu</AppBackButton>
    </div>
  );
}
