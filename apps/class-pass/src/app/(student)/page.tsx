'use client'

import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'
import { maskPhone, normalizeName, normalizePhone } from '@/lib/utils'

const LS_NAME = 'class_pass_student_name'
const LS_PHONE = 'class_pass_student_phone'
const LS_VERIFICATION = 'class_pass_student_verification'

export default function StudentLoginPage() {
  const tenant = useTenantConfig()
  const router = useRouter()
  const quickLoginTriggeredRef = useRef(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [savedName, setSavedName] = useState('')
  const [savedPhone, setSavedPhone] = useState('')
  const [savedVerificationCode, setSavedVerificationCode] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [appName, setAppName] = useState(tenant.defaultAppName)
  const [studentLoginEnabled, setStudentLoginEnabled] = useState(true)
  const [studentCoursesEnabled, setStudentCoursesEnabled] = useState(true)
  const [configReady, setConfigReady] = useState(false)

  useEffect(() => {
    quickLoginTriggeredRef.current = false

    const storedName = sessionStorage.getItem(LS_NAME) ?? ''
    const storedPhone = sessionStorage.getItem(LS_PHONE) ?? ''
    const storedVerificationCode = sessionStorage.getItem(LS_VERIFICATION) ?? ''

    setName(storedName)
    setPhone(storedPhone)
    setVerificationCode(storedVerificationCode)

    if (storedName && storedPhone && storedVerificationCode) {
      setSavedName(storedName)
      setSavedPhone(storedPhone)
      setSavedVerificationCode(storedVerificationCode)
      setShowForm(false)
    } else {
      setShowForm(true)
    }

    fetch(withTenantPrefix('/api/config/app', tenant.type), { cache: 'no-store' })
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

      sessionStorage.setItem(LS_NAME, loginName)
      sessionStorage.setItem(LS_PHONE, loginPhone)
      sessionStorage.setItem(LS_VERIFICATION, normalizedVerificationCode)
      router.replace(withTenantPrefix('/courses', tenant.type))
    } catch {
      setError('잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }, [router, studentCoursesEnabled, studentLoginEnabled, tenant.type])

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
    sessionStorage.removeItem(LS_NAME)
    sessionStorage.removeItem(LS_PHONE)
    sessionStorage.removeItem(LS_VERIFICATION)
    quickLoginTriggeredRef.current = false
    setSavedName('')
    setSavedPhone('')
    setSavedVerificationCode('')
    setName('')
    setPhone('')
    setVerificationCode('')
    setShowForm(true)
    setError('')
  }

  const studentSurfaceEnabled = studentLoginEnabled && studentCoursesEnabled

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white p-6">
      <div className="flex w-full max-w-[320px] flex-col gap-10">
        <h1 className="break-keep whitespace-pre-wrap text-center text-2xl font-extrabold tracking-tight text-gray-900">
          {(appName || tenant.defaultAppName).split(/<br\s*\/?>/i).map((line, index, array) => (
            <span key={index}>
              {line}
              {index < array.length - 1 && <br />}
            </span>
          ))}
        </h1>

        <div className="flex w-full flex-col">
          {configReady && !studentLoginEnabled ? (
            <div className="bg-[#f0f4ff] p-5 text-center">
              <p className="text-base font-bold text-gray-900">학생 로그인이 닫혀 있습니다.</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                현재 학생 로그인 기능이 비활성화되어 있습니다.
              </p>
            </div>
          ) : null}

          {configReady && studentLoginEnabled && !studentCoursesEnabled ? (
            <div className="bg-[#f0f4ff] p-5 text-center">
              <p className="text-base font-bold text-gray-900">수강 조회가 닫혀 있습니다.</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                현재 학생 수강 조회 기능이 비활성화되어 있습니다.
              </p>
            </div>
          ) : null}

          {studentSurfaceEnabled && savedName && !showForm ? (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between bg-[#f0f4ff] p-5">
                <div>
                  <p className="text-lg font-bold text-gray-900">{savedName}</p>
                  <p className="mt-1 text-sm text-gray-600">{maskPhone(savedPhone)}</p>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-sm text-gray-500 underline transition-colors hover:text-gray-800"
                >
                  다른 학생으로 로그인
                </button>
              </div>

              {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}

              <button
                type="button"
                onClick={handleQuickLogin}
                disabled={loading}
                className="w-full py-4 text-lg font-bold text-white transition-opacity disabled:opacity-60"
                style={{ background: 'var(--theme)' }}
              >
                {loading ? '로그인 중...' : '저장된 정보로 다시 로그인'}
              </button>
            </div>
          ) : null}

          {studentSurfaceEnabled && showForm ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col gap-0.5 bg-white">
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="이름"
                  autoComplete="name"
                  autoFocus
                  className="w-full border-none bg-[#f0f4ff] px-4 py-4 text-base text-gray-900 transition-colors placeholder:text-gray-500 focus:bg-[#e4ebff] focus:outline-none"
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
                  placeholder="휴대폰 번호"
                  autoComplete="tel"
                  inputMode="numeric"
                  className="w-full border-none bg-[#f0f4ff] px-4 py-4 text-base text-gray-900 transition-colors placeholder:text-gray-500 focus:bg-[#e4ebff] focus:outline-none"
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
                  className="w-full border-none bg-[#f0f4ff] px-4 py-4 text-base text-gray-900 transition-colors placeholder:text-gray-500 focus:bg-[#e4ebff] focus:outline-none"
                />
              </div>

              {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 text-lg font-bold text-white transition-opacity disabled:opacity-60"
                style={{ background: 'var(--theme)' }}
              >
                {loading ? '로그인 중...' : '로그인'}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  )
}
