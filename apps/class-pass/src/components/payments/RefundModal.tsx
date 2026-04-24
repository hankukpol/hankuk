'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  PAYMENT_METHOD_LABEL,
  REFUND_METHOD_LABEL,
  REFUND_METHODS,
  type EnrollmentPayment,
  type RefundMethod,
} from '@/lib/payments/types'
import { formatPaymentDate, formatWon } from '@/lib/payments/format'

type RefundModalProps = {
  open: boolean
  payment: EnrollmentPayment | null
  courseName: string
  submitting?: boolean
  onClose: () => void
  onConfirm: (input: {
    amount: number
    method: RefundMethod
    reason: string
    memo: string
  }) => void
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

  return 'card_cancel'
}

function getRefundedAmount(payment: EnrollmentPayment | null) {
  return (payment?.enrollment_refunds ?? []).reduce((sum, refund) => sum + refund.amount, 0)
}

export function RefundModal({
  open,
  payment,
  courseName,
  submitting = false,
  onClose,
  onConfirm,
}: RefundModalProps) {
  const remainingAmount = useMemo(() => (
    payment ? payment.amount - getRefundedAmount(payment) : 0
  ), [payment])
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<RefundMethod>('card_cancel')
  const [reason, setReason] = useState('')
  const [memo, setMemo] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }

    setAmount(String(Math.max(remainingAmount, 0)))
    setMethod(getDefaultRefundMethod(payment))
    setReason('')
    setMemo('')
  }, [open, payment, remainingAmount])

  if (!open || !payment) {
    return null
  }

  const student = payment.enrollments
  const parsedAmount = Number(amount.replace(/[^\d]/g, ''))
  const amountInvalid = !Number.isInteger(parsedAmount) || parsedAmount <= 0 || parsedAmount > remainingAmount

  return (
    <div
      role="presentation"
      className="apple-modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-5"
      onClick={() => {
        if (!submitting) {
          onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl rounded-[8px] bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Refund</p>
            <h3 className="mt-1 text-[21px] font-semibold tracking-[-0.22px] text-[#1d1d1f]">환불 처리</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {student?.name ?? '수강생'} / {courseName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full px-2 py-1 text-xs font-semibold text-black/45 transition hover:bg-black/5 hover:text-black/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            닫기
          </button>
        </div>

        <div className="mt-5 rounded-[8px] bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-[#1d1d1f]">
            원 결제: {formatPaymentDate(payment.paid_at)} {PAYMENT_METHOD_LABEL[payment.method]} {formatWon(payment.amount)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            기존 환불 {formatWon(getRefundedAmount(payment))} / 환불 가능 {formatWon(remainingAmount)}
          </p>
          {payment.installment_months > 0 ? (
            <p className="mt-1 text-xs text-slate-500">할부 {payment.installment_months}개월</p>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">환불 금액</span>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ''))}
              className={`rounded-[8px] border px-3 py-2.5 text-sm outline-none ${
                amountInvalid ? 'border-red-200 bg-red-50/60' : 'border-slate-200 focus:border-slate-400'
              }`}
            />
            <span className="text-xs text-slate-400">최대 {formatWon(remainingAmount)}까지 부분 환불할 수 있습니다.</span>
          </label>

          <div>
            <p className="text-xs font-semibold text-slate-500">환불 방법</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {REFUND_METHODS.map((refundMethod) => (
                <button
                  key={refundMethod}
                  type="button"
                  onClick={() => setMethod(refundMethod)}
                  className={`rounded-[8px] px-3 py-2 text-xs font-semibold transition ${
                    method === refundMethod
                      ? 'bg-[#1d1d1f] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {REFUND_METHOD_LABEL[refundMethod]}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">사유</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="예: 개인 사정"
              className="rounded-[8px] border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">메모</span>
            <textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              rows={3}
              className="rounded-[8px] border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </label>
        </div>

        {method === 'card_cancel' ? (
          <p className="mt-4 rounded-[8px] bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            카드 환불은 기존 단말기에서 취소 처리 후 저장해 주세요.
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full bg-[#f5f5f7] px-4 py-2 text-sm font-semibold text-[#1d1d1f] transition hover:bg-[#ebebee] disabled:cursor-not-allowed disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ amount: parsedAmount, method, reason, memo })}
            disabled={submitting || amountInvalid}
            className="rounded-full bg-[#1d1d1f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '저장 중...' : '환불 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
