'use client'

import { getUserErrorMessage } from '@/lib/user-error-message'
import Link from 'next/link'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'

export default function AdminSetupPage() {
  const router = useRouter()
  const tenant = useTenantConfig()
  const [setupComplete, setSetupComplete] = useState(false)
  const [id, setId] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (pin.length < 4) {
      setError('관리자 PIN은 4자리 이상이어야 합니다.')
      return
    }

    if (pin !== confirmPin) {
      setError('관리자 PIN 확인 값이 일치하지 않습니다.')
      return
    }

    setLoading(true)
    setError('')

    const response = await fetch('/api/auth/admin/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pin }),
    })
    const payload = await response.json().catch(() => null)
    setLoading(false)

    if (!response.ok) {
      if (response.status === 409) {
        setSetupComplete(true)
      }
      setError(payload?.error ?? '초기 관리자 설정에 실패했습니다.')
      return
    }

    router.push(withTenantPrefix('/dashboard', tenant.type))
  }

  return (
    <div className="admin-auth-card">
        <p className="text-xs font-semibold text-gray-400">관리자 설정</p>
        <h1 className="admin-page-title mt-3">초기 관리자 설정</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          최초 한 번만 관리자 ID와 PIN을 등록합니다.
        </p>

        {setupComplete ? (
          <div className="mt-6 border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-800">
            관리자 설정이 이미 완료되어 있습니다.{' '}
            <Link href={withTenantPrefix('/admin/login', tenant.type)} className="font-semibold underline">
              관리자 로그인
            </Link>
            으로 이동해 주세요.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div className="border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-600">
              운영 환경에서는 bootstrap이 기본적으로 잠겨 있을 수 있습니다. 비활성 상태라면 운영 환경 변수를 확인해야 합니다.
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700">관리자 ID</label>
              <input
                type="text"
                value={id}
                onChange={(event) => setId(event.target.value)}
                placeholder="선택 사항"
                className="min-w-0 border border-slate-200 px-4 py-3 text-base text-gray-900 outline-none focus:border-slate-400"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700">관리자 PIN</label>
              <input
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder="4자리 이상"
                inputMode="numeric"
                className="min-w-0 border border-slate-200 px-4 py-3 text-base text-gray-900 outline-none focus:border-slate-400"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700">관리자 PIN 확인</label>
              <input
                type="password"
                value={confirmPin}
                onChange={(event) => setConfirmPin(event.target.value)}
                placeholder="한 번 더 입력"
                inputMode="numeric"
                className="min-w-0 border border-slate-200 px-4 py-3 text-base text-gray-900 outline-none focus:border-slate-400"
              />
            </div>

            {error ? <p className="text-sm text-red-600">{getUserErrorMessage(error)}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="admin-button admin-button-primary disabled:opacity-60"
            >
              {loading ? '설정 중...' : '관리자 설정 완료'}
            </button>
          </form>
        )}
    </div>
  )
}
