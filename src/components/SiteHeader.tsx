"use client";

import Header from "@/components/Header";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";

/** Global site header — hidden in the Expo / store native shell. */
export default function SiteHeader() {
  const isNativeApp = useIsNativeApp();
  if (isNativeApp) return null;
  return (
    <div data-site-header="">
      <Header />
    </div>
  );
}
