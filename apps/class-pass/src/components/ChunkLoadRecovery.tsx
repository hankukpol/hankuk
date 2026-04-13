'use client'

import { useEffect } from 'react'

function isChunkLoadMessage(value: unknown) {
  if (typeof value !== 'string') {
    return false
  }

  return /ChunkLoadError|Loading chunk [^ ]+ failed/i.test(value)
}

function shouldRecoverChunkLoad(error: unknown) {
  if (error instanceof Error) {
    return isChunkLoadMessage(error.name) || isChunkLoadMessage(error.message)
  }

  if (typeof error === 'object' && error !== null) {
    const maybeMessage = Reflect.get(error, 'message')
    const maybeName = Reflect.get(error, 'name')
    return isChunkLoadMessage(maybeName) || isChunkLoadMessage(maybeMessage)
  }

  return isChunkLoadMessage(error)
}

function getRecoveryKey() {
  return `class-pass-chunk-reload:${window.location.pathname}${window.location.search}`
}

function recoverChunkLoad() {
  const recoveryKey = getRecoveryKey()
  if (sessionStorage.getItem(recoveryKey) === 'done') {
    return
  }

  sessionStorage.setItem(recoveryKey, 'done')
  window.location.reload()
}

export function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (shouldRecoverChunkLoad(event.error ?? event.message)) {
        recoverChunkLoad()
      }
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (shouldRecoverChunkLoad(event.reason)) {
        recoverChunkLoad()
      }
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  return null
}
