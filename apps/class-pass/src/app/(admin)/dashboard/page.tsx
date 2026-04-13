'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import type { Course } from '@/types/database'
import { withTenantPrefix } from '@/lib/tenant'
import { formatDateTime } from '@/lib/utils'

type DashboardStats = {
  totalStudents: number
  todayDistributions: number
  totalDistributions: number
  completionRate: number
  hourlyDistributions: { hour: number; count: number }[]
  materialStats: { id: number; name: string; total: number; received: number; rate: number }[]
}

export default function AdminDashboardPage() {
  const tenant = useTenantConfig()
  const [courses, setCourses] = useState<Course[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/courses').then(async (r) => {
        const p = await r.json().catch(() => null)
        if (!r.ok) throw new Error(p?.error ?? '강좌 목록을 불러오지 못했습니다.')
        return (p.courses ?? []) as Course[]
      }),
      fetch('/api/dashboard/stats').then(async (r) => {
        const p = await r.json().catch(() => null)
        if (!r.ok) return null
        return p as DashboardStats
      }),
    ])
      .then(([coursesData, statsData]) => {
        setCourses(coursesData)
        setStats(statsData)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '데이터를 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [])

  const activeCourses = useMemo(
    () => courses.filter((c) => c.status === 'active'),
    [courses],
  )

  const maxHourly = useMemo(() => {
    if (!stats?.hourlyDistributions) return 1
    return Math.max(1, ...stats.hourlyDistributions.map((h) => h.count))
  }, [stats?.hourlyDistributions])

  if (loading) {
    return <p className="py-12 text-center text-sm text-gray-400">불러오는 중...</p>
  }

  if (error) {
    return <p className="py-12 text-center text-sm text-red-500">{error}</p>
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 rounded-2xl bg-white px-5 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900">운영 대시보드</h2>
          <p className="mt-1 text-sm text-gray-500">
            강좌 운영 현황을 확인하고 학생 인증 설정 같은 관리 작업으로 바로 이동할 수 있습니다.
          </p>
        </div>
        <Link
          href={withTenantPrefix('/dashboard/students/auth-setup', tenant.type)}
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          학생 인증 일괄 설정
        </Link>
      </div>
      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: '수강생', value: stats?.totalStudents ?? 0, accent: 'text-blue-600' },
          { label: '오늘 배부', value: stats?.todayDistributions ?? 0, accent: 'text-emerald-600' },
          { label: '총 배부', value: stats?.totalDistributions ?? 0, accent: 'text-amber-600' },
          { label: '수령률', value: stats ? `${stats.completionRate}%` : '-', accent: 'text-violet-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-2xl bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-medium text-gray-400">{kpi.label}</p>
            <p className={`mt-1 text-2xl font-extrabold ${kpi.accent}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Hourly bar chart — wider */}
        <section className="rounded-2xl bg-white p-5 shadow-sm lg:col-span-3">
          <h3 className="text-sm font-bold text-gray-700">시간대별 배부</h3>
          {stats ? (
            <div className="mt-4 flex items-end gap-[3px]" style={{ height: 120 }}>
              {stats.hourlyDistributions.map((h) => (
                <div
                  key={h.hour}
                  className="group relative flex flex-1 flex-col items-center justify-end"
                  style={{ height: '100%' }}
                >
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{
                      height: `${Math.max(3, (h.count / maxHourly) * 100)}%`,
                      background: h.count > 0 ? 'var(--theme)' : '#e2e8f0',
                      minHeight: 3,
                    }}
                  />
                  {h.count > 0 && (
                    <span className="absolute -top-4 hidden text-[10px] font-bold text-gray-500 group-hover:block">
                      {h.count}
                    </span>
                  )}
                  {h.hour % 3 === 0 && (
                    <span className="mt-1 text-[9px] text-gray-400">{h.hour}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-xs text-gray-400">데이터 없음</p>
          )}
        </section>

        {/* Material receipt rates — narrower */}
        <section className="rounded-2xl bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-bold text-gray-700">자료 수령률</h3>
          {stats && stats.materialStats.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              {stats.materialStats.map((mat) => (
                <div key={mat.id}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium text-gray-600">{mat.name}</span>
                    <span className="tabular-nums text-gray-400">
                      {mat.received}/{mat.total}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${mat.rate}%`,
                        background:
                          mat.rate >= 80 ? '#10b981' : mat.rate >= 50 ? '#f59e0b' : 'var(--theme)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-xs text-gray-400">등록된 자료 없음</p>
          )}
        </section>
      </div>

      {/* ── Active courses table ── */}
      <section className="rounded-2xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-bold text-gray-700">
            운영 중 강좌 <span className="ml-1 text-gray-400">{activeCourses.length}</span>
          </h3>
          <Link
            href={withTenantPrefix('/dashboard/courses', tenant.type)}
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            전체 강좌 관리 →
          </Link>
        </div>

        {activeCourses.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">운영 중인 강좌가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-gray-400">
                  <th className="px-5 py-3">강좌</th>
                  <th className="px-3 py-3">유형</th>
                  <th className="hidden px-3 py-3 md:table-cell">기능</th>
                  <th className="hidden px-3 py-3 lg:table-cell">생성일</th>
                  <th className="px-5 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {activeCourses.map((course) => {
                  const tags = [
                    course.feature_qr_pass && 'QR',
                    course.feature_qr_distribution && '배부',
                    course.feature_seat_assignment && '좌석',
                    course.feature_photo && '사진',
                    course.feature_exam_delivery_mode && '배부모드',
                    course.feature_weekday_color && '요일색',
                    course.feature_anti_forgery_motion && '보안효과',
                  ].filter(Boolean)

                  return (
                    <tr key={course.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                            style={{ background: course.theme_color ?? 'var(--theme)' }}
                          >
                            {course.id}
                          </span>
                          <span className="font-semibold text-gray-900">{course.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-500">
                        {course.course_type === 'interview'
                          ? '면접'
                          : course.course_type === 'mock_exam'
                            ? '모의고사'
                            : course.course_type === 'lecture'
                              ? '강의'
                              : '일반'}
                      </td>
                      <td className="hidden px-3 py-3 md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {tags.map((t) => (
                            <span
                              key={t as string}
                              className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 text-gray-400 lg:table-cell">
                        {formatDateTime(course.created_at).split(' ')[0]}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={withTenantPrefix(`/dashboard/courses/${course.id}/students`, tenant.type)}
                            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                          >
                            수강생
                          </Link>
                          <Link
                            href={withTenantPrefix(`/dashboard/courses/${course.id}`, tenant.type)}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            설정
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
