'use client'

import { AlertTriangle, BarChart3, CheckCircle2, Sparkles, Users } from 'lucide-react'

import type { AnalyticsBucket, CourseAnalyticsResult } from '@/lib/course-analytics'

const APPLE_BLUE = '#0071e3'
const MISSING_LABEL = '미입력'

function getPercent(count: number, total: number) {
  if (total <= 0) return 0
  return (count / total) * 100
}

function formatPercent(value: number) {
  if (value <= 0) return '0%'
  if (value >= 99.95) return '100%'
  return `${value.toFixed(1)}%`
}

function completionRate(total: number, missing: number) {
  if (total <= 0) return 0
  return Math.max(0, Math.round(((total - missing) / total) * 100))
}

function visibleBuckets(buckets: AnalyticsBucket[]) {
  return buckets.filter((bucket) => bucket.count > 0 && bucket.label !== MISSING_LABEL)
}

function allBuckets(buckets: AnalyticsBucket[]) {
  return buckets.filter((bucket) => bucket.count > 0)
}

function buildInsights(analytics: CourseAnalyticsResult) {
  const insights: string[] = []
  const total = analytics.total

  if (total <= 0) {
    return ['현재 수강중인 학생 데이터가 아직 없습니다.']
  }

  const cohorts = visibleBuckets(analytics.cohort)
  const topCohort = cohorts[0]
  const secondCohort = cohorts[1]

  if (topCohort) {
    const topCohorts = cohorts.filter((bucket) => bucket.count === topCohort.count)
    const topCohortLabel =
      topCohorts.length === 1
        ? topCohort.label
        : topCohorts.length <= 3
          ? topCohorts.map((bucket) => bucket.label).join(', ')
          : `${topCohort.label} 외 ${topCohorts.length - 1}개 기수`
    insights.push(`${topCohortLabel}가 ${topCohort.count}명으로 가장 많습니다.`)
  }

  if (topCohort && secondCohort) {
    const topTwoPercent = getPercent(topCohort.count + secondCohort.count, total)
    if (topTwoPercent >= 60) {
      insights.push(`상위 2개 기수가 전체의 ${formatPercent(topTwoPercent)}를 차지합니다.`)
    }
  }

  const studentTypes = visibleBuckets(analytics.studentType)
  const topStudentType = studentTypes[0]
  if (topStudentType) {
    const ratio = getPercent(topStudentType.count, total)
    insights.push(`${topStudentType.label} 비중은 ${formatPercent(ratio)}입니다.`)
  }

  if (analytics.missing.cohort > 0) {
    insights.push(`기수 미입력 학생 ${analytics.missing.cohort}명은 분석에서 별도 확인이 필요합니다.`)
  }

  if (analytics.missing.gender > 0) {
    insights.push(`성별 미입력 학생이 ${analytics.missing.gender}명 있어 성비 해석에 주의가 필요합니다.`)
  }

  if (insights.length === 0) {
    insights.push('수강생 기본 정보가 안정적으로 입력되어 있습니다.')
  }

  return insights.slice(0, 4)
}

function MetricCard({
  label,
  value,
  helper,
  tone = 'default',
}: {
  label: string
  value: string
  helper: string
  tone?: 'default' | 'blue'
}) {
  return (
    <div className="rounded-[12px] border border-slate-100 bg-[#f5f5f7] px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tracking-normal ${
          tone === 'blue' ? 'text-[#0071e3]' : 'text-[#1d1d1f]'
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
      {label}
    </div>
  )
}

function InsightPanel({ insights }: { insights: string[] }) {
  return (
    <section className="rounded-[12px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#1d1d1f]">
        <Sparkles className="h-4 w-4 text-[#0071e3]" />
        핵심 인사이트
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {insights.map((insight) => (
          <div
            key={insight}
            className="rounded-[10px] border border-slate-100 bg-[#f5f5f7] px-4 py-3 text-sm leading-6 text-slate-700"
          >
            {insight}
          </div>
        ))}
      </div>
    </section>
  )
}

