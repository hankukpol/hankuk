'use client'

import { getUserErrorMessage } from '@/lib/user-error-message'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react'
import { useTenantConfig } from '@/components/TenantProvider'
import { formatWon } from '@/lib/payments/format'
import { withTenantPrefix } from '@/lib/tenant'

type IntegritySeverity = 'error' | 'warning'
type BillingStatus = 'unpaid' | 'partial' | 'paid' | 'exempt' | 'refunded'
type EnrollmentStatus = 'active' | 'refunded'

type IntegrityIssue = {
  id: string
  severity: IntegritySeverity
  code: string
  message: string
  recommendation: string
  courseId: number
  courseName: string
  enrollmentId: number
  studentName: string
  phone: string
  examNumber: string | null
  enrollmentStatus: EnrollmentStatus
  billingStatus: BillingStatus | null
  expectedBillingStatus: BillingStatus | null
  payableAmount: number
  paymentGrossAmount: number
  refundAmount: number
  netAmount: number
  paymentCount: number
  latestActivityAt: string | null
}

type IntegrityReport = {
  division: string
  checkedAt: string
  truncated: boolean
  totals: {
    coursesChecked: number
    enrollmentsChecked: number
    billingsChecked: number
    paymentsChecked: number
    refundsChecked: number
    issueCount: number
    errorCount: number
    warningCount: number
  }
  issues: IntegrityIssue[]
}

const SEVERITY_LABEL: Record<IntegritySeverity, string> = {
  error: '오류',
  warning: '확인 필요',
}

const BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  unpaid: '미납',
  partial: '부분납',
  paid: '완납',
  exempt: '면제',
  refunded: '환불',
}

const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  active: '수강중',
  refunded: '환불완료',
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'rose' | 'amber' | 'blue' }) {
  const toneClass = tone === 'rose'
    ? 'text-rose-600'
    : tone === 'amber'
      ? 'text-amber-600'
      : tone === 'blue'
        ? 'text-blue-600'
        : 'text-slate-900'

  return (
    <article className="border border-slate-200 bg-white">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${toneClass}`}>{value}</p>
    </article>
  )
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatBillingStatus(value: BillingStatus | null) {
  return value ? BILLING_STATUS_LABEL[value] ?? value : '-'
}

export default function SettlementIntegrityPage() {
  const tenant = useTenantConfig()
  const [report, setReport] = useState<IntegrityReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/payments/integrity', { cache: 'no-store' })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error ?? '수납 정합성 점검 결과를 불러오지 못했습니다.')
      }

      setReport(result as IntegrityReport)
    } catch (reason) {
      setReport(null)
      setError(reason instanceof Error ? reason.message : '수납 정합성 점검 결과를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  const visibleIssues = useMemo(() => report?.issues ?? [], [report])

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href={withTenantPrefix('/dashboard/settlements', tenant.type)}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              수납·정산으로 돌아가기
            </Link>
            <h1 className="admin-page-title mt-1">수납 정합성 점검</h1>
            <p className="mt-2 text-sm text-slate-500">
              수강 등록, 청구 정보, 수납·환불 합계가 서로 맞지 않는 항목을 읽기 전용으로 확인합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadReport()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {report ? '다시 점검' : '점검 실행'}
          </button>
        </div>
      </section>

      {error ? (
        <p className="admin-notice admin-notice-danger">
          {getUserErrorMessage(error)}
        </p>
      ) : null}

      <section className="admin-metric-strip">
        <StatCard label="오류" value={String(report?.totals.errorCount ?? 0)} tone="rose" />
        <StatCard label="확인 필요" value={String(report?.totals.warningCount ?? 0)} tone="amber" />
        <StatCard label="점검 수강" value={String(report?.totals.enrollmentsChecked ?? 0)} tone="blue" />
        <StatCard label="청구 정보" value={String(report?.totals.billingsChecked ?? 0)} />
        <StatCard label="수납 기록" value={String(report?.totals.paymentsChecked ?? 0)} />
      </section>

      {report?.truncated ? (
        <p className="admin-notice admin-notice-warning">
          수강 등록 수가 많아 최근 {report.totals.enrollmentsChecked.toLocaleString('ko-KR')}건만 점검했습니다.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[#1d1d1f]">점검 결과</h2>
            <p className="mt-1 text-xs text-slate-500">
              마지막 점검: {formatDateTime(report?.checkedAt)}
            </p>
          </div>
          {report && report.totals.issueCount === 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              불일치 없음
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {report?.totals.issueCount ?? 0}건
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm font-medium text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            점검 중입니다.
          </div>
        ) : !report ? (
          <div className="px-5 py-16 text-center">
            <ShieldAlert className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-[#1d1d1f]">필요할 때만 점검을 실행합니다.</p>
            <p className="mt-1 text-xs text-slate-500">이 화면은 운영 메뉴에서 숨겨진 읽기 전용 진단 도구입니다.</p>
          </div>
        ) : visibleIssues.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
            <p className="mt-3 text-sm font-semibold text-[#1d1d1f]">현재 발견된 수납 정합성 문제가 없습니다.</p>
            <p className="mt-1 text-xs text-slate-500">이 화면은 데이터를 변경하지 않고 점검 결과만 표시합니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">수강생</th>
                  <th className="px-4 py-3">문제</th>
                  <th className="px-4 py-3">청구</th>
                  <th className="px-4 py-3">수납/환불</th>
                  <th className="px-4 py-3">권장 조치</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleIssues.map((issue) => (
                  <tr key={issue.id} className="align-top">
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                        issue.severity === 'error'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {SEVERITY_LABEL[issue.severity]}
                      </span>
                      <p className="mt-2 text-xs text-slate-500">{formatDateTime(issue.latestActivityAt)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={withTenantPrefix(`/dashboard/courses/${issue.courseId}/students`, tenant.type)}
                        className="font-bold text-slate-900 hover:underline"
                      >
                        {issue.studentName}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">{issue.courseName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {issue.examNumber || '-'} · {issue.phone} · {ENROLLMENT_STATUS_LABEL[issue.enrollmentStatus]}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900">{getUserErrorMessage(issue.message)}</p>
                      <p className="mt-1 font-mono text-[11px] text-slate-400">{issue.code}</p>
                    </td>
                    <td className="admin-table-amount px-4 py-4">
                      <p className="font-semibold text-slate-900">{formatWon(issue.payableAmount)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        현재 {formatBillingStatus(issue.billingStatus)} · 계산 {formatBillingStatus(issue.expectedBillingStatus)}
                      </p>
                    </td>
                    <td className="admin-table-amount px-4 py-4">
                      <p className="font-semibold text-slate-900">순액 {formatWon(issue.netAmount)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        수납 {formatWon(issue.paymentGrossAmount)} · 환불 {formatWon(issue.refundAmount)} · {issue.paymentCount}건
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="max-w-[320px] text-sm leading-6 text-slate-600">{issue.recommendation}</p>
                    </td>
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
