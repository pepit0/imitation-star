"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";

/**
 * Minimal back control for Forum / Profile / Login when the site Header is hidden.
 */
export default function NativeAppBackBar() {
  const isNativeApp = useIsNativeApp();
  const pathname = usePathname();

  if (!isNativeApp) return null;
  if (pathname === "/play" || pathname?.startsWith("/play/")) return null;

  return (
    <div className="shrink-0 flex items-center gap-3 px-3 py-2 border-b-3 border-black bg-es-darker">
      <Link
        href="/play"
        className="text-xs uppercase tracking-wider font-bold text-white px-3 py-1.5 bg-es-brand border-2 border-black"
      >
        ← Game menu
      </Link>
    </div>
  );
}
