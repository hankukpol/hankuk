'use client'

import type { FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import {
  STUDENT_SESSION_NAME_KEY,
  STUDENT_SESSION_PHONE_KEY,
  STUDENT_SESSION_VERIFICATION_KEY,
  clearStudentSession,
  clearSavedStudentCredentials,
  getSavedStudentCredentials,
  isStudentRemembered,
  saveStudentCredentials,
  writeStudentCourseCache,
} from '@/lib/student-session'
import { withTenantPrefix } from '@/lib/tenant'
import { maskPhone, normalizeName, normalizePhone } from '@/lib/utils'

export default function StudentLoginPage() {
  const tenant = useTenantConfig()
  const router = useRouter()
  const searchParams = useSearchParams()
  const quickLoginTriggeredRef = useRef(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [savedName, setSavedName] = useState('')
  const [savedPhone, setSavedPhone] = useState('')
  const [savedVerificationCode, setSavedVerificationCode] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [appName, setAppName] = useState(tenant.defaultAppName)
  const [studentLoginEnabled, setStudentLoginEnabled] = useState(true)
  const [studentCoursesEnabled, setStudentCoursesEnabled] = useState(true)
  const [configReady, setConfigReady] = useState(false)
  const skipAutoLogin = searchParams.get('loggedOut') === '1'

  useEffect(() => {
    quickLoginTriggeredRef.current = false

    const storedName = sessionStorage.getItem(STUDENT_SESSION_NAME_KEY) ?? ''
    const storedPhone = sessionStorage.getItem(STUDENT_SESSION_PHONE_KEY) ?? ''
    const storedVerificationCode = sessionStorage.getItem(STUDENT_SESSION_VERIFICATION_KEY) ?? ''

    const saved = getSavedStudentCredentials()
    const effectiveName = storedName || saved?.name || ''
    const effectivePhone = storedPhone || saved?.phone || ''
    const effectiveVerification = storedVerificationCode || saved?.verificationCode || ''

    setName(effectiveName)
    setPhone(effectivePhone)
    setVerificationCode(effectiveVerification)
    setRememberMe(isStudentRemembered())

    if (effectiveName && effectivePhone && effectiveVerification) {
      setSavedName(effectiveName)
      setSavedPhone(effectivePhone)
      setSavedVerificationCode(effectiveVerification)
      setShowForm(false)
    } else {
      setShowForm(true)
    }

    fetch(withTenantPrefix('/api/config/app', tenant.type))
      .then((response) => response.json())
      .then((config: { app_name?: string; student_login_enabled?: boolean; student_courses_enabled?: boolean }) => {
        if (config.app_name) {
          setAppName(config.app_name)
        }
        setStudentLoginEnabled(config.student_login_enabled ?? true)
        setStudentCoursesEnabled(config.student_courses_enabled ?? true)
      })
      .catch(() => {})
      .finally(() => setConfigReady(true))
  }, [tenant.type])

  const login = useCallback(async (loginName: string, loginPhone: string, loginVerificationCode: string) => {
    const normalizedName = normalizeName(loginName)
    const normalizedPhone = normalizePhone(loginPhone)
    const normalizedVerificationCode = loginVerificationCode.replace(/\D/g, '')

    if (!normalizedName || !normalizedPhone || !normalizedVerificationCode) {
      setError('이름, 연락처, 인증번호를 모두 입력해 주세요.')
      return
    }

    if (!studentLoginEnabled) {
      setError('학생 로그인 기능이 현재 비활성화되어 있습니다.')
      return
    }

    if (!studentCoursesEnabled) {
      setError('수강 조회 기능이 현재 비활성화되어 있습니다.')
      return
    }

    setLoading(true)
    setError('')

    try {
      if (normalizedPhone.length < 10) {
        setError('휴대폰 번호를 10자리 이상 입력해 주세요.')
        return
      }

      if (normalizedVerificationCode.length < 4 || normalizedVerificationCode.length > 6) {
        setError('인증번호는 생년월일 6자리 또는 PIN 4자리로 입력해 주세요.')
        return
      }

      const response = await fetch(withTenantPrefix('/api/enrollments/lookup', tenant.type), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          phone: normalizedPhone,
          verificationCode: normalizedVerificationCode,
        }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setError(payload?.error ?? '수강 이력을 확인하지 못했습니다.')
        return
      }

      sessionStorage.setItem(STUDENT_SESSION_NAME_KEY, loginName)
      sessionStorage.setItem(STUDENT_SESSION_PHONE_KEY, loginPhone)
      sessionStorage.setItem(STUDENT_SESSION_VERIFICATION_KEY, normalizedVerificationCode)

      if (rememberMe) {
        saveStudentCredentials(loginName, loginPhone, normalizedVerificationCode)
      } else {
        clearSavedStudentCredentials()
      }

      writeStudentCourseCache(sessionStorage, {
        tenant: tenant.type,
        name: loginName,
        phone: loginPhone,
        verificationCode: normalizedVerificationCode,
        courses: payload?.courses ?? [],
      })

      router.replace(withTenantPrefix('/courses', tenant.type))
    } catch {
      setError('잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }, [rememberMe, router, studentCoursesEnabled, studentLoginEnabled, tenant.type])

  useEffect(() => {
    if (!configReady) {
      return
    }

    if (!savedName || !savedPhone || !savedVerificationCode || showForm) {
      return
    }

    if (!studentLoginEnabled || !studentCoursesEnabled) {
      return
    }

    if (skipAutoLogin) {
      return
    }

    if (quickLoginTriggeredRef.current) {
      return
    }

    quickLoginTriggeredRef.current = true
    void login(savedName, savedPhone, savedVerificationCode)
  }, [
    configReady,
    login,
    savedName,
    savedPhone,
    savedVerificationCode,
    showForm,
    skipAutoLogin,
    studentCoursesEnabled,
    studentLoginEnabled,
  ])

  async function handleQuickLogin() {
    quickLoginTriggeredRef.current = true
    await login(savedName, savedPhone, savedVerificationCode)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    quickLoginTriggeredRef.current = true
    await login(name, phone, verificationCode)
  }

  function handleReset() {
    clearStudentSession(sessionStorage)
    clearSavedStudentCredentials()
    quickLoginTriggeredRef.current = false
    setSavedName('')
    setSavedPhone('')
    setSavedVerificationCode('')
    setName('')
    setPhone('')
    setVerificationCode('')
    setRememberMe(false)
    setShowForm(true)
    setError('')
  }

  const studentSurfaceEnabled = studentLoginEnabled && studentCoursesEnabled

  return (
    <div className="student-page student-safe-bottom px-4 pt-4 sm:px-5">
      <div className="flex flex-col gap-5">
        <section className="student-hero student-card-dark px-5 pb-6 pt-5">
          <p className="student-eyebrow student-eyebrow-dark">학생 로그인</p>
          <h1 className="student-display mt-3 break-keep whitespace-pre-wrap">
            {(appName || tenant.defaultAppName).split(/<br\s*\/?>/i).map((line, index, array) => (
              <span key={index}>
                {line}
                {index < array.length - 1 && <br />}
              </span>
            ))}
          </h1>
          <p className="student-body student-body-dark mt-2 break-keep">
            수강 조회, 출석 확인, 모바일 수강증 확인을 한 흐름으로 이어줍니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="student-chip student-chip-dark">모바일 수강증</span>
            <span className="student-chip student-chip-dark">본인 인증</span>
            <span className="student-chip student-chip-dark">QR 지원</span>
          </div>
        </section>

        <section className="student-card px-4 py-5 sm:px-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="student-eyebrow student-eyebrow-light">학생 확인</p>
              <h2 className="student-display-compact mt-2">모바일 학생 확인</h2>
            </div>
            <div className="student-chip hidden sm:inline-flex">보안 인증</div>
          </div>

          {configReady && !studentLoginEnabled ? (
            <div className="student-card-muted px-4 py-3 text-center">
              <p className="text-[15px] font-semibold tracking-[-0.03em] text-[var(--student-text)]">학생 로그인이 현재 닫혀 있습니다.</p>
              <p className="student-body mt-2">관리자가 학생 로그인 기능을 일시적으로 비활성화했습니다.</p>
            </div>
          ) : null}

          {configReady && studentLoginEnabled && !studentCoursesEnabled ? (
            <div className="student-card-muted px-4 py-3 text-center">
              <p className="text-[15px] font-semibold tracking-[-0.03em] text-[var(--student-text)]">수강 조회가 현재 닫혀 있습니다.</p>
              <p className="student-body mt-2">관리자가 학생 수강 조회 기능을 일시적으로 비활성화했습니다.</p>
            </div>
          ) : null}

          {studentSurfaceEnabled && savedName && !showForm ? (
            <div className="flex flex-col gap-3">
              <div className="student-card-muted px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="student-eyebrow student-eyebrow-light">저장된 정보</p>
                    <p className="mt-2 text-[16px] font-semibold tracking-[-0.04em] text-[var(--student-text)]">{savedName}</p>
                    <p className="mt-1 text-[14px] text-[var(--student-text-muted)]">{maskPhone(savedPhone)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-[14px] font-semibold text-[var(--student-link)] transition-opacity hover:opacity-70"
                  >
                    정보 변경
                  </button>
                </div>
              </div>

              {error ? <p className="text-center text-[14px] font-medium text-[#c2410c]">{error}</p> : null}

              <button
                type="button"
                onClick={handleQuickLogin}
                disabled={loading}
                className="student-pill-button student-pill-primary w-full disabled:translate-y-0 disabled:opacity-40"
              >
                {loading ? '로그인 중...' : '저장된 정보로 계속하기'}
              </button>
            </div>
          ) : null}

          {studentSurfaceEnabled && showForm ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2.5">
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="이름"
                  autoComplete="name"
                  autoFocus
                  className="student-input"
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
                  placeholder="휴대폰 번호"
                  autoComplete="tel"
                  inputMode="numeric"
                  className="student-input"
                />
                <input
                  type="tel"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="생년월일 6자리 또는 PIN"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  minLength={4}
                  maxLength={6}
                  className="student-input"
                />
              </div>

              <label className="flex items-center gap-2.5 rounded-full border border-[var(--student-line)] bg-white px-3.5 py-2.5">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 rounded border-[#cbd5e1] accent-[var(--student-blue)]"
                />
                <span className="text-[14px] font-medium text-[var(--student-text-muted)]">로그인 정보 저장</span>
              </label>

              {error ? <p className="text-center text-[14px] font-medium text-[#c2410c]">{error}</p> : null}

              <button
                type="submit"
                disabled={loading}
                className="student-pill-button student-pill-primary w-full disabled:translate-y-0 disabled:opacity-40"
              >
                {loading ? '로그인 중...' : '로그인'}
              </button>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  )
}
