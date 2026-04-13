'use client'

import { QRCodeSVG } from 'qrcode.react'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DESIGNATED_SEAT_DISPLAY_RETRY_MS,
  getDisplayRefreshDelay,
} from '@/lib/designated-seat/display-runtime'

type DisplayPayload = {
  course: { id: number; name: string }
  session: { id: number; expires_at: string }
  rotationToken: string
  rotationExpiresAt: string
}

type SessionEntry = {
  courseId: number
  token: string
  payload: DisplayPayload | null
  error: string
}

function parseSessionsParam(raw: string): Array<{ courseId: number; token: string }> {
  return raw
    .split(',')
    .map((segment) => {
      const colonIdx = segment.indexOf(':')
      if (colonIdx < 1) return null
      const courseId = Number(segment.slice(0, colonIdx))
      const token = segment.slice(colonIdx + 1)
      if (!Number.isInteger(courseId) || courseId <= 0 || !token) return null
      return { courseId, token }
    })
    .filter((entry): entry is { courseId: number; token: string } => entry !== null)
}

export default function MultiDisplayPage() {
  const searchParams = useSearchParams()
  const sessionsParam = searchParams.get('sessions') ?? ''
  const parsed = useMemo(() => parseSessionsParam(sessionsParam), [sessionsParam])

  const [entries, setEntries] = useState<SessionEntry[]>([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    setEntries(parsed.map((p) => ({ courseId: p.courseId, token: p.token, payload: null, error: '' })))
  }, [parsed])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const loadEntry = useCallback(async (courseId: number, token: string) => {
    const response = await fetch(
      `/api/designated-seats/display?courseId=${courseId}&token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    )
    const result = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error((result as { error?: string } | null)?.error ?? 'QR ?뺣낫瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??')
    }
    return result as DisplayPayload
  }, [])

  useEffect(() => {
    if (parsed.length === 0) return

    let cancelled = false
    let nextLoadTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleNextLoad = (delayMs: number) => {
      nextLoadTimer = setTimeout(() => {
        void loadAll()
      }, delayMs)
    }

    async function loadAll() {
      const results = await Promise.allSettled(
        parsed.map((p) => loadEntry(p.courseId, p.token)),
      )
      if (cancelled) return

      const nextEntries = parsed.map((p, i) => {
        const result = results[i]
        return {
          courseId: p.courseId,
          token: p.token,
          payload: result.status === 'fulfilled' ? result.value : null,
          error: result.status === 'rejected' ? (result.reason as Error).message : '',
        }
      })

      setEntries(nextEntries)

      const successfulPayloads = nextEntries
        .map((entry) => entry.payload)
        .filter((entry): entry is DisplayPayload => entry !== null)

      if (successfulPayloads.length === 0) {
        scheduleNextLoad(DESIGNATED_SEAT_DISPLAY_RETRY_MS)
        return
      }

      const nextDelay = Math.min(
        ...successfulPayloads.map((payload) => getDisplayRefreshDelay(payload.rotationExpiresAt)),
      )
      scheduleNextLoad(nextDelay)
    }

    void loadAll()
    return () => {
      cancelled = true
      if (nextLoadTimer) {
        clearTimeout(nextLoadTimer)
      }
    }
  }, [parsed, loadEntry])

  if (parsed.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-white">
        <p className="text-lg">?쒖떆??媛뺤쥖 ?몄뀡???놁뒿?덈떎.</p>
      </div>
    )
  }

  const count = entries.length
  const cols = count <= 2 ? count : 2
  const qrSize = count <= 1 ? 400 : count <= 2 ? 360 : 260

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 px-6 py-8 text-white">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">Designated Seat</p>
            <p className="mt-1 text-sm text-slate-500">
              QR? 15珥덈쭏??諛붾뚮ŉ, ?먯떊??媛뺤쥖 QR???ㅼ틪?섏꽭??
            </p>
          </div>
          <div className="rounded-[10px] border border-slate-800 bg-slate-900 px-5 py-3 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">?⑥? ?쒓컙</p>
            <p className="mt-1 text-3xl font-black text-emerald-300">
              {entries[0]?.payload
                ? Math.max(0, Math.ceil((new Date(entries[0].payload.rotationExpiresAt).getTime() - now) / 1000))
                : 0}
            </p>
          </div>
        </div>
      </div>

      <div
        className="mx-auto mt-8 grid w-full max-w-7xl flex-1 gap-6"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {entries.map((entry) => (
          <div key={entry.courseId} className="flex flex-col items-center gap-4">
            <div className="rounded-[10px] border border-slate-700 bg-slate-900 px-4 py-3 text-center">
              <h2 className={`${count <= 2 ? 'text-lg' : 'text-base'} font-bold text-white`}>
                {entry.payload?.course.name ?? `媛뺤쥖 #${entry.courseId}`}
              </h2>
            </div>

            {entry.error ? (
              <div className="flex flex-1 items-center justify-center rounded-[10px] border border-red-800 bg-red-950/50 p-8">
                <p className="text-sm text-red-400">{entry.error}</p>
              </div>
            ) : !entry.payload ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-white" />
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-[10px] bg-white p-6 shadow-2xl">
                <QRCodeSVG
                  value={entry.payload.rotationToken}
                  size={qrSize}
                  level="M"
                  includeMargin
                  bgColor="#ffffff"
                  fgColor="#111827"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mx-auto mt-6 w-full max-w-7xl">
        <div className="rounded-[10px] bg-slate-950/70 px-5 py-3 text-center text-xs text-slate-500">
          {entries
            .filter((e) => e.payload)
            .map((e) => `${e.payload!.course.name}: ${new Date(e.payload!.session.expires_at).toLocaleString('ko-KR')}源뚯?`)
            .join(' 쨌 ')}
        </div>
      </div>
    </div>
  )
}
