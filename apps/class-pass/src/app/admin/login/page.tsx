'use client'

import Link from 'next/link'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'

export default function AdminLoginPage() {
  const router = useRouter()
  const tenant = useTenantConfig()
  const [id, setId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)

    const response = await fetch('/api/auth/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pin }),
    })
    const payload = await response.json().catch(() => null)
    setLoading(false)

    if (!response.ok) {
      setError(payload?.error ?? '관리자 로그인에 실패했습니다.')
      return
    }

    router.push(withTenantPrefix('/dashboard', tenant.type))
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f8fafc] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">관리자 로그인</p>
        <h1 className="mt-3 text-3xl font-extrabold text-gray-900">{tenant.adminTitle}</h1>
        <p className="mt-2 text-sm text-gray-500">
          관리자 ID와 PIN으로 로그인해 강좌와 운영 설정을 관리합니다.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">관리자 ID</label>
            <input
              type="text"
              value={id}
              onChange={(event) => setId(event.target.value)}
              placeholder="설정하지 않았다면 비워 두세요"
              autoComplete="username"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-base text-gray-900 outline-none focus:border-slate-400"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">관리자 PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="PIN 입력"
              autoComplete="current-password"
              inputMode="numeric"
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

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
          초기 관리자 설정이 아직 되어 있지 않다면{' '}
          <Link href={withTenantPrefix('/admin/setup', tenant.type)} className="font-semibold underline">
            초기 관리자 설정
          </Link>
          에서 먼저 등록해 주세요.
        </div>
      </div>
    </div>
  )
}
