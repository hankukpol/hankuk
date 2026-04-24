'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CirclePlus, RotateCcw, Search, XCircle } from 'lucide-react'
import type { Course, Enrollment } from '@/types/database'
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  type EnrollmentPayment,
  type RefundMethod,
} from '@/lib/payments/types'
import { formatPaymentDate, formatWon } from '@/lib/payments/format'
import {
  PaymentSection,
  createEmptyPaymentSectionValue,
  normalizePaymentSectionPayload,
  type PaymentSectionValue,
} from './PaymentSection'
import { RefundModal } from './RefundModal'

type CoursePaymentsPanelProps = {
  course: Pick<Course, 'id' | 'name'>
  enrollments: Enrollment[]
  initialPayments?: EnrollmentPayment[]
  onDataChanged?: () => Promise<void> | void
}

function getRefundTotal(payment: EnrollmentPayment) {
  return (payment.enrollment_refunds ?? []).reduce((sum, refund) => sum + refund.amount, 0)
}

function getStatusClass(status: EnrollmentPayment['status']) {
  switch (status) {
    case 'paid':
      return 'bg-emerald-50 text-emerald-700'
    case 'partial_refunded':
      return 'bg-amber-50 text-amber-700'
    case 'fully_refunded':
      return 'bg-rose-50 text-rose-700'
    default:
      return 'bg-slate-100 text-slate-500'
  }
}

