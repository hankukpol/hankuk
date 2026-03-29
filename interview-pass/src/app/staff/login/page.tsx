'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { useAppConfig } from '@/hooks/use-app-config'
import { isStaffDistributionEnabled } from '@/lib/app-config.shared'
import { withTenantPrefix } from '@/lib/tenant'

const LS_MODE = 'staff_auth_mode'
const LS_ID = 'staff_auth_id'
const LS_PIN = 'staff_auth_pin'

type AuthMode = 'staff' | 'admin'

async function doAuth(authMode: AuthMode, authPin: string, authId: string) {
  if (authMode === 'admin') {
    return fetch('/api/auth/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: authId, pin: authPin }),
    })
  }

  return fetch('/api/auth/staff/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: authPin }),
  })
}

function clearSavedStaffAuth() {
  localStorage.removeItem(LS_MODE)
  localStorage.removeItem(LS_ID)
  localStorage.removeItem(LS_PIN)
}

function StaffLoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const tenant = useTenantConfig()
  const redirect = useMemo(
    () => withTenantPrefix(params.get('redirect') ?? '/scan', tenant.type),
    [params, tenant.type]
  )
  const { config, isLoading: isConfigLoading } = useAppConfig()

  const [mode, setMode] = useState<AuthMode>('staff')
  const [adminId, setAdminId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [autoLogging, setAutoLogging] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [savedLabel, setSavedLabel] = useState('')
  const staffEntryEnabled = isStaffDistributionEnabled(config)

  useEffect(() => {
    if (isConfigLoading) {
      return
    }

    let cancelled = false

    async function prepare() {
      if (!staffEntryEnabled) {
        clearSavedStaffAuth()
        if (!cancelled) {
          setAutoLogging(false)
          setShowForm(false)
          setSavedLabel('')
          setError('')
        }
        return
      }

      const savedMode = localStorage.getItem(LS_MODE) as AuthMode | null
      const savedId = localStorage.getItem(LS_ID) ?? ''
      const savedPin = localStorage.getItem(LS_PIN) ?? ''

      if (savedMode && savedPin) {
        const label = savedMode === 'admin' ? `관리자${savedId ? ` (${savedId})` : ''}` : '직원 PIN'
        if (!cancelled) {
          setSavedLabel(label)
          setAutoLogging(true)
        }

        try {
          const res = await doAuth(savedMode, savedPin, savedId)
          if (res.ok) {
            router.replace(redirect)
            return
          }

          clearSavedStaffAuth()
          const data = (await res.json().catch(() => null)) as { error?: string } | null
          if (!cancelled) {
            setSavedLabel('')
            setAutoLogging(false)
            setShowForm(true)
            setError(data?.error ?? '저장된 인증 정보가 유효하지 않습니다. 다시 입력해 주세요.')
          }
          return
        } catch {
          if (!cancelled) {
            setAutoLogging(false)
            setShowForm(true)
          }
          return
        }
      }

      if (!cancelled) {
        setShowForm(true)
      }
    }

    void prepare()

    return () => {
      cancelled = true
    }
  }, [isConfigLoading, redirect, router, staffEntryEnabled])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!staffEntryEnabled) {
      setError('직원 스캔과 빠른 배부 기능이 현재 모두 비활성화되어 있습니다.')
      return
    }

    if (!pin) {
      setError('PIN을 입력해 주세요.')
      return
    }

    setError('')
    setLoading(true)

    const res = await doAuth(mode, pin, adminId)
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    setLoading(false)

    if (!res.ok) {
      setError(data?.error ?? '인증에 실패했습니다.')
      return
    }

    localStorage.setItem(LS_MODE, mode)
    localStorage.setItem(LS_PIN, pin)
    if (mode === 'admin' && adminId) {
      localStorage.setItem(LS_ID, adminId)
    } else {
      localStorage.removeItem(LS_ID)
    }

    router.push(redirect)
  }

  if (isConfigLoading || autoLogging) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6">
        <div
          className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
          style={{ borderColor: 'var(--theme)', borderTopColor: 'transparent' }}
        />
        <p className="text-sm text-gray-500">
          {isConfigLoading ? '직원 인증 설정을 확인하는 중입니다...' : '자동 인증 중입니다...'}
        </p>
        {!isConfigLoading && savedLabel ? <p className="text-xs text-gray-400">{savedLabel}</p> : null}
      </div>
    )
  }

  if (!staffEntryEnabled) {
    return (
      <div className="flex min-h-dvh flex-col bg-gray-50">
        <div className="px-4 py-5 text-center text-white" style={{ background: 'var(--theme)' }}>
          <h1 className="text-xl font-bold">직원 인증</h1>
        </div>
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              기능 비활성
            </p>
            <h2 className="mt-3 text-lg font-bold text-amber-950">
              직원 스캔과 빠른 배부 기능이 현재 모두 비활성화되어 있습니다.
            </h2>
            <p className="mt-3 text-sm leading-6 text-amber-900">
              이 지점에서는 직원 인증이 필요한 배부 기능을 사용하지 않도록 설정되어 있습니다.
              다시 필요해지면 관리자 기능 설정에서 켜 주세요.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={withTenantPrefix('/', tenant.type)}
                className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700"
              >
                학생 화면으로 이동
              </Link>
              <Link
                href={withTenantPrefix('/admin/login', tenant.type)}
                className="inline-flex items-center rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
              >
                관리자 로그인
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!showForm) {
    return null
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="px-4 py-5 text-center text-white" style={{ background: 'var(--theme)' }}>
        <h1 className="text-xl font-bold">직원 인증</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5 p-6">
        <p className="text-sm leading-relaxed text-gray-600">
          인증된 상태에서만 QR 스캔과 배부 처리를 할 수 있습니다.
          <br />
          처음 한 번 인증하면 이후 자동으로 인증됩니다.
        </p>

        <div className="flex overflow-hidden border border-gray-200">
          {(['staff', 'admin'] as AuthMode[]).map((nextMode) => (
            <button
              key={nextMode}
              type="button"
              onClick={() => {
                setMode(nextMode)
                setError('')
              }}
              className="flex-1 py-2.5 text-sm font-medium transition-colors"
              style={
                mode === nextMode
                  ? { background: 'var(--theme)', color: '#fff' }
                  : { background: '#fff', color: '#6b7280' }
              }
            >
              {nextMode === 'staff' ? '직원 PIN' : '관리자 인증'}
            </button>
          ))}
        </div>

        {mode === 'admin' ? (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">
              관리자 아이디
              <span className="ml-1 text-xs font-normal text-gray-400">
                (설정한 경우만 입력)
              </span>
            </label>
            <input
              type="text"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              placeholder="아이디가 없으면 비워 두세요"
              autoComplete="username"
              className="w-full border border-gray-300 px-4 py-3 text-base focus:border-blue-900 focus:outline-none"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">
            {mode === 'staff' ? '직원 PIN' : '관리자 PIN'}
          </label>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN 입력"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            className="w-full border border-gray-300 px-4 py-3 text-base focus:border-blue-900 focus:outline-none"
          />
        </div>

        {error ? <p className="-mt-2 text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 text-base font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--theme)' }}
        >
          {loading ? '인증 중...' : '이 기기에서 인증하기'}
        </button>
      </form>
    </div>
  )
}

export default function StaffLoginPage() {
  return (
    <Suspense>
      <StaffLoginForm />
    </Suspense>
  )
}
