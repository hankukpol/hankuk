'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { Plus, ReceiptText, RefreshCw, RotateCcw, X, XCircle } from 'lucide-react'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'
import type { Course, Enrollment } from '@/types/database'
import { useMotionConfig, useReducedMotionDuration } from '@/lib/motion'
import { PaymentCorrectionModal, type PaymentCorrectionConfirmInput } from './PaymentCorrectionModal'
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

type DrawerNotice = {
  title: string
  description: string
  tone?: 'default' | 'danger' | 'success'
}

type EnrollmentCancellationPrompt = {
  enrollmentId: number
  studentName: string
  payableAmount: number
  source: 'refund' | 'void'
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
      return 'bg-slate-100 text-slate-600'
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

function mergePaymentUpdates(current: EnrollmentPayment[], updates: EnrollmentPayment[]) {
  if (updates.length === 0) {
    return current
  }

  const updatedById = new Map(updates.map((payment) => [payment.id, payment]))
  return current.map((payment) => updatedById.get(payment.id) ?? payment)
}

function shouldPromptEnrollmentCancellation(options: {
  enrollment: Enrollment | null
  payments: EnrollmentPayment[]
  payableAmount: number
  changedCategory: EnrollmentPayment['category']
}) {
  if (
    !options.enrollment
    || options.enrollment.status !== 'active'
    || options.enrollment.billing?.tuition_exempt
    || options.payableAmount <= 0
    || options.changedCategory !== 'tuition'
  ) {
    return false
  }

  const hasTuitionPaymentHistory = options.payments.some((payment) => payment.category === 'tuition')
  return hasTuitionPaymentHistory && summarizePayments(options.payments, { category: 'tuition' }).net <= 0
}

export function EnrollmentPaymentDrawer({
  open,
  course,
  enrollment,
  onClose,
  onDataChanged,
}: EnrollmentPaymentDrawerProps) {
  const motionConfig = useMotionConfig()
  const backdropDuration = useReducedMotionDuration(0.2)
  const [payments, setPayments] = useState<EnrollmentPayment[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [paymentDraft, setPaymentDraft] = useState<PaymentSectionValue>(createEmptyPaymentSectionValue)
  const [refundTarget, setRefundTarget] = useState<EnrollmentPayment | null>(null)
  const [correctionTarget, setCorrectionTarget] = useState<EnrollmentPayment | null>(null)
  const [voidTarget, setVoidTarget] = useState<EnrollmentPayment | null>(null)
  const [cancelEnrollmentPrompt, setCancelEnrollmentPrompt] = useState<EnrollmentCancellationPrompt | null>(null)
  const [notice, setNotice] = useState<DrawerNotice | null>(null)
  const [receiptNotice, setReceiptNotice] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const lastErrorNoticeRef = useRef('')

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
      if (event.key === 'Escape' && !submitting && !refundTarget && !correctionTarget && !voidTarget && !cancelEnrollmentPrompt && !notice) {
        onClose()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [cancelEnrollmentPrompt, correctionTarget, notice, onClose, open, refundTarget, submitting, voidTarget])

  useEffect(() => {
    if (!open || !enrollment) {
      return
    }

    setMessage('')
    setError('')
    setFormOpen(false)
    setRefundTarget(null)
    setCorrectionTarget(null)
    setVoidTarget(null)
    setCancelEnrollmentPrompt(null)
    setNotice(null)
    void loadPayments()
  }, [enrollment, loadPayments, open])

  useEffect(() => {
    if (!error) {
      lastErrorNoticeRef.current = ''
      return
    }

    if (lastErrorNoticeRef.current === error) {
      return
    }

    lastErrorNoticeRef.current = error
    setNotice({
      title: '확인이 필요합니다',
      description: error,
      tone: 'danger',
    })
  }, [error])

  const summary = useMemo(() => summarizePayments(payments), [payments])
  const tuitionSummary = useMemo(() => summarizePayments(payments, { category: 'tuition' }), [payments])
  const payableAmount = enrollment?.billing?.payable_amount ?? course.tuition_amount ?? 0
  const remainingAmount = Math.max(payableAmount - tuitionSummary.net, 0)
  const canWritePayment = Boolean(enrollment && !enrollment.billing?.tuition_exempt)

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

      const missingCardCompany = paymentDraft.entries.some(
        (entry) => entry.method === 'card' && !entry.cardCompany?.trim(),
      )
      if (missingCardCompany) {
        setError('카드사를 선택해 주세요.')
        return
      }

      const missingBankAccountLast4 = paymentDraft.entries.some(
        (entry) => entry.method === 'bank_transfer' && !/^\d{4}$/.test(entry.bankAccountLast4.trim()),
      )
      if (missingBankAccountLast4) {
        setError('계좌 결제는 계좌 마지막 4자리를 입력해 주세요.')
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

    try {
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
      setError(result?.error ?? '결제를 저장하지 못했습니다.')
      return
    }

    setFormOpen(false)
    setPaymentDraft(createEmptyPaymentSectionValue())

    const receiptNos = (result?.payments ?? [])
      .map((p: { display_receipt_no?: string | null }) => p.display_receipt_no)
      .filter(Boolean)
      .join(', ')

    if (enrollment.status === 'refunded') {
      setMessage('환불 완료 수강생을 다시 활성화하고 수납 내역을 저장했습니다.')
    } else if (payload.tuitionExempt) {
      setMessage('수납 면제 기록을 저장했습니다.')
    } else if (receiptNos) {
      setReceiptNotice(receiptNos)
    } else {
      setMessage('수납 내역을 저장했습니다.')
    }

    await refreshAll()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '결제를 저장하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
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

    const target = refundTarget
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
    const response = await fetch('/api/payments/refunds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const result = await response.json().catch(() => null)

    if (!response.ok) {
      setError(result?.error ?? '환불을 저장하지 못했습니다.')
      return
    }

    const updatedPayments = Array.isArray(result?.payments) ? result.payments as EnrollmentPayment[] : []
    const shouldUpdateEnrollmentStatus = shouldPromptEnrollmentCancellation({
      enrollment,
      payments: mergePaymentUpdates(payments, updatedPayments),
      payableAmount,
      changedCategory: target.category,
    })

    setRefundTarget(null)
    setMessage(
      shouldUpdateEnrollmentStatus
        ? '환불 처리를 완료했고 수강 상태를 환불로 변경했습니다.'
        : input.refunds.length > 1
          ? '복수 결제 건의 환불 처리를 완료했습니다.'
          : '환불 처리를 완료했습니다.',
    )
    await refreshAll()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '환불을 저장하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCreateCorrection(input: PaymentCorrectionConfirmInput) {
    if (!enrollment) {
      return
    }

    setSubmitting(true)
    setError('')
    setMessage('')
    try {
    const response = await fetch('/api/payments/corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrollmentId: enrollment.id,
        courseId: course.id,
        ...input,
      }),
    })
    const result = await response.json().catch(() => null)

    if (!response.ok) {
      setError(result?.error ?? '결제 정정을 저장하지 못했습니다.')
      return
    }

    setCorrectionTarget(null)
    setMessage('환불과 재수납 정정을 저장했습니다.')
    await refreshAll()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '결제 정정을 저장하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleVoidPayment(payment: EnrollmentPayment) {
    setVoidTarget(payment)
  }

  async function handleVoidPaymentConfirmed() {
    if (!voidTarget) {
      return
    }

    const target = voidTarget
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
    const response = await fetch(`/api/payments/${voidTarget.id}/void`, { method: 'POST' })
    const result = await response.json().catch(() => null)

    if (!response.ok) {
      setVoidTarget(null)
      setError(result?.error ?? '결제를 취소하지 못했습니다.')
      return
    }

    const updatedPayment = result?.payment as EnrollmentPayment | undefined
    const nextPayments = updatedPayment ? mergePaymentUpdates(payments, [updatedPayment]) : payments
    const shouldAskToCancelEnrollment = shouldPromptEnrollmentCancellation({
      enrollment,
      payments: nextPayments,
      payableAmount,
      changedCategory: target.category,
    })

    setVoidTarget(null)
    setMessage('결제를 취소했습니다.')
    await refreshAll()
    if (shouldAskToCancelEnrollment && enrollment) {
      setCancelEnrollmentPrompt({
        enrollmentId: enrollment.id,
        studentName: enrollment.name,
        payableAmount,
        source: 'void',
      })
    }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '결제를 취소하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancelEnrollmentConfirmed() {
    if (!cancelEnrollmentPrompt) {
      return
    }

    setSubmitting(true)
    setError('')
    try {
    const response = await fetch(`/api/enrollments/${cancelEnrollmentPrompt.enrollmentId}/refund`, { method: 'POST' })
    const result = await response.json().catch(() => null)

    if (!response.ok) {
      setError(result?.error ?? '수강 상태를 취소하지 못했습니다.')
      return
    }

    setCancelEnrollmentPrompt(null)
    setMessage('수강 상태를 수강취소로 변경했습니다.')
    await refreshAll()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '수강 상태를 취소하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  function keepEnrollmentActive() {
    if (submitting) {
      return
    }

    setCancelEnrollmentPrompt(null)
    setMessage('수강 상태는 활성으로 유지했습니다. 재결제 예정이면 수납을 다시 추가해 주세요.')
  }

  function handleDrawerDragEnd(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) {
    if (!submitting && info.offset.x > 100 && info.velocity.x > 200) {
      onClose()
    }
  }

  const billing = enrollment?.billing

  return (
    <>
      <AnimatePresence>
        {open && enrollment ? (
          <>
            <motion.div
              className="fixed inset-0 z-[120] bg-black/40 sm:backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: backdropDuration }}
              onClick={() => {
                if (!submitting) {
                  onClose()
                }
              }}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              className="fixed inset-y-0 right-0 z-[121] flex h-dvh w-full flex-col bg-white shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px] sm:w-[640px] xl:w-[780px] 2xl:w-[960px]"
              initial={{ x: 'calc(100% + 24px)', opacity: 0.96 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 'calc(100% + 24px)', opacity: 0.96 }}
              transition={motionConfig.drawer}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              whileDrag={{ scale: 0.995 }}
              onDragEnd={handleDrawerDragEnd}
            >
          <header className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Student Detail</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <h2 className="truncate text-[28px] font-semibold text-[#1d1d1f]">{enrollment.name}</h2>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    enrollment.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                  }`}>
                    {enrollment.status === 'active' ? '수강 중' : '환불'}
                  </span>
                </div>
                <p className="mt-2 truncate text-sm text-slate-500">
                  {enrollment.exam_number || '-'} · {enrollment.phone || '-'} · {course.name}
                </p>
              </div>
              <button
                type="button"
                aria-label="닫기"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-slate-50 text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {(message || error) ? (
              <div className="mb-4 space-y-2">
                {message ? (
                  <p className="rounded-[8px] bg-[#ecfdf5] px-3 py-2 text-xs font-medium text-emerald-600">{message}</p>
                ) : null}
                {error ? (
                  <p className="rounded-[8px] bg-[#fef2f2] px-3 py-2 text-xs font-medium text-rose-600">{error}</p>
                ) : null}
              </div>
            ) : null}

            <section>
              <div className="grid gap-3 sm:grid-cols-3">
                <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <p className="text-xs font-semibold text-slate-500">총 수납</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{formatWon(summary.gross)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <p className="text-xs font-semibold text-slate-500">환불</p>
                  <p className="mt-2 text-2xl font-bold text-rose-600">
                    {summary.refund > 0 ? '−' : ''}{formatWon(summary.refund)}
                  </p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <p className="text-xs font-semibold text-slate-500">미납</p>
                  <p className={`mt-2 text-2xl font-bold ${remainingAmount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {formatWon(remainingAmount)}
                  </p>
                </article>
              </div>

              {billing ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  <span>정가 <span className="font-semibold text-slate-900">{formatWon(billing.expected_amount)}</span></span>
                  <span className="text-slate-300">·</span>
                  <span>할인 <span className="font-semibold text-rose-600">{formatWon(billing.discount_amount)}</span></span>
                  <span className="text-slate-300">·</span>
                  <span>청구 <span className="font-semibold text-slate-900">{formatWon(billing.payable_amount)}</span></span>
                  <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getBillingStatusClass(billing.status)}`}>
                    {BILLING_STATUS_LABEL[billing.status]}
                  </span>
                </div>
              ) : null}
            </section>

            <section className="mt-6">
              <div className="flex items-center justify-between gap-3 px-1 pb-3">
                <div>
                  <h3 className="text-base font-semibold text-[#1d1d1f]">결제 내역</h3>
                  <p className="mt-0.5 text-xs text-slate-500">전체 {payments.length}건 · 합계 {formatWon(summary.gross)}</p>
                </div>
                <button
                  type="button"
                  onClick={openPaymentForm}
                  disabled={!canWritePayment || submitting}
                  className="inline-flex items-center gap-1.5 rounded-[8px] bg-blue-600 px-3.5 py-2 text-xs font-medium text-white transition-all duration-200 ease-ios hover:bg-blue-700 active:scale-[0.97] active:duration-100 disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  수납 추가
                </button>
              </div>

              <div className="overflow-hidden rounded-[10px] bg-white border border-slate-200">
                {/* 보조 안내는 제거 — 사용자가 한번 보면 충분 */}

              {formOpen ? (
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-5">
                  <PaymentSection value={paymentDraft} onChange={setPaymentDraft} compact />
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setFormOpen(false)}
                      disabled={submitting}
                      className="rounded-[8px] bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCreatePayment()}
                      disabled={submitting}
                      className="rounded-[8px] bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97] active:duration-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
                    >
                      {submitting ? '저장 중...' : '결제 저장'}
                    </button>
                  </div>
                </div>
              ) : null}

              {loading ? (
                <p className="px-4 py-12 text-center text-sm text-slate-500">결제 내역을 불러오는 중입니다.</p>
              ) : payments.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <ReceiptText className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm text-slate-500">아직 결제 기록이 없습니다.</p>
                </div>
              ) : (
                <>
                <div className="grid gap-2 p-3 2xl:hidden">
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
                          <p className="mt-1 text-xs font-semibold text-rose-600">−{formatWon(getRefundTotal(payment))}</p>
                        </div>
                      </div>
                      {payment.memo || payment.cash_receipt_approval_no ? (
                        <p className="mt-2 truncate text-xs text-slate-500">
                          {payment.memo || `현금영수증 ${payment.cash_receipt_approval_no}`}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setRefundTarget(payment)}
                          disabled={payment.status === 'voided' || payment.status === 'fully_refunded' || submitting}
                          className="inline-flex items-center gap-1 rounded-[8px] bg-[#fffbeb] px-2.5 py-1.5 text-[11px] font-semibold text-amber-600 transition-all duration-200 ease-ios hover:bg-amber-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          환불
                        </button>
                        <button
                          type="button"
                          onClick={() => setCorrectionTarget(payment)}
                          disabled={payment.status === 'voided' || payment.status === 'fully_refunded' || submitting}
                          className="inline-flex items-center gap-1 rounded-[8px] bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 transition-all duration-200 ease-ios hover:bg-blue-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          정정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVoidPayment(payment)}
                          disabled={payment.status !== 'paid' || submitting}
                          className="inline-flex items-center gap-1 rounded-[8px] bg-[#fef2f2] px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 transition-all duration-200 ease-ios hover:bg-rose-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          취소
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="hidden 2xl:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-semibold text-slate-500">
                        <th className="px-5 py-3">일시</th>
                        <th className="px-3 py-3">수납</th>
                        <th className="px-3 py-3 text-right">금액</th>
                        <th className="px-3 py-3 text-center">상태</th>
                        <th className="px-5 py-3 text-right">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payments.map((payment) => {
                        const refundTotal = getRefundTotal(payment)
                        const isInactive = payment.status === 'voided' || payment.status === 'fully_refunded'

                        return (
                          <tr key={payment.id} className={`transition-colors hover:bg-slate-50/70 ${isInactive ? 'opacity-60' : ''}`}>
                            <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-500">
                              {formatPaymentDate(payment.paid_at)}
                            </td>
                            <td className="px-3 py-3.5">
                              <p className="whitespace-nowrap font-semibold text-slate-700">
                                {PAYMENT_METHOD_LABEL[payment.method]}
                                <span className="ml-1.5 text-xs font-normal text-slate-500">{PAYMENT_CATEGORY_LABEL[payment.category]}</span>
                              </p>
                              {getPaymentMemo(payment) ? (
                                <p className="mt-0.5 truncate text-xs text-slate-500" title={getPaymentMemo(payment)}>
                                  {getPaymentMemo(payment)}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-3 py-3.5 text-right">
                              <p className="whitespace-nowrap font-semibold text-[#1d1d1f]">{formatWon(payment.amount)}</p>
                              {refundTotal > 0 ? (
                                <p className="mt-0.5 whitespace-nowrap text-xs font-semibold text-rose-600">
                                  −{formatWon(refundTotal)}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-3 py-3.5 text-center">
                              <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getPaymentStatusClass(payment.status)}`}>
                                {PAYMENT_STATUS_LABEL[payment.status]}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex justify-end gap-1.5 whitespace-nowrap">
                                {isInactive ? (
                                  <span className="text-[11px] text-slate-300">—</span>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setRefundTarget(payment)}
                                      disabled={submitting}
                                      className="inline-flex items-center gap-1 rounded-[6px] bg-white border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-amber-50 hover:text-amber-600 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      환불
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setCorrectionTarget(payment)}
                                      disabled={payment.status === 'voided' || payment.status === 'fully_refunded' || submitting}
                                      className="inline-flex items-center gap-1 rounded-[6px] bg-white border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-blue-50 hover:text-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                                    >
                                      <RefreshCw className="h-3 w-3" />
                                      정정
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleVoidPayment(payment)}
                                      disabled={payment.status !== 'paid' || submitting}
                                      className="inline-flex items-center gap-1 rounded-[6px] bg-white border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-rose-50 hover:text-rose-600 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                                    >
                                      <XCircle className="h-3 w-3" />
                                      취소
                                    </button>
                                  </>
                                )}
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
              </div>
            </section>
          </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

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

      <PaymentCorrectionModal
        open={Boolean(correctionTarget)}
        payment={correctionTarget}
        courseName={course.name}
        currentTuitionNetAmount={tuitionSummary.net}
        billingPayableAmount={payableAmount}
        submitting={submitting}
        onClose={() => {
          if (!submitting) {
            setCorrectionTarget(null)
          }
        }}
        onConfirm={(input) => {
          void handleCreateCorrection(input)
        }}
      />

      <ConfirmationModal
        open={Boolean(voidTarget)}
        title="결제를 취소할까요?"
        description={voidTarget ? `${formatWon(voidTarget.amount)} 결제를 취소합니다.\n\n이유: 오입력 또는 실제 승인 취소가 필요한 경우에만 사용해 주세요. 환불 기록이 있는 결제는 취소할 수 없습니다.` : undefined}
        confirmLabel="결제 취소"
        pendingLabel="취소 중..."
        tone="danger"
        submitting={submitting}
        overlayClassName="z-[200]"
        onClose={() => {
          if (!submitting) {
            setVoidTarget(null)
          }
        }}
        onConfirm={() => {
          void handleVoidPaymentConfirmed()
        }}
      />

      <ConfirmationModal
        open={Boolean(cancelEnrollmentPrompt)}
        title="수강 상태도 취소할까요?"
        description={cancelEnrollmentPrompt ? [
          `${cancelEnrollmentPrompt.studentName} 학생의 수강료 실수납이 0원이 되어 미납액이 ${formatWon(cancelEnrollmentPrompt.payableAmount)}입니다.`,
          cancelEnrollmentPrompt.source === 'void'
            ? '결제 취소만 정정한 것이고 재결제 예정이면 활성 상태를 유지하세요.'
            : '전액 환불 후 실제 수강도 종료된 경우에만 수강취소로 변경하세요.',
        ].join('\n\n') : undefined}
        confirmLabel="수강취소"
        pendingLabel="처리 중..."
        cancelLabel="활성 유지"
        tone="danger"
        submitting={submitting}
        overlayClassName="z-[205]"
        onClose={keepEnrollmentActive}
        onConfirm={() => {
          void handleCancelEnrollmentConfirmed()
        }}
      />

      <ConfirmationModal
        open={Boolean(notice)}
        title={notice?.title ?? '확인이 필요합니다'}
        description={notice?.description}
        confirmLabel="확인"
        cancelLabel={null}
        tone={notice?.tone ?? 'danger'}
        overlayClassName="z-[210]"
        onClose={() => setNotice(null)}
        onConfirm={() => setNotice(null)}
      />

      <ConfirmationModal
        open={Boolean(receiptNotice)}
        title="수납 완료"
        description="카드 영수증에 아래 번호를 기재해주세요."
        confirmLabel="확인"
        cancelLabel={null}
        tone="success"
        overlayClassName="z-[210]"
        onClose={() => setReceiptNotice(null)}
        onConfirm={() => setReceiptNotice(null)}
      >
        <div className="rounded-[10px] bg-emerald-50 px-4 py-4 text-center">
          <p className="text-xs font-medium text-slate-500">영수증 번호</p>
          <p className="mt-1 font-mono text-4xl font-bold tracking-widest text-emerald-700">{receiptNotice}</p>
        </div>
      </ConfirmationModal>
    </>
  )
}
