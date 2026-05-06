'use client'

import { QRCodeSVG } from 'qrcode.react'
import { useParams } from 'next/navigation'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  DESIGNATED_SEAT_DISPLAY_INACTIVE_RETRY_MS,
  DESIGNATED_SEAT_DISPLAY_RETRY_MS,
  getDisplayRefreshDelay,
} from '@/lib/designated-seat/display-runtime'
import { buildDesignatedSeatQrValue } from '@/lib/designated-seat/scan'

type ActiveDisplayPayload = {
  status: 'active'
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
  device: {
    id: number
    name: string
  }
}

type InactiveDisplayPayload = {
  status: 'inactive'
  course: {
    id: number
    name: string
  }
  message: string
}

type RegistrationPayload = {
  status: 'registration_required'
  course?: {
    id: number
    name: string
  }
  error: string
}

type DisplayPayload = ActiveDisplayPayload | InactiveDisplayPayload

async function readJson<T>(response: Response) {
  return response.json().catch(() => null) as Promise<T | null>
}

export default function DesignatedSeatDisplayPage() {
  const params = useParams<{ courseId: string }>()
  const courseId = Number(params.courseId)

  const [payload, setPayload] = useState<DisplayPayload | null>(null)
  const [registrationRequired, setRegistrationRequired] = useState<RegistrationPayload | null>(null)
  const [registrationCode, setRegistrationCode] = useState('')
  const [registrationMessage, setRegistrationMessage] = useState('')
  const [registrationSubmitting, setRegistrationSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      setError('표시할 강좌 정보가 올바르지 않습니다.')
      return
    }

    let cancelled = false
    let nextLoadTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleNextLoad = (delayMs: number) => {
      nextLoadTimer = setTimeout(() => {
        void loadAndSchedule()
      }, delayMs)
    }

    const loadAndSchedule = async () => {
      try {
        const response = await fetch(`/api/designated-seats/display?courseId=${courseId}`, {
          cache: 'no-store',
        })
        const result = await readJson<DisplayPayload | RegistrationPayload | { error?: string }>(response)

        if (cancelled) {
          return
        }

        if (result && 'status' in result && result.status === 'registration_required') {
          setRegistrationRequired(result)
          setPayload(null)
          setError('')
          return
        }

        if (!response.ok) {
          const errorMessage = result && 'error' in result ? result.error : null
          throw new Error(errorMessage ?? '현장 QR 정보를 불러오지 못했습니다.')
        }

        const nextPayload = result as DisplayPayload
        setPayload(nextPayload)
        setRegistrationRequired(null)
        setError('')

        scheduleNextLoad(
          nextPayload.status === 'active'
            ? getDisplayRefreshDelay(nextPayload.rotationExpiresAt)
            : DESIGNATED_SEAT_DISPLAY_INACTIVE_RETRY_MS,
        )
      } catch (reason) {
        if (cancelled) {
          return
        }

        setError(reason instanceof Error ? reason.message : '현장 QR 정보를 불러오지 못했습니다.')
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
  }, [courseId])

  const remainingSeconds = useMemo(() => {
    if (!payload || payload.status !== 'active') {
      return 0
    }

    return Math.max(0, Math.ceil((new Date(payload.rotationExpiresAt).getTime() - now) / 1000))
  }, [now, payload])

  const qrValue = useMemo(() => {
    if (!payload || payload.status !== 'active') {
      return ''
    }

    return buildDesignatedSeatQrValue(payload.rotationToken)
  }, [payload])

  async function handleRegister(event: FormEvent) {
    event.preventDefault()
    if (!Number.isInteger(courseId) || courseId <= 0 || registrationSubmitting) {
      return
    }

    setRegistrationSubmitting(true)
    setRegistrationMessage('')
    setError('')

    const response = await fetch('/api/designated-seats/display/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        code: registrationCode.trim(),
      }),
    })
    const result = await readJson<{ error?: string; success?: boolean }>(response)
    setRegistrationSubmitting(false)

    if (!response.ok || !result?.success) {
      setRegistrationMessage(result?.error ?? '표시 기기 등록에 실패했습니다.')
      return
    }

    setRegistrationCode('')
    setRegistrationRequired(null)
    setRegistrationMessage('기기 등록이 완료되었습니다. QR 화면을 불러오는 중입니다.')
    window.setTimeout(() => window.location.reload(), 600)
  }

  if (registrationRequired) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f5f5f7] px-6 text-[#1d1d1f]">
        <main className="w-full max-w-md rounded-[8px] bg-white p-6 shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#86868b]">Display Registration</p>
          <h1 className="mt-3 text-2xl font-semibold leading-tight">
            {registrationRequired.course?.name ?? '지정좌석 QR'} 표시 기기 등록
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#86868b]">
            관리자 화면에서 발급한 6자리 등록 코드를 입력하면 이 브라우저에서만 QR 표시가 허용됩니다.
          </p>

          <p className="mt-2 text-xs leading-5 text-[#86868b]">
            브라우저 쿠키가 삭제되거나 브라우저 정책으로 만료되면 같은 PC라도 재등록이 필요합니다.
          </p>

          <form onSubmit={handleRegister} className="mt-6 flex flex-col gap-3">
            <input
              value={registrationCode}
              onChange={(event) => setRegistrationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              pattern="\d{6}"
              placeholder="6자리 코드"
              className="h-14 rounded-[8px] border border-[#d2d2d7] px-4 text-center text-2xl font-semibold tracking-[0.24em] outline-none transition focus:border-[#0071e3]"
              autoFocus
            />
            <button
              type="submit"
              disabled={registrationSubmitting || registrationCode.length !== 6}
              className="h-12 rounded-[8px] bg-[#0071e3] text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {registrationSubmitting ? '등록 중...' : '이 기기 등록'}
            </button>
          </form>

          {registrationMessage ? (
            <p className="mt-4 text-sm font-medium text-[#1d1d1f]">{registrationMessage}</p>
          ) : null}
        </main>
      </div>
    )
  }

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

  if (payload.status === 'inactive') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-8 text-center text-white">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">Designated Seat</p>
        <h1 className="mt-4 text-4xl font-black">{payload.course.name}</h1>
        <p className="mt-6 text-2xl font-semibold text-slate-200">{payload.message}</p>
        <p className="mt-3 text-sm text-slate-500">스케줄 시간이 되면 QR이 자동으로 표시됩니다.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 px-8 py-10 text-white">
      <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">Designated Seat</p>
          <h1 className="mt-3 text-4xl font-black">{payload.course.name}</h1>
          <p className="mt-3 text-lg text-slate-300">학생에게 보여줄 지정좌석 인증 QR입니다.</p>
          <p className="mt-2 text-sm text-slate-500">
            QR은 15초마다 바뀌며, 이 화면은 등록된 표시 기기에서만 열립니다.
          </p>
        </div>

        <div className="rounded-[10px] border border-slate-800 bg-slate-900 px-6 py-5 text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">남은 시간</p>
          <p className="mt-3 text-5xl font-black text-emerald-300">{remainingSeconds}</p>
        </div>
      </div>

      <div className="mx-auto mt-10 flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-8">
        <div className="flex items-center justify-center rounded-[10px] bg-white p-8 shadow-2xl">
          <QRCodeSVG
            value={qrValue}
            size={520}
            level="M"
            includeMargin
            bgColor="#ffffff"
            fgColor="#111827"
          />
        </div>

        <div className="rounded-[10px] bg-slate-950/70 px-5 py-4 text-center text-sm text-slate-400">
          <p>세션 만료: {new Date(payload.session.expires_at).toLocaleString('ko-KR')}</p>
          <p className="mt-1">표시 기기: {payload.device.name}</p>
        </div>
      </div>
    </div>
  )
}
