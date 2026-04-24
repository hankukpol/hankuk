'use client'

import { Banknote, Building2, CreditCard, Layers3, ReceiptText } from 'lucide-react'
import {
  PAYMENT_CATEGORIES,
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  type PaymentCategory,
  type PaymentMethod,
} from '@/lib/payments/types'
import { formatWon } from '@/lib/payments/format'

export type PaymentSectionItemDraft = {
  id: string
  label: string
  amount: string
}

export type PaymentSectionValue = {
  amount: string
  method: PaymentMethod
  category: PaymentCategory
  paidAt: string
  memo: string
  cardLast4: string
  installmentMonths: string
  bankName: string
  bankAccountLast4: string
  items: PaymentSectionItemDraft[]
  confirmedCoursePrice: boolean
}

type PaymentSectionProps = {
  value: PaymentSectionValue
  onChange: (value: PaymentSectionValue) => void
  compact?: boolean
}

const METHOD_META: Array<{
  value: PaymentMethod
  label: string
  icon: typeof CreditCard
}> = [
  { value: 'card', label: '카드', icon: CreditCard },
  { value: 'cash', label: '현금', icon: Banknote },
  { value: 'bank_transfer', label: '계좌', icon: Building2 },
  { value: 'mixed', label: '복합', icon: Layers3 },
  { value: 'other', label: '기타', icon: ReceiptText },
]

