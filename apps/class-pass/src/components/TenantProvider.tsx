'use client'

import * as React from 'react'
import type { TenantConfig } from '@/lib/tenant'

const TenantContext = React.createContext<TenantConfig | null>(null)

export function TenantProvider({
  tenantConfig,
  children,
}: {
  tenantConfig: TenantConfig
  children: React.ReactNode
}) {
  return React.createElement(TenantContext.Provider, { value: tenantConfig }, children) as React.ReactElement
}

export function useTenantConfig() {
  const tenant = React.useContext(TenantContext)

  if (!tenant) {
    throw new Error('TenantProvider is missing in the current tree.')
  }

  return tenant
}
