'use client'

import { createContext, createElement, useContext } from 'react'
import { getTenantConfigByType, type TenantType } from '@/lib/tenant'

const TenantContext = createContext<TenantType | null>(null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TenantChildren = any

export function TenantProvider({
  tenantType,
  children,
}: {
  tenantType: TenantType
  children: TenantChildren
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createElement(TenantContext.Provider as any, { value: tenantType }, children)
}

export function useTenantConfig() {
  const tenantType = useContext(TenantContext)

  if (!tenantType) {
    throw new Error('TenantProvider is missing in the current tree.')
  }

  return getTenantConfigByType(tenantType)
}
