'use client'

import { useState } from 'react'

export default function DesignatedSeatMonitorPage() {
  const [urls, setUrls] = useState<string[]>(['', ''])
  const [multiUrl, setMultiUrl] = useState('')
  const [error, setError] = useState('')

  function parseDisplayUrl(url: string): { courseId: string; token: string } | null {
    try {
      const parsed = new URL(url, window.location.origin)
      const match = parsed.pathname.match(/\/designated-seat-display\/(\d+)/)
      if (!match) return null
      const token = parsed.searchParams.get('token')
      if (!token) return null
      return { courseId: match[1], token }
    } catch {
      return null
    }
  }

  function addSlot() {
    setUrls((prev) => [...prev, ''])
  }

  function removeSlot(index: number) {
    setUrls((prev) => prev.filter((_, i) => i !== index))
  }

  function generate() {
    setError('')
    const entries = urls
      .map((url) => parseDisplayUrl(url.trim()))
      .filter((e): e is { courseId: string; token: string } => e !== null)

    if (entries.length < 2) {
      setError('최소 2개의 유효한 강좌 표시 URL을 입력해주세요.')
      return
    }

    const sessions = entries.map((e) => `${e.courseId}:${e.token}`).join(',')
    const result = `${window.location.origin}/designated-seat-display/multi?sessions=${encodeURIComponent(sessions)}`
    setMultiUrl(result)
    window.open(result, '_blank')
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-extrabold text-gray-900">멀티 강좌 QR 모니터</h1>
      <p className="mt-2 text-sm text-gray-500">
        여러 강좌의 지정좌석 QR을 하나의 모니터에 동시에 표시합니다.
        각 강좌의 &quot;배정현황 &gt; 현장 QR 표시&quot;에서 시작 후 URL을 복사해 아래에 붙여넣으세요.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {urls.map((url, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-center text-sm font-bold text-gray-400">{index + 1}</span>
            <input
              value={url}
              onChange={(e) => {
                const next = [...urls]
                next[index] = e.target.value
                setUrls(next)
              }}
              placeholder="강좌 표시 URL을 붙여넣기"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
            {urls.length > 2 ? (
              <button
                type="button"
                onClick={() => removeSlot(index)}
                className="shrink-0 rounded-xl bg-slate-100 px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-200"
              >
                삭제
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={addSlot}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          + 강좌 추가
        </button>
        <button
          type="button"
          onClick={generate}
          className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          멀티 모니터 URL 생성
        </button>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : null}

      {multiUrl ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-semibold text-emerald-800">멀티 모니터 URL이 생성되었습니다</p>
          <input
            value={multiUrl}
            readOnly
            className="mt-3 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-xs text-slate-600 outline-none"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(multiUrl)
              }}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              URL 복사
            </button>
            <a
              href={multiUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              새 창으로 열기
            </a>
          </div>
        </div>
      ) : null}
    </div>
  )
}
