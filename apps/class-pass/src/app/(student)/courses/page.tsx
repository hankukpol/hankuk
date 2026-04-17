'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import {
  STUDENT_SESSION_NAME_KEY,
  STUDENT_SESSION_PHONE_KEY,
  STUDENT_SESSION_VERIFICATION_KEY,
  clearStudentSession,
  readStudentCourseCache,
  writeStudentCourseCache,
} from '@/lib/student-session'
import type { PassCourseSummary } from '@/types/database'
import { withTenantPrefix } from '@/lib/tenant'
import { formatCourseTypeLabel, maskPhone, normalizeName, normalizePhone } from '@/lib/utils'

export default function StudentCoursesPage() {
  const tenant = useTenantConfig()
  const router = useRouter()
  const [courses, setCourses] = useState<PassCourseSummary[]>([])
  const [studentName, setStudentName] = useState('')
  const [studentPhone, setStudentPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const storedName = sessionStorage.getItem(STUDENT_SESSION_NAME_KEY) ?? ''
    const storedPhone = sessionStorage.getItem(STUDENT_SESSION_PHONE_KEY) ?? ''
    const storedVerificationCode = sessionStorage.getItem(STUDENT_SESSION_VERIFICATION_KEY) ?? ''

    if (!storedName || !storedPhone || !storedVerificationCode) {
      router.replace(withTenantPrefix('/', tenant.type))
      return
    }

    setStudentName(storedName)
    setStudentPhone(storedPhone)

    const cachedCourses = readStudentCourseCache(sessionStorage, {
      tenant: tenant.type,
      name: storedName,
      phone: storedPhone,
      verificationCode: storedVerificationCode,
    })
    const hasCachedCourses = Boolean(cachedCourses)

    if (cachedCourses) {
      setCourses(cachedCourses)
      setLoading(false)
    }

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
          throw new Error(payload?.error ?? '수강 중인 강의를 찾지 못했습니다.')
        }

        const nextCourses = payload?.courses ?? []
        setCourses(nextCourses)
        writeStudentCourseCache(sessionStorage, {
          tenant: tenant.type,
          name: storedName,
          phone: storedPhone,
          verificationCode: storedVerificationCode,
          courses: nextCourses,
        })
      })
      .catch((reason: unknown) => {
        if (!hasCachedCourses) {
          setError(reason instanceof Error ? reason.message : '강의 목록을 불러오지 못했습니다.')
        }
      })
      .finally(() => setLoading(false))
  }, [router, tenant.type])

  function handleReset() {
    clearStudentSession(sessionStorage)
    router.push(`${withTenantPrefix('/', tenant.type)}?loggedOut=1`)
  }

  if (loading) {
    return (
      <div className="student-page flex min-h-dvh items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--student-blue)] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="student-page student-safe-bottom">
      <section className="student-hero px-4 pb-6 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="student-eyebrow student-eyebrow-dark">내 강좌</p>
            <h1 className="student-display mt-2">내 강좌</h1>
          </div>
          <span className="student-chip student-chip-dark">{courses.length}개 강좌</span>
        </div>
        <p className="student-body student-body-dark mt-2">
          {studentName} · {maskPhone(studentPhone)}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="student-chip student-chip-dark">QR 수강증</span>
          <span className="student-chip student-chip-dark">출석 체크</span>
          <span className="student-chip student-chip-dark">실시간 확인</span>
        </div>
      </section>

      <section className="px-4 pt-4">
        {error ? (
          <div className="student-card px-5 py-6 text-center">
            <p className="text-[15px] font-medium text-[#c2410c]">{error}</p>
            <button
              type="button"
              onClick={handleReset}
              className="student-pill-button student-pill-primary mt-5 w-full"
            >
              다시 로그인
            </button>
          </div>
        ) : courses.length === 0 ? (
          <div className="student-card px-5 py-5 text-center">
            <p className="text-[17px] font-semibold tracking-[-0.03em] text-[var(--student-text)]">현재 수강 중인 강좌가 없습니다.</p>
            <p className="student-body mt-2">
              등록된 강좌가 없거나 환불 처리 상태일 수 있습니다.
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="student-pill-button student-pill-primary mt-4 w-full"
            >
              처음으로 돌아가기
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
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
                  className="student-card block px-4 py-3.5 transition-transform active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--student-surface-muted)] text-[11px] font-semibold text-[var(--student-blue)]">
                      {String(entry.course.id).padStart(2, '0')}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-[15px] font-semibold leading-tight tracking-[-0.02em] text-[var(--student-text)]">
                          {entry.course.name}
                        </p>
                        {entry.attendance.attended_today ? (
                          <span className="student-chip bg-[#eefaf1] text-[#19703a]">
                            <span className="student-status-dot" style={{ background: '#19703a' }} />
                            출석
                          </span>
                        ) : entry.attendance.open ? (
                          <span className="student-chip bg-[rgba(0,113,227,0.08)] text-[var(--student-blue)]">
                            <span className="student-status-dot student-status-dot-active" />
                            출석중
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-0.5 text-[12px] text-[var(--student-text-muted)]">
                        {formatCourseTypeLabel(entry.course.course_type)}
                      </p>

                      {features.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {features.map((feature) => (
                            <span key={feature as string} className="student-chip">
                              {feature}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-[var(--student-text-muted)]">
                      <path d="M4 2.5L9 7l-5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <div className="px-5 pt-6 sm:px-6">
        <button
          type="button"
          onClick={handleReset}
          className="student-pill-button student-pill-outline w-full"
        >
          로그아웃
        </button>
      </div>
    </div>
  )
}
