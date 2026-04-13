'use client'

import { QRCodeSVG } from 'qrcode.react'
import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  DESIGNATED_SEAT_DISPLAY_RETRY_MS,
  getDisplayRefreshDelay,
} from '@/lib/designated-seat/display-runtime'

type DisplayPayload = {
  course: {
    id: number
    name: string
  }
  session: {
    id: number
    expires_at: string
  }
  rotationToken: string
  rotationExpiresAt: string
}

export default function DesignatedSeatDisplayPage() {
  const params = useParams<{ courseId: string }>()
  const searchParams = useSearchParams()
  const courseId = Number(params.courseId)
  const token = searchParams.get('token') ?? ''

  const [payload, setPayload] = useState<DisplayPayload | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!Number.isInteger(courseId) || courseId <= 0 || !token) {
      setError('?쒖떆 ?몄뀡???щ컮瑜댁? ?딆뒿?덈떎.')
      return
    }

    let cancelled = false
    let nextLoadTimer: ReturnType<typeof setTimeout> | null = null

    async function load() {
      const response = await fetch(`/api/designated-seats/display?courseId=${courseId}&token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error((result as { error?: string } | null)?.error ?? '?꾩옣 QR ?뺣낫瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??')
      }

      return result as DisplayPayload
    }

    const scheduleNextLoad = (delayMs: number) => {
      nextLoadTimer = setTimeout(() => {
        void loadAndSchedule()
      }, delayMs)
    }

    const loadAndSchedule = async () => {
      try {
        const nextPayload = await load()
        if (cancelled) {
          return
        }

        setPayload(nextPayload)
        setError('')
        scheduleNextLoad(getDisplayRefreshDelay(nextPayload.rotationExpiresAt))
      } catch (reason) {
        if (cancelled) {
          return
        }

        setError(reason instanceof Error ? reason.message : '?꾩옣 QR ?뺣낫瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??')
        scheduleNextLoad(DESIGNATED_SEAT_DISPLAY_RETRY_MS)
      }
    }

    void loadAndSchedule()

    return () => {
      cancelled = true
      if (nextLoadTimer) {
        clearTimeout(nextLoadTimer)
      }
    }
  }, [courseId, token])

  const remainingSeconds = useMemo(() => {
    if (!payload) {
      return 0
    }

    return Math.max(0, Math.ceil((new Date(payload.rotationExpiresAt).getTime() - now) / 1000))
  }, [now, payload])

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 px-8 text-center text-white">
        <p className="text-lg font-semibold">{error}</p>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 px-8 py-10 text-white">
      <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">Designated Seat</p>
          <h1 className="mt-3 text-4xl font-black">{payload.course.name}</h1>
          <p className="mt-3 text-lg text-slate-300">?꾨옒 QR???ㅼ틪????醫뚯꽍???좏깮?섏꽭??</p>
          <p className="mt-2 text-sm text-slate-500">
            QR? 15珥덈쭏??諛붾뚮ŉ, 醫뚯꽍??蹂寃쏀븷 ?뚮쭏???ㅼ떆 ?몄쬆?댁빞 ?⑸땲??
          </p>
        </div>

        <div className="rounded-[10px] border border-slate-800 bg-slate-900 px-6 py-5 text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">?⑥? ?쒓컙</p>
          <p className="mt-3 text-5xl font-black text-emerald-300">{remainingSeconds}</p>
        </div>
      </div>

      <div className="mx-auto mt-10 flex w-full max-w-6xl flex-1 flex-col items-center gap-8">
        <div className="flex items-center justify-center rounded-[10px] bg-white p-8 shadow-2xl">
          <QRCodeSVG
            value={payload.rotationToken}
            size={520}
            level="M"
            includeMargin
            bgColor="#ffffff"
            fgColor="#111827"
          />
        </div>

        <div className="rounded-[10px] bg-slate-950/70 px-5 py-4 text-center text-sm text-slate-400">
          <p>?몄뀡 留뚮즺: {new Date(payload.session.expires_at).toLocaleString('ko-KR')}</p>
          <p className="mt-1">???섏씠吏 URL???몃?濡??좎텧?섎㈃ 利됱떆 愿由ъ옄 ?붾㈃?먯꽌 ?쒖떆瑜?醫낅즺?댁＜?몄슂.</p>
        </div>
      </div>
    </div>
  )
}
