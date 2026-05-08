'use client'

import { Banknote, Building2, Coins, CreditCard, Globe2, Plus, ReceiptText, Trash2 } from 'lucide-react'
import {
  PAYMENT_CATEGORIES,
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  type PaymentCategory,
  type PaymentMethod,
} from '@/lib/payments/types'
import { formatWon } from '@/lib/payments/format'
import { getTuitionExemptBillingRuleError } from '@/lib/payments/billing-rules'

type PaymentEntryMethod = Exclude<PaymentMethod, 'mixed' | 'free'>

export type PaymentEntryDraft = {
  id: string
  method: PaymentEntryMethod
  amount: string
  memo: string
  cardCompany: string
  depositorName: string
  cashReceiptApprovalNo: string
}

export type NormalizedPaymentDraft = {
  amount: number
  method: PaymentMethod
  category: PaymentCategory
  paidAt?: string
  memo: string | null
  cardCompany?: string | null
  depositorName?: string | null
  cashReceiptApprovalNo?: string | null
  items: Array<{ label: string; amount: number }>
}

export type NormalizedPaymentSectionPayload = {
  expectedAmount: number
  discountAmount: number
  payableAmount: number
  paidAmount: number
  remainingAmount: number
  paymentTotal: number
  tuitionExempt: boolean
  payments: NormalizedPaymentDraft[]
}

export type PaymentSectionValue = {
  expectedAmount: string
  discountAmount: string
  discountReason: string
  paidAmount: string
  category: PaymentCategory
  paidAt: string
  memo: string
  tuitionExempt: boolean
  tuitionExemptReason: string
  entries: PaymentEntryDraft[]
}

type PaymentSectionProps = {
  value: PaymentSectionValue
  onChange: (value: PaymentSectionValue) => void
  compact?: boolean
  showCategory?: boolean
  lockedBilling?: boolean
  singlePaymentOnly?: boolean
  hideBillingControls?: boolean
  hidePaymentMeta?: boolean
  hideSummaryHeader?: boolean
}

const PAYMENT_METHOD_META: Array<{
  value: PaymentEntryMethod
  label: string
  icon: typeof CreditCard
}> = [
  { value: 'card', label: '카드', icon: CreditCard },
  { value: 'homepage', label: '홈페이지 결제', icon: Globe2 },
  { value: 'cash', label: '현금', icon: Banknote },
  { value: 'bank_transfer', label: '계좌', icon: Building2 },
  { value: 'point', label: '포인트', icon: Coins },
  { value: 'other', label: '기타', icon: ReceiptText },
]

