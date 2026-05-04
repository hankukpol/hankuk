'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Download, FileSpreadsheet, RefreshCw } from 'lucide-react'
import { useTenantConfig } from '@/components/TenantProvider'
import {
  buildSettlementReport,
  type SettlementFilterKind,
  type SettlementSeriesFilter,
} from '@/lib/payments/settlement-report'
import { downloadDailySettlementXlsx, downloadSettlementCsv } from '@/lib/payments/xlsx-export'
import { formatWon } from '@/lib/payments/format'
import { withTenantPrefix } from '@/lib/tenant'
import type { EnrollmentPayment } from '@/lib/payments/types'
import type { Course } from '@/types/database'

function getTodayKst() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getInitialDate() {
  if (typeof window === 'undefined') {
    return getTodayKst()
  }

  const date = new URLSearchParams(window.location.search).get('date')
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getTodayKst()
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

export default function DailySettlementsPage() {
  const tenant = useTenantConfig()
  const [date, setDate] = useState(getInitialDate)
  const [courses, setCourses] = useState<Course[]>([])
  const [courseId, setCourseId] = useState(getInitialCourseId)
  const [rawPayments, setRawPayments] = useState<EnrollmentPayment[]>([])
  const [filter, setFilter] = useState<SettlementFilterKind>('all')
  const [seriesFilter, setSeriesFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({ from: date, to: date, limit: '5000' })
      if (courseId) {
        params.set('courseId', courseId)
      }
      const response = await fetch(`/api/payments/settlement/details?${params.toString()}`, { cache: 'no-store' })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(result?.error ?? '일일 정산 데이터를 불러오지 못했습니다.')
      }

      setRawPayments((result?.payments ?? []) as EnrollmentPayment[])
    } catch (reason) {
      setRawPayments([])
      setError(reason instanceof Error ? reason.message : '일일 정산 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [courseId, date])

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
    () => buildSettlementReport(rawPayments, date, date),
    [date, rawPayments],
  )
  const report = useMemo(
    () => buildSettlementReport(rawPayments, date, date, parseSeriesFilter(seriesFilter)),
    [date, rawPayments, seriesFilter],
  )

  const rows = useMemo(() => {
    const ledgerRows = report?.ledgerRows ?? []
    if (filter === 'payment') {
      return ledgerRows.filter((row) => row.kind === 'payment')
    }
    if (filter === 'refund') {
      return ledgerRows.filter((row) => row.kind === 'refund')
    }
    return ledgerRows
  }, [filter, report])

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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Daily Settlement</p>
            <h1 className="mt-1 text-2xl font-semibold text-[#1d1d1f]">일일 정산</h1>
            <p className="mt-2 text-sm text-slate-500">하루 수납, 환불, 영수증 번호 범위와 결제자 명단을 확인합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={withTenantPrefix('/dashboard/settlements/monthly', tenant.type)}
              className="inline-flex items-center gap-2 rounded-[8px] bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              <CalendarDays className="h-4 w-4" />
              월별 보기
            </Link>
            <button
              type="button"
              onClick={() => report ? downloadSettlementCsv(report.ledgerRows, `settlement-daily-${date.replace(/-/g, '')}.csv`) : undefined}
              disabled={!report?.ledgerRows.length}
              className="inline-flex items-center gap-2 rounded-[8px] bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => report ? downloadDailySettlementXlsx(report, date) : undefined}
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
            <span className="text-xs font-semibold text-slate-500">정산일</span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-[8px] border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
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

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <StatCard label="총매출" value={formatWon(summary.grossAmount)} />
        <StatCard label="환불" value={formatWon(summary.refundAmount)} tone="rose" />
        <StatCard label="순매출" value={formatWon(summary.netAmount)} tone="blue" />
        <StatCard label="수납건수" value={`${summary.paymentCount.toLocaleString('ko-KR')}건`} />
        <StatCard label="환불건수" value={`${summary.refundCount.toLocaleString('ko-KR')}건`} tone="rose" />
        <StatCard label="결제자수" value={`${summary.payerCount.toLocaleString('ko-KR')}명`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-[#1d1d1f]">수납</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(report?.paymentMethods ?? []).map((method) => (
              <div key={method.key} className="rounded-[8px] bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-[#1d1d1f]">{method.label}</p>
                  <span className="text-xs font-semibold text-slate-400">{method.count}건</span>
                </div>
                <p className="mt-2 text-lg font-bold text-blue-600">{formatWon(method.grossAmount)}</p>
                <p className="mt-1 text-xs text-slate-500">영수증 번호 {method.receiptRange}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-[#1d1d1f]">환불</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(report?.refundMethods ?? []).map((method) => (
              <div key={method.key} className="rounded-[8px] bg-rose-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-[#1d1d1f]">{method.label}</p>
                  <span className="text-xs font-semibold text-rose-400">{method.count}건</span>
                </div>
                <p className="mt-2 text-lg font-bold text-rose-600">{formatWon(method.refundAmount)}</p>
                <p className="mt-1 text-xs text-rose-500">영수증 번호 {method.receiptRange}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {(report?.categories ?? []).map((category) => (
            <div key={category.key} className="flex items-center justify-between gap-3 rounded-[8px] bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-600">{category.label}</p>
              <p className="text-sm font-bold text-[#1d1d1f]">{formatWon(category.netAmount)}</p>
            </div>
          ))}
        </div>
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

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1d1d1f]">결제 명단</h2>
            <p className="mt-1 text-xs text-slate-500">시각 역순으로 수납과 환불을 함께 표시합니다.</p>
          </div>
          <div className="flex rounded-[8px] bg-slate-100 p-1">
            {[
              ['all', '전체'],
              ['payment', '수납만'],
              ['refund', '환불만'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value as SettlementFilterKind)}
                className={`rounded-[7px] px-3 py-1.5 text-xs font-bold transition ${
                  filter === value ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1160px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold text-slate-500">
              <tr>
                {['시각', '학생', '학원구분', '강좌', '직렬', '방법', '결제액', '환불', '순액', '영수증번호', '사유'].map((header) => (
                  <th key={header} className="px-4 py-3">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className={row.kind === 'refund' ? 'bg-rose-50/70' : 'bg-white'}>
                  <td className="px-4 py-3 font-medium text-slate-600">{row.time}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#1d1d1f]">{row.studentName}</p>
                    <p className="mt-1 text-xs text-slate-400">{row.examNumber ?? row.phone ?? '-'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-[8px] bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      {row.studentTypeLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.courseName}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-[8px] px-2.5 py-1 text-xs font-bold ${
                      row.seriesGroup === 'career' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {row.seriesLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{row.methodLabel}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[#1d1d1f]">{formatWon(row.paymentAmount)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-rose-600">{formatWon(row.refundAmount)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${row.netAmount < 0 ? 'text-rose-600' : 'text-blue-600'}`}>
                    {formatWon(row.netAmount)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.receiptNo}</td>
                  <td className="px-4 py-3">
                    {row.reasonCategoryLabel ? (
                      <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-rose-600 shadow-sm">
                        {row.reasonCategoryLabel}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">{row.memo ?? '-'}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">정산 내역이 없습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
