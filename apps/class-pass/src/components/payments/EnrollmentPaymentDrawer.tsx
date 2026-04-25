'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, ReceiptText, RotateCcw, X, XCircle } from 'lucide-react'
import type { Course, Enrollment } from '@/types/database'
import {
  BILLING_STATUS_LABEL,
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  type EnrollmentPayment,
  type RefundMethod,
  type RefundReasonCategory,
} from '@/lib/payments/types'
import { formatPaymentDate, formatWon } from '@/lib/payments/format'
import { getRefundTotal, summarizePayments } from '@/lib/payments/summary'
import {
  PaymentSection,
  createEmptyPaymentSectionValue,
  createPaymentSectionValueForBilling,
  normalizePaymentSectionPayload,
  type PaymentSectionValue,
} from './PaymentSection'
import { RefundModal } from './RefundModal'

type EnrollmentPaymentDrawerProps = {
  open: boolean
  course: Pick<Course, 'id' | 'name' | 'tuition_amount'>
  enrollment: Enrollment | null
  onClose: () => void
  onDataChanged?: () => Promise<void> | void
}

function getPaymentStatusClass(status: EnrollmentPayment['status']) {
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

function getBillingStatusClass(status: NonNullable<Enrollment['billing']>['status']) {
  switch (status) {
    case 'paid':
    case 'exempt':
      return 'bg-emerald-50 text-emerald-700'
    case 'partial':
      return 'bg-amber-50 text-amber-700'
    case 'refunded':
      return 'bg-rose-50 text-rose-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function getPaymentMemo(payment: EnrollmentPayment) {
  if (payment.memo?.trim()) {
    return payment.memo
  }

  if (payment.cash_receipt_approval_no) {
    return `현금영수증 ${payment.cash_receipt_approval_no}`
  }

  return '메모 없음'
}

export function EnrollmentPaymentDrawer({
  open,
  course,
  enrollment,
  onClose,
  onDataChanged,
}: EnrollmentPaymentDrawerProps) {
  const [payments, setPayments] = useState<EnrollmentPayment[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [paymentDraft, setPaymentDraft] = useState<PaymentSectionValue>(createEmptyPaymentSectionValue)
  const [refundTarget, setRefundTarget] = useState<EnrollmentPayment | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadPayments = useCallback(async () => {
    if (!enrollment) {
      setPayments([])
      return
    }

    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/payments?courseId=${course.id}&enrollmentId=${enrollment.id}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? '결제 내역을 불러오지 못했습니다.')
      }

      setPayments((payload?.payments ?? []) as EnrollmentPayment[])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '결제 내역을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [course.id, enrollment])

  useEffect(() => {
    if (!open) {
      return
    }

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting && !refundTarget) {
        onClose()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open, refundTarget, submitting])

  useEffect(() => {
    if (!open || !enrollment) {
      return
    }

    setMessage('')
    setError('')
    setFormOpen(false)
    setRefundTarget(null)
    void loadPayments()
  }, [enrollment, loadPayments, open])

  const summary = useMemo(() => summarizePayments(payments), [payments])
  const tuitionSummary = useMemo(() => summarizePayments(payments, { category: 'tuition' }), [payments])
  const payableAmount = enrollment?.billing?.payable_amount ?? course.tuition_amount ?? 0
  const remainingAmount = Math.max(payableAmount - tuitionSummary.net, 0)
  const canWritePayment = Boolean(enrollment && enrollment.status === 'active' && !enrollment.billing?.tuition_exempt)

  const refreshAll = useCallback(async () => {
    await loadPayments()
    await onDataChanged?.()
  }, [loadPayments, onDataChanged])

  function openPaymentForm() {
    if (enrollment?.billing?.tuition_exempt) {
      setError('이미 무료 수강 또는 수납 면제로 기록된 수강생입니다.')
      return
    }

    if (enrollment?.billing) {
      setPaymentDraft(createPaymentSectionValueForBilling({
        expectedAmount: enrollment.billing.expected_amount,
        discountAmount: enrollment.billing.discount_amount,
        discountReason: enrollment.billing.discount_reason,
        paidAmount: tuitionSummary.net,
        tuitionExempt: enrollment.billing.tuition_exempt,
        tuitionExemptReason: enrollment.billing.tuition_exempt_reason,
      }))
    } else {
      setPaymentDraft(createPaymentSectionValueForBilling({
        expectedAmount: course.tuition_amount ?? 0,
        paidAmount: tuitionSummary.net,
      }))
    }
    setError('')
    setMessage('')
    setFormOpen(true)
  }

  async function handleCreatePayment() {
    if (!enrollment) {
      return
    }

    if (enrollment.status !== 'active') {
      setError('환불 처리된 수강생에는 수납을 추가할 수 없습니다.')
      return
    }

    const payload = normalizePaymentSectionPayload(paymentDraft)
    const dueAmount = payload.tuitionExempt ? 0 : Math.max(payload.payableAmount - tuitionSummary.net, 0)

    if (!Number.isInteger(payload.expectedAmount) || payload.expectedAmount < 0) {
      setError('강좌 정가를 확인해 주세요.')
      return
    }

    if (!Number.isInteger(payload.discountAmount) || payload.discountAmount < 0) {
      setError('할인 금액을 확인해 주세요.')
      return
    }

    if (payload.discountAmount > payload.expectedAmount) {
      setError('할인 금액은 강좌 정가보다 클 수 없습니다.')
      return
    }

    if (!payload.tuitionExempt && payload.discountAmount > 0 && !paymentDraft.discountReason.trim()) {
      setError('할인 금액을 입력한 경우 할인 사유가 필요합니다.')
      return
    }

    if (payload.tuitionExempt) {
      if (!paymentDraft.tuitionExemptReason.trim()) {
        setError('무료 수강 또는 수납 면제 사유를 입력해 주세요.')
        return
      }

      if (tuitionSummary.net > 0) {
        setError('이미 수납 내역이 있는 수강생은 무료 수강으로 변경할 수 없습니다.')
        return
      }
    } else {
      if (payload.expectedAmount <= 0) {
        setError('유료 수납은 정가를 1원 이상 입력해야 합니다.')
        return
      }

      if (payload.payableAmount <= 0) {
        setError('적용 금액이 0원이면 무료 수강으로 기록해 주세요.')
        return
      }

      if (payload.payments.length === 0 || payload.paymentTotal <= 0) {
        setError('결제 수단별 수납 금액을 입력해 주세요.')
        return
      }

      if (dueAmount <= 0) {
        setError('남은 수납 금액이 없습니다.')
        return
      }

      if (payload.paymentTotal !== dueAmount) {
        setError('수납 합계가 남은 적용 금액과 일치해야 합니다.')
        return
      }
    }

    setSubmitting(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/payments/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: course.id,
        enrollmentId: enrollment.id,
        billing: {
          expectedAmount: payload.expectedAmount,
          discountAmount: payload.discountAmount,
          discountReason: paymentDraft.discountReason.trim() || null,
          payableAmount: payload.payableAmount,
          tuitionExempt: payload.tuitionExempt,
          tuitionExemptReason: paymentDraft.tuitionExemptReason.trim() || null,
        },
        payments: payload.payments,
      }),
    })
    const result = await response.json().catch(() => null)

    if (!response.ok) {
      setSubmitting(false)
      setError(result?.error ?? '결제를 저장하지 못했습니다.')
      return
    }

    setSubmitting(false)
    setFormOpen(false)
    setPaymentDraft(createEmptyPaymentSectionValue())
    setMessage(payload.tuitionExempt ? '수납 면제 기록을 저장했습니다.' : '수납 내역을 저장했습니다.')
    await refreshAll()
  }

  async function handleCreateRefund(input: {
    refunds: Array<{
      paymentId: number
      amount: number
      method: RefundMethod
      reasonCategory: RefundReasonCategory
      reason: string
      cancelReceiptNo: string | null
      refundAccountLast4: string | null
      memo: string
    }>
  }) {
    if (!refundTarget) {
      return
    }

    setSubmitting(true)
    setError('')
    setMessage('')
    const response = await fetch('/api/payments/refunds', {
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
    setMessage(input.refunds.length > 1 ? '복수 결제 건의 환불 처리를 완료했습니다.' : '환불 처리를 완료했습니다.')
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

  if (!open || !enrollment) {
    return null
  }

  const billing = enrollment.billing

  return (
    <>
      <div className="fixed inset-0 z-[100] flex justify-end bg-black/24 backdrop-blur-[2px]" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label="결제 상세 닫기"
          className="hidden flex-1 cursor-default sm:block"
          onClick={() => {
            if (!submitting) {
              onClose()
            }
          }}
        />
        <aside className="flex h-dvh w-full flex-col bg-white shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px] sm:max-w-[760px]">
          <header className="border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Student Detail</p>
                <h2 className="mt-1 truncate text-xl font-semibold text-[#1d1d1f]">{enrollment.name}</h2>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {enrollment.exam_number || '-'} · {enrollment.phone || '-'} · {course.name}
                </p>
              </div>
              <button
                type="button"
                aria-label="닫기"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {(message || error) ? (
              <div className="mb-4 space-y-2">
                {message ? (
                  <p className="rounded-[8px] bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{message}</p>
                ) : null}
                {error ? (
                  <p className="rounded-[8px] bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>
                ) : null}
              </div>
            ) : null}

            <section className="rounded-[8px] bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#1d1d1f]">수납 요약</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    수납 추가, 결제 취소, 환불 처리를 이 학생 기준으로 관리합니다.
                  </p>
                </div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                  enrollment.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}>
                  {enrollment.status === 'active' ? '수강 중' : '환불'}
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-[8px] bg-white px-3 py-3">
                  <p className="text-[11px] font-semibold text-slate-400">총 수납</p>
                  <p className="mt-1 text-sm font-bold text-[#1d1d1f]">{formatWon(summary.gross)}</p>
                </div>
                <div className="rounded-[8px] bg-white px-3 py-3">
                  <p className="text-[11px] font-semibold text-slate-400">환불</p>
                  <p className="mt-1 text-sm font-bold text-rose-600">{formatWon(summary.refund)}</p>
                </div>
                <div className="rounded-[8px] bg-white px-3 py-3">
                  <p className="text-[11px] font-semibold text-slate-400">미납</p>
                  <p className="mt-1 text-sm font-bold text-blue-600">{formatWon(remainingAmount)}</p>
                </div>
              </div>

              {billing ? (
                <div className="mt-3 grid gap-2 rounded-[8px] bg-white px-3 py-3 text-xs sm:grid-cols-4">
                  <p className="text-slate-500">정가 <span className="font-bold text-[#1d1d1f]">{formatWon(billing.expected_amount)}</span></p>
                  <p className="text-slate-500">할인 <span className="font-bold text-rose-600">{formatWon(billing.discount_amount)}</span></p>
                  <p className="text-slate-500">청구 <span className="font-bold text-[#1d1d1f]">{formatWon(billing.payable_amount)}</span></p>
                  <p>
                    <span className={`rounded-md px-2 py-0.5 font-semibold ${getBillingStatusClass(billing.status)}`}>
                      {BILLING_STATUS_LABEL[billing.status]}
                    </span>
                  </p>
                </div>
              ) : null}
            </section>

            <section className="mt-4 rounded-[8px] border border-slate-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#1d1d1f]">결제 내역</h3>
                  <p className="mt-1 text-xs text-slate-500">학생별 상세 수납, 취소, 환불 기록입니다.</p>
                  <p className="mt-1 text-xs text-slate-400">전액 환불이 완료되면 강좌와 모바일 수강증에서 자동 제외됩니다.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openPaymentForm}
                    disabled={!canWritePayment || submitting}
                    className="inline-flex items-center gap-1.5 rounded-[8px] bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    수납 추가
                  </button>
                </div>
              </div>

              {formOpen ? (
                <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-4">
                  <PaymentSection value={paymentDraft} onChange={setPaymentDraft} compact />
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setFormOpen(false)}
                      disabled={submitting}
                      className="rounded-[8px] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCreatePayment()}
                      disabled={submitting}
                      className="rounded-[8px] bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? '저장 중...' : '결제 저장'}
                    </button>
                  </div>
                </div>
              ) : null}

              {loading ? (
                <p className="px-4 py-12 text-center text-sm text-slate-400">결제 내역을 불러오는 중입니다.</p>
              ) : payments.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <ReceiptText className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm text-slate-400">아직 결제 기록이 없습니다.</p>
                </div>
              ) : (
                <>
                <div className="grid gap-2 p-3 sm:hidden">
                  {payments.map((payment) => (
                    <article key={payment.id} className="rounded-[8px] bg-slate-50 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-500">{formatPaymentDate(payment.paid_at)}</p>
                          <p className="mt-1 text-sm font-semibold text-[#1d1d1f]">
                            {PAYMENT_METHOD_LABEL[payment.method]} · {PAYMENT_CATEGORY_LABEL[payment.category]}
                          </p>
                          <span className={`mt-2 inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${getPaymentStatusClass(payment.status)}`}>
                            {PAYMENT_STATUS_LABEL[payment.status]}
                          </span>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-[#1d1d1f]">{formatWon(payment.amount)}</p>
                          <p className="mt-1 text-xs font-semibold text-rose-600">환불 {formatWon(getRefundTotal(payment))}</p>
                        </div>
                      </div>
                      {payment.memo || payment.cash_receipt_approval_no ? (
                        <p className="mt-2 truncate text-xs text-slate-500">
                          {payment.memo || `현금영수증 ${payment.cash_receipt_approval_no}`}
                        </p>
                      ) : null}
                      <div className="mt-3 flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setRefundTarget(payment)}
                          disabled={payment.status === 'voided' || payment.status === 'fully_refunded' || submitting}
                          className="inline-flex items-center gap-1 rounded-[8px] bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          환불
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleVoidPayment(payment)}
                          disabled={payment.status !== 'paid' || submitting}
                          className="inline-flex items-center gap-1 rounded-[8px] bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          취소
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                        <th className="w-[150px] px-3 py-3">일시</th>
                        <th className="px-3 py-3">수납 정보</th>
                        <th className="w-[124px] px-3 py-3 text-right">금액</th>
                        <th className="w-[92px] px-3 py-3">상태</th>
                        <th className="w-[132px] px-3 py-3 text-right">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {payments.map((payment) => {
                        const refundTotal = getRefundTotal(payment)

                        return (
                          <tr key={payment.id} className="hover:bg-slate-50/70">
                            <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">
                              {formatPaymentDate(payment.paid_at)}
                            </td>
                            <td className="min-w-0 px-3 py-3">
                              <p className="truncate font-semibold text-slate-700">
                                {PAYMENT_METHOD_LABEL[payment.method]} · {PAYMENT_CATEGORY_LABEL[payment.category]}
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-400">{getPaymentMemo(payment)}</p>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <p className="whitespace-nowrap font-semibold text-[#1d1d1f]">{formatWon(payment.amount)}</p>
                              <p className="mt-1 whitespace-nowrap text-xs font-semibold text-rose-600">
                                환불 {formatWon(refundTotal)}
                              </p>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${getPaymentStatusClass(payment.status)}`}>
                                {PAYMENT_STATUS_LABEL[payment.status]}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex justify-end gap-1.5 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setRefundTarget(payment)}
                                  disabled={payment.status === 'voided' || payment.status === 'fully_refunded' || submitting}
                                  className="inline-flex items-center gap-1 rounded-[8px] bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  환불
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleVoidPayment(payment)}
                                  disabled={payment.status !== 'paid' || submitting}
                                  className="inline-flex items-center gap-1 rounded-[8px] bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  취소
                                </button>
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
        </aside>
      </div>

      <RefundModal
        open={Boolean(refundTarget)}
        payment={refundTarget}
        payments={payments}
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
    </>
  )
}
