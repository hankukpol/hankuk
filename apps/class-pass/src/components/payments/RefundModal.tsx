'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { AdminDrawerSurface } from '@/components/admin/AdminDrawer'
import { AdminPortal } from '@/components/admin/AdminPortal'
import { AdminDialogClose } from '@/components/admin/AdminDialogClose'
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

type RefundModalProps = {
  open: boolean
  payment: EnrollmentPayment | null
  payments?: EnrollmentPayment[]
  courseName: string
  submitting?: boolean
  onClose: () => void
  onConfirm: (input: {
    requestId: string
    endEnrollment: boolean
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
  const titleId = useId()
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
  const requestId = useRef('')
  const [endEnrollment, setEndEnrollment] = useState(false)

  useEffect(() => {
    if (!open || !payment) {
      requestId.current = ''
      return
    }
    if (!requestId.current) requestId.current = crypto.randomUUID()

    const nextPayments = getRefundablePayments(payment, payments)
    setDrafts(nextPayments.map((entry) => ({
      paymentId: entry.id,
      enabled: entry.id === payment.id,
      amount: String(getRemainingAmount(entry)),
      method: getDefaultRefundMethod(entry),
    })))
    setReasonCategory('withdrawal')
    setReason('')
    setCancelReceiptNo('')
    setRefundAccountLast4('')
    setMemo('')
    setEndEnrollment(false)
  }, [open, payment, payments])

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
  const sameCheckoutIds = payment?.checkout_group_id
    ? new Set(refundablePayments.filter((entry) => entry.checkout_group_id === payment.checkout_group_id).map((entry) => entry.id))
    : new Set<number>()
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
    <AdminPortal><AnimatePresence>
      {open && payment ? (
        <AdminDrawerSurface labelledBy={titleId} priority={140} onClose={onClose} closeDisabled={submitting}>
        <div className="admin-dialog-header flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 id={titleId} className="admin-dialog-title mt-1 break-words text-[21px] font-semibold tracking-[-0.231px] text-[#1d1d1f]">환불 처리</h3>
            <p className="mt-2 text-sm text-slate-700">
              {student?.name ?? '수강생'} / {courseName}
            </p>
          </div>
          <AdminDialogClose onClick={onClose} disabled={submitting} />
        </div>

        <fieldset disabled={submitting} className="admin-dialog-body min-w-0 pt-5">
        <div className="rounded-[8px] bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-[#1d1d1f]">
            기준 수납: {formatPaymentDate(payment.paid_at)} {PAYMENT_METHOD_LABEL[payment.method]} {formatWon(payment.amount)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            같은 수강생의 같은 분류 수납 중 환불 가능한 건만 표시됩니다.
          </p>
        </div>

        {hasMultiplePayments ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-slate-500">선택한 결제 한 건만 환불합니다. 다른 결제도 환불하려면 직접 선택해 주세요.</p>
            {/* 토글이 아니라 한 번 실행되는 동작이므로 128px 고정폭 조건 버튼이 아닌 일반 실행 버튼을 쓴다. */}
            {sameCheckoutIds.size > 1 ? (
              <button type="button" className="admin-button" onClick={() => setDrafts((current) => current.map((draft) => ({ ...draft, enabled: sameCheckoutIds.has(draft.paymentId) })))}>
                동일 결제 모두 선택
              </button>
            ) : null}
          </div>
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
          <div className="space-y-2">
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" aria-label="환불 후 수강 종료" checked={endEnrollment}
                disabled={payment.enrollments?.status === 'cancelled'}
                onChange={(event) => setEndEnrollment(event.target.checked)} />
              환불 후 수강 종료
            </label>
            <p className="text-xs text-slate-500">
              {endEnrollment ? '이미 이용한 금액은 그대로 보존하며, 수강과 이용 자격을 종료합니다.' : '체크하지 않으면 기존 수강 상태를 유지합니다. 전액 환불도 자동으로 수강을 종료하지 않습니다.'}
            </p>
          </div>
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
              maxLength={200}
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
              maxLength={500}
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

          <p className="mt-4 text-xs text-slate-500">응답 오류가 나면 내용을 바꾸지 말고 같은 요청으로 다시 확인해 주세요. 실제 환불 여부는 단말기·입금 내역도 확인해야 합니다.</p>
        </fieldset>

        <div className="admin-dialog-footer">
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
              requestId: requestId.current,
              endEnrollment,
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
        </AdminDrawerSurface>
      ) : null}
    </AnimatePresence></AdminPortal>
  )
}
