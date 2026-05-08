'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  PAYMENT_CATEGORIES,
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  REFUND_METHOD_LABEL,
  REFUND_METHODS,
  type EnrollmentPayment,
  type PaymentCategory,
  type PaymentMethod,
  type RefundMethod,
} from '@/lib/payments/types'
import { formatPaymentDate, formatWon } from '@/lib/payments/format'
import { getRefundTotal } from '@/lib/payments/summary'
import { useMotionConfig, useReducedMotionDuration } from '@/lib/motion'

type CorrectionPaymentMethod = Exclude<PaymentMethod, 'mixed' | 'free'>
type TuitionBillingMode = 'keep' | 'match_net'

export type PaymentCorrectionConfirmInput = {
  refund: {
    paymentId: number
    amount: number
    method: RefundMethod
    reasonCategory: 'payment_correction'
    reason: string | null
    cancelReceiptNo: string | null
    refundAccountLast4: string | null
    refundedAt: string | null
    memo: string | null
  }
  payment: {
    amount: number
    method: CorrectionPaymentMethod
    category: PaymentCategory
    paidAt: string | null
    memo: string | null
    cardCompany: string | null
    depositorName: string | null
    cashReceiptApprovalNo: string | null
    items: Array<{ label: string; amount: number }>
  }
  tuitionBillingMode?: TuitionBillingMode
}

type PaymentCorrectionModalProps = {
  open: boolean
  payment: EnrollmentPayment | null
  courseName: string
  currentTuitionNetAmount: number
  billingPayableAmount: number
  submitting?: boolean
  onClose: () => void
  onConfirm: (input: PaymentCorrectionConfirmInput) => void
}

const PAYMENT_METHODS: CorrectionPaymentMethod[] = ['card', 'homepage', 'cash', 'bank_transfer', 'point', 'other']

const CARD_COMPANIES = [
  '신한', '삼성', 'KB', '현대', '롯데', '우리', '하나',
  'NH농협', 'IBK기업', 'BC', '씨티', '카카오페이', '네이버페이', '토스페이', '기타',
]

function normalizeCardCompanyLabel(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed.startsWith('KB') ? 'KB' : trimmed
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

function getDefaultPaymentMethod(payment: EnrollmentPayment | null): CorrectionPaymentMethod {
  if (!payment || payment.method === 'mixed' || payment.method === 'free') {
    return 'card'
  }

  return payment.method
}

function toLocalDateTimeInputValue(date = new Date()) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localTime.toISOString().slice(0, 16)
}

function parseAmount(value: string) {
  return Number(value.replace(/[^\d]/g, '') || 0)
}

function numericInput(value: string) {
  return value.replace(/[^\d]/g, '')
}

