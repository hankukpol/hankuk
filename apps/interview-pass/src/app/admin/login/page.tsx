'use client'

import Link from 'next/link'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'

type LoginMode = 'pin' | 'shared'

type BootstrapStatus = {
  configured?: boolean
  bootstrapAllowed?: boolean
  message?: string
}

export default function AdminLoginPage() {
  const router = useRouter()
  const tenant = useTenantConfig()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [bootstrapAllowed, setBootstrapAllowed] = useState(true)
  const [bootstrapMessage, setBootstrapMessage] = useState('')
  const [mode, setMode] = useState<LoginMode>('pin')
  const [id, setId] = useState('')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/admin/bootstrap')
      .then((res) => res.json())
      .then((data: BootstrapStatus) => {
        setConfigured(Boolean(data.configured))
        setBootstrapAllowed(data.bootstrapAllowed !== false)
        setBootstrapMessage(data.message ?? '')
      })
      .catch(() => {
        setConfigured(true)
      })
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (mode === 'pin' && !pin) {
      setError('관리자 PIN을 입력해 주세요.')
      return
    }

    if (mode === 'shared') {
      if (!email.trim()) {
        setError('공용 인증 이메일을 입력해 주세요.')
        return
      }

      if (password.length < 6) {
        setError('공용 인증 비밀번호는 6자리 이상이어야 합니다.')
        return
      }
    }

    setLoading(true)
    setError('')

    const endpoint =
      mode === 'pin' ? '/api/auth/admin/login' : '/api/auth/admin/shared-login'
    const payload = mode === 'pin' ? { id, pin } : { email, password }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
              {bootstrapAllowed ? (
                <>
                  관리자 PIN이 아직 설정되지 않았습니다.{' '}
                  <Link
                    href={withTenantPrefix('/admin/setup', tenant.type)}
                    className="font-semibold underline"
                  >
                    초기 관리자 설정
                  </Link>
                  으로 먼저 진행해 주세요.
                </>
              ) : (
                bootstrapMessage || '현재 환경에서는 초기 관리자 설정이 비활성화되어 있습니다.'
              )}
            </div>
          ) : null}

          <div className="mb-5 flex overflow-hidden rounded-xl border border-gray-200">
            {([
              ['pin', 'PIN 로그인'],
              ['shared', '공용 인증 로그인'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value)
                  setError('')
                }}
                className="flex-1 py-2.5 text-sm font-medium transition-colors"
                style={
                  mode === value
                    ? { background: 'var(--theme)', color: '#fff' }
                    : { background: '#fff', color: '#6b7280' }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'shared' ? (
            <p className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
              공용 인증 로그인은 관리자 설정 화면에서 현재 division 관리자 아이디를 공용 인증
              계정에 연결한 뒤 사용할 수 있습니다.
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'pin' ? (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">관리자 아이디</label>
                  <input
                    type="text"
                    value={id}
                    onChange={(event) => setId(event.target.value)}
                    placeholder="설정하지 않았다면 비워 두세요."
                    autoComplete="username"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-blue-900 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">관리자 PIN</label>
                  <input
                    type="password"
                    value={pin}
                    onChange={(event) => setPin(event.target.value)}
                    placeholder="관리자 PIN"
                    inputMode="numeric"
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-blue-900 focus:outline-none"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">공용 인증 이메일</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="shared auth 이메일"
                    autoComplete="email"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-blue-900 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">공용 인증 비밀번호</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="공용 인증 비밀번호"
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-blue-900 focus:outline-none"
                  />
                </div>
              </>
            )}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={loading || (setupRequired && !bootstrapAllowed && mode === 'pin')}
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
