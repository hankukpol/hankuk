'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  PAYMENT_METHOD_LABEL,
  REFUND_REASON_CATEGORIES,
  REFUND_REASON_CATEGORY_LABEL,
  REFUND_METHOD_LABEL,
  REFUND_METHODS,
  type EnrollmentPayment,
  type RefundMethod,
  type RefundReasonCategory,
} from '@/lib/payments/types'
import { formatPaymentDate, formatWon } from '@/lib/payments/format'
import { useMotionConfig, useReducedMotionDuration } from '@/lib/motion'

type RefundModalProps = {
  open: boolean
  payment: EnrollmentPayment | null
  payments?: EnrollmentPayment[]
  courseName: string
  submitting?: boolean
  onClose: () => void
  onConfirm: (input: {
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
  }) => void
}

type RefundDraft = {
  paymentId: number
  enabled: boolean
  amount: string
  method: RefundMethod
}

function getDefaultRefundMethod(payment: EnrollmentPayment | null): RefundMethod {
  if (!payment) {
    return 'card_cancel'
  }

  if (payment.method === 'cash') {
    return 'cash'
  }

  if (payment.method === 'bank_transfer') {
    return 'bank_transfer'
  }

  if (payment.method === 'point') {
    return 'point'
  }

  if (payment.method === 'homepage' || payment.method === 'other' || payment.method === 'mixed') {
    return 'other'
  }

  return 'card_cancel'
}

function getRefundedAmount(payment: EnrollmentPayment | null) {
  return (payment?.enrollment_refunds ?? []).reduce((sum, refund) => sum + refund.amount, 0)
}

function getRemainingAmount(payment: EnrollmentPayment | null) {
  return Math.max((payment?.amount ?? 0) - getRefundedAmount(payment), 0)
}

function getRefundablePayments(payment: EnrollmentPayment | null, payments: EnrollmentPayment[] | undefined) {
  if (!payment) {
    return []
  }

  const source = payments?.length ? payments : [payment]
  return source
    .filter((candidate) => (
      candidate.enrollment_id === payment.enrollment_id
      && candidate.category === payment.category
      && candidate.method !== 'free'
      && candidate.status !== 'voided'
      && getRemainingAmount(candidate) > 0
    ))
    .sort((left, right) => {
      if (left.id === payment.id) return -1
      if (right.id === payment.id) return 1
      return right.paid_at.localeCompare(left.paid_at)
    })
}

function parseAmount(value: string) {
  return Number(value.replace(/[^\d]/g, ''))
}

