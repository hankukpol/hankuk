'use client'

import { X } from 'lucide-react'
import { useEffect } from 'react'

type SeatEditModalProps = {
  open: boolean
  title: string
  badge?: string
  description?: string
  widthClassName?: string
  children: unknown
  onClose: () => void
}

export function SeatEditModal({
  open,
  title,
  badge,
  description,
  widthClassName = 'max-w-md',
  children,
  onClose,
}: SeatEditModalProps) {
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="모달 닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 flex w-full flex-col overflow-hidden rounded-[10px] border border-[#d2d2d7] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.18)] ${widthClassName}`}
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
      >
        <div className="shrink-0 border-b border-[#d2d2d7] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {badge ? (
                <span className="inline-flex rounded-[6px] border border-[#d2d2d7] bg-white px-3 py-1 text-xs font-semibold text-[#86868b]">
                  {badge}
                </span>
              ) : null}
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[#1d1d1f]">{title}</h2>
              {description ? (
                <p className="mt-2 text-sm leading-6 text-[#86868b]">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-[#d2d2d7] text-[#6e6e73] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-xs font-medium text-[#86868b]">ESC 키로 바로 닫을 수 있습니다.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {children as never}
        </div>
      </div>
    </div>
  )
}
