'use client'

import localFont from 'next/font/local'
import * as React from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import '@/app/(admin)/admin.css'

const adminFont = localFont({
  src: '../../app/fonts/PretendardVariable.woff2',
  variable: '--font-admin',
  display: 'swap',
  weight: '100 900',
})

export function AdminTheme({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const tenant = useTenantConfig()
  const classes = ['admin-shell', adminFont.variable, className].filter(Boolean).join(' ')

  return (
    <div className={classes} data-tenant={tenant.type}>
      {children}
      <div id="admin-portal-root" />
    </div>
  )
}
