'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'

type DashboardCourseSummary = {
  id: number
  name: string
  courseType: 'interview' | 'mock_exam' | 'lecture' | 'general'
  activeStudents: number
  refundedStudents: number
  featureQrPass: boolean
  featureDistribution: boolean
  featureSeatAssignment: boolean
  featureDesignatedSeat: boolean
  featureAttendance: boolean
  attendanceOpen: boolean
  designatedSeatOpen: boolean
  attendanceSessionActive: boolean
  designatedSeatSessionActive: boolean
  designatedSeatLayoutReady: boolean
  designatedSeatSeatCount: number
  needsAttention: boolean
  needsAttendanceSession: boolean
  needsDesignatedSeatLayout: boolean
  needsDesignatedSeatSession: boolean
}

type DashboardStats = {
  overview: {
    activeCourses: number
    activeStudents: number
    pendingAuthStudents: number
    actionRequiredCourses: number
  }
  auth: {
    total: number
    birthDateReadyCount: number
    pinRequiredCount: number
  }
  featureUsage: {
    attendanceCourses: number
    designatedSeatCourses: number
    seatAssignmentCourses: number
    distributionCourses: number
    qrPassCourses: number
  }
  actionItems: {
    pendingStudentAuth: number
    attendanceNeedsSession: number
    designatedSeatNeedsLayout: number
    designatedSeatNeedsSession: number
  }
  courses: DashboardCourseSummary[]
}

function formatCourseTypeLabel(value: DashboardCourseSummary['courseType']) {
  switch (value) {
    case 'interview':
      return '면접'
    case 'mock_exam':
      return '모의고사'
    case 'lecture':
      return '강의'
    default:
      return '일반'
  }
}

function getFeatureBadges(course: DashboardCourseSummary) {
  return [
    course.featureAttendance && '출석',
    course.featureDesignatedSeat && '지정좌석',
    course.featureSeatAssignment && '좌석표',
    course.featureDistribution && '배부',
    course.featureQrPass && 'QR',
  ].filter(Boolean) as string[]
}

function getStatusBadges(course: DashboardCourseSummary) {
  const badges: Array<{ label: string; tone: 'red' | 'green' | 'gray' | 'amber' }> = []

  if (course.featureAttendance) {
    if (course.needsAttendanceSession) {
      badges.push({ label: '출석 OPEN, 세션 없음', tone: 'red' })
    } else if (course.attendanceOpen && course.attendanceSessionActive) {
      badges.push({ label: '출석 진행 중', tone: 'green' })
    } else {
      badges.push({ label: '출석 닫힘', tone: 'gray' })
    }
  }

  if (course.featureDesignatedSeat) {
    if (course.needsDesignatedSeatLayout) {
      badges.push({ label: '지정좌석 레이아웃 확인', tone: 'amber' })
    } else if (course.needsDesignatedSeatSession) {
      badges.push({ label: '지정좌석 OPEN, 세션 없음', tone: 'red' })
    } else if (course.designatedSeatOpen && course.designatedSeatSessionActive) {
      badges.push({ label: '지정좌석 진행 중', tone: 'green' })
    } else {
      badges.push({ label: '지정좌석 닫힘', tone: 'gray' })
    }
  }

  if (badges.length === 0) {
    badges.push({ label: '운영 설정 확인 필요 없음', tone: 'gray' })
  }

  return badges
}

function getBadgeClass(tone: 'red' | 'green' | 'gray' | 'amber') {
  switch (tone) {
    case 'red':
      return 'bg-red-50 text-red-700 ring-red-100'
    case 'green':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-100'
    case 'amber':
      return 'bg-amber-50 text-amber-700 ring-amber-100'
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-200'
  }
}

