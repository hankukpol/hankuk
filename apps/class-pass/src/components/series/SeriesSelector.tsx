'use client'

import { useEffect, useMemo } from 'react'
import type { BranchSeriesGroup, BranchSeriesOption } from '@/types/database'

type SeriesSelectorProps = {
  options: BranchSeriesOption[]
  valueId: number | null
  onChange: (optionId: number | null) => void
  disabled?: boolean
}

function getDefaultOption(options: BranchSeriesOption[]) {
  return (
    options.find((option) => option.is_default)
    ?? options.find((option) => option.group_key === 'public')
    ?? options[0]
    ?? null
  )
}

export function SeriesSelector({
  options,
  valueId,
  onChange,
  disabled = false,
}: SeriesSelectorProps) {
  const activeOptions = useMemo(
    () => options.filter((option) => option.is_active),
    [options],
  )
  const publicOptions = activeOptions.filter((option) => option.group_key === 'public')
  const careerOptions = activeOptions.filter((option) => option.group_key === 'career')
  const fallbackOption = getDefaultOption(activeOptions)
  const selectedOption = activeOptions.find((option) => option.id === valueId) ?? fallbackOption
  const selectedGroup = selectedOption?.group_key ?? 'public'
  const selectableOptions = selectedGroup === 'career' ? careerOptions : publicOptions

  useEffect(() => {
    if (!valueId && fallbackOption) {
      onChange(fallbackOption.id)
    }
  }, [fallbackOption, onChange, valueId])

  function selectGroup(group: BranchSeriesGroup) {
    const candidates = group === 'career' ? careerOptions : publicOptions
    const nextOption = group === 'public'
      ? candidates.find((option) => option.is_default) ?? candidates[0]
      : candidates[0]

    if (nextOption) {
      onChange(nextOption.id)
    }
  }

  if (activeOptions.length === 0) {
    return (
      <p className="admin-notice admin-notice-warning">
        활성화된 직렬 옵션이 없습니다. 지점 설정에서 먼저 직렬을 추가해 주세요.
      </p>
    )
  }

  const showDropdown = selectableOptions.length > 1 || selectedGroup === 'career'

  return (
    <div className="flex min-w-0 flex-wrap items-stretch gap-2">
      <div role="group" aria-label="직렬" className="admin-choice-group inline-flex shrink-0 gap-0.5 rounded-[10px] border border-slate-200 bg-slate-100 p-0.5">
        {([
          ['public', '공채', publicOptions.length === 0],
          ['career', '경채', careerOptions.length === 0],
        ] as const).map(([group, label, groupDisabled]) => (
          <button
            key={group}
            type="button"
            disabled={disabled || groupDisabled}
            onClick={() => selectGroup(group)}
            aria-pressed={selectedGroup === group}
            className={`admin-choice-button rounded-[7px] px-4 py-1.5 text-sm font-semibold transition-all duration-200 ease-ios active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${
              selectedGroup === group
                ? 'bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'text-slate-500 hover:text-[#1d1d1f]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {showDropdown ? (
        <select
          aria-label="세부 직렬"
          value={selectedOption?.id ?? ''}
          disabled={disabled || selectableOptions.length === 0}
          onChange={(event) => onChange(Number(event.target.value) || null)}
          className="admin-series-option min-w-[160px] flex-1 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-slate-400 disabled:bg-slate-50"
        >
          {selectableOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}
