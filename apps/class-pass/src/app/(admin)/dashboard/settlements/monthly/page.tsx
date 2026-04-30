'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Download, FileSpreadsheet, RefreshCw } from 'lucide-react'
import { useTenantConfig } from '@/components/TenantProvider'
import { buildSettlementReport, type SettlementSeriesFilter } from '@/lib/payments/settlement-report'
import { downloadMonthlySettlementXlsx, downloadSettlementCsv } from '@/lib/payments/xlsx-export'
import { formatWon } from '@/lib/payments/format'
import { PAYMENT_METHOD_LABEL, type EnrollmentPayment, type PaymentMethod } from '@/lib/payments/types'
import { withTenantPrefix } from '@/lib/tenant'
import type { Course } from '@/types/database'

const PAYMENT_METHOD_ORDER: PaymentMethod[] = ['card', 'cash', 'bank_transfer', 'point', 'other', 'free']

function getCurrentMonthKst() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function getMonthOptions() {
  const current = getCurrentMonthKst()
  const [year, month] = current.split('-').map(Number)
  return Array.from({ length: 18 }, (_, index) => {
    const date = new Date(year, month - 1 - index, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return { value, label: `${date.getFullYear()}년 ${date.getMonth() + 1}월` }
  })
}

function getMonthRange(month: string) {
  const [year, monthIndex] = month.split('-').map(Number)
  const lastDate = new Date(year, monthIndex, 0).getDate()
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDate).padStart(2, '0')}`,
  }
}

function getInitialCourseId() {
  if (typeof window === 'undefined') {
    return ''
  }

  const courseId = new URLSearchParams(window.location.search).get('courseId')
  return courseId && /^\d+$/.test(courseId) ? courseId : ''
}

function parseSeriesFilter(value: string): SettlementSeriesFilter | undefined {
  if (value === 'public' || value === 'career') {
    return { group: value }
  }

  if (value.startsWith('detail:')) {
    const [, group, ...labelParts] = value.split(':')
    if (group === 'public' || group === 'career') {
      return { group, label: labelParts.join(':') }
    }
  }

  return undefined
}

function toSeriesFilterValue(group: string, label: string) {
  return `detail:${group}:${label}`
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'blue' | 'rose' }) {
  const toneClass = tone === 'blue' ? 'text-blue-600' : tone === 'rose' ? 'text-rose-600' : 'text-slate-900'
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
    </article>
  )
}

export default function MonthlySettlementsPage() {
  const tenant = useTenantConfig()
  const monthOptions = useMemo(getMonthOptions, [])
  const [month, setMonth] = useState(getCurrentMonthKst)
  const [courses, setCourses] = useState<Course[]>([])
  const [courseId, setCourseId] = useState(getInitialCourseId)
  const [rawPayments, setRawPayments] = useState<EnrollmentPayment[]>([])
  const [seriesFilter, setSeriesFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const range = useMemo(() => getMonthRange(month), [month])

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({ from: range.from, to: range.to, limit: '10000' })
      if (courseId) {
        params.set('courseId', courseId)
      }
      const response = await fetch(`/api/payments/settlement/details?${params.toString()}`, { cache: 'no-store' })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(result?.error ?? '월별 정산 데이터를 불러오지 못했습니다.')
      }

      setRawPayments((result?.payments ?? []) as EnrollmentPayment[])
    } catch (reason) {
      setRawPayments([])
      setError(reason instanceof Error ? reason.message : '월별 정산 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [courseId, range.from, range.to])

  useEffect(() => {
    fetch('/api/courses?activeOnly=1', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(result?.error ?? '강좌 목록을 불러오지 못했습니다.')
        }
        setCourses((result?.courses ?? []) as Course[])
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '강좌 목록을 불러오지 못했습니다.')
      })
  }, [])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  const allReport = useMemo(
    () => buildSettlementReport(rawPayments, range.from, range.to),
    [range.from, range.to, rawPayments],
  )
  const report = useMemo(
    () => buildSettlementReport(rawPayments, range.from, range.to, parseSeriesFilter(seriesFilter)),
    [range.from, range.to, rawPayments, seriesFilter],
  )

  const methodRows = useMemo(() => {
    const rows = new Map<PaymentMethod, { method: PaymentMethod; label: string; count: number; gross: number; refund: number; net: number }>()

    for (const method of PAYMENT_METHOD_ORDER) {
      rows.set(method, { method, label: PAYMENT_METHOD_LABEL[method], count: 0, gross: 0, refund: 0, net: 0 })
    }

    for (const row of report?.paymentRows ?? []) {
      const current = rows.get(row.originalPaymentMethod) ?? {
        method: row.originalPaymentMethod,
        label: row.originalPaymentMethodLabel,
        count: 0,
        gross: 0,
        refund: 0,
        net: 0,
      }
      current.count += 1
      current.gross += row.paymentAmount
      current.net += row.paymentAmount
      rows.set(row.originalPaymentMethod, current)
    }

    for (const row of report?.refundRows ?? []) {
      const current = rows.get(row.originalPaymentMethod) ?? {
        method: row.originalPaymentMethod,
        label: row.originalPaymentMethodLabel,
        count: 0,
        gross: 0,
        refund: 0,
        net: 0,
      }
      current.refund += row.refundAmount
      current.net -= row.refundAmount
      rows.set(row.originalPaymentMethod, current)
    }

    return Array.from(rows.values())
  }, [report])

  const maxCategoryNet = Math.max(...(report?.categories ?? []).map((category) => Math.max(category.netAmount, 0)), 1)
  const topCourses = (report?.courseRows ?? []).slice(0, 10)
  const summary = report?.summary ?? {
    grossAmount: 0,
    refundAmount: 0,
    netAmount: 0,
    paymentCount: 0,
    refundCount: 0,
    payerCount: 0,
    averageDailyNet: 0,
    refundRate: 0,
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Monthly Settlement</p>
            <h1 className="mt-1 text-2xl font-semibold text-[#1d1d1f]">월별 정산</h1>
            <p className="mt-2 text-sm text-slate-500">월간 수납 흐름, 환불률, 강좌별 매출 순위를 확인합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={withTenantPrefix('/dashboard/settlements/daily', tenant.type)}
              className="inline-flex items-center gap-2 rounded-[8px] bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              <CalendarDays className="h-4 w-4" />
              일일 보기
            </Link>
            <button
              type="button"
              onClick={() => report ? downloadSettlementCsv(report.ledgerRows, `settlement-monthly-${month.replace(/-/g, '')}.csv`) : undefined}
              disabled={!report?.ledgerRows.length}
              className="inline-flex items-center gap-2 rounded-[8px] bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => report ? downloadMonthlySettlementXlsx(report, month) : undefined}
              disabled={!report}
              className="inline-flex items-center gap-2 rounded-[8px] bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              XLSX 다운로드
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[220px,1fr,220px,auto]">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">정산월</span>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">강좌</span>
            <select
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            >
              <option value="">전체 강좌</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">직렬</span>
            <select
              value={seriesFilter}
              onChange={(event) => setSeriesFilter(event.target.value)}
              className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            >
              <option value="all">전체 직렬</option>
              <option value="public">공채</option>
              <option value="career">경채</option>
              {allReport.seriesRows.map((series) => (
                <option key={series.key} value={toSeriesFilterValue(series.group, series.label)}>
                  {series.group === 'career' ? '경채' : '공채'} · {series.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadReport()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 self-end rounded-[8px] bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            조회
          </button>
        </div>
      </section>

      {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard label="월 총매출" value={formatWon(summary.grossAmount)} />
        <StatCard label="환불" value={formatWon(summary.refundAmount)} tone="rose" />
        <StatCard label="순매출" value={formatWon(summary.netAmount)} tone="blue" />
        <StatCard label="건수" value={`${(summary.paymentCount + summary.refundCount).toLocaleString('ko-KR')}건`} />
        <StatCard label="일평균" value={formatWon(summary.averageDailyNet)} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <p className="text-sm font-bold text-[#1d1d1f]">
          환불률 {(summary.refundRate * 100).toFixed(1)}%
          <span className="ml-2 font-medium text-slate-500">환불액 / 총매출 기준</span>
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(report?.seriesGroups ?? []).map((series) => (
            <div key={series.key} className="rounded-[8px] bg-slate-50 px-4 py-3">
              <p className="text-sm font-bold text-[#1d1d1f]">{series.label}</p>
              <p className="mt-2 text-lg font-bold text-blue-600">{formatWon(series.netAmount)}</p>
              <p className="mt-1 text-xs text-slate-500">
                수납 {series.paymentCount}건 · 환불 {series.refundCount}건 · {series.studentCount}명
              </p>
            </div>
          ))}
          {(report?.seriesRows ?? []).filter((series) => series.group === 'career').map((series) => (
            <div key={series.key} className="rounded-[8px] bg-blue-50 px-4 py-3">
              <p className="text-sm font-bold text-[#1d1d1f]">{series.label}</p>
              <p className="mt-2 text-lg font-bold text-blue-700">{formatWon(series.netAmount)}</p>
              <p className="mt-1 text-xs text-blue-600">
                수납 {series.paymentCount}건 · 환불 {series.refundCount}건 · {series.studentCount}명
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold text-[#1d1d1f]">결제수단별 월간 합계</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                <tr>
                  {['방법', '건수', '총액', '환불', '순액'].map((header) => (
                    <th key={header} className="px-4 py-3">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {methodRows.map((row) => (
                  <tr key={row.method}>
                    <td className="px-4 py-3 font-semibold text-[#1d1d1f]">{row.label}</td>
                    <td className="px-4 py-3 text-slate-600">{row.count}건</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#1d1d1f]">{formatWon(row.gross)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-600">{formatWon(row.refund)}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{formatWon(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-[#1d1d1f]">분류별 매출</h2>
          <div className="mt-4 space-y-4">
            {(report?.categories ?? []).map((category) => (
              <div key={category.key}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-600">{category.label}</span>
                  <span className="font-bold text-[#1d1d1f]">{formatWon(category.netAmount)}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{ width: `${Math.max(4, Math.round((Math.max(category.netAmount, 0) / maxCategoryNet) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold text-[#1d1d1f]">강좌별 매출 순위 Top 10</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {topCourses.map((course, index) => (
              <div key={course.courseId} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#1d1d1f]">{index + 1}. {course.courseName}</p>
                  <p className="mt-1 text-xs text-slate-500">{course.studentCount}명 · 수납 {course.paymentCount}건 · 환불 {course.refundCount}건</p>
                </div>
                <p className="shrink-0 text-sm font-bold text-blue-600">{formatWon(course.netAmount)}</p>
              </div>
            ))}
            {!loading && topCourses.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">강좌별 매출이 없습니다.</p>
            ) : null}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold text-[#1d1d1f]">일별 명세</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[620px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                <tr>
                  {['일자', '총액', '환불', '순액', '건수'].map((header) => (
                    <th key={header} className="px-4 py-3">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(report?.dailyRows ?? []).map((row) => (
                  <tr key={row.date}>
                    <td className="px-4 py-3">
                      <Link
                        href={withTenantPrefix(`/dashboard/settlements/daily?date=${row.date}${courseId ? `&courseId=${courseId}` : ''}`, tenant.type)}
                        className="font-bold text-blue-600 hover:text-blue-700"
                      >
                        {row.date}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[#1d1d1f]">{formatWon(row.grossAmount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-600">{formatWon(row.refundAmount)}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{formatWon(row.netAmount)}</td>
                    <td className="px-4 py-3 text-slate-600">수납 {row.paymentCount} · 환불 {row.refundCount}</td>
                  </tr>
                ))}
                {!loading && !(report?.dailyRows.length ?? 0) ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">일별 명세가 없습니다.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  )
}
