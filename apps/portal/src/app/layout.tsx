import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '통합 관리자 포털',
  description: '한 번 로그인하고 여러 Hankuk 운영 앱으로 이동하는 통합 관리자 포털',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <div className="portal-shell">{children}</div>
      </body>
    </html>
  )
}
