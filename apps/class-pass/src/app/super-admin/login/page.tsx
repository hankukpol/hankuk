'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SuperAdminLoginPage() {
  const router = useRouter()
  const [loginId, setLoginId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)

    const response = await fetch('/api/auth/super-admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, pin }),
    })
    const payload = await response.json().catch(() => null)
    setLoading(false)

    if (!response.ok) {
      setError(payload?.error ?? '슈퍼 관리자 로그인에 실패했습니다.')
      return
    }

    router.push('/super-admin/manage')
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-73px)] w-full max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Super Admin
        </p>
        <h2 className="mt-3 text-3xl font-extrabold text-slate-900">
          전역 관리자 로그인
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          지점과 운영자 계정을 관리하는 전역 관리자 화면입니다.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700">로그인 ID</label>
            <input
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-400"
              autoComplete="username"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700">PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-400"
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-slate-900 px-5 py-4 text-lg font-bold text-white disabled:opacity-60"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
