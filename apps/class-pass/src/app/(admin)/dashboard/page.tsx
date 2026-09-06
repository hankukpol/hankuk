'use client'

import { getUserErrorMessage } from '@/lib/user-error-message'
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
    activeUniqueStudents: number
    activeEnrollmentCount: number
    duplicateEnrollmentCount: number
    suspendedEnrollmentCount: number
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

type AttentionFilter = 'needsAttendanceSession' | 'needsDesignatedSeatLayout' | 'needsDesignatedSeatSession'

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
      badges.push({ label: '출석 화면 시작 필요', tone: 'red' })
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
      badges.push({ label: '지정좌석 화면 시작 필요', tone: 'red' })
    } else if (course.designatedSeatOpen && course.designatedSeatSessionActive) {
      badges.push({ label: '지정좌석 진행 중', tone: 'green' })
    } else {
      badges.push({ label: '지정좌석 닫힘', tone: 'gray' })
    }
  }

  if (badges.length === 0) {
    badges.push({ label: '정상', tone: 'gray' })
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
  const [attentionFilter, setAttentionFilter] = useState<{ key: AttentionFilter; label: string } | null>(null)

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
    return <p className="py-12 text-center text-sm text-red-600">{getUserErrorMessage(error || '대시보드 정보를 확인하지 못했습니다.')}</p>
  }

  const overviewCards = [
    { label: '운영 중 강좌', value: stats.overview.activeCourses, unit: '개', tone: 'neutral' },
    {
      label: '수강 중 학생',
      value: stats.overview.activeUniqueStudents,
      unit: '명',
      tone: 'accent',
      helper: `전체 수강 ${stats.overview.activeEnrollmentCount}건 / 중복 수강 ${stats.overview.duplicateEnrollmentCount}건`,
    },
    { label: '인증 미설정 학생', value: stats.overview.pendingAuthStudents, unit: '명', tone: stats.overview.pendingAuthStudents > 0 ? 'attention' : 'neutral' },
    { label: '확인 필요한 강좌', value: stats.overview.actionRequiredCourses, unit: '개', tone: stats.overview.actionRequiredCourses > 0 ? 'attention' : 'neutral' },
  ]

  const actionCards: Array<{ label: string; value: number; helper: string; href?: string; filter?: AttentionFilter }> = [
    {
      label: '인증 미설정 학생',
      value: stats.actionItems.pendingStudentAuth,
      href: '/dashboard/students/auth-setup',
      helper: `생년월일로 설정 가능 ${stats.auth.birthDateReadyCount}명 / 인증번호 필요 ${stats.auth.pinRequiredCount}명`,
    },
    {
      label: '정지 수강 건수',
      value: stats.overview.suspendedEnrollmentCount,
      href: '/dashboard/courses',
      helper: '정지 처리되어 실제 활성 학생 수에서 제외된 수강',
    },
    {
      label: '출석 화면 시작 필요',
      value: stats.actionItems.attendanceNeedsSession,
      filter: 'needsAttendanceSession',
      helper: '출석을 열었지만 인증 화면이 시작되지 않은 강좌',
    },
    {
      label: '지정좌석 레이아웃 확인',
      value: stats.actionItems.designatedSeatNeedsLayout,
      filter: 'needsDesignatedSeatLayout',
      helper: '신청을 열었지만 좌석 배치가 준비되지 않은 강좌',
    },
    {
      label: '지정좌석 화면 시작 필요',
      value: stats.actionItems.designatedSeatNeedsSession,
      filter: 'needsDesignatedSeatSession',
      helper: '신청을 열었지만 인증 화면이 시작되지 않은 강좌',
    },
  ]

  const featureCards = [
    { label: '출석 사용 강좌', value: stats.featureUsage.attendanceCourses },
    { label: '지정좌석 사용 강좌', value: stats.featureUsage.designatedSeatCourses },
    { label: '좌석표 사용 강좌', value: stats.featureUsage.seatAssignmentCourses },
    { label: '배부 사용 강좌', value: stats.featureUsage.distributionCourses },
    { label: 'QR 수강증 강좌', value: stats.featureUsage.qrPassCourses },
  ]
  const visibleCourses = attentionFilter ? stats.courses.filter(course => course[attentionFilter.key]) : stats.courses

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard-header">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1>운영 대시보드</h1>
            <p className="admin-dashboard-description">
              오늘의 운영 현황과 확인이 필요한 강좌를 한눈에 확인하세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={withTenantPrefix('/dashboard/students/auth-setup', tenant.type)}
              className="admin-dashboard-button admin-dashboard-button-primary"
            >
              학생 인증 일괄 설정
            </Link>
            <Link
              href={withTenantPrefix('/dashboard/courses', tenant.type)}
              className="admin-dashboard-button"
            >
              강좌 관리
            </Link>
          </div>
        </div>
      </header>

      <section className="admin-dashboard-overview" aria-label="운영 핵심 지표">
        {overviewCards.map((card) => (
          <article key={card.label} className="admin-dashboard-metric" data-tone={card.tone}>
            <p className="admin-dashboard-label">{card.label}</p>
            <p className="admin-dashboard-metric-value">{card.value.toLocaleString('ko-KR')}<span>{card.unit}</span></p>
            {'helper' in card && card.helper ? (
              <p className="admin-dashboard-helper">{card.helper}</p>
            ) : null}
          </article>
        ))}
      </section>

      <div className="admin-dashboard-panels">
        <section className="admin-dashboard-panel" aria-labelledby="dashboard-attention-heading">
          <div className="admin-dashboard-panel-heading">
            <h2 id="dashboard-attention-heading">오늘 확인할 일</h2>
            <span className="admin-dashboard-panel-caption" data-attention={stats.overview.actionRequiredCourses > 0}>
              {stats.overview.actionRequiredCourses > 0 ? `${stats.overview.actionRequiredCourses}개 강좌 확인 필요` : '강좌 운영 정상'}
            </span>
          </div>
          <div className="admin-dashboard-rows">
            {actionCards.map((card) => (
              <article key={card.label} className="admin-dashboard-row" data-attention={card.value > 0}>
                <div className="min-w-0">
                  <p className="admin-dashboard-row-label">{card.label}</p>
                  <p className="admin-dashboard-helper">{card.helper}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <strong className="admin-dashboard-row-value">{card.value.toLocaleString('ko-KR')}</strong>
                  {card.value > 0 && card.href ? <Link className="admin-button" href={withTenantPrefix(card.href, tenant.type)} aria-label={`${card.label} 관리 화면 보기`}>확인</Link> : null}
                  {card.value > 0 && card.filter ? <button type="button" className="admin-button" aria-label={`${card.label} 강좌 보기`} onClick={() => {
                    setAttentionFilter({ key: card.filter!, label: card.label })
                    const heading = document.getElementById('dashboard-courses-heading')
                    heading?.scrollIntoView?.({ block: 'start' })
                    heading?.focus({ preventScroll: true })
                  }}>강좌 보기</button> : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-dashboard-panel" aria-labelledby="dashboard-features-heading">
          <div className="admin-dashboard-panel-heading">
            <h2 id="dashboard-features-heading">기능 사용 현황</h2>
            <span className="admin-dashboard-panel-caption">운영 강좌 기준</span>
          </div>
          <div className="admin-dashboard-rows">
            {featureCards.map((card) => (
              <article key={card.label} className="admin-dashboard-row admin-dashboard-feature">
                <p className="admin-dashboard-row-label">{card.label}</p>
                <p className="admin-dashboard-feature-count"><strong>{card.value.toLocaleString('ko-KR')}</strong>개 강좌</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="admin-dashboard-courses" aria-labelledby="dashboard-courses-heading">
        <div className="admin-dashboard-panel-heading">
          <div>
            <h2 id="dashboard-courses-heading" tabIndex={-1}>운영 중 강좌 현황</h2>
          </div>
          <span className="admin-dashboard-panel-caption" role="status">{attentionFilter ? `${attentionFilter.label} · ${visibleCourses.length}개` : `전체 ${stats.courses.length}개`}</span>
          {attentionFilter && <button type="button" className="admin-button" onClick={() => setAttentionFilter(null)}>전체 강좌 보기</button>}
        </div>

        {visibleCourses.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{attentionFilter ? '해당 조건의 강좌가 없습니다.' : '운영 중인 강좌가 없습니다.'}</p>
        ) : (
          <>
          <div className="grid gap-3 p-3 md:hidden">
            {visibleCourses.map((course) => {
              const featureBadges = getFeatureBadges(course)
              const statusBadges = getStatusBadges(course)

              return (
                <article key={course.id} className="min-w-0 overflow-hidden rounded-[8px] bg-slate-50 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="admin-dashboard-course-name">{course.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatCourseTypeLabel(course.courseType)} · 활성 수강 {course.activeStudents}명 / 환불 {course.refundedStudents}명
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          course.needsAttention ? 'bg-red-50 text-red-700' : 'bg-white text-slate-500'
                        }`}>
                          {course.needsAttention ? '확인 필요' : '정상'}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {featureBadges.length > 0 ? (
                          featureBadges.map((badge) => (
                            <span
                              key={badge}
                              className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600"
                            >
                              {badge}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">사용 중인 기능 없음</span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {statusBadges.map((badge) => (
                          <span
                            key={badge.label}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getBadgeClass(badge.tone)}`}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Link
                          href={withTenantPrefix(`/dashboard/courses/${course.id}/students`, tenant.type)}
                          className="rounded-[8px] bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          학생
                        </Link>
                        {course.featureAttendance ? (
                          <Link
                            href={withTenantPrefix(`/dashboard/courses/${course.id}/attendance`, tenant.type)}
                            className="rounded-[8px] bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            출석
                          </Link>
                        ) : null}
                        {course.featureDesignatedSeat ? (
                          <Link
                            href={withTenantPrefix(`/dashboard/courses/${course.id}/designated-seats`, tenant.type)}
                            className="rounded-[8px] bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            지정좌석
                          </Link>
                        ) : null}
                        <Link
                          href={withTenantPrefix(`/dashboard/courses/${course.id}/students`, tenant.type)}
                          className="rounded-[8px] bg-[#0071e3] px-3 py-2 text-center text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          수납
                        </Link>
                        <Link
                          href={withTenantPrefix(`/dashboard/courses/${course.id}`, tenant.type)}
                          className="rounded-[8px] bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          상세
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="admin-dashboard-course-table">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                  <th className="px-5 py-3">강좌</th>
                  <th className="px-3 py-3">유형</th>
                  <th className="px-3 py-3">수강 현황</th>
                  <th className="px-3 py-3">기능</th>
                  <th className="px-3 py-3">운영 상태</th>
                  <th className="px-5 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                  {visibleCourses.map((course) => {
                  const featureBadges = getFeatureBadges(course)
                  const statusBadges = getStatusBadges(course)

                  return (
                    <tr key={course.id} className="align-top hover:bg-slate-50/70">
                      <td className="admin-table-course px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div>
                            <p className="admin-dashboard-course-name">{course.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-slate-600">{formatCourseTypeLabel(course.courseType)}</td>
                      <td className="px-3 py-4">
                        <div className="flex flex-col gap-1 text-xs">
                          <span className="font-semibold text-slate-900">활성 수강 {course.activeStudents}명</span>
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
                            href={withTenantPrefix(`/dashboard/courses/${course.id}/students`, tenant.type)}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            수납
                          </Link>
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
          </>
        )}
      </section>
    </div>
  )
}
