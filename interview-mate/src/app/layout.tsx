import type { Metadata } from "next";
import localFont from "next/font/local";

import { PwaBootstrap } from "@/components/pwa/pwa-bootstrap";
import { AppToaster } from "@/components/ui/toaster";

import "./globals.css";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "100 900",
  display: "swap",
});

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Interview Mate",
  description:
    "Mock interview reservations, study-group operations, and admin workflows in one app.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${pretendard.variable} ${geistSans.variable} ${geistMono.variable} bg-background font-sans text-foreground antialiased`}
      >
        <PwaBootstrap />
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
