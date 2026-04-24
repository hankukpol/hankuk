'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react'
import { useTenantConfig } from '@/components/TenantProvider'
import { formatWon, paymentCategoryLabel, paymentMethodLabel } from '@/lib/payments/format'
import type { PaymentMethod, PaymentSettlementRow } from '@/lib/payments/types'
import { withTenantPrefix } from '@/lib/tenant'
import type { Course } from '@/types/database'

type SettlementSummary = {
  grossAmount: number
  refundAmount: number
  netAmount: number
  paymentCount: number
}

type SettlementGroupedRow = SettlementSummary & {
  key: string
  label: string
}

type SettlementPayload = {
  rows: PaymentSettlementRow[]
  summary: SettlementSummary
  groups: {
    daily: SettlementGroupedRow[]
    monthly: SettlementGroupedRow[]
    course: SettlementGroupedRow[]
    method: SettlementGroupedRow[]
  }
}

type GroupKey = keyof SettlementPayload['groups']

function getTodayKey() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

function getMonthStartKey() {
  const today = getTodayKey()
  return `${today.slice(0, 7)}-01`
}

function toCsvCell(value: unknown) {
  const raw = String(value ?? '')
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
}

function downloadCsv(rows: PaymentSettlementRow[]) {
  const header = ['일자', '강좌', '방법', '분류', '총액', '환불', '순액', '건수']
  const lines = [
    header,
    ...rows.map((row) => [
      row.paid_date,
      row.course_name,
      paymentMethodLabel(row.method),
      paymentCategoryLabel(row.category),
      row.gross_amount,
      row.refund_amount,
      row.net_amount,
      row.payment_count,
    ]),
  ].map((line) => line.map(toCsvCell).join(','))

  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `class-pass-settlement-${getTodayKey()}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function SettlementsPage() {
  const tenant = useTenantConfig()
  const [courses, setCourses] = useState<Course[]>([])
  const [courseId, setCourseId] = useState('')
  const [from, setFrom] = useState(getMonthStartKey)
  const [to, setTo] = useState(getTodayKey)
  const [groupKey, setGroupKey] = useState<GroupKey>('daily')
  const [payload, setPayload] = useState<SettlementPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const loadSettlement = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ from, to })
    if (courseId) {
      params.set('courseId', courseId)
    }

    try {
      const response = await fetch(`/api/payments/settlement?${params.toString()}`, { cache: 'no-store' })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(result?.error ?? '정산 데이터를 불러오지 못했습니다.')
      }
      setPayload(result as SettlementPayload)
    } catch (reason) {
      setPayload(null)
      setError(reason instanceof Error ? reason.message : '정산 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [courseId, from, to])

  useEffect(() => {
    void loadSettlement()
  }, [loadSettlement])

  const groupRows = useMemo(() => payload?.groups[groupKey] ?? [], [groupKey, payload])
  const summary = payload?.summary ?? { grossAmount: 0, refundAmount: 0, netAmount: 0, paymentCount: 0 }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[8px] bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Settlement</p>
            <h1 className="mt-1 text-2xl font-semibold text-[#1d1d1f]">수납·정산</h1>
            <p className="mt-2 text-sm text-slate-500">데스크 수납 기록 기준으로 매출, 환불, 순매출을 확인합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={withTenantPrefix('/dashboard/settlements/import', tenant.type)}
              className="inline-flex items-center gap-2 rounded-[8px] bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              <FileSpreadsheet className="h-4 w-4" />
              엑셀 가져오기
            </Link>
            <button
              type="button"
              onClick={() => payload ? downloadCsv(payload.rows) : undefined}
              disabled={!payload?.rows.length}
              className="inline-flex items-center gap-2 rounded-[8px] bg-[#1d1d1f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              CSV 다운로드
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[160px,160px,1fr,auto]">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">시작일</span>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="rounded-[8px] border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">종료일</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
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
          <button
            type="button"
            onClick={() => void loadSettlement()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 self-end rounded-[8px] bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            조회
          </button>
        </div>
      </section>

      {error ? <p className="text-xs text-red-500">{error}</p> : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: '총 매출', value: formatWon(summary.grossAmount), className: 'text-[#1d1d1f]' },
          { label: '환불', value: formatWon(summary.refundAmount), className: 'text-rose-600' },
          { label: '순매출', value: formatWon(summary.netAmount), className: 'text-blue-600' },
          { label: '건수', value: `${summary.paymentCount.toLocaleString('ko-KR')}건`, className: 'text-[#1d1d1f]' },
        ].map((card) => (
          <article key={card.label} className="rounded-[8px] bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400">{card.label}</p>
            <p className={`mt-1 text-xl font-bold sm:text-2xl ${card.className}`}>{card.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[8px] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2 overflow-x-auto">
            {([
              ['daily', '일별'],
              ['monthly', '월별'],
              ['course', '강좌별'],
              ['method', '결제방법별'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setGroupKey(key)}
                className={`shrink-0 rounded-[8px] px-3 py-2 text-xs font-semibold transition ${
                  groupKey === key ? 'bg-[#1d1d1f] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs font-semibold text-slate-400">{groupRows.length}개 행</span>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-slate-400">정산 데이터를 불러오는 중입니다.</p>
        ) : groupRows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">조회 기간에 결제 또는 환불 기록이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                  <th className="px-5 py-3">구분</th>
                  <th className="px-3 py-3 text-right">총액</th>
                  <th className="px-3 py-3 text-right">환불</th>
                  <th className="px-3 py-3 text-right">순액</th>
                  <th className="px-5 py-3 text-right">건수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {groupRows.map((row) => (
                  <tr key={row.key} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-semibold text-[#1d1d1f]">
                      {groupKey === 'method' ? paymentMethodLabel(row.key as PaymentMethod) : row.label}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-700">{formatWon(row.grossAmount)}</td>
                    <td className="px-3 py-3 text-right text-rose-600">{formatWon(row.refundAmount)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-blue-600">{formatWon(row.netAmount)}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{row.paymentCount.toLocaleString('ko-KR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-[8px] bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-[#1d1d1f]">상세 원장</h2>
        </div>
        {!payload?.rows.length ? (
          <p className="py-10 text-center text-sm text-slate-400">상세 원장 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                  <th className="px-5 py-3">일자</th>
                  <th className="px-3 py-3">강좌</th>
                  <th className="px-3 py-3">방법</th>
                  <th className="px-3 py-3">분류</th>
                  <th className="px-3 py-3 text-right">총액</th>
                  <th className="px-3 py-3 text-right">환불</th>
                  <th className="px-3 py-3 text-right">순액</th>
                  <th className="px-5 py-3 text-right">건수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {payload.rows.map((row) => (
                  <tr key={`${row.paid_date}:${row.course_id}:${row.method}:${row.category}`} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 text-slate-500">{row.paid_date}</td>
                    <td className="px-3 py-3 font-semibold text-[#1d1d1f]">{row.course_name}</td>
                    <td className="px-3 py-3 text-slate-600">{paymentMethodLabel(row.method)}</td>
                    <td className="px-3 py-3 text-slate-600">{paymentCategoryLabel(row.category)}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{formatWon(row.gross_amount)}</td>
                    <td className="px-3 py-3 text-right text-rose-600">{formatWon(row.refund_amount)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-blue-600">{formatWon(row.net_amount)}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{row.payment_count.toLocaleString('ko-KR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