export default function AdminDashboardPage() {
  const tenant = useTenantConfig()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(withTenantPrefix('/api/dashboard/stats', tenant.type), { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error ?? '대시보드 정보를 불러오지 못했습니다.')
        }

        setStats(payload as DashboardStats)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '대시보드 정보를 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [tenant.type])

  if (loading) {
    return <p className="py-12 text-center text-sm text-gray-500">대시보드를 불러오는 중입니다.</p>
  }

  if (error || !stats) {
    return <p className="py-12 text-center text-sm text-red-600">{error || '대시보드 정보를 확인하지 못했습니다.'}</p>
  }

  const overviewCards = [
    { label: '운영 중 강좌', value: stats.overview.activeCourses, accent: 'text-slate-900' },
    { label: '활성 수강생', value: stats.overview.activeStudents, accent: 'text-blue-600' },
    { label: '인증 미설정 학생', value: stats.overview.pendingAuthStudents, accent: 'text-amber-600' },
    { label: '즉시 확인 필요 강좌', value: stats.overview.actionRequiredCourses, accent: 'text-red-600' },
  ]

  const actionCards = [
    {
      label: '인증 미설정 학생',
      value: stats.actionItems.pendingStudentAuth,
      helper: `생년월일 준비 ${stats.auth.birthDateReadyCount}명 / PIN 필요 ${stats.auth.pinRequiredCount}명`,
    },
    {
      label: '출석 세션 필요',
      value: stats.actionItems.attendanceNeedsSession,
      helper: '출석 OPEN 상태인데 표시 세션이 없는 강좌',
    },
    {
      label: '지정좌석 레이아웃 확인',
      value: stats.actionItems.designatedSeatNeedsLayout,
      helper: '지정좌석 OPEN 상태인데 레이아웃 또는 좌석이 비어 있는 강좌',
    },
    {
      label: '지정좌석 세션 필요',
      value: stats.actionItems.designatedSeatNeedsSession,
      helper: '지정좌석 OPEN 상태인데 현장 세션이 없는 강좌',
    },
  ]

  const featureCards = [
    { label: '출석 사용 강좌', value: stats.featureUsage.attendanceCourses },
    { label: '지정좌석 사용 강좌', value: stats.featureUsage.designatedSeatCourses },
    { label: '좌석표 사용 강좌', value: stats.featureUsage.seatAssignmentCourses },
    { label: '배부 사용 강좌', value: stats.featureUsage.distributionCourses },
    { label: 'QR 수강증 강좌', value: stats.featureUsage.qrPassCourses },
  ]

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">운영 대시보드</h2>
            <p className="mt-1 text-sm text-slate-500">
              배부 실적 대신 강좌 운영 상태, 학생 인증 준비, 오늘 바로 확인할 예외를 먼저 보여줍니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={withTenantPrefix('/dashboard/students/auth-setup', tenant.type)}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              학생 인증 일괄 설정
            </Link>
            <Link
              href={withTenantPrefix('/dashboard/courses', tenant.type)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              강좌 관리
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <article key={card.label} className="rounded-2xl bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">{card.label}</p>
            <p className={`mt-1 text-2xl font-extrabold ${card.accent}`}>{card.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-800">오늘 확인할 일</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {stats.overview.actionRequiredCourses}개 강좌 주의
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {actionCards.map((card) => (
              <article key={card.label} className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-4">
                <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-900">{card.value}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{card.helper}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800">기능 사용 현황</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {featureCards.map((card) => (
              <article key={card.label} className="rounded-2xl border border-slate-100 px-4 py-4">
                <p className="text-xs font-medium text-slate-400">{card.label}</p>
                <p className="mt-1 text-xl font-extrabold text-slate-900">{card.value}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800">운영 중 강좌 현황</h3>
            <p className="mt-1 text-xs text-slate-500">
              강좌별 활성 수강생, 환불 수강생, 기능 사용 여부, 출석·지정좌석 상태를 한 번에 확인합니다.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-400">{stats.courses.length}개 강좌</span>
        </div>

        {stats.courses.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">운영 중인 강좌가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                  <th className="px-5 py-3">강좌</th>
                  <th className="px-3 py-3">유형</th>
                  <th className="px-3 py-3">수강생</th>
                  <th className="px-3 py-3">기능</th>
                  <th className="px-3 py-3">운영 상태</th>
                  <th className="px-5 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stats.courses.map((course) => {
                  const featureBadges = getFeatureBadges(course)
                  const statusBadges = getStatusBadges(course)

                  return (
                    <tr key={course.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold text-white ${
                              course.needsAttention ? 'bg-red-500' : 'bg-slate-800'
                            }`}
                          >
                            {course.id}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-900">{course.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {course.needsAttention ? '즉시 확인 필요' : '운영 상태 정상'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-slate-600">{formatCourseTypeLabel(course.courseType)}</td>
                      <td className="px-3 py-4">
                        <div className="flex flex-col gap-1 text-xs">
                          <span className="font-semibold text-slate-900">활성 {course.activeStudents}명</span>
                          <span className="text-slate-500">환불 {course.refundedStudents}명</span>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex max-w-[220px] flex-wrap gap-1.5">
                          {featureBadges.length > 0 ? (
                            featureBadges.map((badge) => (
                              <span
                                key={badge}
                                className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600"
                              >
                                {badge}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400">사용 중인 기능 없음</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex max-w-[320px] flex-wrap gap-1.5">
                          {statusBadges.map((badge) => (
                            <span
                              key={badge.label}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getBadgeClass(badge.tone)}`}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                        {course.featureDesignatedSeat ? (
                          <p className="mt-2 text-xs text-slate-400">
                            지정좌석 레이아웃 {course.designatedSeatLayoutReady ? '준비됨' : '없음'} / 좌석 {course.designatedSeatSeatCount}개
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Link
                            href={withTenantPrefix(`/dashboard/courses/${course.id}/students`, tenant.type)}
                            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                          >
                            학생
                          </Link>
                          {course.featureAttendance ? (
                            <Link
                              href={withTenantPrefix(`/dashboard/courses/${course.id}/attendance`, tenant.type)}
                              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                            >
                              출석
                            </Link>
                          ) : null}
                          {course.featureDesignatedSeat ? (
                            <Link
                              href={withTenantPrefix(`/dashboard/courses/${course.id}/designated-seats`, tenant.type)}
                              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                            >
                              지정좌석
                            </Link>
                          ) : null}
                          <Link
                            href={withTenantPrefix(`/dashboard/courses/${course.id}`, tenant.type)}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            상세
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
