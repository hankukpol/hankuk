'use client'

import type { FormEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'

const SAVED_SCAN_LOGIN_STORAGE_PREFIX = 'class_pass_scan_login'

type SavedScanLogin = {
  loginId: string
  pin: string
  savedAt: number
}

function getSavedScanLoginStorageKey(division: string) {
  return `${SAVED_SCAN_LOGIN_STORAGE_PREFIX}:${division}`
}

function readSavedScanLogin(storageKey: string): SavedScanLogin | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<SavedScanLogin>
    if (typeof parsed.loginId !== 'string' || typeof parsed.pin !== 'string' || !parsed.pin) {
      return null
    }

    return {
      loginId: parsed.loginId,
      pin: parsed.pin,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    }
  } catch {
    return null
  }
}

function writeSavedScanLogin(storageKey: string, credentials: Pick<SavedScanLogin, 'loginId' | 'pin'>) {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      loginId: credentials.loginId,
      pin: credentials.pin,
      savedAt: Date.now(),
    }),
  )
}

function clearSavedScanLogin(storageKey: string) {
  window.localStorage.removeItem(storageKey)
}

export default function StaffLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenant = useTenantConfig()
  const autoLoginAttemptedRef = useRef(false)
  const savedLoginStorageKey = getSavedScanLoginStorageKey(tenant.type)
  const [loginId, setLoginId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasSavedLogin, setHasSavedLogin] = useState(false)

  const getRedirect = useCallback(() => {
    const redirect = searchParams.get('redirect')
    const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : null
    return safeRedirect ? withTenantPrefix(safeRedirect, tenant.type) : withTenantPrefix('/scan', tenant.type)
  }, [searchParams, tenant.type])

  const submitLogin = useCallback(async (
    credentials: Pick<SavedScanLogin, 'loginId' | 'pin'>,
    options: { auto?: boolean } = {},
  ) => {
    setError('')
    setLoading(true)

    const response = await fetch('/api/auth/staff/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loginId: credentials.loginId,
        pin: credentials.pin,
      }),
    })
    const payload = await response.json().catch(() => null)
    setLoading(false)

    if (!response.ok) {
      if (options.auto) {
        clearSavedScanLogin(savedLoginStorageKey)
        setHasSavedLogin(false)
        setPin('')
        setError('저장된 로그인 정보가 변경되었거나 만료되었습니다. 다시 입력해 주세요.')
        return
      }

      setError(payload?.error ?? '직원 로그인에 실패했습니다.')
      return
    }

    try {
      writeSavedScanLogin(savedLoginStorageKey, credentials)
      setHasSavedLogin(true)
    } catch {
      // Storage can fail in private browsing. Login should still succeed.
    }

    router.push(getRedirect())
  }, [getRedirect, router, savedLoginStorageKey])

  useEffect(() => {
    if (autoLoginAttemptedRef.current) {
      return
    }

    autoLoginAttemptedRef.current = true
    const savedLogin = readSavedScanLogin(savedLoginStorageKey)
    if (!savedLogin) {
      return
    }

    setLoginId(savedLogin.loginId)
    setPin(savedLogin.pin)
    setHasSavedLogin(true)
    void submitLogin(savedLogin, { auto: true })
  }, [savedLoginStorageKey, submitLogin])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void submitLogin({ loginId: loginId.trim(), pin })
  }

  function handleClearSavedLogin() {
    clearSavedScanLogin(savedLoginStorageKey)
    setHasSavedLogin(false)
    setPin('')
    setError('저장된 로그인 정보를 삭제했습니다.')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f8fafc] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Scan Login</p>
        <h1 className="mt-3 text-3xl font-extrabold text-gray-900">스캔 페이지 로그인</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          관리자 또는 직원 운영계정 ID와 PIN으로 로그인합니다. 공용 직원 PIN만 쓰는 지점은 ID를 비워도 됩니다.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">관리자/직원 ID</label>
            <input
              type="text"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              placeholder="운영계정 ID 또는 직원 이름"
              autoComplete="username"
              autoFocus
              className="rounded-2xl border border-slate-200 px-4 py-3 text-base text-gray-900 outline-none focus:border-slate-400"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="PIN 입력"
              inputMode="numeric"
              autoComplete="current-password"
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

          {hasSavedLogin ? (
            <button
              type="button"
              onClick={handleClearSavedLogin}
              className="text-sm font-semibold text-gray-500 underline underline-offset-4"
            >
              저장된 로그인 정보 삭제
            </button>
          ) : null}
        </form>
      </div>
    </div>
  )
}
