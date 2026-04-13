'use client'

import { useEffect } from 'react'

const RESET_FLAG = 'class-pass-localhost-sw-reset'
let resetPromise: Promise<void> | null = null

async function resetLocalhostServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  const resetState = sessionStorage.getItem(RESET_FLAG)
  if (resetState === 'done' || resetState === 'running') {
    return
  }

  if (resetPromise) {
    return resetPromise
  }

  sessionStorage.setItem(RESET_FLAG, 'running')
  resetPromise = (async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      if (registrations.length > 0) {
        await Promise.all(registrations.map((registration) => registration.unregister()))
      }

      if ('caches' in window) {
        const keys = await caches.keys()
        if (keys.length > 0) {
          await Promise.all(keys.map((key) => caches.delete(key)))
        }
      }

      sessionStorage.setItem(RESET_FLAG, 'done')
    } catch {
      sessionStorage.removeItem(RESET_FLAG)
    } finally {
      resetPromise = null
    }
  })()

  return resetPromise
}

export function LocalhostServiceWorkerReset() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const { hostname } = window.location
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return
    }

    if (!('serviceWorker' in navigator)) {
      return
    }

    const runReset = () => {
      void resetLocalhostServiceWorker()
    }

    const browserWindow = window as Window &
      typeof globalThis & {
        requestIdleCallback?: (callback: IdleRequestCallback) => number
        cancelIdleCallback?: (handle: number) => void
      }

    // Run the cleanup quietly after initial paint so localhost navigation stays smooth.
    if (typeof browserWindow.requestIdleCallback === 'function') {
      const idleId = browserWindow.requestIdleCallback(runReset)
      return () => {
        if (typeof browserWindow.cancelIdleCallback === 'function') {
          browserWindow.cancelIdleCallback(idleId)
        }
      }
    }

    const timeoutId = globalThis.setTimeout(runReset, 0)
    return () => {
      globalThis.clearTimeout(timeoutId)
    }
  }, [])

  return null
}
