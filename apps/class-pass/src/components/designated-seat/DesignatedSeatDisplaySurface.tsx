'use client'

import { QRCodeSVG } from 'qrcode.react'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  DESIGNATED_SEAT_DISPLAY_INACTIVE_RETRY_MS,
  DESIGNATED_SEAT_DISPLAY_RETRY_MS,
  getDisplayRefreshDelay,
} from '@/lib/designated-seat/display-runtime'
import {
  getDesignatedSeatCompactQrFrameWidth,
  getDesignatedSeatQrSize,
} from '@/lib/designated-seat/display-layout'
import { buildDesignatedSeatQrValue } from '@/lib/designated-seat/scan'

export type DesignatedSeatDisplayClientTarget =
  | {
    type: 'course'
    courseId: number
    roomId?: number | null
    label?: string
  }
  | {
    type: 'slot'
    slotKey: string
    roomId?: number | null
    label?: string
  }

type ActiveDisplayPayload = {
  status: 'active'
  course: {
    id: number
    name: string
  }
  slot?: {
    id: number
    key: string
    label: string
  } | null
  session: {
    id: number
    expires_at: string
  }
  room?: {
    id: number
    name: string
  } | null
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
  slot?: {
    id: number
    key: string
    label: string
  } | null
  message: string
}

type RegistrationPayload = {
  status: 'registration_required'
  course?: {
    id: number
    name: string
  }
  slot?: {
    id: number
    key: string
    label: string
  } | null
  error: string
}

type DisplayPayload = ActiveDisplayPayload | InactiveDisplayPayload

async function readJson<T>(response: Response) {
  return response.json().catch(() => null) as Promise<T | null>
}

function buildTargetQuery(target: DesignatedSeatDisplayClientTarget) {
  const query = new URLSearchParams()
  if (target.type === 'slot') {
    query.set('slotKey', target.slotKey)
  } else {
    query.set('courseId', String(target.courseId))
  }
  if (target.roomId) {
    query.set('roomId', String(target.roomId))
  }

  return query.toString()
}

function buildRegisterBody(target: DesignatedSeatDisplayClientTarget, code: string) {
  return target.type === 'slot'
    ? {
      slotKey: target.slotKey,
      code,
    }
    : {
      courseId: target.courseId,
      code,
    }
}

function getTargetFallbackLabel(target: DesignatedSeatDisplayClientTarget) {
  return target.label ?? (target.type === 'slot' ? target.slotKey : `Course ${target.courseId}`)
}

type DesignatedSeatDisplayTileProps = {
  target: DesignatedSeatDisplayClientTarget
  compact?: boolean
  targetCount?: number
}

