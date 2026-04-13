'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'

export default function StaffLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenant = useTenantConfig()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function getRedirect() {
    const redirect = searchParams.get('redirect')
    const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : null
    return safeRedirect ? withTenantPrefix(safeRedirect, tenant.type) : withTenantPrefix('/scan', tenant.type)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)

    const response = await fetch('/api/auth/staff/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    const payload = await response.json().catch(() => null)
    setLoading(false)

    if (!response.ok) {
      setError(payload?.error ?? '직원 로그인에 실패했습니다.')
      return
    }

    router.push(getRedirect())
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f8fafc] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">직원 로그인</p>
        <h1 className="mt-3 text-3xl font-extrabold text-gray-900">직원 로그인</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          자료 배부와 QR 스캔을 위해 직원 PIN으로 로그인합니다.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">직원 PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="PIN 입력"
              inputMode="numeric"
              autoComplete="current-password"
              autoFocus
              className="rounded-2xl border border-slate-200 px-4 py-3 text-base text-gray-900 outline-none focus:border-slate-400"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl px-5 py-4 text-lg font-bold text-white disabled:opacity-60"
            style={{ background: 'var(--theme)' }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
