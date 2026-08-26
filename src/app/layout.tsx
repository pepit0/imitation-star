import type { Metadata, Viewport } from "next";
import { Bebas_Neue, IBM_Plex_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import NativeAppBackBar from "@/components/NativeAppBackBar";
import SiteHeader from "@/components/SiteHeader";
import { SubscriptionProvider } from "@/components/subscription/SubscriptionProvider";
import { NATIVE_APP_STORAGE_KEY } from "@/lib/nativeApp";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono-title",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas-neue",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Imitation Star — Dub Scenes, Share Takes, Get Rated",
  description:
    "Dub a scene your way — accurate or hilarious. Post it for other players to rate, or share it with friends. No AI scores.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    shortcut: [{ url: "/favicon.png", sizes: "32x32", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Imitation Star",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#FF595E",
  viewportFit: "cover",
};

/** Runs before paint so site Header never flashes in the Expo / store shell. */
const NATIVE_APP_BOOT =
  `(function(){try{var s="${NATIVE_APP_STORAGE_KEY}";` +
  `var q=location.search;` +
  `if(/[?&]client=app(?:&|$)/.test(q)||/[?&]native=1(?:&|$)/.test(q)){` +
  `sessionStorage.setItem(s,"1");document.documentElement.dataset.nativeApp="1";` +
  `}else if(sessionStorage.getItem(s)==="1"){document.documentElement.dataset.nativeApp="1";}` +
  `}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${ibmPlexMono.variable} ${bebasNeue.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NATIVE_APP_BOOT }} />
      </head>
      <body className="h-full flex flex-col overflow-hidden antialiased">
        <AuthProvider>
          <SubscriptionProvider>
            <SiteHeader />
            <NativeAppBackBar />
            <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
          </SubscriptionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