function createEntryId() {
  return `payment_entry_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function toLocalDateTimeInputValue(date = new Date()) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localTime.toISOString().slice(0, 16)
}

const CARD_COMPANIES = [
  '신한', '삼성', 'KB', '현대', '롯데', '우리', '하나',
  'NH농협', 'IBK기업', 'BC', '씨티', '카카오페이', '네이버페이', '토스페이', '기타',
]

function createEmptyEntry(options?: Partial<Omit<PaymentEntryDraft, 'id'>>): PaymentEntryDraft {
  return {
    id: createEntryId(),
    method: options?.method ?? 'card',
    amount: options?.amount ?? '',
    memo: options?.memo ?? '',
    cardCompany: options?.cardCompany ?? '',
    depositorName: options?.depositorName ?? '',
    cashReceiptApprovalNo: options?.cashReceiptApprovalNo ?? '',
  }
}

export function createEmptyPaymentSectionValue(): PaymentSectionValue {
  return {
    expectedAmount: '',
    discountAmount: '',
    discountReason: '',
    paidAmount: '',
    category: 'tuition',
    paidAt: toLocalDateTimeInputValue(),
    memo: '',
    tuitionExempt: false,
    tuitionExemptReason: '',
    entries: [createEmptyEntry()],
  }
}

export function createPaymentSectionValueForAmount(amount: number): PaymentSectionValue {
  const next = createEmptyPaymentSectionValue()
  const normalizedAmount = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0
  const amountText = String(normalizedAmount)

  return {
    ...next,
    expectedAmount: amountText,
    entries: [createEmptyEntry({ amount: normalizedAmount > 0 ? amountText : '' })],
  }
}

export function createPaymentSectionValueForBilling(options: {
  expectedAmount: number
  discountAmount?: number | null
  discountReason?: string | null
  paidAmount?: number | null
  tuitionExempt?: boolean | null
  tuitionExemptReason?: string | null
}): PaymentSectionValue {
  const next = createEmptyPaymentSectionValue()
  const expectedAmount = Math.max(0, Math.floor(Number(options.expectedAmount) || 0))
  const discountAmount = Math.max(0, Math.floor(Number(options.discountAmount ?? 0) || 0))
  const paidAmount = Math.max(0, Math.floor(Number(options.paidAmount ?? 0) || 0))
  const payableAmount = options.tuitionExempt ? 0 : Math.max(expectedAmount - discountAmount, 0)
  const remainingAmount = Math.max(payableAmount - paidAmount, 0)

  return {
    ...next,
    expectedAmount: String(expectedAmount),
    discountAmount: discountAmount > 0 ? String(discountAmount) : '',
    discountReason: options.discountReason ?? '',
    paidAmount: paidAmount > 0 ? String(paidAmount) : '',
    tuitionExempt: Boolean(options.tuitionExempt),
    tuitionExemptReason: options.tuitionExemptReason ?? '',
    entries: [createEmptyEntry({ amount: remainingAmount > 0 ? String(remainingAmount) : '' })],
  }
}

function numberInputValue(value: string) {
  return value.replace(/[^\d]/g, '')
}

function toNumber(value: string) {
  return Number(value.replace(/,/g, '') || 0)
}

function paymentTotal(entries: PaymentEntryDraft[]) {
  return entries.reduce((sum, entry) => sum + toNumber(entry.amount), 0)
}

function usesCashReceipt(method: PaymentEntryMethod) {
  return method === 'cash' || method === 'bank_transfer'
}

function needsCashReceiptNotice(method: PaymentEntryMethod, amount: number) {
  return usesCashReceipt(method) && amount >= 100000
}

export function normalizePaymentSectionPayload(value: PaymentSectionValue): NormalizedPaymentSectionPayload {
  const expectedAmount = toNumber(value.expectedAmount)
  const discountAmount = toNumber(value.discountAmount)
  const paidAmount = toNumber(value.paidAmount)
  const payableAmount = Math.max(expectedAmount - discountAmount, 0)
  const remainingAmount = Math.max(payableAmount - paidAmount, 0)
  const paidAt = value.paidAt ? new Date(value.paidAt).toISOString() : undefined

  if (value.tuitionExempt) {
    const reason = value.tuitionExemptReason.trim()
    const memo = [
      value.memo.trim(),
      reason ? `무료 수강: ${reason}` : '무료 수강',
    ].filter(Boolean).join('\n')

    return {
      expectedAmount,
      discountAmount,
      payableAmount: 0,
      paidAmount,
      remainingAmount: 0,
      paymentTotal: 0,
      tuitionExempt: true,
      payments: [{
        amount: 0,
        method: 'free' as PaymentMethod,
        category: value.category,
        paidAt,
        memo: memo || null,
        items: [{ label: PAYMENT_CATEGORY_LABEL[value.category], amount: 0 }],
      }],
    }
  }

  const payments = value.entries
    .map((entry) => {
      const amount = toNumber(entry.amount)
      const memo = [value.memo.trim(), entry.memo.trim()].filter(Boolean).join('\n')

      return {
        amount,
        method: entry.method,
        category: value.category,
        paidAt,
        memo: memo || null,
        cardCompany: entry.method === 'card' ? entry.cardCompany?.trim() || null : null,
        depositorName: entry.method === 'bank_transfer' ? entry.depositorName.trim() || null : null,
        cashReceiptApprovalNo: usesCashReceipt(entry.method) ? entry.cashReceiptApprovalNo.trim() || null : null,
        items: [{ label: PAYMENT_CATEGORY_LABEL[value.category], amount }],
      } satisfies NormalizedPaymentDraft
    })
    .filter((payment) => payment.amount > 0)

  return {
    expectedAmount,
    discountAmount,
    payableAmount,
    paidAmount,
    remainingAmount,
    paymentTotal: payments.reduce((sum, payment) => sum + payment.amount, 0),
    tuitionExempt: false,
    payments,
  }
}

export function PaymentSection({
  value,
  onChange,
  compact = false,
  showCategory = false,
  lockedBilling = false,
  singlePaymentOnly = false,
  hideBillingControls = false,
  hidePaymentMeta = false,
  hideSummaryHeader = false,
}: PaymentSectionProps) {
  const expectedAmount = toNumber(value.expectedAmount)
  const discountAmount = toNumber(value.discountAmount)
  const paidAmount = toNumber(value.paidAmount)
  const payableAmount = Math.max(expectedAmount - discountAmount, 0)
  const total = paymentTotal(value.entries)
  const dueAmount = Math.max(payableAmount - paidAmount, 0)
  const remainingAmount = Math.max(dueAmount - total, 0)
  const discountExceeded = discountAmount > expectedAmount && discountAmount > 0
  const tuitionExemptRuleError = getTuitionExemptBillingRuleError({
    tuitionExempt: value.tuitionExempt,
    discountAmount,
    tuitionExemptReason: value.tuitionExemptReason,
  })
  const totalOverPayable = !value.tuitionExempt && dueAmount >= 0 && total > dueAmount
  const noChargeTuition = !value.tuitionExempt && expectedAmount === 0 && discountAmount === 0 && payableAmount === 0
  const totalAccepted = !tuitionExemptRuleError && (value.tuitionExempt || noChargeTuition || (dueAmount > 0 && total === dueAmount))
  const flatSingleEntry = singlePaymentOnly && hideBillingControls
  const totalBadgeText = value.tuitionExempt
    ? '무료 수강'
    : noChargeTuition
      ? '납부 금액 0원'
    : total > 0 && total < dueAmount
      ? `수납 부족 ${formatWon(remainingAmount)}`
      : `수납 합계 ${formatWon(total)}`
  const controlPaddingClass = compact ? 'px-3 py-2' : 'px-3 py-2.5'
  const selectPaddingClass = compact ? 'py-2 pl-3 pr-9' : 'py-2.5 pl-3 pr-9'

  function patch(next: Partial<PaymentSectionValue>) {
    onChange({ ...value, ...next })
  }

  function fillSingleEntryAmount(nextValue: PaymentSectionValue, nextPayableAmount: number) {
    if (nextValue.tuitionExempt || nextValue.entries.length !== 1) {
      return nextValue.entries
    }

    return nextValue.entries.map((entry) => ({ ...entry, amount: nextPayableAmount > 0 ? String(nextPayableAmount) : '' }))
  }

  function patchWithAutoAmount(next: Partial<PaymentSectionValue>) {
    if (lockedBilling) {
      return
    }

    const nextValue = { ...value, ...next }
    const nextExpectedAmount = toNumber(nextValue.expectedAmount)
    const nextDiscountAmount = toNumber(nextValue.discountAmount)
    const nextPaidAmount = toNumber(nextValue.paidAmount)
    const nextPayableAmount = Math.max(nextExpectedAmount - nextDiscountAmount, 0)
    const nextDueAmount = Math.max(nextPayableAmount - nextPaidAmount, 0)
    onChange({ ...nextValue, entries: fillSingleEntryAmount(nextValue, nextDueAmount) })
  }

  function handleTuitionExemptChange(checked: boolean) {
    if (lockedBilling) {
      return
    }

    if (checked) {
      patch({
        tuitionExempt: true,
        discountAmount: '',
        discountReason: '',
        entries: value.entries.map((entry) => ({ ...entry, amount: '' })),
      })
      return
    }

    const nextValue = { ...value, tuitionExempt: false, tuitionExemptReason: '' }
    const nextExpectedAmount = toNumber(nextValue.expectedAmount)
    const nextDiscountAmount = toNumber(nextValue.discountAmount)
    const nextPaidAmount = toNumber(nextValue.paidAmount)
    const nextPayableAmount = Math.max(nextExpectedAmount - nextDiscountAmount, 0)
    const nextDueAmount = Math.max(nextPayableAmount - nextPaidAmount, 0)
    onChange({ ...nextValue, entries: fillSingleEntryAmount(nextValue, nextDueAmount) })
  }

  function updateEntry(entryId: string, patchEntry: Partial<PaymentEntryDraft>) {
    patch({
      entries: value.entries.map((entry) => entry.id === entryId ? { ...entry, ...patchEntry } : entry),
    })
  }

  function updateEntryAmount(entryId: string, nextAmountText: string) {
    const entries = value.entries.map((entry) => (
      entry.id === entryId ? { ...entry, amount: nextAmountText } : entry
    ))
    let overage = paymentTotal(entries) - dueAmount

    if (overage <= 0) {
      patch({ entries })
      return
    }

    const editedIndex = entries.findIndex((entry) => entry.id === entryId)
    for (let index = 0; index < entries.length && overage > 0; index += 1) {
      if (index === editedIndex) {
        continue
      }

      const amount = toNumber(entries[index].amount)
      const reduction = Math.min(amount, overage)
      const nextAmount = amount - reduction
      entries[index] = {
        ...entries[index],
        amount: nextAmount > 0 ? String(nextAmount) : '',
      }
      overage -= reduction
    }

    if (overage > 0 && editedIndex >= 0) {
      const editedAmount = toNumber(entries[editedIndex].amount)
      const nextEditedAmount = Math.max(editedAmount - overage, 0)
      entries[editedIndex] = {
        ...entries[editedIndex],
        amount: nextEditedAmount > 0 ? String(nextEditedAmount) : '',
      }
    }

    patch({ entries })
  }

  function updateEntryMethod(entryId: string, method: PaymentEntryMethod) {
    const otherTotal = value.entries
      .filter((entry) => entry.id !== entryId)
      .reduce((sum, entry) => sum + toNumber(entry.amount), 0)
    const remaining = Math.max(dueAmount - otherTotal, 0)

    patch({
      entries: value.entries.map((entry) => {
        if (entry.id !== entryId) {
          return entry
        }

        return {
          ...entry,
          method,
          amount: entry.amount.trim() ? entry.amount : remaining > 0 ? String(remaining) : '',
          cardCompany: method === 'card' ? entry.cardCompany : '',
          depositorName: method === 'bank_transfer' ? entry.depositorName : '',
          cashReceiptApprovalNo: usesCashReceipt(method) ? entry.cashReceiptApprovalNo : '',
        }
      }),
    })
  }

  function removeEntry(entryId: string) {
    if (value.entries.length <= 1) {
      return
    }

    patch({ entries: value.entries.filter((entry) => entry.id !== entryId) })
  }

  function addEntry() {
    if (singlePaymentOnly) {
      return
    }

    const currentTotal = paymentTotal(value.entries)
    const remaining = Math.max(dueAmount - currentTotal, 0)

    patch({
      entries: [
        ...value.entries,
        createEmptyEntry({
          method: value.entries[0]?.method === 'card' ? 'cash' : 'card',
          amount: remaining > 0 ? String(remaining) : '',
        }),
      ],
    })
  }

  return (
    <section className={compact ? (flatSingleEntry ? 'rounded-[10px] bg-slate-50 p-2' : 'rounded-[10px] bg-slate-50 p-2.5') : ''}>
      {!hideSummaryHeader ? (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className={`${compact ? 'text-sm' : 'text-base'} font-semibold text-[#1d1d1f]`}>수납 정보</h3>
          <p className={`${compact ? 'hidden' : 'mt-0.5'} text-xs leading-5 text-slate-500`}>
            정가에서 할인과 기존 수납액을 빼고 남은 금액을 입력합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {compact ? (
            <label className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={value.tuitionExempt}
                onChange={(event) => handleTuitionExemptChange(event.target.checked)}
                disabled={lockedBilling}
                className="h-3.5 w-3.5 accent-[#0071e3] disabled:cursor-not-allowed"
              />
              무료/면제
            </label>
          ) : null}
          <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
            totalOverPayable
              ? 'bg-rose-50 text-rose-700'
              : totalAccepted
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-50 text-blue-600'
          }`}>
            {totalBadgeText}
          </span>
        </div>
      </div>
      ) : null}

      {!compact ? (
        <label className="mt-4 flex items-start gap-3 rounded-[8px] bg-slate-50 px-4 py-3">
          <input
            type="checkbox"
            checked={value.tuitionExempt}
            onChange={(event) => handleTuitionExemptChange(event.target.checked)}
            disabled={lockedBilling}
            className="mt-1 h-4 w-4 accent-[#0071e3] disabled:cursor-not-allowed"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[#1d1d1f]">무료 수강 / 수납 면제</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              장학생, 무료 체험, 운영 지원처럼 결제를 받지 않는 수강생이면 체크합니다.
            </span>
          </span>
        </label>
      ) : null}

      {!hideBillingControls ? (
      <div className={`${compact ? 'mt-3 gap-2' : 'mt-4 gap-3'} grid md:grid-cols-4`}>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">강좌 정가</span>
          <input
            inputMode="numeric"
            value={value.expectedAmount}
            onChange={(event) => patchWithAutoAmount({ expectedAmount: numberInputValue(event.target.value) })}
            disabled={lockedBilling}
            placeholder="0"
            className={`rounded-[8px] border bg-white border border-slate-200 ${controlPaddingClass} text-sm outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">할인 금액</span>
          <input
            inputMode="numeric"
            value={value.discountAmount}
            onChange={(event) => patchWithAutoAmount({ discountAmount: numberInputValue(event.target.value) })}
            disabled={lockedBilling || value.tuitionExempt}
            placeholder="0"
            className={`rounded-[8px] border bg-white ${controlPaddingClass} text-sm outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${
              discountExceeded ? 'shadow-[inset_0_0_0_1.5px_#b42318]' : 'border border-slate-200'
            }`}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">할인 사유</span>
          <input
            value={value.discountReason}
            onChange={(event) => patch({ discountReason: event.target.value })}
            disabled={lockedBilling || value.tuitionExempt}
            placeholder="형제 할인, 이벤트 등"
            className={`rounded-[8px] border bg-white border border-slate-200 ${controlPaddingClass} text-sm outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">적용 금액</span>
          <div className={`rounded-[8px] ${controlPaddingClass} text-sm font-bold ${
            discountExceeded ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-[#1d1d1f]'
          }`}>
            {formatWon(payableAmount)}
          </div>
        </div>
      </div>
      ) : null}

      {!hideBillingControls && paidAmount > 0 ? (
        <div className="mt-3 rounded-[8px] bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)]">
          기존 수납 {formatWon(paidAmount)} · 이번 수납 필요 {formatWon(dueAmount)}
        </div>
      ) : null}

      {!hideBillingControls && discountExceeded ? (
        <p className="mt-2 text-xs font-medium text-rose-600">할인 금액은 강좌 정가보다 클 수 없습니다.</p>
      ) : null}

      {!hidePaymentMeta ? (
      <div className={`${compact ? 'mt-2 grid gap-2' : 'mt-3 grid gap-3'} ${showCategory || compact ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
        {showCategory ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">분류</span>
            <select
              value={value.category}
              onChange={(event) => patch({ category: event.target.value as PaymentCategory })}
              className={`rounded-[8px] border bg-white border border-slate-200 ${controlPaddingClass} text-sm outline-none focus:border-slate-400`}
            >
              {PAYMENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>{PAYMENT_CATEGORY_LABEL[category]}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">수납일시</span>
          <input
            type="datetime-local"
            value={value.paidAt}
            onChange={(event) => patch({ paidAt: event.target.value })}
            className={`rounded-[8px] border bg-white border border-slate-200 ${controlPaddingClass} text-sm outline-none focus:border-slate-400`}
          />
        </label>

        {compact ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">공통 메모</span>
            <input
              value={value.memo}
              onChange={(event) => patch({ memo: event.target.value })}
              className={`rounded-[8px] border bg-white border border-slate-200 ${controlPaddingClass} text-sm outline-none focus:border-slate-400`}
            />
          </label>
        ) : null}
      </div>
      ) : null}

      {value.tuitionExempt ? (
        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">면제 사유</span>
          <textarea
            value={value.tuitionExemptReason}
            onChange={(event) => patch({ tuitionExemptReason: event.target.value })}
            rows={compact ? 2 : 3}
            placeholder="예: 장학생, 무료 체험, 운영 지원"
            className={`rounded-[8px] border bg-white border border-slate-200 ${controlPaddingClass} text-sm outline-none focus:border-slate-400`}
          />
          {tuitionExemptRuleError ? (
            <span className="text-xs font-medium text-rose-600">{tuitionExemptRuleError}</span>
          ) : null}
        </label>
      ) : (
        <div className={flatSingleEntry ? 'mt-0' : compact ? 'mt-3' : 'mt-5'}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#1d1d1f]">결제 수단</p>
              <p className={`${compact ? 'hidden' : 'mt-0.5'} text-xs text-slate-500`}>분할 결제 시 [+ 수단 추가]로 카드와 현금 등을 함께 입력하세요.</p>
            </div>
            <button
              type="button"
              onClick={addEntry}
              disabled={singlePaymentOnly}
              className={`${singlePaymentOnly ? 'hidden' : 'inline-flex'} items-center gap-1 rounded-[8px] border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100`}
            >
              <Plus className="h-3.5 w-3.5" />
              수단 추가
            </button>
          </div>

          <div className={`${flatSingleEntry ? 'mt-1.5' : compact ? 'mt-2' : 'mt-3'} grid gap-2`}>
            {value.entries.map((entry, index) => {
              const entryAmount = toNumber(entry.amount)
              const cashReceiptNotice = needsCashReceiptNotice(entry.method, entryAmount)

              return (
              <article key={entry.id} className={`rounded-[8px] ${flatSingleEntry ? 'bg-transparent p-0' : compact ? 'bg-slate-50 p-3' : 'bg-slate-50 p-4'}`}>
                {!flatSingleEntry ? (
                <div className={`${compact ? 'mb-2' : 'mb-3'} flex items-center justify-between gap-2`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">결제 {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    disabled={value.entries.length <= 1}
                    className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-medium text-rose-600 transition-all duration-200 ease-ios hover:bg-rose-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </button>
                </div>
                ) : null}

                <div className={`grid ${compact ? 'gap-2' : 'gap-3'}`}>
                  <div className={`grid ${compact ? 'gap-2 sm:grid-cols-4' : 'gap-3 sm:grid-cols-2'}`}>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-500">결제 수단</span>
                      <div className="relative">
                        <select
                          value={entry.method}
                          onChange={(event) => updateEntryMethod(entry.id, event.target.value as PaymentEntryMethod)}
                          className={`w-full appearance-none rounded-[8px] border border-slate-200 bg-white ${selectPaddingClass} text-sm font-medium text-[#1d1d1f] outline-none focus:border-slate-400`}
                        >
                          {PAYMENT_METHOD_META.map((method) => (
                            <option key={method.value} value={method.value}>
                              {method.label}
                            </option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">▾</span>
                      </div>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-500">수납 금액</span>
                      <input
                        inputMode="numeric"
                        value={entry.amount}
                        onChange={(event) => updateEntryAmount(entry.id, numberInputValue(event.target.value))}
                        placeholder={`전액 ${formatWon(Math.max(payableAmount - paidAmount, 0))}`}
                        className={`rounded-[8px] border border-slate-200 bg-white ${controlPaddingClass} text-sm outline-none focus:border-slate-400`}
                      />
                    </label>

                    {entry.method === 'card' ? (
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-slate-500">카드사 <span className="text-rose-500">*</span></span>
                        <div className="relative">
                          <select
                            value={entry.cardCompany}
                            onChange={(event) => updateEntry(entry.id, { cardCompany: event.target.value })}
                            className={`w-full appearance-none rounded-[8px] border bg-white ${selectPaddingClass} text-sm outline-none focus:border-slate-400 ${
                              !entry.cardCompany ? 'border-rose-300 text-slate-400' : 'border-slate-200 text-[#1d1d1f]'
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

                    {entry.method === 'bank_transfer' ? (
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-slate-500">입금자명 <span className="text-rose-500">*</span></span>
                        <input
                          maxLength={80}
                          value={entry.depositorName}
                          onChange={(event) => updateEntry(entry.id, { depositorName: event.target.value })}
                          placeholder="예: 홍길동"
                          className={`rounded-[8px] border bg-white ${controlPaddingClass} text-sm outline-none focus:border-slate-400 ${
                            entry.depositorName.trim() ? 'border-slate-200' : 'border-rose-300'
                          }`}
                        />
                      </label>
                    ) : null}

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-500">결제 메모</span>
                      <input
                        value={entry.memo}
                        onChange={(event) => updateEntry(entry.id, { memo: event.target.value })}
                        placeholder={`예: ${PAYMENT_METHOD_LABEL[entry.method]} 메모`}
                        className={`rounded-[8px] border border-slate-200 bg-white ${controlPaddingClass} text-sm outline-none focus:border-slate-400`}
                      />
                    </label>
                  </div>

                  {usesCashReceipt(entry.method) ? (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-500">현금영수증 승인번호</span>
                      <input
                        value={entry.cashReceiptApprovalNo}
                        onChange={(event) => updateEntry(entry.id, { cashReceiptApprovalNo: event.target.value })}
                        placeholder="현금영수증 발행 시 승인번호 입력"
                        className={`rounded-[8px] border bg-white ${controlPaddingClass} text-sm outline-none focus:border-slate-400 ${
                          cashReceiptNotice && !entry.cashReceiptApprovalNo.trim()
                            ? 'border-amber-300'
                            : 'border-slate-200'
                        }`}
                      />
                      {cashReceiptNotice ? (
                        <span className="text-xs font-medium text-amber-600">
                          10만 원 이상 현금·계좌 수납은 현금영수증 발급 상태 또는 승인번호를 확인해 주세요.
                        </span>
                      ) : null}
                    </label>
                  ) : null}
                </div>
              </article>
            )})}
          </div>

          {!compact ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[8px] bg-slate-50 px-4 py-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500">
                <span>정가 <span className="font-semibold text-[#1d1d1f]">{formatWon(expectedAmount)}</span></span>
                <span className="text-slate-300">·</span>
                <span>할인 <span className="font-semibold text-rose-600">{formatWon(discountAmount)}</span></span>
                <span className="text-slate-300">·</span>
                <span>이번 수납 필요 <span className="font-semibold text-[#1d1d1f]">{formatWon(dueAmount)}</span></span>
                {!value.tuitionExempt && remainingAmount > 0 ? (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>미납 <span className="font-semibold text-amber-600">{formatWon(remainingAmount)}</span></span>
                  </>
                ) : null}
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                totalOverPayable
                  ? 'bg-rose-50 text-rose-700'
                  : totalAccepted
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-50 text-blue-600'
              }`}>
                합계 {formatWon(total)}
              </span>
            </div>
          ) : null}
        </div>
      )}

      {!compact ? (
        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">공통 메모</span>
          <textarea
            value={value.memo}
            onChange={(event) => patch({ memo: event.target.value })}
            rows={3}
            className={`rounded-[8px] border bg-white border border-slate-200 ${controlPaddingClass} text-sm outline-none focus:border-slate-400`}
          />
        </label>
      ) : null}
    </section>
  )
}
