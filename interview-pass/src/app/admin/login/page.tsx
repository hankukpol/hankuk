'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'

export default function AdminLoginPage() {
  const router = useRouter()
  const tenant = useTenantConfig()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [id, setId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/admin/bootstrap')
      .then((res) => res.json())
      .then((data: { configured?: boolean }) => {
        setConfigured(Boolean(data.configured))
      })
      .catch(() => {
        setConfigured(true)
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!pin) {
      setError('관리자 PIN을 입력해 주세요.')
      return
    }

    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pin }),
    })

    const data = await res.json().catch(() => ({}))
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? '관리자 로그인에 실패했습니다.')
      return
    }

    router.push(withTenantPrefix('/dashboard', tenant.type))
  }

  const setupRequired = configured === false

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
          <h1 className="mb-6 text-center text-xl font-bold" style={{ color: 'var(--theme)' }}>
            관리자 로그인
          </h1>

          {setupRequired ? (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              관리자 PIN이 아직 설정되지 않았습니다.{' '}
              <Link href={withTenantPrefix('/admin/setup', tenant.type)} className="font-semibold underline">
                초기 관리자 설정
              </Link>
              으로 먼저 진행해 주세요.
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">관리자 아이디</label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="설정하지 않았다면 비워 두세요"
                autoComplete="username"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-blue-900 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">관리자 PIN</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="관리자 PIN"
                inputMode="numeric"
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-blue-900 focus:outline-none"
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={loading || setupRequired}
              className="w-full rounded-lg py-3 text-base font-medium text-white disabled:opacity-60"
              style={{ background: 'var(--theme)' }}
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