export function RefundModal({
  open,
  payment,
  payments,
  courseName,
  submitting = false,
  onClose,
  onConfirm,
}: RefundModalProps) {
  const motionConfig = useMotionConfig()
  const backdropDuration = useReducedMotionDuration(0.2)
  const refundablePayments = useMemo(
    () => getRefundablePayments(payment, payments),
    [payment, payments],
  )
  const paymentById = useMemo(
    () => new Map(refundablePayments.map((entry) => [entry.id, entry])),
    [refundablePayments],
  )
  const [drafts, setDrafts] = useState<RefundDraft[]>([])
  const [reasonCategory, setReasonCategory] = useState<RefundReasonCategory>('withdrawal')
  const [reason, setReason] = useState('')
  const [cancelReceiptNo, setCancelReceiptNo] = useState('')
  const [refundAccountLast4, setRefundAccountLast4] = useState('')
  const [memo, setMemo] = useState('')

  useEffect(() => {
    if (!open || !payment) {
      return
    }

    const nextPayments = getRefundablePayments(payment, payments)
    setDrafts(nextPayments.map((entry) => ({
      paymentId: entry.id,
      enabled: true,
      amount: String(getRemainingAmount(entry)),
      method: getDefaultRefundMethod(entry),
    })))
    setReasonCategory('withdrawal')
    setReason('')
    setCancelReceiptNo('')
    setRefundAccountLast4('')
    setMemo('')
  }, [open, payment, payments])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open, submitting])

  const student = payment?.enrollments
  const selectedDrafts = drafts.filter((draft) => draft.enabled)
  const refundRequests = selectedDrafts.map((draft) => {
    const target = paymentById.get(draft.paymentId)
    return {
      paymentId: draft.paymentId,
      amount: parseAmount(draft.amount),
      method: draft.method,
      reasonCategory,
      reason,
      cancelReceiptNo: draft.method === 'card_cancel' ? cancelReceiptNo.trim() || null : null,
      refundAccountLast4: draft.method === 'bank_transfer' ? refundAccountLast4.trim() || null : null,
      memo,
      target,
    }
  })
  const hasInvalidRefund = refundRequests.some((request) => (
    !request.target
    || !Number.isInteger(request.amount)
    || request.amount <= 0
    || request.amount > getRemainingAmount(request.target)
  ))
  const totalRefundAmount = refundRequests.reduce((sum, request) => sum + (Number.isFinite(request.amount) ? request.amount : 0), 0)
  const hasCardCancel = refundRequests.some((request) => request.method === 'card_cancel')
  const hasBankTransfer = refundRequests.some((request) => request.method === 'bank_transfer')
  const hasMultiplePayments = refundablePayments.length > 1
  const refundMetaInvalid = (
    (reasonCategory === 'other' && !reason.trim())
    || (hasCardCancel && !cancelReceiptNo.trim())
    || (hasBankTransfer && !/^\d{4}$/.test(refundAccountLast4.trim()))
  )

  function updateDraft(paymentId: number, patch: Partial<RefundDraft>) {
    setDrafts((current) => current.map((draft) => (
      draft.paymentId === paymentId ? { ...draft, ...patch } : draft
    )))
  }

  return (
    <AnimatePresence>
      {open && payment ? (
        <motion.div
          role="presentation"
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 px-5 sm:backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: backdropDuration }}
          onClick={() => {
            if (!submitting) {
              onClose()
            }
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-[12px] bg-white p-6 shadow-[3px_5px_30px_0px_rgba(0,0,0,0.22)]"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={motionConfig.modal}
            onClick={(event) => event.stopPropagation()}
          >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Refund</p>
            <h3 className="mt-1 text-[21px] font-semibold tracking-[-0.231px] text-[#1d1d1f]">환불 처리</h3>
            <p className="mt-2 text-sm text-slate-700">
              {student?.name ?? '수강생'} / {courseName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full px-2 py-1 text-xs font-semibold text-slate-400 transition-all duration-200 ease-ios hover:bg-slate-100 hover:text-slate-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            닫기
          </button>
        </div>

        <div className="mt-5 rounded-[8px] bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-[#1d1d1f]">
            기준 수납: {formatPaymentDate(payment.paid_at)} {PAYMENT_METHOD_LABEL[payment.method]} {formatWon(payment.amount)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            같은 수강생의 같은 분류 수납 중 환불 가능한 건만 표시됩니다.
          </p>
        </div>

        {hasMultiplePayments ? (
          <p className="mt-3 rounded-[8px] bg-slate-50 px-3 py-2 text-xs text-[#0066cc]">
            혼합 또는 분할 수납 {refundablePayments.length}건을 결제수단별로 나누어 환불합니다. 필요 없는 건은 체크를 해제해 주세요.
          </p>
        ) : null}

        <div className="mt-5 space-y-2">
          {refundablePayments.map((entry) => {
            const draft = drafts.find((item) => item.paymentId === entry.id)
            const remainingAmount = getRemainingAmount(entry)
            const parsedAmount = parseAmount(draft?.amount ?? '')
            const amountInvalid = Boolean(draft?.enabled) && (
              !Number.isInteger(parsedAmount)
              || parsedAmount <= 0
              || parsedAmount > remainingAmount
            )

            return (
              <article
                key={entry.id}
                className={`rounded-[8px] px-4 py-3 transition ${
                  draft?.enabled ? 'bg-white shadow-[inset_0_0_0_1px_rgba(0,113,227,0.18)]' : 'bg-slate-50'
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <label className="flex min-w-0 items-start gap-3">
                    <input
                      type="checkbox"
                      checked={draft?.enabled ?? false}
                      onChange={(event) => updateDraft(entry.id, { enabled: event.target.checked })}
                      className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#0071e3]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#1d1d1f]">
                        {PAYMENT_METHOD_LABEL[entry.method]} · {formatWon(entry.amount)}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">
                        {formatPaymentDate(entry.paid_at)} · 기존 환불 {formatWon(getRefundedAmount(entry))}
                      </span>
                    </span>
                  </label>
                  <span className="w-fit rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                    환불 가능 {formatWon(remainingAmount)}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr,180px]">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-500">환불 금액</span>
                    <input
                      inputMode="numeric"
                      value={draft?.amount ?? ''}
                      disabled={!draft?.enabled}
                      onChange={(event) => updateDraft(entry.id, { amount: event.target.value.replace(/[^\d]/g, '') })}
                      className={`rounded-[8px] bg-white px-3 py-2.5 text-sm outline-none transition disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
                        amountInvalid
                          ? 'shadow-[inset_0_0_0_1px_rgba(180,35,24,0.4)] bg-[#fef2f2]'
                          : 'border border-slate-200 focus:border-slate-400'
                      }`}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-500">환불 방법</span>
                    <select
                      value={draft?.method ?? getDefaultRefundMethod(entry)}
                      disabled={!draft?.enabled}
                      onChange={(event) => updateDraft(entry.id, { method: event.target.value as RefundMethod })}
                      className="rounded-[8px] bg-white px-3 py-2.5 text-sm border border-slate-200 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      {REFUND_METHODS.map((refundMethod) => (
                        <option key={refundMethod} value={refundMethod}>
                          {REFUND_METHOD_LABEL[refundMethod]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </article>
            )
          })}
        </div>

        <div className="mt-4 rounded-[8px] bg-slate-50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-slate-500">총 환불 금액</span>
            <span className="text-base font-semibold text-[#1d1d1f]">{formatWon(totalRefundAmount)}</span>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">환불 사유</span>
            <select
              value={reasonCategory}
              onChange={(event) => setReasonCategory(event.target.value as RefundReasonCategory)}
              className="rounded-[8px] bg-white px-3 py-2.5 text-sm border border-slate-200 outline-none transition focus:border-slate-400"
            >
              {REFUND_REASON_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {REFUND_REASON_CATEGORY_LABEL[category]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">
              {reasonCategory === 'other' ? '기타 사항' : '사유 메모'}
            </span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonCategory === 'other' ? '기타 사유를 입력하세요' : '필요 시 사유를 보충하세요'}
              className="rounded-[8px] bg-white px-3 py-2.5 text-sm border border-slate-200 outline-none transition focus:border-slate-400"
            />
          </label>

          {hasCardCancel ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500">카드 취소 승인번호</span>
              <input
                value={cancelReceiptNo}
                onChange={(event) => setCancelReceiptNo(event.target.value)}
                placeholder="단말기 취소 영수증 번호"
                className="rounded-[8px] bg-white px-3 py-2.5 text-sm border border-slate-200 outline-none transition focus:border-slate-400"
              />
            </label>
          ) : null}

          {hasBankTransfer ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500">환불 입금 계좌 마지막 4자리</span>
              <input
                inputMode="numeric"
                maxLength={4}
                value={refundAccountLast4}
                onChange={(event) => setRefundAccountLast4(event.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4자리 숫자"
                className="rounded-[8px] bg-white px-3 py-2.5 text-sm border border-slate-200 outline-none transition focus:border-slate-400"
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">추가 메모</span>
            <textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              rows={3}
              className="rounded-[8px] bg-white px-3 py-2.5 text-sm border border-slate-200 outline-none transition focus:border-slate-400"
            />
          </label>
        </div>

        {hasCardCancel ? (
          <p className="mt-4 rounded-[8px] bg-slate-50 px-3 py-2 text-xs text-slate-700">
            카드 환불은 단말기에서 취소 처리 후 영수증 번호 입력
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-[8px] bg-slate-50 px-4 py-2 text-[14px] font-medium text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm({
              refunds: refundRequests.map((request) => ({
                paymentId: request.paymentId,
                amount: request.amount,
                method: request.method,
                reasonCategory: request.reasonCategory,
                reason: request.reason,
                cancelReceiptNo: request.cancelReceiptNo,
                refundAccountLast4: request.refundAccountLast4,
                memo: request.memo,
              })),
            })}
            disabled={submitting || selectedDrafts.length === 0 || hasInvalidRefund || refundMetaInvalid}
            className="rounded-[8px] bg-blue-600 px-4 py-2 text-[14px] font-medium text-white transition-all duration-200 ease-ios hover:bg-blue-700 active:scale-[0.97] active:duration-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            {submitting ? '저장 중...' : '환불 저장'}
          </button>
        </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