function DesignatedSeatDisplayTile({ target, compact = false, targetCount = 1 }: DesignatedSeatDisplayTileProps) {
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
    if (
      (target.type === 'course' && (!Number.isInteger(target.courseId) || target.courseId <= 0))
      || (target.type === 'slot' && !target.slotKey)
    ) {
      setError('표시 대상 정보가 올바르지 않습니다.')
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
        const response = await fetch(`/api/designated-seats/display?${buildTargetQuery(target)}`, {
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
  }, [target])

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
    if (registrationSubmitting) {
      return
    }

    setRegistrationSubmitting(true)
    setRegistrationMessage('')
    setError('')

    const response = await fetch('/api/designated-seats/display/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRegisterBody(target, registrationCode.trim())),
    })
    const result = await readJson<{ error?: string; success?: boolean }>(response)
    setRegistrationSubmitting(false)

    if (!response.ok || !result?.success) {
      setRegistrationMessage(result?.error ?? '표시기기 등록에 실패했습니다.')
      return
    }

    setRegistrationCode('')
    setRegistrationRequired(null)
    setRegistrationMessage('기기 등록이 완료되었습니다. QR 화면을 불러오는 중입니다.')
    window.setTimeout(() => window.location.reload(), 600)
  }

  const slotLabel = payload?.slot?.label ?? registrationRequired?.slot?.label ?? (target.type === 'slot' ? getTargetFallbackLabel(target) : null)
  const courseName = payload?.course.name ?? registrationRequired?.course?.name ?? getTargetFallbackLabel(target)
  const roomLabel = payload?.status === 'active' ? payload.room?.name ?? null : null
  const qrSize = getDesignatedSeatQrSize(targetCount, compact)
  const qrFrameWidth = compact ? getDesignatedSeatCompactQrFrameWidth(targetCount) : undefined

  if (registrationRequired) {
    return (
      <div className={`${compact ? 'min-h-[520px]' : 'min-h-dvh'} flex items-center justify-center bg-[#f5f5f7] px-6 text-[#1d1d1f]`}>
        <main className="w-full max-w-md rounded-[8px] bg-white p-6 shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#86868b]">Display Registration</p>
          <h1 className="mt-3 text-2xl font-semibold leading-tight">
            {slotLabel ? `${slotLabel} · ` : ''}{courseName} 표시기기 등록
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
              autoFocus={!compact}
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
      <div className={`${compact ? 'min-h-[520px]' : 'min-h-dvh'} flex items-center justify-center bg-slate-950 px-8 text-center text-white`}>
        <p className="text-lg font-semibold">{error}</p>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className={`${compact ? 'min-h-[520px]' : 'min-h-dvh'} flex items-center justify-center bg-slate-950 text-white`}>
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
      </div>
    )
  }

  if (payload.status === 'inactive') {
    return (
      <div className={`${compact ? 'min-h-[520px]' : 'min-h-dvh'} flex flex-col items-center justify-center bg-slate-950 px-8 text-center text-white`}>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">Designated Seat</p>
        {slotLabel ? <p className="mt-3 text-lg font-bold text-sky-100">{slotLabel}</p> : null}
        <h1 className={`${compact ? 'mt-2 text-2xl' : 'mt-4 text-4xl'} font-black`}>{payload.course.name}</h1>
        <p className={`${compact ? 'mt-4 text-lg' : 'mt-6 text-2xl'} font-semibold text-slate-200`}>{payload.message}</p>
        <p className="mt-3 text-sm text-slate-500">스케줄 시간이 되면 QR이 자동으로 표시됩니다.</p>
      </div>
    )
  }

  return (
    <div className={`${compact ? `min-h-[calc(100dvh-96px)] ${targetCount === 2 ? 'px-4' : 'px-5'} py-6` : 'min-h-dvh px-8 py-10'} flex flex-col bg-slate-950 text-white`}>
      <div className={`mx-auto flex w-full ${compact ? 'max-w-2xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between' : 'max-w-6xl items-start justify-between gap-8'}`}>
        <div className={compact ? 'min-w-0' : ''}>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">Designated Seat</p>
          {slotLabel ? <p className="mt-3 text-lg font-bold text-sky-100">{slotLabel}</p> : null}
          {roomLabel ? <p className="mt-2 text-base font-bold text-emerald-200">{roomLabel}</p> : null}
          <h1 className={`${compact ? 'mt-2 text-2xl' : 'mt-3 text-4xl'} font-black`}>{payload.course.name}</h1>
          <p className={`${compact ? 'mt-2 text-sm' : 'mt-3 text-lg'} text-slate-300`}>학생에게 보여줄 지정좌석 인증 QR입니다.</p>
          {!compact ? (
            <p className="mt-2 text-sm text-slate-500">
              QR은 15초마다 바뀌며, 등록된 표시기기에서만 열립니다.
            </p>
          ) : null}
        </div>

        <div className={`${compact ? 'shrink-0 self-start' : ''} rounded-[10px] border border-slate-800 bg-slate-900 px-5 py-4 text-right`}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">남은 시간</p>
          <p className={`${compact ? 'text-4xl' : 'text-5xl'} mt-2 font-black text-emerald-300`}>{remainingSeconds}</p>
        </div>
      </div>

      <div className={`mx-auto ${compact ? 'mt-4 gap-4' : 'mt-10 gap-6'} flex w-full max-w-6xl flex-1 flex-col items-center justify-center`}>
        <div
          className="flex items-center justify-center rounded-[10px] bg-white p-5 shadow-2xl"
          style={qrFrameWidth ? { width: qrFrameWidth } : undefined}
        >
          <QRCodeSVG
            value={qrValue}
            size={qrSize}
            level="M"
            includeMargin
            bgColor="#ffffff"
            fgColor="#111827"
            className={compact ? 'h-auto w-full' : 'h-auto max-w-full'}
          />
        </div>

        <div className="rounded-[10px] bg-slate-950/70 px-5 py-4 text-center text-sm text-slate-400">
          <p>세션 만료: {new Date(payload.session.expires_at).toLocaleString('ko-KR')}</p>
          <p className="mt-1">표시기기: {payload.device.name}</p>
        </div>
      </div>
    </div>
  )
}

export function DesignatedSeatDisplaySurface({
  targets,
}: {
  targets: DesignatedSeatDisplayClientTarget[]
}) {
  if (targets.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 px-6 text-center text-white">
        <main className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-300">Designated Seat</p>
          <h1 className="mt-4 text-3xl font-black">표시할 QR 슬롯이 없습니다.</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            관리자 화면에서 고정 표시 슬롯을 만들고 멀티 표시 URL에 슬롯을 추가해 주세요.
          </p>
        </main>
      </div>
    )
  }

  if (targets.length === 1) {
    return <DesignatedSeatDisplayTile target={targets[0]} />
  }

  return (
    <div className={`min-h-dvh bg-slate-950 p-4 text-white ${targets.length === 2 ? '' : 'sm:p-6'}`}>
      <div className="mb-4 flex flex-col gap-1 px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">Designated Seat Multi Display</p>
        <h1 className="text-2xl font-black">지정좌석 QR 멀티 표시</h1>
      </div>
      <div className={`grid gap-4 lg:grid-cols-2 ${targets.length >= 3 ? '2xl:grid-cols-3' : ''}`}>
        {targets.map((target) => (
          <div key={target.type === 'slot' ? `slot-${target.slotKey}` : `course-${target.courseId}`} className="overflow-hidden rounded-[8px] bg-slate-900">
            <DesignatedSeatDisplayTile target={target} compact targetCount={targets.length} />
          </div>
        ))}
      </div>
    </div>
  )
}
