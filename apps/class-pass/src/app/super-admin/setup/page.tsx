'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SuperAdminSetupPage() {
  const router = useRouter()
  const [loginId, setLoginId] = useState('')
  const [displayName, setDisplayName] = useState('Class Pass Super Admin')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pin !== confirmPin) {
      setError('PIN 확인 값이 일치하지 않습니다.')
      return
    }

    setError('')
    setLoading(true)
    const response = await fetch('/api/auth/super-admin/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, displayName, pin }),
    })
    const payload = await response.json().catch(() => null)
    setLoading(false)

    if (!response.ok) {
      setError(payload?.error ?? '슈퍼 관리자 초기 설정에 실패했습니다.')
      return
    }

    router.push('/super-admin/manage')
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-73px)] w-full max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Bootstrap
        </p>
        <h2 className="mt-3 text-3xl font-extrabold text-slate-900">
          슈퍼 관리자 초기 설정
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          최초 한 번만 전역 관리자 계정을 생성합니다.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <input
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            placeholder="로그인 ID"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-400"
          />
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="표시 이름"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-400"
          />
          <input
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="PIN"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-400"
          />
          <input
            type="password"
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value)}
            placeholder="PIN 확인"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-900 outline-none focus:border-slate-400"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-slate-900 px-5 py-4 text-lg font-bold text-white disabled:opacity-60"
          >
            {loading ? '설정 중...' : '초기 설정 완료'}
          </button>
        </form>
      </div>
    </div>
  )
}
