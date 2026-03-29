import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '면접 스터디 조 편성',
  description: '경찰/소방 면접 스터디를 자동으로 편성하는 프로그램',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-100 antialiased">{children}</body>
    </html>
  );
}
