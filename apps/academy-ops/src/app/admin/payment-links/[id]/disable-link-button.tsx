'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  linkId: number
  canDisable: boolean
}

export function DisableLinkButton({ linkId, canDisable }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!canDisable) return null

  function handleDisable() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/payment-links/${linkId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'DISABLED' }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : '비활성화 실패')
      }
    })
  }

  return (
    <div className="mt-2 space-y-1">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</p>
      )}
      <button
        type="button"
        onClick={handleDisable}
        disabled={isPending}
        className="w-full rounded-full border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
      >
        {isPending ? '처리 중...' : '비활성화'}
      </button>
    </div>
  )
}
