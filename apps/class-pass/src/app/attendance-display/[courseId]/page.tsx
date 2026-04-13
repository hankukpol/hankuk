'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  ATTENDANCE_DISPLAY_RETRY_MS,
  getAttendanceDisplayRefreshDelay,
} from '@/lib/attendance/display-runtime'

type DisplayPayload = {
  course: {
    id: number
    name: string
  }
  session: {
    id: number
    expires_at: string
  }
  rotationCode: string
  rotationExpiresAt: string
}

export default function AttendanceDisplayPage() {
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
      setError('잘못된 출석 세션 주소입니다.')
      return
    }

    let cancelled = false
    let nextLoadTimer: ReturnType<typeof setTimeout> | null = null

    async function load() {
      const response = await fetch(`/api/attendance/display?courseId=${courseId}&token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error((result as { error?: string } | null)?.error ?? '출석 세션을 불러오지 못했습니다.')
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
        scheduleNextLoad(getAttendanceDisplayRefreshDelay(nextPayload.rotationExpiresAt))
      } catch (reason) {
        if (cancelled) {
          return
        }

        setError(reason instanceof Error ? reason.message : '출석 세션을 불러오지 못했습니다.')
        scheduleNextLoad(ATTENDANCE_DISPLAY_RETRY_MS)
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
      <div className="flex min-h-dvh items-center justify-center bg-[#050816] px-8 text-center text-white">
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-300">Attendance Check</p>
          <p className="mt-4 text-2xl font-semibold">{error}</p>
        </div>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#050816] text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/15 border-t-white" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.16),_transparent_28%),linear-gradient(180deg,#040816_0%,#0b1222_55%,#111827_100%)] px-8 py-10 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-300">Attendance Check</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">{payload.course.name}</h1>
            <p className="mt-3 text-lg text-slate-300">학생은 휴대폰에서 출석 페이지를 열고 아래 6자리 숫자를 입력하면 됩니다.</p>
            <p className="mt-2 text-sm text-slate-500">코드는 30초마다 바뀌며, 출석 세션이 끝나면 자동으로 더 이상 제출되지 않습니다.</p>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-white/5 px-6 py-5 text-right backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Next Rotation</p>
            <p className="mt-3 text-6xl font-black text-emerald-300">{remainingSeconds}</p>
          </div>
        </div>

        <div className="rounded-[36px] border border-white/10 bg-white/[0.04] px-10 py-14 shadow-2xl backdrop-blur">
          <div className="flex flex-col items-center text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-slate-400">Current Code</p>
            <div className="mt-8 rounded-[28px] border border-emerald-400/25 bg-[#07111f] px-10 py-8 shadow-[0_0_80px_rgba(16,185,129,0.12)]">
              <p className="font-mono text-[clamp(4.5rem,16vw,10rem)] font-black tracking-[0.3em] text-emerald-300">
                {payload.rotationCode}
              </p>
            </div>

            <p className="mt-8 text-2xl font-semibold text-slate-100">코드를 학생 페이지에 그대로 입력하세요.</p>
            <p className="mt-3 text-base text-slate-400">기기 잠금이 켜져 있어 같은 기기로 다른 학생 출석을 대신 입력할 수 없습니다.</p>

            <div className="mt-10 grid w-full gap-4 md:grid-cols-2">
              <div className="rounded-[20px] border border-white/10 bg-black/20 px-5 py-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Code Expires</p>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {new Date(payload.rotationExpiresAt).toLocaleString('ko-KR')}
                </p>
              </div>
              <div className="rounded-[20px] border border-white/10 bg-black/20 px-5 py-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Session Ends</p>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {new Date(payload.session.expires_at).toLocaleString('ko-KR')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
