'use client'

import { useMemo } from 'react'
import type { DesignatedSeat } from '@/types/database'
import { sortSeats } from '@/lib/designated-seat/layout'

type SeatStudentInfo = {
  name: string
  exam_number?: string | null
  reserved_at?: string | null
}

type SeatGridProps = {
  columns: number
  rows: number
  aisleColumns?: number[]
  seats: DesignatedSeat[]
  occupiedSeatIds?: number[]
  currentSeatId?: number | null
  selectedSeatId?: number | null
  selectedSeatIds?: ReadonlySet<number>
  seatStudentMap?: ReadonlyMap<number, SeatStudentInfo>
  onSeatClick?: (seat: DesignatedSeat, shiftKey: boolean) => void
  mode?: 'student' | 'admin'
}

function uniqueSorted(values: number[] | undefined) {
  return Array.from(new Set(values ?? [])).sort((left, right) => left - right)
}

export function SeatGrid({
  columns,
  rows,
  aisleColumns,
  seats,
  occupiedSeatIds,
  currentSeatId,
  selectedSeatId,
  selectedSeatIds,
  seatStudentMap,
  onSeatClick,
  mode = 'student',
}: SeatGridProps) {
  const seatMap = useMemo(
    () => new Map(sortSeats(seats).map((seat) => [`${seat.position_x}:${seat.position_y}`, seat])),
    [seats],
  )
  const occupied = useMemo(() => new Set(occupiedSeatIds ?? []), [occupiedSeatIds])
  const aisles = useMemo(() => uniqueSorted(aisleColumns), [aisleColumns])

  // Build column mapping: each logical column gets a grid column index.
  // After each aisle column, insert an extra narrow gap column.
  const columnMapping = useMemo(() => {
    const map = new Map<number, number>()
    let gridCol = 1
    for (let x = 1; x <= columns; x += 1) {
      map.set(x, gridCol)
      gridCol += 1
      if (aisles.includes(x)) {
        gridCol += 1 // skip a column for aisle gap
      }
    }
    return { map, totalGridColumns: gridCol - 1 }
  }, [columns, aisles])

  const templateColumns = useMemo(() => {
    const minSize = mode === 'admin' ? 'minmax(0, 1fr)' : 'minmax(40px, 1fr)'
    const parts: string[] = []
    for (let x = 1; x <= columns; x += 1) {
      parts.push(minSize)
      if (aisles.includes(x) && x < columns) {
        parts.push('12px')
      }
    }
    return parts.join(' ')
  }, [columns, aisles, mode])

  const items: Array<JSX.Element> = []

  for (let y = 1; y <= rows; y += 1) {
    for (let x = 1; x <= columns; x += 1) {
      const gridColStart = columnMapping.map.get(x) ?? x

      const seat = seatMap.get(`${x}:${y}`)
      if (!seat) {
        items.push(
          <div
            key={`empty:${x}:${y}`}
            className={`rounded-lg border border-dashed border-slate-200 bg-slate-50/60 ${mode === 'admin' ? 'aspect-square' : 'h-10'}`}
            style={{ gridColumnStart: gridColStart }}
          />,
        )
        continue
      }

      const isMine = currentSeatId === seat.id
      const isSelected = selectedSeatId === seat.id || (selectedSeatIds?.has(seat.id) ?? false)
      const isOccupied = occupied.has(seat.id) && !isMine
      const isInactive = !seat.is_active
      const studentInfo = seatStudentMap?.get(seat.id)
      const clickable = Boolean(onSeatClick) && (mode === 'admin' || !isOccupied)

      const sizeClass = mode === 'admin' ? 'aspect-square' : 'h-10'
      let className = `flex ${sizeClass} flex-col items-center justify-center rounded-lg border px-1 text-center transition `
      if (isSelected) {
        className += 'border-slate-950 bg-slate-950 text-white shadow-lg '
      } else if (isMine) {
        className += 'border-emerald-500 bg-emerald-500 text-white shadow-sm '
      } else if (isOccupied) {
        className += mode === 'admin'
          ? 'border-blue-200 bg-blue-50 text-slate-700 '
          : 'border-slate-200 bg-slate-200 text-slate-500 '
      } else if (isInactive) {
        className += 'border-dashed border-slate-300 bg-slate-100 text-slate-400 '
      } else {
        className += clickable
          ? 'border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50 '
          : 'border-slate-200 bg-white text-slate-800 '
      }

      items.push(
        <button
          key={seat.id}
          type="button"
          onClick={(event) => {
            if (clickable) {
              onSeatClick?.(seat, event.shiftKey)
            }
          }}
          disabled={!clickable}
          className={className}
          style={{ gridColumnStart: gridColStart }}
        >
          {mode === 'student' ? (
            isOccupied ? (
              <span className="text-[10px] font-bold text-slate-400">×</span>
            ) : isMine ? (
              <>
                <span className="text-[10px] font-bold leading-tight">{seat.label}</span>
                <span className="text-[8px] leading-tight">내 좌석</span>
              </>
            ) : (
              <span className="text-[10px] font-bold leading-tight opacity-80">{seat.label}</span>
            )
          ) : (
            <>
              <span className="text-[11px] font-bold leading-tight opacity-80">{seat.label}</span>
              {studentInfo ? (
                <div className="mt-0.5 min-w-0 text-center">
                  <p className="truncate text-[11px] font-semibold leading-tight">{studentInfo.name}</p>
                  {studentInfo.reserved_at ? (
                    <p className="mt-0.5 truncate text-[9px] opacity-60">
                      {new Date(studentInfo.reserved_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  ) : studentInfo.exam_number ? (
                    <p className="mt-0.5 truncate text-[10px] opacity-70">{studentInfo.exam_number}</p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-0.5 text-[10px] font-semibold leading-tight">
                  {isMine ? '내 좌석' : isSelected ? '선택' : isOccupied ? '배정됨' : isInactive ? '비활성' : '공석'}
                </div>
              )}
            </>
          )}
        </button>,
      )
    }
  }

  return (
    <div className="space-y-3">
      {mode === 'admin' ? (
        <div className="rounded-xl border border-slate-200 bg-white py-2 text-center text-sm font-medium text-slate-500">
          칠판
        </div>
      ) : null}

      <div
        className={`grid gap-1 sm:gap-1.5 ${mode === 'student' ? 'overflow-x-auto' : 'gap-1.5 sm:gap-2'}`}
        style={{ gridTemplateColumns: templateColumns }}
      >
        {items}
      </div>

      {mode === 'admin' ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-blue-200 bg-blue-50" />
            배정 학생
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-slate-200 bg-white" />
            공석
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-dashed border-slate-300 bg-slate-100" />
            비활성
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-slate-950 bg-slate-950" />
            선택됨
          </span>
        </div>
      ) : null}
    </div>
  )
}