function toIso(value: string) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function PaymentCorrectionModal({
  open,
  payment,
  courseName,
  currentTuitionNetAmount,
  billingPayableAmount,
  submitting = false,
  onClose,
  onConfirm,
}: PaymentCorrectionModalProps) {
  const motionConfig = useMotionConfig()
  const backdropDuration = useReducedMotionDuration(0.2)
  const refundableAmount = Math.max((payment?.amount ?? 0) - getRefundTotal(payment ?? { enrollment_refunds: [] }), 0)
  const [refundAmount, setRefundAmount] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('card_cancel')
  const [paymentMethod, setPaymentMethod] = useState<CorrectionPaymentMethod>('card')
  const [category, setCategory] = useState<PaymentCategory>('tuition')
  const [occurredAt, setOccurredAt] = useState(toLocalDateTimeInputValue)
  const [cardCompany, setCardCompany] = useState('')
  const [depositorName, setDepositorName] = useState('')
  const [cancelReceiptNo, setCancelReceiptNo] = useState('')
  const [refundAccountLast4, setRefundAccountLast4] = useState('')
  const [cashReceiptApprovalNo, setCashReceiptApprovalNo] = useState('')
  const [reason, setReason] = useState('결제 정정')
  const [memo, setMemo] = useState('결제 정정')
  const [tuitionBillingMode, setTuitionBillingMode] = useState<TuitionBillingMode>('keep')
  const [billingModeTouched, setBillingModeTouched] = useState(false)

  useEffect(() => {
    if (!open || !payment) {
      return
    }

    const nextRefundableAmount = Math.max(payment.amount - getRefundTotal(payment), 0)
    setRefundAmount(nextRefundableAmount > 0 ? String(nextRefundableAmount) : '')
    setNewAmount(nextRefundableAmount > 0 ? String(nextRefundableAmount) : '')
    setRefundMethod(getDefaultRefundMethod(payment))
    setPaymentMethod(getDefaultPaymentMethod(payment))
    setCardCompany(payment.method === 'card' ? normalizeCardCompanyLabel(payment.card_company) : '')
    setDepositorName(payment.method === 'bank_transfer' ? (payment.depositor_name ?? payment.bank_account_last4 ?? '') : '')
    setCategory(payment.category)
    setOccurredAt(toLocalDateTimeInputValue())
    setCancelReceiptNo('')
    setRefundAccountLast4('')
    setCashReceiptApprovalNo('')
    setReason('결제 정정')
    setMemo('결제 정정')
    setTuitionBillingMode('keep')
    setBillingModeTouched(false)
  }, [open, payment])

  const parsedRefundAmount = parseAmount(refundAmount)
  const parsedNewAmount = parseAmount(newAmount)
  const refundTouchesTuition = payment?.category === 'tuition'
  const paymentTouchesTuition = category === 'tuition'
  const correctedTuitionNetAmount = Math.max(
    currentTuitionNetAmount
      - (refundTouchesTuition ? parsedRefundAmount : 0)
      + (paymentTouchesTuition ? parsedNewAmount : 0),
    0,
  )

  useEffect(() => {
    if (!open || billingModeTouched || category !== 'tuition') {
      return
    }

    setTuitionBillingMode(parsedRefundAmount === parsedNewAmount ? 'keep' : 'match_net')
  }, [billingModeTouched, category, open, parsedNewAmount, parsedRefundAmount])

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

  const invalidRefundAmount = !Number.isInteger(parsedRefundAmount)
    || parsedRefundAmount <= 0
    || parsedRefundAmount > refundableAmount
  const invalidNewAmount = !Number.isInteger(parsedNewAmount) || parsedNewAmount <= 0
  const missingCardCancelReceipt = refundMethod === 'card_cancel' && !cancelReceiptNo.trim()
  const missingRefundAccount = refundMethod === 'bank_transfer' && !/^\d{4}$/.test(refundAccountLast4.trim())
  const missingCardCompany = paymentMethod === 'card' && !cardCompany.trim()
  const missingDepositorName = paymentMethod === 'bank_transfer' && !depositorName.trim()
  const invalidReason = !reason.trim()
  const invalid = (
    !payment
    || invalidRefundAmount
    || invalidNewAmount
    || missingCardCancelReceipt
    || missingRefundAccount
    || missingCardCompany
    || missingDepositorName
    || invalidReason
  )
  const netChangeAmount = parsedNewAmount - parsedRefundAmount

  function submit() {
    if (!payment || invalid) {
      return
    }

    onConfirm({
      refund: {
        paymentId: payment.id,
        amount: parsedRefundAmount,
        method: refundMethod,
        reasonCategory: 'payment_correction',
        reason: reason.trim() || null,
        cancelReceiptNo: refundMethod === 'card_cancel' ? cancelReceiptNo.trim() || null : null,
        refundAccountLast4: refundMethod === 'bank_transfer' ? refundAccountLast4.trim() || null : null,
        refundedAt: toIso(occurredAt),
        memo: memo.trim() || null,
      },
      payment: {
        amount: parsedNewAmount,
        method: paymentMethod,
        category,
        paidAt: toIso(occurredAt),
        memo: memo.trim() || null,
        cardCompany: paymentMethod === 'card' ? cardCompany.trim() || null : null,
        depositorName: paymentMethod === 'bank_transfer' ? depositorName.trim() || null : null,
        cashReceiptApprovalNo: paymentMethod === 'cash' || paymentMethod === 'bank_transfer'
          ? cashReceiptApprovalNo.trim() || null
          : null,
        items: [{ label: PAYMENT_CATEGORY_LABEL[category], amount: parsedNewAmount }],
      },
      tuitionBillingMode: category === 'tuition' ? tuitionBillingMode : undefined,
    })
  }

  return (
    <AnimatePresence>
      {open && payment ? (
        <motion.div
          role="presentation"
          className="fixed inset-0 z-[145] flex items-center justify-center bg-black/40 px-5 sm:backdrop-blur-sm"
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Correction</p>
                <h3 className="mt-1 text-[21px] font-semibold tracking-[-0.231px] text-[#1d1d1f]">결제 정정</h3>
                <p className="mt-2 text-sm text-slate-700">{payment.enrollments?.name ?? '수강생'} / {courseName}</p>
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
                기준 수납: {formatPaymentDate(payment.paid_at)} {PAYMENT_METHOD_LABEL[payment.method]} {PAYMENT_CATEGORY_LABEL[payment.category]} {formatWon(payment.amount)}
              </p>
              <p className="mt-1 text-xs text-slate-500">환불 가능 금액 {formatWon(refundableAmount)} 중 일부 또는 전액을 환불하고, 새 수납을 같은 정정일로 저장합니다.</p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <section className="rounded-[10px] bg-slate-50 p-4">
                <h4 className="text-sm font-semibold text-[#1d1d1f]">환불</h4>
                <div className="mt-3 grid gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-500">환불 금액</span>
                    <input
                      inputMode="numeric"
                      value={refundAmount}
                      onChange={(event) => setRefundAmount(numericInput(event.target.value))}
                      className={`rounded-[8px] bg-white px-3 py-2.5 text-sm outline-none ${invalidRefundAmount ? 'shadow-[inset_0_0_0_1px_rgba(180,35,24,0.4)]' : 'border border-slate-200 focus:border-slate-400'}`}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-500">환불 방법</span>
                    <select
                      value={refundMethod}
                      onChange={(event) => setRefundMethod(event.target.value as RefundMethod)}
                      className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    >
                      {REFUND_METHODS.map((method) => (
                        <option key={method} value={method}>{REFUND_METHOD_LABEL[method]}</option>
                      ))}
                    </select>
                  </label>
                  {refundMethod === 'card_cancel' ? (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-500">카드 취소 승인번호</span>
                      <input
                        value={cancelReceiptNo}
                        onChange={(event) => setCancelReceiptNo(event.target.value)}
                        className={`rounded-[8px] bg-white px-3 py-2.5 text-sm outline-none ${missingCardCancelReceipt ? 'shadow-[inset_0_0_0_1px_rgba(180,35,24,0.4)]' : 'border border-slate-200 focus:border-slate-400'}`}
                      />
                    </label>
                  ) : null}
                  {refundMethod === 'bank_transfer' ? (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-500">환불 계좌 마지막 4자리</span>
                      <input
                        value={refundAccountLast4}
                        maxLength={4}
                        onChange={(event) => setRefundAccountLast4(event.target.value.replace(/[^\d]/g, '').slice(0, 4))}
                        className={`rounded-[8px] bg-white px-3 py-2.5 text-sm outline-none ${missingRefundAccount ? 'shadow-[inset_0_0_0_1px_rgba(180,35,24,0.4)]' : 'border border-slate-200 focus:border-slate-400'}`}
                      />
                    </label>
                  ) : null}
                </div>
              </section>

              <section className="rounded-[10px] bg-slate-50 p-4">
                <h4 className="text-sm font-semibold text-[#1d1d1f]">재수납</h4>
                <div className="mt-3 grid gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-500">수납 금액</span>
                    <input
                      inputMode="numeric"
                      value={newAmount}
                      onChange={(event) => setNewAmount(numericInput(event.target.value))}
                      className={`rounded-[8px] bg-white px-3 py-2.5 text-sm outline-none ${invalidNewAmount ? 'shadow-[inset_0_0_0_1px_rgba(180,35,24,0.4)]' : 'border border-slate-200 focus:border-slate-400'}`}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-500">결제 수단</span>
                    <select
                      value={paymentMethod}
                      onChange={(event) => {
                        const next = event.target.value as CorrectionPaymentMethod
                        setPaymentMethod(next)
                        if (next !== 'card') setCardCompany('')
                        if (next !== 'bank_transfer') setDepositorName('')
                      }}
                      className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>{PAYMENT_METHOD_LABEL[method]}</option>
                      ))}
                    </select>
                  </label>
                  {paymentMethod === 'card' ? (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-500">카드사 <span className="text-rose-500">*</span></span>
                      <div className="relative">
                        <select
                          value={cardCompany}
                          onChange={(event) => setCardCompany(event.target.value)}
                          className={`w-full appearance-none rounded-[8px] border bg-white py-2.5 pl-3 pr-9 text-sm outline-none focus:border-slate-400 ${
                            !cardCompany ? 'border-rose-300 text-slate-400' : 'border-slate-200 text-[#1d1d1f]'
                          }`}
                        >
                          <option value="">카드사 선택</option>
                          {CARD_COMPANIES.map((company) => (
                            <option key={company} value={company}>{company}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">▾</span>
                      </div>
                    </label>
                  ) : null}
                  {paymentMethod === 'bank_transfer' ? (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-500">입금자명 <span className="text-rose-500">*</span></span>
                      <input
                        maxLength={80}
                        value={depositorName}
                        onChange={(event) => setDepositorName(event.target.value)}
                        placeholder="예: 홍길동"
                        className={`rounded-[8px] border bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400 ${
                          depositorName.trim() ? 'border-slate-200' : 'border-rose-300'
                        }`}
                      />
                    </label>
                  ) : null}
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-500">분류</span>
                    <select
                      value={category}
                      onChange={(event) => setCategory(event.target.value as PaymentCategory)}
                      className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    >
                      {PAYMENT_CATEGORIES.map((entry) => (
                        <option key={entry} value={entry}>{PAYMENT_CATEGORY_LABEL[entry]}</option>
                      ))}
                    </select>
                  </label>
                  {(paymentMethod === 'cash' || paymentMethod === 'bank_transfer') ? (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-500">현금영수증 승인번호</span>
                      <input
                        value={cashReceiptApprovalNo}
                        onChange={(event) => setCashReceiptApprovalNo(event.target.value)}
                        className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                      />
                    </label>
                  ) : null}
                </div>
              </section>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-500">정정일시</span>
                <input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                  className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-500">정정 사유</span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={200}
                  className={`rounded-[8px] bg-white px-3 py-2.5 text-sm outline-none ${invalidReason ? 'shadow-[inset_0_0_0_1px_rgba(180,35,24,0.4)]' : 'border border-slate-200 focus:border-slate-400'}`}
                />
              </label>
            </div>

            {category === 'tuition' ? (
              <div className="mt-4 rounded-[10px] bg-slate-50 p-4">
                <p className="text-sm font-semibold text-[#1d1d1f]">수강료 청구액 처리</p>
                <div className="mt-3 grid gap-2">
                  <label className="flex items-start gap-3 rounded-[8px] bg-white px-3 py-3">
                    <input
                      type="radio"
                      checked={tuitionBillingMode === 'keep'}
                      onChange={() => {
                        setBillingModeTouched(true)
                        setTuitionBillingMode('keep')
                      }}
                      className="mt-1 h-4 w-4 accent-[#0071e3]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-700">기존 적용 금액 유지</span>
                      <span className="mt-0.5 block text-xs text-slate-500">현재 청구 {formatWon(billingPayableAmount)} 기준으로 미납 상태를 계산합니다.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-[8px] bg-white px-3 py-3">
                    <input
                      type="radio"
                      checked={tuitionBillingMode === 'match_net'}
                      onChange={() => {
                        setBillingModeTouched(true)
                        setTuitionBillingMode('match_net')
                      }}
                      className="mt-1 h-4 w-4 accent-[#0071e3]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-700">정정 후 실수납액으로 조정</span>
                      <span className="mt-0.5 block text-xs text-slate-500">수강료 적용 금액을 {formatWon(correctedTuitionNetAmount)}로 맞춥니다.</span>
                    </span>
                  </label>
                </div>
              </div>
            ) : null}

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500">메모</span>
              <textarea
                rows={2}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                maxLength={500}
                className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              />
            </label>

            <div className="mt-5 rounded-[10px] bg-white px-4 py-3 text-sm shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)]">
              <div className="grid gap-2 sm:grid-cols-3">
                <p><span className="text-slate-500">환불</span> <span className="font-semibold text-rose-600">-{formatWon(parsedRefundAmount)}</span></p>
                <p><span className="text-slate-500">재수납</span> <span className="font-semibold text-[#1d1d1f]">+{formatWon(parsedNewAmount)}</span></p>
                <p><span className="text-slate-500">순변동</span> <span className={netChangeAmount < 0 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>{formatWon(netChangeAmount)}</span></p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-[8px] bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || invalid}
                className="rounded-[8px] bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-all duration-200 ease-ios hover:bg-blue-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
              >
                {submitting ? '저장 중...' : '정정 저장'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
