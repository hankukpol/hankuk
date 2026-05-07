'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Search } from 'lucide-react'
import { useTenantConfig } from '@/components/TenantProvider'
import {
  buildSettlementReport,
  type SettlementFilterKind,
  type SettlementLedgerRow,
  type SettlementSeriesFilter,
} from '@/lib/payments/settlement-report'
import { downloadDailySettlementReportXlsx, downloadDailySettlementXlsx, downloadSettlementCsv } from '@/lib/payments/xlsx-export'
import { formatWon } from '@/lib/payments/format'
import { withTenantPrefix } from '@/lib/tenant'
import type { EnrollmentPayment, SettlementEntryConfirmation } from '@/lib/payments/types'
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
  return getTodayKst()
}

function getInitialCourseId() {
  return ''
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

type SettlementConfirmationPayload = {
  division: string
  settlementDate: string
  effectiveStatus: 'unconfirmed' | 'confirmed' | 'needs_review'
  confirmation: {
    id: number
    settlementDate: string
    division: string
    status: 'confirmed' | 'needs_review'
    effectiveStatus: 'confirmed' | 'needs_review'
    confirmedAt: string
    confirmedByName: string | null
    confirmedByStaffId: number
    snapshot: DailySettlementSnapshot | null
    currentSnapshot: DailySettlementSnapshot
    latestChangedAt: string | null
    snapshotChanged: boolean
    memo: string | null
  } | null
  currentSnapshot: DailySettlementSnapshot
  latestChangedAt: string | null
  snapshotChanged: boolean
}

type DailySettlementSnapshot = {
  gross: number
  refund: number
  net: number
  payment_count: number
  refund_count: number
  payer_count: number
  by_method: Partial<Record<string, number>>
  refund_by_method: Record<string, number>
}

type CheckoutGroupDisplayItem =
  | { type: 'row'; row: SettlementLedgerRow }
  | {
    type: 'group'
    key: string
    checkoutGroupId: string
    rows: SettlementLedgerRow[]
    status: 'unconfirmed' | 'partial' | 'confirmed'
    confirmedCount: number
    totalAmount: number
  }

function getCheckoutGroupStatus(rows: SettlementLedgerRow[]): {
  status: 'unconfirmed' | 'partial' | 'confirmed'
  confirmedCount: number
} {
  const confirmedCount = rows.filter((row) => Boolean(row.settlementConfirmedAt)).length
  const status = confirmedCount === 0
    ? 'unconfirmed'
    : confirmedCount === rows.length
      ? 'confirmed'
      : 'partial'

  return { status, confirmedCount }
}

function formatKstShortDateTime(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function DailySettlementsPage() {
  const tenant = useTenantConfig()
  const [fromDate, setFromDate] = useState(getInitialDate)
  const [toDate, setToDate] = useState(getInitialDate)
  const [courses, setCourses] = useState<Course[]>([])
  const [courseId, setCourseId] = useState(getInitialCourseId)
  const [rawPayments, setRawPayments] = useState<EnrollmentPayment[]>([])
  const [filter, setFilter] = useState<SettlementFilterKind>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [seriesFilter, setSeriesFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<SettlementConfirmationPayload | null>(null)
  const [confirmationLoading, setConfirmationLoading] = useState(true)
  const [confirmationSaving, setConfirmationSaving] = useState(false)
  const [confirmationError, setConfirmationError] = useState('')
  const [entryConfirmationSavingId, setEntryConfirmationSavingId] = useState('')
  const [entryConfirmationError, setEntryConfirmationError] = useState('')
  const [hasAppliedInitialParams, setHasAppliedInitialParams] = useState(false)
  const [hasLoadedInitialReport, setHasLoadedInitialReport] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initialFrom = params.get('from') ?? params.get('date')
    const initialTo = params.get('to') ?? params.get('date')
    const initialCourseId = params.get('courseId')

    if (initialFrom && /^\d{4}-\d{2}-\d{2}$/.test(initialFrom)) {
      setFromDate(initialFrom)
    }
    if (initialTo && /^\d{4}-\d{2}-\d{2}$/.test(initialTo)) {
      setToDate(initialTo)
    }
    if (initialCourseId && /^\d+$/.test(initialCourseId)) {
      setCourseId(initialCourseId)
    }
    setHasAppliedInitialParams(true)
  }, [])

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate })
      if (courseId) {
        params.set('courseId', courseId)
      }
      const response = await fetch(`/api/payments/settlement/details?${params.toString()}`, { cache: 'no-store' })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(result?.error ?? '정산 데이터를 불러오지 못했습니다.')
      }

      setRawPayments((result?.payments ?? []) as EnrollmentPayment[])
    } catch (reason) {
      setRawPayments([])
      setError(reason instanceof Error ? reason.message : '정산 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [courseId, fromDate, toDate])

  const loadConfirmation = useCallback(async () => {
    if (fromDate !== toDate) {
      setConfirmation(null)
      setConfirmationLoading(false)
      return
    }

    setConfirmationLoading(true)
    setConfirmationError('')

    try {
      const response = await fetch(`/api/settlements/confirmation?date=${encodeURIComponent(fromDate)}`, { cache: 'no-store' })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(result?.error ?? '정산 확인 상태를 불러오지 못했습니다.')
      }

      setConfirmation(result as SettlementConfirmationPayload)
    } catch (reason) {
      setConfirmation(null)
      setConfirmationError(reason instanceof Error ? reason.message : '정산 확인 상태를 불러오지 못했습니다.')
    } finally {
      setConfirmationLoading(false)
    }
  }, [fromDate, toDate])

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
    if (!hasAppliedInitialParams || hasLoadedInitialReport) {
      return
    }
    setHasLoadedInitialReport(true)
    void loadReport()
    void loadConfirmation()
  }, [hasAppliedInitialParams, hasLoadedInitialReport, loadConfirmation, loadReport])

  useEffect(() => {
    if (hasAppliedInitialParams && hasLoadedInitialReport) {
      setConfirmation(null)
      setConfirmationError('')
    }
  }, [courseId, fromDate, hasAppliedInitialParams, hasLoadedInitialReport, toDate])

  const isSingleDay = fromDate === toDate

  const allReport = useMemo(
    () => buildSettlementReport(rawPayments, fromDate, toDate),
    [fromDate, toDate, rawPayments],
  )
  const report = useMemo(
    () => buildSettlementReport(rawPayments, fromDate, toDate, parseSeriesFilter(seriesFilter)),
    [fromDate, toDate, rawPayments, seriesFilter],
  )

  const rows = useMemo(() => {
    const ledgerRows = report?.ledgerRows ?? []
    const filteredByKind = filter === 'payment'
      ? ledgerRows.filter((row) => row.kind === 'payment')
      : filter === 'refund'
        ? ledgerRows.filter((row) => row.kind === 'refund')
        : ledgerRows
    const keyword = searchTerm.trim().toLowerCase()

    if (!keyword) {
      return filteredByKind
    }

    return filteredByKind.filter((row) => [
      row.kind === 'payment' ? '수납' : '환불',
      row.studentName,
      row.examNumber,
      row.phone,
      row.studentTypeLabel,
      row.courseName,
      row.courseReportCode,
      row.seriesLabel,
      row.methodLabel,
      row.categoryLabel,
      row.receiptNo,
      row.reasonCategoryLabel,
      row.reason,
      row.memo,
      String(row.paymentAmount),
      String(row.refundAmount),
      String(row.netAmount),
    ].some((value) => String(value ?? '').toLowerCase().includes(keyword)))
  }, [filter, report, searchTerm])

  const cardCompanyCounts = useMemo(() => {
    const counts = new Map<string, number>()

    for (const row of report?.ledgerRows ?? []) {
      if (row.kind !== 'payment' || row.originalPaymentMethod !== 'card') {
        continue
      }

      const cardCompany = row.cardCompany?.trim() || '미지정'
      counts.set(cardCompany, (counts.get(cardCompany) ?? 0) + 1)
    }

    return Array.from(counts.entries())
      .map(([cardCompany, count]) => ({ cardCompany, count }))
      .sort((left, right) => right.count - left.count || left.cardCompany.localeCompare(right.cardCompany, 'ko-KR'))
  }, [report])

  const refundCardCompanyCounts = useMemo(() => {
    const counts = new Map<string, number>()

    for (const row of report?.ledgerRows ?? []) {
      if (row.kind !== 'refund' || row.originalPaymentMethod !== 'card' || row.method !== 'card_cancel') {
        continue
      }

      const cardCompany = row.cardCompany?.trim() || '미지정'
      counts.set(cardCompany, (counts.get(cardCompany) ?? 0) + 1)
    }

    return Array.from(counts.entries())
      .map(([cardCompany, count]) => ({ cardCompany, count }))
      .sort((left, right) => right.count - left.count || left.cardCompany.localeCompare(right.cardCompany, 'ko-KR'))
  }, [report])

  const checkoutGroupByFirstPaymentId = useMemo(() => {
    const groupMap = new Map<string, SettlementLedgerRow[]>()
    for (const row of report?.ledgerRows ?? []) {
      if (row.kind === 'payment' && row.checkoutGroupId) {
        groupMap.set(row.checkoutGroupId, [...(groupMap.get(row.checkoutGroupId) ?? []), row])
      }
    }

    const visitedGroups = new Set<string>()
    const map = new Map<number, Extract<CheckoutGroupDisplayItem, { type: 'group' }>>()
    for (const row of rows) {
      if (row.kind !== 'payment' || !row.checkoutGroupId) {
        continue
      }

      const groupRows = groupMap.get(row.checkoutGroupId) ?? []
      if (groupRows.length <= 1) {
        continue
      }

      if (visitedGroups.has(row.checkoutGroupId)) {
        continue
      }

      visitedGroups.add(row.checkoutGroupId)
      const status = getCheckoutGroupStatus(groupRows)
      map.set(row.paymentId, {
        type: 'group',
        key: `checkout-group-${row.checkoutGroupId}`,
        checkoutGroupId: row.checkoutGroupId,
        rows: groupRows,
        status: status.status,
        confirmedCount: status.confirmedCount,
        totalAmount: groupRows.reduce((sum, groupRow) => sum + groupRow.paymentAmount, 0),
      })
    }

    return map
  }, [report, rows])

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
  const hasActiveLedgerSearch = searchTerm.trim().length > 0
  const confirmationDisabledReason = !isSingleDay
    ? '정산 확인은 단일 날짜 조회 상태에서만 처리할 수 있습니다.'
    : courseId || seriesFilter !== 'all'
      ? '정산 확인은 전체 강좌·전체 직렬 조회 상태에서만 처리할 수 있습니다.'
      : hasActiveLedgerSearch
        ? '검색어를 지운 뒤 전체 결제 명단 기준으로 정산 확인을 처리할 수 있습니다.'
        : ''
  const canConfirmSettlement = !confirmationDisabledReason
  const confirmationStatus = confirmation?.effectiveStatus ?? 'unconfirmed'
  const confirmationLabel = confirmationStatus === 'confirmed'
    ? '확인 완료'
    : confirmationStatus === 'needs_review'
      ? '재확인 필요'
      : '미확인'
  const confirmerName = confirmation?.confirmation?.confirmedByName
    ?? (confirmation?.confirmation?.confirmedByStaffId ? `담당자 #${confirmation.confirmation.confirmedByStaffId}` : '')

  async function handleConfirmSettlement() {
    if (!canConfirmSettlement) {
      setConfirmationError(confirmationDisabledReason || '현재 조회 조건에서는 정산 확인을 처리할 수 없습니다.')
      return
    }

    setConfirmationSaving(true)
    setConfirmationError('')

    try {
      const response = await fetch('/api/settlements/confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: fromDate }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        setConfirmationError(result?.error ?? '정산 확인을 저장하지 못했습니다.')
        return
      }

      setConfirmation(result as SettlementConfirmationPayload)
    } catch (reason) {
      setConfirmationError(reason instanceof Error ? reason.message : '정산 확인을 저장하지 못했습니다.')
    } finally {
      setConfirmationSaving(false)
    }
  }

  function applyEntryConfirmationResult(input: {
    kind: 'payment' | 'refund'
    paymentId: number
    refundId: number | null
    confirmation: SettlementEntryConfirmation
  }) {
    setRawPayments((current) => current.map((payment) => {
      if (payment.id !== input.paymentId) {
        return payment
      }

      if (input.kind === 'payment') {
        return {
          ...payment,
          settlement_confirmation: input.confirmation,
        }
      }

      return {
        ...payment,
        enrollment_refunds: (payment.enrollment_refunds ?? []).map((refund) => (
          refund.id === input.refundId
            ? {
              ...refund,
              settlement_confirmation: input.confirmation,
            }
            : refund
        )),
      }
    }))
  }

  function applyPaymentConfirmationEntries(entries: SettlementEntryConfirmation[]) {
    const entryByPaymentId = new Map(entries.map((entry) => [entry.payment_id, entry]))
    setRawPayments((current) => current.map((payment) => {
      const confirmation = entryByPaymentId.get(payment.id)
      return confirmation
        ? { ...payment, settlement_confirmation: confirmation }
        : payment
    }))
  }

  async function handleToggleEntryConfirmation(row: SettlementLedgerRow) {
    if (row.kind === 'refund' && !row.refundId) {
      setEntryConfirmationError('환불 행 정보를 확인하지 못했습니다.')
      return
    }

    setEntryConfirmationSavingId(row.id)
    setEntryConfirmationError('')

    const action = row.settlementConfirmedAt ? 'cancel' : 'confirm'
    try {
      const response = await fetch('/api/settlements/entry-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: row.date,
          kind: row.kind,
          paymentId: row.paymentId,
          refundId: row.refundId,
          action,
        }),
      })
      const result = await response.json().catch(() => null) as {
        error?: string
        entry?: SettlementEntryConfirmation
      } | null

      if (!response.ok || !result?.entry) {
        setEntryConfirmationError(result?.error ?? '정산 행 확인 상태를 저장하지 못했습니다.')
        return
      }

      applyEntryConfirmationResult({
        kind: row.kind,
        paymentId: row.paymentId,
        refundId: row.refundId,
        confirmation: result.entry,
      })
      void loadConfirmation()
    } catch (reason) {
      setEntryConfirmationError(reason instanceof Error ? reason.message : '정산 행 확인 상태를 저장하지 못했습니다.')
    } finally {
      setEntryConfirmationSavingId('')
    }
  }

  async function handleToggleCheckoutGroupConfirmation(group: Extract<CheckoutGroupDisplayItem, { type: 'group' }>) {
    const firstRow = group.rows[0]
    if (!firstRow) {
      return
    }

    setEntryConfirmationSavingId(group.key)
    setEntryConfirmationError('')

    const action = group.status === 'confirmed' ? 'cancel' : 'confirm'
    try {
      const response = await fetch('/api/settlements/entry-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: firstRow.date,
          kind: 'payment',
          paymentId: firstRow.paymentId,
          checkoutGroupId: group.checkoutGroupId,
          action,
        }),
      })
      const result = await response.json().catch(() => null) as {
        error?: string
        entries?: SettlementEntryConfirmation[]
      } | null

      if (!response.ok || !Array.isArray(result?.entries)) {
        setEntryConfirmationError(result?.error ?? '묶음 정산 확인 상태를 저장하지 못했습니다.')
        return
      }

      applyPaymentConfirmationEntries(result.entries)
      void loadConfirmation()
    } catch (reason) {
      setEntryConfirmationError(reason instanceof Error ? reason.message : '묶음 정산 확인 상태를 저장하지 못했습니다.')
    } finally {
      setEntryConfirmationSavingId('')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Daily Settlement</p>
            <h1 className="mt-1 text-2xl font-semibold text-[#1d1d1f]">일일 정산</h1>
            <p className="mt-2 text-sm text-slate-500">기간별 수납, 환불, 영수증 번호 범위와 결제자 명단을 확인합니다.</p>
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
              onClick={() => {
                if (!report) return
                const label = isSingleDay ? fromDate.replace(/-/g, '') : `${fromDate.replace(/-/g, '')}_${toDate.replace(/-/g, '')}`
                downloadSettlementCsv(report.ledgerRows, `settlement-${label}.csv`)
              }}
              disabled={!report?.ledgerRows.length}
              className="inline-flex items-center gap-2 rounded-[8px] bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => {
                if (!report) return
                const label = isSingleDay ? fromDate : `${fromDate}~${toDate}`
                downloadDailySettlementReportXlsx(report, label)
              }}
              disabled={!report?.ledgerRows.length}
              className="inline-flex items-center gap-2 rounded-[8px] bg-[#1d1d1f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              보고용
            </button>
            <button
              type="button"
              onClick={() => {
                if (!report) return
                const label = isSingleDay ? fromDate : `${fromDate}~${toDate}`
                downloadDailySettlementXlsx(report, label)
              }}
              disabled={!report}
              className="inline-flex items-center gap-2 rounded-[8px] bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              XLSX 다운로드
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[180px,180px,1fr,180px,auto]">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">시작일</span>
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="rounded-[8px] border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">종료일</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(event) => setToDate(event.target.value)}
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
            onClick={() => {
              void loadReport()
              void loadConfirmation()
            }}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 self-end rounded-[8px] bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            조회
          </button>
        </div>

        {isSingleDay ? (
          <div className={`mt-4 rounded-[10px] border px-4 py-3 ${
            confirmationStatus === 'needs_review'
              ? 'border-amber-200 bg-amber-50'
              : confirmationStatus === 'confirmed'
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-slate-200 bg-slate-50'
          }`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {confirmationStatus === 'needs_review' ? (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  ) : confirmationStatus === 'confirmed' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-slate-400" />
                  )}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    confirmationStatus === 'needs_review'
                      ? 'bg-amber-100 text-amber-700'
                      : confirmationStatus === 'confirmed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-white text-slate-500'
                  }`}>
                    {confirmationLabel}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {tenant.branchName} · {fromDate}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  {confirmationLoading
                    ? '정산 확인 상태를 불러오는 중입니다.'
                    : confirmationStatus === 'confirmed' && confirmation?.confirmation
                      ? `확인 완료 · ${formatKstShortDateTime(confirmation.confirmation.confirmedAt)}${confirmerName ? ` · ${confirmerName}` : ''}`
                    : confirmationStatus === 'needs_review' && confirmation?.confirmation
                        ? confirmation.confirmation.latestChangedAt
                          ? `확인 이후 수납 또는 환불 변경이 있습니다. 마지막 변경 ${formatKstShortDateTime(confirmation.confirmation.latestChangedAt)}`
                          : '확인 당시 집계와 현재 집계가 다릅니다. 수납·환불 내역을 다시 확인해 주세요.'
                        : '아직 이 날짜의 정산 확인 기록이 없습니다.'}
                </p>
                {confirmationStatus !== 'confirmed' && confirmationDisabledReason ? (
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {confirmationDisabledReason}
                  </p>
                ) : null}
                {confirmationError ? (
                  <p className="mt-1 text-xs font-semibold text-rose-600">{confirmationError}</p>
                ) : null}
              </div>
              {confirmationStatus !== 'confirmed' ? (
                <button
                  type="button"
                  onClick={() => void handleConfirmSettlement()}
                  disabled={!canConfirmSettlement || confirmationLoading || confirmationSaving}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[8px] bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {confirmationSaving ? '저장 중...' : confirmationStatus === 'needs_review' ? '재확인' : '정산 확인'}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-500">
              기간 조회 중 — {fromDate} ~ {toDate} · 정산 확인은 단일 날짜 조회에서만 사용할 수 있습니다.
            </p>
          </div>
        )}
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
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-[#1d1d1f]">카드사별 결제 건수</h3>
              <span className="text-xs font-semibold text-slate-400">카드 결제만</span>
            </div>
            {cardCompanyCounts.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {cardCompanyCounts.map((item) => (
                  <div key={item.cardCompany} className="inline-flex items-center gap-2 rounded-[8px] bg-blue-50 px-3 py-2">
                    <span className="text-xs font-bold text-slate-700">{item.cardCompany}</span>
                    <span className="text-xs font-bold text-blue-700">{item.count.toLocaleString('ko-KR')}건</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-[8px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400">
                카드 결제 내역 없음
              </p>
            )}
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
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-[#1d1d1f]">카드사별 환불 건수</h3>
              <span className="text-xs font-semibold text-slate-400">카드 취소만</span>
            </div>
            {refundCardCompanyCounts.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {refundCardCompanyCounts.map((item) => (
                  <div key={item.cardCompany} className="inline-flex items-center gap-2 rounded-[8px] bg-rose-50 px-3 py-2">
                    <span className="text-xs font-bold text-slate-700">{item.cardCompany}</span>
                    <span className="text-xs font-bold text-rose-700">{item.count.toLocaleString('ko-KR')}건</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-[8px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400">
                카드 결제 환불 내역 없음
              </p>
            )}
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
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#1d1d1f]">결제 명단</h2>
            <p className="mt-1 text-xs text-slate-500">
              {isSingleDay ? fromDate : `${fromDate} ~ ${toDate}`} · 시각 역순으로 수납과 환불을 함께 표시합니다.
            </p>
          </div>
          <label className="relative w-full xl:max-w-[460px]">
            <span className="sr-only">결제 명단 검색</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="학생, 응시번호, 연락처, 강좌, 영수증 검색"
              className="h-10 w-full rounded-[8px] border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <div className="flex shrink-0 rounded-[8px] bg-slate-100 p-1">
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
          {entryConfirmationError ? (
            <p className="text-xs font-semibold text-rose-600 xl:basis-full xl:text-right">{entryConfirmationError}</p>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold text-slate-500">
              <tr>
                {['시각', '학생', '학원구분', '강좌', '직렬', '방법', '카드사', '결제액', '환불', '순액', '영수증번호', '사유', '정산확인'].map((header) => (
                  <th key={header} className="whitespace-nowrap px-3 py-2.5">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const checkoutGroup = row.kind === 'payment'
                  ? checkoutGroupByFirstPaymentId.get(row.paymentId)
                  : undefined
                return (
                <React.Fragment key={row.id}>
                  {checkoutGroup ? (
                    <tr className="bg-blue-50/70">
                      <td colSpan={13} className="px-4 py-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700 shadow-sm">
                                묶음결제
                              </span>
                              <span className="text-sm font-bold text-[#1d1d1f]">{checkoutGroup.rows[0]?.studentName}</span>
                              <span className="text-xs font-semibold text-slate-500">
                                {checkoutGroup.rows.length}개 강좌 · {formatWon(checkoutGroup.totalAmount)}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                checkoutGroup.status === 'confirmed'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : checkoutGroup.status === 'partial'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-white text-slate-500'
                              }`}>
                                {checkoutGroup.status === 'confirmed'
                                  ? '전체 확인'
                                  : checkoutGroup.status === 'partial'
                                    ? `일부 확인 ${checkoutGroup.confirmedCount}/${checkoutGroup.rows.length}`
                                    : '미확인'}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {checkoutGroup.rows.map((groupRow) => groupRow.courseName).join(' / ')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleToggleCheckoutGroupConfirmation(checkoutGroup)}
                            disabled={entryConfirmationSavingId === checkoutGroup.key}
                            className={`inline-flex shrink-0 items-center justify-center rounded-[8px] px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              checkoutGroup.status === 'confirmed'
                                ? 'bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-600'
                                : 'bg-[#0071e3] text-white hover:bg-blue-700'
                            }`}
                          >
                            {entryConfirmationSavingId === checkoutGroup.key
                              ? '처리 중'
                              : checkoutGroup.status === 'confirmed'
                                ? '묶음 확인 취소'
                                : '묶음 확인'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                <tr className={`${row.kind === 'refund' ? 'bg-rose-50/70' : 'bg-white'} ${row.checkoutGroupId ? 'border-l-4 border-l-blue-100' : ''}`}>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-600">{row.time}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-[#1d1d1f]">{row.studentName}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{row.examNumber ?? row.phone ?? '-'}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="inline-flex rounded-[8px] bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      {row.studentTypeLabel}
                    </span>
                  </td>
                  <td className="max-w-[160px] px-3 py-2.5 text-sm text-slate-600">{row.courseName}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className={`inline-flex rounded-[8px] px-2 py-0.5 text-xs font-bold ${
                      row.seriesGroup === 'career' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {row.seriesLabel}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-sm font-semibold text-slate-700">{row.methodLabel}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-600">{row.cardCompany ?? '-'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-[#1d1d1f]">{formatWon(row.paymentAmount)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-rose-600">{formatWon(row.refundAmount)}</td>
                  <td className={`whitespace-nowrap px-3 py-2.5 text-right font-bold ${row.netAmount < 0 ? 'text-rose-600' : 'text-blue-600'}`}>
                    {formatWon(row.netAmount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-500">{row.receiptNo}</td>
                  <td className="max-w-[120px] px-3 py-2.5">
                    {row.reasonCategoryLabel ? (
                      <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-rose-600 shadow-sm">
                        {row.reasonCategoryLabel}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">{row.memo ?? '-'}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {row.settlementConfirmedAt ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          확인
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleToggleEntryConfirmation(row)}
                          disabled={entryConfirmationSavingId === row.id}
                          className="rounded-[6px] bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {entryConfirmationSavingId === row.id ? '...' : '취소'}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleToggleEntryConfirmation(row)}
                        disabled={entryConfirmationSavingId === row.id}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-[8px] bg-[#0071e3] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {entryConfirmationSavingId === row.id ? '처리 중' : '정산 확인'}
                      </button>
                    )}
                  </td>
                </tr>
                </React.Fragment>
                )
              })}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-sm text-slate-400">
                    {searchTerm.trim() ? '검색 결과가 없습니다.' : '정산 내역이 없습니다.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