function createItemId() {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function createEmptyPaymentSectionValue(): PaymentSectionValue {
  return {
    amount: '',
    method: 'card',
    category: 'tuition',
    paidAt: new Date().toISOString().slice(0, 16),
    memo: '',
    cardLast4: '',
    installmentMonths: '0',
    bankName: '',
    bankAccountLast4: '',
    items: [{ id: createItemId(), label: '수강료', amount: '' }],
    confirmedCoursePrice: false,
  }
}

export function normalizePaymentSectionPayload(value: PaymentSectionValue) {
  const amount = Number(value.amount.replace(/,/g, ''))
  const items = value.items
    .map((item) => ({
      label: item.label.trim(),
      amount: Number(item.amount.replace(/,/g, '')),
    }))
    .filter((item) => item.label && Number.isInteger(item.amount) && item.amount > 0)

  return {
    amount,
    method: value.method,
    category: value.category,
    paidAt: value.paidAt ? new Date(value.paidAt).toISOString() : undefined,
    memo: value.memo.trim() || null,
    cardLast4: value.cardLast4.trim() || null,
    installmentMonths: Number(value.installmentMonths || 0),
    bankName: value.bankName.trim() || null,
    bankAccountLast4: value.bankAccountLast4.trim() || null,
    items: items.length > 0 ? items : [{ label: PAYMENT_CATEGORY_LABEL[value.category], amount }],
  }
}

function numberInputValue(value: string) {
  return value.replace(/[^\d]/g, '')
}

function itemTotal(items: PaymentSectionItemDraft[]) {
  return items.reduce((sum, item) => sum + Number(item.amount.replace(/,/g, '') || 0), 0)
}

export function PaymentSection({ value, onChange, compact = false }: PaymentSectionProps) {
  const amount = Number(value.amount.replace(/,/g, '') || 0)
  const total = itemTotal(value.items)
  const totalMatches = amount > 0 && total === amount

  function patch(next: Partial<PaymentSectionValue>) {
    onChange({ ...value, ...next })
  }

  function updateItem(itemId: string, patchItem: Partial<PaymentSectionItemDraft>) {
    patch({
      items: value.items.map((item) => item.id === itemId ? { ...item, ...patchItem } : item),
    })
  }

  function removeItem(itemId: string) {
    if (value.items.length <= 1) {
      return
    }

    patch({ items: value.items.filter((item) => item.id !== itemId) })
  }

  return (
    <section className={compact ? 'rounded-[8px] bg-slate-50 p-4' : 'rounded-[8px] border border-slate-200 bg-slate-50/70 p-4'}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#1d1d1f]">결제 정보</h3>
          <p className="mt-1 text-xs text-slate-500">실제 단말기 결제 후 class-pass에는 수납 기록만 저장합니다.</p>
        </div>
        <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
          totalMatches ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}>
          항목 합계 {formatWon(total)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        {METHOD_META.map((method) => {
          const Icon = method.icon
          const active = value.method === method.value

          return (
            <button
              key={method.value}
              type="button"
              onClick={() => patch({ method: method.value })}
              className={`flex items-center justify-center gap-2 rounded-[8px] px-3 py-2.5 text-sm font-semibold transition ${
                active ? 'bg-[#1d1d1f] text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {method.label}
            </button>
          )
        })}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">총 결제 금액</span>
          <input
            inputMode="numeric"
            value={value.amount}
            onChange={(event) => patch({ amount: numberInputValue(event.target.value) })}
            placeholder="300000"
            className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">분류</span>
          <select
            value={value.category}
            onChange={(event) => patch({ category: event.target.value as PaymentCategory })}
            className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          >
            {PAYMENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>{PAYMENT_CATEGORY_LABEL[category]}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">결제일시</span>
          <input
            type="datetime-local"
            value={value.paidAt}
            onChange={(event) => patch({ paidAt: event.target.value })}
            className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-500">결제 방법</span>
          <select
            value={value.method}
            onChange={(event) => patch({ method: event.target.value as PaymentMethod })}
            className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          >
            {Object.entries(PAYMENT_METHOD_LABEL).map(([method, label]) => (
              <option key={method} value={method}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {value.method === 'card' || value.method === 'mixed' ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">카드 마지막 4자리</span>
            <input
              inputMode="numeric"
              maxLength={4}
              value={value.cardLast4}
              onChange={(event) => patch({ cardLast4: numberInputValue(event.target.value).slice(0, 4) })}
              className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">할부 개월</span>
            <input
              inputMode="numeric"
              value={value.installmentMonths}
              onChange={(event) => patch({ installmentMonths: numberInputValue(event.target.value).slice(0, 2) || '0' })}
              className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </label>
        </div>
      ) : null}

      {value.method === 'bank_transfer' || value.method === 'mixed' ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">은행</span>
            <input
              value={value.bankName}
              onChange={(event) => patch({ bankName: event.target.value })}
              placeholder="예: 국민은행"
              className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500">계좌 마지막 4자리</span>
            <input
              inputMode="numeric"
              maxLength={4}
              value={value.bankAccountLast4}
              onChange={(event) => patch({ bankAccountLast4: numberInputValue(event.target.value).slice(0, 4) })}
              className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </label>
        </div>
      ) : null}

      <div className="mt-4 rounded-[8px] bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-500">결제 항목</p>
          <button
            type="button"
            onClick={() => patch({ items: [...value.items, { id: createItemId(), label: '', amount: '' }] })}
            className="rounded-[8px] bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            + 항목
          </button>
        </div>
        <div className="mt-3 grid gap-2">
          {value.items.map((item, index) => (
            <div key={item.id} className="grid gap-2 sm:grid-cols-[1fr,160px,auto]">
              <input
                value={item.label}
                onChange={(event) => updateItem(item.id, { label: event.target.value })}
                placeholder={index === 0 ? PAYMENT_CATEGORY_LABEL[value.category] : '항목명'}
                className="rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
              <input
                inputMode="numeric"
                value={item.amount}
                onChange={(event) => updateItem(item.id, { amount: numberInputValue(event.target.value) })}
                placeholder="금액"
                className="rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                disabled={value.items.length <= 1}
                className="rounded-[8px] bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </div>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-500">메모</span>
        <textarea
          value={value.memo}
          onChange={(event) => patch({ memo: event.target.value })}
          rows={compact ? 2 : 3}
          className="rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
        />
      </label>

      <label className="mt-3 flex items-start gap-2 rounded-[8px] bg-white px-3 py-2.5 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={value.confirmedCoursePrice}
          onChange={(event) => patch({ confirmedCoursePrice: event.target.checked })}
          className="mt-0.5"
        />
        <span>결제 금액과 항목 합계를 확인했습니다. 강좌 정가가 별도로 있으면 데스크에서 대조 후 저장합니다.</span>
      </label>
    </section>
  )
}
