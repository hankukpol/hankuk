'use client'

import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'
import { formatCourseTypeLabel } from '@/lib/utils'
import type { Course } from '@/types/database'

type CourseLayoutProps = {
  children: React.ReactNode
}

type CourseRouteTab = {
  href: string
  label: string
  enabled: boolean
  match: (pathname: string) => boolean
}

async function fetchCourseHeader(courseId: number): Promise<Course> {
  const response = await fetch(`/api/courses/${courseId}`, { cache: 'no-store' })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error ?? '강좌 정보를 불러오지 못했습니다.')
  }

  return payload.course as Course
}

export default function CourseLayout({ children }: CourseLayoutProps) {
  const params = useParams<{ id: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const tenant = useTenantConfig()
  const courseId = Number(params.id)

  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [duplicating, setDuplicating] = useState(false)
  const [error, setError] = useState('')
  const [hasMounted, setHasMounted] = useState(false)

  const basePath = useMemo(
    () => withTenantPrefix(`/dashboard/courses/${courseId}`, tenant.type),
    [courseId, tenant.type],
  )

  useEffect(() => {
    setHasMounted(true)
  }, [])

  useEffect(() => {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      setCourse(null)
      setLoading(false)
      setError('잘못된 강좌 ID입니다.')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    fetchCourseHeader(courseId)
      .then((nextCourse) => {
        if (cancelled) {
          return
        }
        setCourse(nextCourse)
      })
      .catch((reason: unknown) => {
        if (cancelled) {
          return
        }
        setCourse(null)
        setError(reason instanceof Error ? reason.message : '강좌 정보를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [courseId])

  const tabs = useMemo<CourseRouteTab[]>(() => {
    const matches = (href: string) => (currentPathname: string) =>
      currentPathname === href || currentPathname.startsWith(`${href}/`)

    return [
      {
        label: '설정',
        href: basePath,
        enabled: true,
        match: (currentPathname) => currentPathname === basePath,
      },
      {
        label: '수강생',
        href: `${basePath}/students`,
        enabled: true,
        match: matches(`${basePath}/students`),
      },
      {
        label: '결제',
        href: `${basePath}/payments`,
        enabled: true,
        match: matches(`${basePath}/payments`),
      },
      {
        label: '좌석 배정',
        href: `${basePath}/seats`,
        enabled: course ? course.feature_seat_assignment : true,
        match: matches(`${basePath}/seats`),
      },
      {
        label: '지정좌석',
        href: `${basePath}/designated-seats`,
        enabled: course ? course.feature_designated_seat : true,
        match: matches(`${basePath}/designated-seats`),
      },
      {
        label: '출결',
        href: `${basePath}/attendance`,
        enabled: course ? course.feature_attendance : true,
        match: matches(`${basePath}/attendance`),
      },
      {
        label: '자료',
        href: `${basePath}/materials`,
        enabled: course ? course.feature_qr_distribution : true,
        match: matches(`${basePath}/materials`),
      },
    ]
  }, [basePath, course])

  async function handleDuplicate() {
    if (!course) {
      return
    }

    const confirmed = window.confirm(
      `"${course.name}" 강좌를 복사할까요?\n\n강좌 설정, 과목, 수강생 추가 필드만 복사되고 학생/자료/좌석 데이터는 복사되지 않습니다.`,
    )

    if (!confirmed) {
      return
    }

    setDuplicating(true)
    setError('')

    const response = await fetch(`/api/courses/${course.id}/duplicate`, {
      method: 'POST',
    })
    const payload = await response.json().catch(() => null)
    setDuplicating(false)

    if (!response.ok) {
      setError(payload?.error ?? '강좌 복사본을 만들지 못했습니다.')
      return
    }

    const duplicated = payload?.course as Course | undefined
    if (!duplicated?.id) {
      setError('복사된 강좌 정보를 확인하지 못했습니다.')
      return
    }

    router.push(withTenantPrefix(`/dashboard/courses/${duplicated.id}`, tenant.type))
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[8px] border border-slate-200 bg-white px-5 pt-5 sm:px-6 sm:pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">강좌 관리</p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-[#1d1d1f]">
              {course?.name ?? (loading ? '강좌 정보를 불러오는 중...' : '강좌 정보를 확인할 수 없습니다.')}
            </h1>
            <p className="mt-1 text-sm text-[#86868b]">
              {course ? `${formatCourseTypeLabel(course.course_type)} slug ${course.slug}` : `강좌 ID ${courseId}`}
            </p>
            {course?.copied_from_course_name ? (
              <p className="mt-1 text-xs font-medium text-indigo-600">
                원본 강좌: {course.copied_from_course_name}
              </p>
            ) : null}
          </div>

          {course ? (
            <button
              type="button"
              onClick={() => void handleDuplicate()}
              disabled={duplicating}
              className="rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {duplicating ? '복사중' : '복사'}
            </button>
          ) : (
            <div className="h-10 w-20 rounded-[8px] bg-slate-100" />
          )}
        </div>

        <div className="mt-5 flex gap-6 border-b border-slate-200 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = hasMounted && tab.match(pathname)

            if (!tab.enabled) {
              return (
                <span
                  key={tab.href}
                  title="이 기능은 비활성화되어 있습니다"
                  aria-disabled="true"
                  className="-mb-px whitespace-nowrap border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-semibold text-slate-300 cursor-not-allowed"
                >
                  {tab.label}
                </span>
              )
            }

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`-mb-px whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-sm font-semibold transition ${
                  isActive
                    ? 'border-[#1d1d1f] text-[#1d1d1f]'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-[#1d1d1f]'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </section>

      {error ? (
        <div className="rounded-[8px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      ) : null}

      {children}
    </div>
  )
}
