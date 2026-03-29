'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Props {
  memoId: string
}

export function ResolveButton({ memoId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')

  async function handleResolve(action: 'resolve' | 'dismiss') {
    setLoading(true)
    try {
      const res = await fetch(`/api/score-corrections/${memoId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      })
      if (!res.ok) throw new Error()
      router.push('/admin/score-corrections')
      router.refresh()
    } catch {
      toast.error('처리에 실패했습니다.')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="처리 메모 (선택사항)"
        className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
        rows={3}
      />
      <div className="flex gap-2">
        <button
          onClick={() => handleResolve('resolve')}
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          처리 완료
        </button>
        <button
          onClick={() => handleResolve('dismiss')}
          disabled={loading}
          className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
        >
          반려
        </button>
      </div>
    </div>
  )
}
