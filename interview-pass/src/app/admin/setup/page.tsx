'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'

export default function AdminSetupPage() {
  const router = useRouter()
  const tenant = useTenantConfig()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [id, setId] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/admin/bootstrap')
      .then((res) => res.json())
      .then((data: { configured?: boolean }) => {
        setConfigured(Boolean(data.configured))
      })
      .catch(() => {
        setError('초기 설정 상태를 확인하지 못했습니다.')
        setConfigured(false)
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (pin.length < 4) {
      setError('관리자 PIN은 4자리 이상이어야 합니다.')
      return
    }

    if (pin !== confirmPin) {
      setError('관리자 PIN 확인값이 일치하지 않습니다.')
      return
    }

    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/admin/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pin }),
    })

    const data = await res.json().catch(() => ({}))
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? '초기 관리자 설정에 실패했습니다.')
      if (res.status === 409) {
        setConfigured(true)
      }
      return
    }

    router.push(withTenantPrefix('/dashboard', tenant.type))
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-md">
        <h1 className="mb-2 text-center text-2xl font-bold" style={{ color: 'var(--theme)' }}>
          초기 관리자 설정
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          관리자 PIN이 아직 없을 때만 한 번 설정할 수 있습니다.
        </p>

        {configured === null ? (
          <p className="text-center text-sm text-gray-500">설정 상태를 확인하는 중입니다.</p>
        ) : configured ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              관리자 설정이 이미 완료되었습니다. 관리자 로그인으로 이동해 주세요.
            </div>
            <Link
              href={withTenantPrefix('/admin/login', tenant.type)}
              className="block w-full rounded-lg py-3 text-center text-base font-medium text-white"
              style={{ background: 'var(--theme)' }}
            >
              관리자 로그인으로 이동
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">관리자 아이디</label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="선택 사항입니다"
                autoComplete="username"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-blue-900 focus:outline-none"
              />
              <p className="text-xs text-gray-500">비워 두면 PIN만으로 로그인할 수 있습니다.</p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">관리자 PIN</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="4자리 이상 입력"
                autoComplete="new-password"
                inputMode="numeric"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-blue-900 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">관리자 PIN 확인</label>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="같은 PIN을 다시 입력"
                autoComplete="new-password"
                inputMode="numeric"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-blue-900 focus:outline-none"
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-3 text-base font-medium text-white disabled:opacity-60"
              style={{ background: 'var(--theme)' }}
            >
              {loading ? '설정 중...' : '관리자 설정 완료'}
            </button>

            <Link href={withTenantPrefix('/admin/login', tenant.type)} className="block text-center text-sm text-gray-500 underline">
              관리자 로그인이 이미 가능하면 여기로 이동
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
