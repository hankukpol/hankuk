import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

export type SortDirection = 'asc' | 'desc'

export type SortState<K extends string> = {
  key: K | null
  dir: SortDirection
}

export function useSortState<K extends string>(defaultKey?: K, defaultDir: SortDirection = 'asc') {
  const [sort, setSort] = useState<SortState<K>>({
    key: defaultKey ?? null,
    dir: defaultDir,
  })

  const toggle = (key: K) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return { key: null, dir: 'asc' }
    })
  }

  return { sort, toggle }
}

export function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T | null,
  dir: SortDirection,
): T[] {
  if (!key) return rows
  return [...rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const cmp =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'ko', { numeric: true })
    return dir === 'asc' ? cmp : -cmp
  })
}

type SortableHeaderProps<K extends string> = {
  label: string
  sortKey: K
  sort: SortState<K>
  onSort: (key: K) => void
  className?: string
  align?: 'left' | 'right'
}

export function SortableHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className = '',
  align = 'left',
}: SortableHeaderProps<K>) {
  const active = sort.key === sortKey
  const Icon = active ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown

  return (
    <th
      className={`cursor-pointer select-none whitespace-nowrap ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-0.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        <Icon
          className={`h-3.5 w-3.5 shrink-0 transition-colors ${active ? 'text-blue-500' : 'text-slate-300'}`}
        />
      </span>
    </th>
  )
}
