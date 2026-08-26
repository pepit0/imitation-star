"use client";

import Header from "@/components/Header";

/** Global site header — hidden in the Expo shell via CSS (`html[data-native-app="1"]`). */
export default function SiteHeader() {
  return (
    <div data-site-header="">
      <Header />
    </div>
  );
}
