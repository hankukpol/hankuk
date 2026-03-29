'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import { APP_CONFIG_DEFAULTS, type AppConfigSnapshot } from '@/lib/app-config.shared'

type UseAppConfigResult = {
  config: AppConfigSnapshot
  isLoading: boolean
  error: string
  reload: () => Promise<void>
}

export function useAppConfig(): UseAppConfigResult {
  const tenant = useTenantConfig()
  const defaultAppName = tenant.defaultAppName
  const [config, setConfig] = useState<AppConfigSnapshot>(() => ({
    ...APP_CONFIG_DEFAULTS,
    app_name: defaultAppName,
  }))
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/config/app', { cache: 'no-store' })
      const data = (await response.json().catch(() => null)) as
        | (AppConfigSnapshot & { error?: string })
        | null

      if (!response.ok) {
        throw new Error(data?.error ?? '앱 설정을 불러오지 못했습니다.')
      }

      setConfig({
        ...APP_CONFIG_DEFAULTS,
        app_name: defaultAppName,
        ...(data ?? {}),
      })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '앱 설정을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [defaultAppName])

  useEffect(() => {
    void reload()
  }, [reload])

  return { config, isLoading, error, reload }
}