function DataQualityCard({ analytics }: { analytics: CourseAnalyticsResult }) {
  const missingItems = [
    { label: '기수', count: analytics.missing.cohort },
    { label: '성별', count: analytics.missing.gender },
    { label: '직렬', count: analytics.missing.series },
  ].filter((item) => item.count > 0)

  if (analytics.total <= 0) {
    return null
  }

  if (missingItems.length === 0) {
    return (
      <section className="flex items-start gap-3 rounded-[12px] border border-slate-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0071e3]" />
        <div>
          <div className="font-semibold text-[#1d1d1f]">기본 분석 정보가 모두 입력되어 있습니다.</div>
          <div className="mt-0.5 text-slate-500">현재 강좌의 기수, 성별, 직렬 기준 분석을 그대로 참고할 수 있습니다.</div>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-[12px] border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#0071e3]" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#1d1d1f]">분석 전 확인할 정보가 있습니다.</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {missingItems.map((item) => (
              <span
                key={item.label}
                className="rounded-full bg-[#f5f5f7] px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
              >
                {item.label} 미입력 {item.count}명
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function CohortSection({ analytics }: { analytics: CourseAnalyticsResult }) {
  const cohorts = visibleBuckets(analytics.cohort)
  const maxCohortCount = cohorts[0]?.count ?? 0

  return (
    <section className="rounded-[12px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1d1d1f]">
            <BarChart3 className="h-4 w-4 text-[#0071e3]" />
            기수별 수강 현황
          </div>
          <p className="mt-1 text-sm text-slate-500">현재 강좌에 실제 등록된 기수만 표시합니다.</p>
        </div>
        <div className="text-sm text-slate-500">총 {analytics.total.toLocaleString('ko-KR')}명</div>
      </div>

      <div className="mt-5 space-y-4">
        {cohorts.length === 0 ? (
          <EmptyState label="기수가 입력된 수강생이 아직 없습니다." />
        ) : (
          cohorts.map((bucket) => {
            const percent = getPercent(bucket.count, analytics.total)
            const width = Math.max(percent, 2)
            const isTopCohort = maxCohortCount > 0 && bucket.count === maxCohortCount

            return (
              <div key={bucket.label} className="rounded-[12px] border border-slate-100 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-[#1d1d1f]">{bucket.label}</span>
                      {isTopCohort ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-[#0071e3] ring-1 ring-blue-100">
                          최다
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm text-slate-600">
                    <span className="font-semibold text-[#1d1d1f]">{bucket.count.toLocaleString('ko-KR')}명</span>
                    <span className="ml-2 text-slate-400">{formatPercent(percent)}</span>
                  </div>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${width}%`, backgroundColor: APPLE_BLUE }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function DistributionCard({
  title,
  helper,
  buckets,
  total,
}: {
  title: string
  helper: string
  buckets: AnalyticsBucket[]
  total: number
}) {
  const rows = allBuckets(buckets)

  return (
    <section className="rounded-[12px] border border-slate-100 bg-white p-5 shadow-sm">
      <div>
        <div className="text-sm font-semibold text-[#1d1d1f]">{title}</div>
        <p className="mt-1 text-sm text-slate-500">{helper}</p>
      </div>

      <div className="mt-5 space-y-3">
        {rows.length === 0 ? (
          <EmptyState label="표시할 데이터가 없습니다." />
        ) : (
          rows.map((bucket) => {
            const percent = getPercent(bucket.count, total)
            const isMissing = bucket.label === MISSING_LABEL

            return (
              <div key={bucket.label}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className={`min-w-0 truncate font-medium ${isMissing ? 'text-slate-500' : 'text-slate-700'}`}>
                    {bucket.label}
                  </span>
                  <span className="shrink-0 text-slate-500">
                    <span className="font-semibold text-[#1d1d1f]">{bucket.count.toLocaleString('ko-KR')}명</span>
                    <span className="ml-2 text-slate-400">{formatPercent(percent)}</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${isMissing ? 'bg-slate-400' : 'bg-slate-700'}`}
                    style={{ width: `${Math.max(percent, 2)}%` }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function SplitCard({
  title,
  helper,
  buckets,
  total,
}: {
  title: string
  helper: string
  buckets: AnalyticsBucket[]
  total: number
}) {
  const rows = allBuckets(buckets)

  return (
    <section className="rounded-[12px] border border-slate-100 bg-white p-5 shadow-sm">
      <div>
        <div className="text-sm font-semibold text-[#1d1d1f]">{title}</div>
        <p className="mt-1 text-sm text-slate-500">{helper}</p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState label="표시할 데이터가 없습니다." />
        </div>
      ) : (
        <>
          <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {rows.map((bucket, index) => {
              const percent = getPercent(bucket.count, total)
              const color =
                bucket.label === MISSING_LABEL
                  ? '#9ca3af'
                  : index === 0
                    ? APPLE_BLUE
                    : index === 1
                      ? '#1d1d1f'
                      : '#64748b'

              return (
                <div
                  key={bucket.label}
                  className="h-full"
                  style={{
                    width: `${Math.max(percent, 2)}%`,
                    backgroundColor: color,
                  }}
                />
              )
            })}
          </div>

          <div className="mt-4 grid gap-2">
            {rows.map((bucket, index) => {
              const percent = getPercent(bucket.count, total)
              const color =
                bucket.label === MISSING_LABEL
                  ? '#9ca3af'
                  : index === 0
                    ? APPLE_BLUE
                    : index === 1
                      ? '#1d1d1f'
                      : '#64748b'

              return (
                <div key={bucket.label} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="truncate font-medium text-slate-700">{bucket.label}</span>
                  </div>
                  <div className="shrink-0 text-slate-500">
                    <span className="font-semibold text-[#1d1d1f]">{bucket.count.toLocaleString('ko-KR')}명</span>
                    <span className="ml-2 text-slate-400">{formatPercent(percent)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

export function CourseAnalyticsClient({
  analytics,
}: {
  analytics: CourseAnalyticsResult
}) {
  const course = analytics.course
  const cohortCount = visibleBuckets(analytics.cohort).length
  const insights = buildInsights(analytics)
  const cohortCompletion = completionRate(analytics.total, analytics.missing.cohort)
  const genderCompletion = completionRate(analytics.total, analytics.missing.gender)

  return (
    <div className="space-y-5">
      <section className="rounded-[14px] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase text-[#0071e3]">Course Insight</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#1d1d1f]">수강생 현황</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {course.name} 수강생 구성을 기수 중심으로 요약합니다.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-[#f5f5f7] px-3 py-2 text-sm font-medium text-slate-600">
            <Users className="h-4 w-4 text-[#0071e3]" />
            강좌 ID {course.id}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="총 수강생"
            value={`${analytics.total.toLocaleString('ko-KR')}명`}
            helper="현재 수강중 기준"
            tone="blue"
          />
          <MetricCard label="참여 기수" value={`${cohortCount.toLocaleString('ko-KR')}개`} helper="입력된 기수만 집계" />
          <MetricCard label="기수 입력률" value={`${cohortCompletion}%`} helper={`미입력 ${analytics.missing.cohort}명`} />
          <MetricCard label="성별 입력률" value={`${genderCompletion}%`} helper={`미입력 ${analytics.missing.gender}명`} />
        </div>
      </section>

      <DataQualityCard analytics={analytics} />
      <InsightPanel insights={insights} />
      <CohortSection analytics={analytics} />

      <div className="grid gap-5 lg:grid-cols-3">
        <SplitCard title="성별 구성" helper="남/여 입력값 기준" buckets={analytics.gender} total={analytics.total} />
        <DistributionCard title="직렬 구성" helper="공채/경채 및 직렬 기준" buckets={analytics.series} total={analytics.total} />
        <SplitCard title="학원/일반 구성" helper="수강생 구분 기준" buckets={analytics.studentType} total={analytics.total} />
      </div>
    </div>
  )
}