export function CoursePaymentsPanel({
  course,
  enrollments,
  initialPayments = [],
  onDataChanged,
}: CoursePaymentsPanelProps) {
  const [payments, setPayments] = useState<EnrollmentPayment[]>(initialPayments)
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(enrollments[0]?.id ?? null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(initialPayments.length === 0)
  const [submitting, setSubmitting] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [paymentDraft, setPaymentDraft] = useState<PaymentSectionValue>(createEmptyPaymentSectionValue)
  const [refundTarget, setRefundTarget] = useState<EnrollmentPayment | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadPayments = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/payments?courseId=${course.id}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? '결제 목록을 불러오지 못했습니다.')
      }

      setPayments((payload?.payments ?? []) as EnrollmentPayment[])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '결제 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [course.id])

  useEffect(() => {
    void loadPayments()
  }, [loadPayments])

  useEffect(() => {
    if (selectedEnrollmentId && enrollments.some((enrollment) => enrollment.id === selectedEnrollmentId)) {
      return
    }

    setSelectedEnrollmentId(enrollments[0]?.id ?? null)
  }, [enrollments, selectedEnrollmentId])

  const paymentSummaryByEnrollment = useMemo(() => {
    const map = new Map<number, { gross: number; refund: number; net: number; count: number }>()
    for (const payment of payments) {
      const current = map.get(payment.enrollment_id) ?? { gross: 0, refund: 0, net: 0, count: 0 }
      if (payment.status !== 'voided') {
        const refund = getRefundTotal(payment)
        current.gross += payment.amount
        current.refund += refund
        current.net += payment.amount - refund
        current.count += 1
      }
      map.set(payment.enrollment_id, current)
    }
    return map
  }, [payments])

  const filteredEnrollments = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return enrollments
    }

    return enrollments.filter((enrollment) => (
      enrollment.name.toLowerCase().includes(query)
      || enrollment.phone.includes(query)
      || (enrollment.exam_number ?? '').toLowerCase().includes(query)
    ))
  }, [enrollments, search])

  const selectedEnrollment = enrollments.find((enrollment) => enrollment.id === selectedEnrollmentId) ?? null
  const selectedPayments = payments.filter((payment) => payment.enrollment_id === selectedEnrollmentId)
  const selectedSummary = selectedEnrollmentId
    ? paymentSummaryByEnrollment.get(selectedEnrollmentId) ?? { gross: 0, refund: 0, net: 0, count: 0 }
    : { gross: 0, refund: 0, net: 0, count: 0 }

  async function refreshAll() {
    await loadPayments()
    await onDataChanged?.()
  }

  async function handleCreatePayment() {
    if (!selectedEnrollment) {
      setError('수강생을 선택해 주세요.')
      return
    }

    const payload = normalizePaymentSectionPayload(paymentDraft)
    if (!Number.isInteger(payload.amount) || payload.amount <= 0) {
      setError('결제 금액을 입력해 주세요.')
      return
    }

    setSubmitting(true)
    setError('')
    setMessage('')
    const response = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        courseId: course.id,
        enrollmentId: selectedEnrollment.id,
      }),
    })
    const result = await response.json().catch(() => null)
    setSubmitting(false)

    if (!response.ok) {
      setError(result?.error ?? '결제를 저장하지 못했습니다.')
      return
    }

    setMessage(`${selectedEnrollment.name} 결제를 저장했습니다.`)
    setFormOpen(false)
    setPaymentDraft(createEmptyPaymentSectionValue())
    await refreshAll()
  }

  async function handleCreateRefund(input: {
    amount: number
    method: RefundMethod
    reason: string
    memo: string
  }) {
    if (!refundTarget) {
      return
    }

    setSubmitting(true)
    setError('')
    setMessage('')
    const response = await fetch(`/api/payments/${refundTarget.id}/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const result = await response.json().catch(() => null)
    setSubmitting(false)

    if (!response.ok) {
      setError(result?.error ?? '환불을 저장하지 못했습니다.')
      return
    }

    setRefundTarget(null)
    setMessage('환불 처리를 완료했습니다.')
    await refreshAll()
  }

  async function handleVoidPayment(payment: EnrollmentPayment) {
    const confirmed = window.confirm(`${formatWon(payment.amount)} 결제를 취소할까요? 오입력 취소 용도이며 환불 기록이 있으면 취소할 수 없습니다.`)
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setError('')
    setMessage('')
    const response = await fetch(`/api/payments/${payment.id}/void`, { method: 'POST' })
    const result = await response.json().catch(() => null)
    setSubmitting(false)

    if (!response.ok) {
      setError(result?.error ?? '결제를 취소하지 못했습니다.')
      return
    }

    setMessage('결제를 취소했습니다.')
    await refreshAll()
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[360px,1fr]">
      <aside className="rounded-[8px] bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4">
          <h3 className="text-sm font-bold text-[#1d1d1f]">수강생 결제 현황</h3>
          <div className="mt-3 flex items-center gap-2 rounded-[8px] border border-slate-200 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="이름, 연락처, 응시번호"
              className="min-w-0 flex-1 text-sm outline-none"
            />
          </div>
        </div>

        <div className="max-h-[640px] overflow-y-auto p-2">
          {filteredEnrollments.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다.</p>
          ) : filteredEnrollments.map((enrollment) => {
            const summary = paymentSummaryByEnrollment.get(enrollment.id) ?? { gross: 0, refund: 0, net: 0, count: 0 }
            const selected = enrollment.id === selectedEnrollmentId

            return (
              <button
                key={enrollment.id}
                type="button"
                onClick={() => {
                  setSelectedEnrollmentId(enrollment.id)
                  setError('')
                  setMessage('')
                }}
                className={`w-full rounded-[8px] px-3 py-3 text-left transition ${
                  selected ? 'bg-[#1d1d1f] text-white' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{enrollment.name}</p>
                    <p className={`mt-0.5 truncate text-xs ${selected ? 'text-white/65' : 'text-slate-500'}`}>
                      {enrollment.exam_number || '-'} · {enrollment.phone}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    selected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {summary.count}건
                  </span>
                </div>
                <p className={`mt-2 text-xs ${selected ? 'text-white/80' : 'text-slate-500'}`}>
                  순수납 {formatWon(summary.net)}
                </p>
              </button>
            )
          })}
        </div>
      </aside>

      <div className="min-w-0 rounded-[8px] bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Payments</p>
            <h3 className="mt-1 text-xl font-semibold text-[#1d1d1f]">
              {selectedEnrollment ? selectedEnrollment.name : '수강생을 선택해 주세요'}
            </h3>
            {selectedEnrollment ? (
              <p className="mt-1 text-sm text-slate-500">{course.name} · {selectedEnrollment.phone}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
            <div className="rounded-[8px] bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold text-slate-400">총 수납</p>
              <p className="mt-1 text-sm font-bold text-[#1d1d1f]">{formatWon(selectedSummary.gross)}</p>
            </div>
            <div className="rounded-[8px] bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold text-slate-400">환불</p>
              <p className="mt-1 text-sm font-bold text-rose-600">{formatWon(selectedSummary.refund)}</p>
            </div>
            <div className="rounded-[8px] bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold text-slate-400">순수납</p>
              <p className="mt-1 text-sm font-bold text-blue-600">{formatWon(selectedSummary.net)}</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          {(message || error) ? (
            <div className="mb-4">
              {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
              {error ? <p className="text-xs text-red-500">{error}</p> : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700">결제 이력</p>
            <button
              type="button"
              onClick={() => setFormOpen((current) => !current)}
              disabled={!selectedEnrollment}
              className="inline-flex items-center gap-2 rounded-[8px] bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CirclePlus className="h-4 w-4" />
              결제 추가
            </button>
          </div>

          {formOpen && selectedEnrollment ? (
            <div className="mt-4">
              <PaymentSection value={paymentDraft} onChange={setPaymentDraft} compact />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-[8px] bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreatePayment()}
                  disabled={submitting}
                  className="rounded-[8px] bg-[#1d1d1f] px-4 py-2 text-sm font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? '저장 중...' : '결제 저장'}
                </button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <p className="py-12 text-center text-sm text-slate-400">결제 이력을 불러오는 중입니다.</p>
          ) : selectedPayments.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">결제 기록이 없습니다.</p>
          ) : (
            <>
              <div className="mt-4 grid gap-3 md:hidden">
                {selectedPayments.map((payment) => (
                  <article key={payment.id} className="rounded-[8px] border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#1d1d1f]">{formatWon(payment.amount)}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatPaymentDate(payment.paid_at)}</p>
                      </div>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${getStatusClass(payment.status)}`}>
                        {PAYMENT_STATUS_LABEL[payment.status]}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {PAYMENT_METHOD_LABEL[payment.method]} · {PAYMENT_CATEGORY_LABEL[payment.category]} · 환불 {formatWon(getRefundTotal(payment))}
                    </p>
                    {payment.memo ? <p className="mt-2 text-xs text-slate-500">{payment.memo}</p> : null}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRefundTarget(payment)}
                        disabled={payment.status === 'voided' || payment.status === 'fully_refunded'}
                        className="rounded-[8px] bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        환불
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleVoidPayment(payment)}
                        disabled={payment.status !== 'paid'}
                        className="rounded-[8px] bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        취소
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-4 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[880px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                      <th className="px-3 py-3">일자</th>
                      <th className="px-3 py-3">방법</th>
                      <th className="px-3 py-3">분류</th>
                      <th className="px-3 py-3 text-right">금액</th>
                      <th className="px-3 py-3 text-right">환불</th>
                      <th className="px-3 py-3">상태</th>
                      <th className="px-3 py-3">메모</th>
                      <th className="px-3 py-3 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {selectedPayments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-3 text-xs text-slate-500">{formatPaymentDate(payment.paid_at)}</td>
                        <td className="px-3 py-3 text-slate-600">{PAYMENT_METHOD_LABEL[payment.method]}</td>
                        <td className="px-3 py-3 text-slate-600">{PAYMENT_CATEGORY_LABEL[payment.category]}</td>
                        <td className="px-3 py-3 text-right font-semibold text-[#1d1d1f]">{formatWon(payment.amount)}</td>
                        <td className="px-3 py-3 text-right text-rose-600">{formatWon(getRefundTotal(payment))}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${getStatusClass(payment.status)}`}>
                            {PAYMENT_STATUS_LABEL[payment.status]}
                          </span>
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-3 text-slate-500">{payment.memo || '-'}</td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setRefundTarget(payment)}
                              disabled={payment.status === 'voided' || payment.status === 'fully_refunded'}
                              className="inline-flex items-center gap-1 rounded-[8px] bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              환불
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleVoidPayment(payment)}
                              disabled={payment.status !== 'paid'}
                              className="inline-flex items-center gap-1 rounded-[8px] bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              취소
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <RefundModal
        open={Boolean(refundTarget)}
        payment={refundTarget}
        courseName={course.name}
        submitting={submitting}
        onClose={() => {
          if (!submitting) {
            setRefundTarget(null)
          }
        }}
        onConfirm={(input) => {
          void handleCreateRefund(input)
        }}
      />
    </section>
  )
}
