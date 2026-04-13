'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import type { PassCourseSummary } from '@/types/database'
import { withTenantPrefix } from '@/lib/tenant'
import { formatCourseTypeLabel, maskPhone, normalizeName, normalizePhone } from '@/lib/utils'

const LS_NAME = 'class_pass_student_name'
const LS_PHONE = 'class_pass_student_phone'
const LS_VERIFICATION = 'class_pass_student_verification'

export default function StudentCoursesPage() {
  const tenant = useTenantConfig()
  const router = useRouter()
  const [courses, setCourses] = useState<PassCourseSummary[]>([])
  const [studentName, setStudentName] = useState('')
  const [studentPhone, setStudentPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const storedName = sessionStorage.getItem(LS_NAME) ?? ''
    const storedPhone = sessionStorage.getItem(LS_PHONE) ?? ''
    const storedVerificationCode = sessionStorage.getItem(LS_VERIFICATION) ?? ''

    if (!storedName || !storedPhone || !storedVerificationCode) {
      router.replace(withTenantPrefix('/', tenant.type))
      return
    }

    setStudentName(storedName)
    setStudentPhone(storedPhone)

    fetch(withTenantPrefix('/api/enrollments/lookup', tenant.type), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: normalizeName(storedName),
        phone: normalizePhone(storedPhone),
        verificationCode: storedVerificationCode.replace(/\D/g, ''),
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error ?? '수강 중인 강좌를 찾지 못했습니다.')
        }
        setCourses(payload.courses ?? [])
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '강좌 목록을 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [router, tenant.type])

  function handleReset() {
    sessionStorage.removeItem(LS_NAME)
    sessionStorage.removeItem(LS_PHONE)
    sessionStorage.removeItem(LS_VERIFICATION)
    router.push(withTenantPrefix('/', tenant.type))
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-900 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="px-4 py-5 text-center text-white" style={{ background: 'var(--theme)' }}>
        <h1 className="text-xl font-bold">내 수강 강좌</h1>
        <p className="mt-1 text-sm text-white/80">
          {studentName} · {maskPhone(studentPhone)}
        </p>
      </div>

      <div className="flex-1 p-4">
        {error ? (
          <div className="border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={handleReset}
              className="mt-3 px-4 py-2 text-sm font-medium text-white"
              style={{ background: 'var(--theme)' }}
            >
              다시 로그인
            </button>
          </div>
        ) : courses.length === 0 ? (
          <div className="border border-gray-100 bg-gray-50 p-6 text-center">
            <p className="text-base font-bold text-gray-900">수강 중인 강좌가 없습니다.</p>
            <p className="mt-2 text-sm text-gray-500">
              등록된 강좌가 없거나 환불 처리된 상태일 수 있습니다.
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="mt-4 px-4 py-2 text-sm font-medium text-white"
              style={{ background: 'var(--theme)' }}
            >
              다시 로그인
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {courses.map((entry) => {
              const features = [
                entry.course.feature_qr_pass && 'QR',
                entry.course.feature_seat_assignment && '좌석',
                entry.course.feature_qr_distribution && '배부',
                entry.course.feature_dday && 'D-day',
              ].filter(Boolean)

              return (
                <Link
                  key={entry.enrollment_id}
                  href={withTenantPrefix(`/courses/${entry.course.slug}?enrollmentId=${entry.enrollment_id}`, tenant.type)}
                  prefetch={false}
                  className="flex items-center justify-between border-b border-gray-100 px-1 py-4 transition active:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[10px] font-bold text-white"
                        style={{ background: entry.course.theme_color ?? 'var(--theme)' }}
                      >
                        {entry.course.id}
                      </span>
                      <p className="truncate font-medium text-gray-900">{entry.course.name}</p>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-9">
                      <span className="text-xs text-gray-400">{formatCourseTypeLabel(entry.course.course_type)}</span>
                      {features.map((feature) => (
                        <span key={feature as string} className="bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="shrink-0 pl-3 text-sm text-gray-400">열기</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <div className="px-4 pb-6">
        <button
          type="button"
          onClick={handleReset}
          className="w-full border border-gray-200 py-3 text-sm text-gray-500"
        >
          처음 화면으로 돌아가기
        </button>
      </div>
    </div>
  )
}
