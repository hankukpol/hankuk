import type { Metadata } from "next";
import localFont from "next/font/local";

import { AppToaster } from "@/components/ui/AppToaster";
import "./globals.css";

// DESIGN.md 3절 — 폰트는 Pretendard 하나뿐이다. 화면별로 다른 웹폰트를 추가하지 않는다.
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "시간통제 자습반 관리 시스템",
  description: "직렬별 출석, 상벌점, 성적, 수납을 통합 관리하는 운영 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${pretendard.variable} antialiased`}>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
