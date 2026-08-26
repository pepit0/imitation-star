import type { Metadata, Viewport } from "next";
import { Bebas_Neue, IBM_Plex_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import Header from "@/components/Header";
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
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${ibmPlexMono.variable} ${bebasNeue.variable} h-full`}
    >
      <body className="h-full flex flex-col overflow-hidden antialiased">
        <AuthProvider>
          <Header />
          <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
