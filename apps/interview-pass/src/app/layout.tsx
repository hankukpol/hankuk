import type { Metadata, Viewport } from 'next'
import { TenantProvider } from '@/components/TenantProvider'
import { getServerTenantConfig } from '@/lib/tenant.server'
import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getServerTenantConfig()

  return {
    title: tenant.defaultAppName,
    description: tenant.defaultDescription,
    other: {
      'mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-capable': 'yes',
    },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getServerTenantConfig()

  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body>
        <TenantProvider tenantType={tenant.type}>{children}</TenantProvider>
      </body>
    </html>
  )
}
