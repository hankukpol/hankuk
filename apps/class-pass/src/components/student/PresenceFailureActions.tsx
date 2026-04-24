'use client'

import { useState } from 'react'
import type { BrowserContext } from '@/lib/client/browser-env'
import type { ClientPresenceErrorCode } from '@/lib/client/geolocation'
import { withTenantPrefix } from '@/lib/tenant'
import { useTenantConfig } from '@/components/TenantProvider'

type PresenceFailureActionsProps = {
  courseId: number
  enrollmentId: number
  name: string
  phone: string
  feature: 'attendance' | 'designated_seat'
  browserContext?: BrowserContext
  errorCode?: ClientPresenceErrorCode | string
  message?: string
  onRetry: () => void
}

export function PresenceFailureActions({
  courseId,
  enrollmentId,
  name,
  phone,
  feature,
  browserContext,
  errorCode,
  message,
  onRetry,
}: PresenceFailureActionsProps) {
  const tenant = useTenantConfig()
  const [requesting, setRequesting] = useState(false)
  const [requestMessage, setRequestMessage] = useState('')

  async function handleExceptionRequest() {
    setRequesting(true)
    setRequestMessage('')

    const response = await fetch(withTenantPrefix('/api/presence/exception-request', tenant.type), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        enrollmentId,
        name,
        phone,
        feature,
        browserContext,
        errorCode,
        message,
      }),
    })
    const payload = await response.json().catch(() => null)
    setRequesting(false)
    setRequestMessage(
      response.ok
        ? payload?.message ?? '관리자 확인 요청을 보냈습니다.'
        : payload?.error ?? '관리자 확인 요청을 보내지 못했습니다.',
    )
  }

  return (
    <div className="student-card-muted mt-3 px-4 py-3">
      <p className="text-[13px] leading-5 text-[var(--student-text-muted)]">
        카카오톡에서 실패하면 Safari/Chrome으로 다시 열거나 홈 화면 바로가기를 사용해 주세요.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onRetry}
          className="student-pill-button student-pill-outline w-full"
        >
          위치 다시 확인
        </button>
        <button
          type="button"
          onClick={() => void handleExceptionRequest()}
          disabled={requesting}
          className="student-pill-button student-pill-secondary w-full disabled:opacity-50"
        >
          {requesting ? '요청 중...' : '관리자 확인 요청'}
        </button>
      </div>
      {requestMessage ? (
        <p className="mt-2 text-[12px] font-medium text-[var(--student-link)]">{requestMessage}</p>
      ) : null}
    </div>
  )
}
