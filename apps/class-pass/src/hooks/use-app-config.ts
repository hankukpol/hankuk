'use client'

import { useEffect, useState } from 'react'
import type { AppConfigSnapshot } from '@/lib/app-config.shared'

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfigSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch('/api/config/app')
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled) {
          setConfig(payload as AppConfigSnapshot)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfig(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { config, isLoading }
}
