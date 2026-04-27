'use client'

import { ArrowDown, ArrowUp, Plus, ToggleLeft, ToggleRight } from 'lucide-react'
import type { BranchSeriesGroup, BranchSeriesOption } from '@/types/database'

type BranchSeriesOptionsEditorProps = {
  value: BranchSeriesOption[]
  onChange: (value: BranchSeriesOption[]) => void
}

const GROUP_META: Record<BranchSeriesGroup, { title: string; description: string; addLabel: string }> = {
  public: {
    title: '공채',
    description: '대부분의 수강생에게 자동 적용되는 기본 직렬입니다.',
    addLabel: '공채 옵션 추가',
  },
  career: {
    title: '경채',
    description: '경채 수강생에게 선택할 세부 직렬을 관리합니다.',
    addLabel: '경채 옵션 추가',
  },
}

function nextLocalId(options: BranchSeriesOption[]) {
  return Math.min(0, ...options.map((option) => option.id)) - 1
}

function sortOptions(options: BranchSeriesOption[]) {
  const order: Record<BranchSeriesGroup, number> = { public: 0, career: 1 }
  return [...options].sort((left, right) => {
    const groupCompare = order[left.group_key] - order[right.group_key]
    if (groupCompare !== 0) return groupCompare
    const displayCompare = left.display_order - right.display_order
    if (displayCompare !== 0) return displayCompare
    return left.id - right.id
  })
}

export function BranchSeriesOptionsEditor({
  value,
  onChange,
}: BranchSeriesOptionsEditorProps) {
  function updateOption(id: number, patch: Partial<BranchSeriesOption>) {
    let next = value.map((option) => (
      option.id === id ? { ...option, ...patch } : option
    ))

    const updated = next.find((option) => option.id === id)
    if (patch.is_default && updated) {
      next = next.map((option) => ({
        ...option,
        is_default: option.id === id,
        is_active: option.id === id ? true : option.is_active,
      }))
    }

    onChange(sortOptions(next))
  }

  function addOption(group: BranchSeriesGroup) {
    const groupOptions = value.filter((option) => option.group_key === group)
    const hasDefault = value.some((option) => option.is_default)
    const id = nextLocalId(value)
    const option: BranchSeriesOption = {
      id,
      branch_id: 0,
      group_key: group,
      label: group === 'public' ? `공채 ${groupOptions.length + 1}` : `경채 ${groupOptions.length + 1}`,
      is_default: !hasDefault && group === 'public',
      is_active: true,
      display_order: groupOptions.length * 10,
      created_at: '',
      updated_at: '',
    }

    onChange(sortOptions([...value, option]))
  }

  function moveOption(id: number, direction: -1 | 1) {
    const target = value.find((option) => option.id === id)
    if (!target) {
      return
    }

    const sameGroup = sortOptions(value.filter((option) => option.group_key === target.group_key))
    const index = sameGroup.findIndex((option) => option.id === id)
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= sameGroup.length) {
      return
    }

    const reordered = [...sameGroup]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(swapIndex, 0, moved)

    const orderById = new Map(reordered.map((option, order) => [option.id, order * 10]))
    onChange(sortOptions(value.map((option) => (
      orderById.has(option.id)
        ? { ...option, display_order: orderById.get(option.id) ?? option.display_order }
        : option
    ))))
  }

  return (
    <div className="grid gap-4">
      {(['public', 'career'] as const).map((group) => {
        const options = sortOptions(value.filter((option) => option.group_key === group))

        return (
          <section key={group} className="rounded-[8px] border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-[#1d1d1f]">{GROUP_META[group].title}</h4>
                <p className="mt-1 text-xs text-slate-500">{GROUP_META[group].description}</p>
              </div>
              <button
                type="button"
                onClick={() => addOption(group)}
                className="inline-flex items-center gap-1.5 rounded-[8px] bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                <Plus className="h-3.5 w-3.5" />
                {GROUP_META[group].addLabel}
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {options.map((option, index) => (
                <div
                  key={option.id}
                  className={`grid gap-2 rounded-[8px] border px-3 py-3 md:grid-cols-[1fr,auto,auto,auto] md:items-center ${
                    option.is_active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 text-slate-400'
                  }`}
                >
                  <input
                    value={option.label}
                    onChange={(event) => updateOption(option.id, { label: event.target.value })}
                    className="min-w-0 rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0071e3]"
                  />

                  <label className="inline-flex items-center gap-2 rounded-[8px] bg-[#f5f5f7] px-3 py-2 text-xs font-semibold text-slate-700">
                    <input
                      type="radio"
                      name="branch-series-default"
                      checked={option.is_default}
                      onChange={() => updateOption(option.id, { is_default: true, is_active: true })}
                    />
                    기본
                  </label>

                  <button
                    type="button"
                    disabled={option.is_default}
                    title={option.is_default ? '기본 직렬은 비활성화할 수 없습니다.' : undefined}
                    onClick={() => updateOption(option.id, { is_active: !option.is_active })}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold ${
                      option.is_active
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {option.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    {option.is_active ? '활성' : '비활성'}
                  </button>

                  <div className="flex gap-1 md:justify-end">
                    <button
                      type="button"
                      aria-label="위로 이동"
                      disabled={index === 0}
                      onClick={() => moveOption(option.id, -1)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="아래로 이동"
                      disabled={index === options.length - 1}
                      onClick={() => moveOption(option.id, 1)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
