import type { Metadata, Viewport } from "next";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getAcademyRuntimeBranding();

  return {
    title: {
      default: branding.systemName,
      template: `%s | ${branding.academyName}`,
    },
    description: branding.systemDescription,
    manifest: "/manifest.json",
    applicationName: branding.systemName,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: branding.systemName,
    },
    icons: {
      icon: [
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [
        {
          url: "/icons/apple-touch-icon.png",
          sizes: "180x180",
          type: "image/png",
        },
      ],
      shortcut: ["/icons/icon-192.png"],
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const branding = await getAcademyRuntimeBranding();

  return {
    themeColor: branding.themeColor,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
