'use client'

import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { normalizeName, normalizePhone } from '@/lib/utils'

const LS_NAME = 'student_name'
const LS_PHONE = 'student_phone'

function maskPhone(phone: string) {
  if (phone.length >= 10) {
    return `${phone.slice(0, 3)}-****-${phone.slice(-4)}`
  }

  return phone
}

export default function StudentLoginPage() {
  const tenant = useTenantConfig()
  const router = useRouter()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [savedName, setSavedName] = useState('')
  const [savedPhone, setSavedPhone] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [appName, setAppName] = useState('')
  const [studentLoginEnabled, setStudentLoginEnabled] = useState(true)
  const [studentReceiptEnabled, setStudentReceiptEnabled] = useState(true)
  const [configReady, setConfigReady] = useState(false)

  useEffect(() => {
    const storedName = localStorage.getItem(LS_NAME) ?? ''
    const storedPhone = localStorage.getItem(LS_PHONE) ?? ''

    if (storedName && storedPhone) {
      setSavedName(storedName)
      setSavedPhone(storedPhone)
      setName(storedName)
      setPhone(storedPhone)
    } else {
      setShowForm(true)
    }

    fetch('/api/config/app', { cache: 'no-store' })
      .then((response) => response.json())
      .then(
        (config: {
          app_name?: string
          student_login_enabled?: boolean
          student_receipt_enabled?: boolean
        }) => {
          if (config.app_name) {
            setAppName(config.app_name)
          }

          setStudentLoginEnabled(config.student_login_enabled ?? true)
          setStudentReceiptEnabled(config.student_receipt_enabled ?? true)
        },
      )
      .catch(() => {})
      .finally(() => setConfigReady(true))
  }, [])

  async function login(loginName: string, loginPhone: string) {
    const normalizedName = normalizeName(loginName)
    const normalizedPhone = normalizePhone(loginPhone)

    if (!normalizedName || !normalizedPhone) {
      return
    }

    if (!studentLoginEnabled) {
      setError('학생 로그인이 현재 비활성화되어 있습니다.')
      return
    }

    if (!studentReceiptEnabled) {
      setError('학생 수령 포털이 현재 비활성화되어 있습니다.')
      return
    }

    setError('')
    setLoading(true)

    try {
      if (normalizedPhone.length < 10) {
        setError('휴대전화 번호를 10자리 이상 입력해 주세요.')
        return
      }

      const response = await fetch('/api/students/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizedName, phone: normalizedPhone }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setError(payload?.error ?? '학생 로그인에 실패했습니다.')
        return
      }

      localStorage.setItem(LS_NAME, loginName)
      localStorage.setItem(LS_PHONE, loginPhone)
      sessionStorage.setItem('qr_token', payload.token)
      sessionStorage.setItem('student', JSON.stringify(payload.student))
      router.push('/receipt')
    } catch {
      setError('서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  async function handleQuickLogin() {
    await login(savedName, savedPhone)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await login(name, phone)
  }

  function handleOtherUser() {
    setSavedName('')
    setSavedPhone('')
    setName('')
    setPhone('')
    setError('')
    setShowForm(true)
  }

  const studentSurfaceEnabled = studentLoginEnabled && studentReceiptEnabled

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
              <p className="text-base font-bold text-gray-900">학생 로그인이 꺼져 있습니다.</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                이 지점에서는 기능 설정에서 학생 로그인을 비활성화했습니다.
              </p>
            </div>
          ) : null}

          {configReady && studentLoginEnabled && !studentReceiptEnabled ? (
            <div className="bg-[#f0f4ff] p-5 text-center">
              <p className="text-base font-bold text-gray-900">수령 포털이 꺼져 있습니다.</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                이 지점에서는 기능 설정에서 학생 수령 포털을 비활성화했습니다.
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
                  onClick={handleOtherUser}
                  className="text-sm text-gray-500 underline transition-colors hover:text-gray-800"
                >
                  다른 학생으로 로그인
                </button>
              </div>

              {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}

              <button
                onClick={handleQuickLogin}
                disabled={loading}
                className="w-full py-4 text-lg font-bold text-white transition-opacity disabled:opacity-60"
                style={{ background: 'var(--theme)' }}
              >
                {loading ? '로그인 중...' : '이어서 로그인'}
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
                  placeholder="휴대전화 번호"
                  autoComplete="tel"
                  inputMode="numeric"
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
