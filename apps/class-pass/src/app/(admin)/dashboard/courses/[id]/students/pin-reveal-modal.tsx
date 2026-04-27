'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMotionConfig, useReducedMotionDuration } from '@/lib/motion'
import type { PinRevealState } from './students-page-types'

type PinRevealModalProps = {
  reveal: PinRevealState | null
  onClose: () => void
  onCopyPin: (pin: string) => void
}

export function PinRevealModal({ reveal, onClose, onCopyPin }: PinRevealModalProps) {
  const motionConfig = useMotionConfig()
  const backdropDuration = useReducedMotionDuration(0.2)

  useEffect(() => {
    if (!reveal) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, reveal])

  return (
    <AnimatePresence>
      {reveal ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5 sm:backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: backdropDuration }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-5 shadow-xl"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={motionConfig.modal}
            onClick={(event) => event.stopPropagation()}
          >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">{reveal.title}</h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 transition-all duration-200 ease-ios hover:text-gray-700 active:scale-[0.97]">
            닫기
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          PIN은 지금 이 순간에만 표시됩니다. 필요하면 바로 복사해 주세요.
        </p>
        <div className="mt-4 flex max-h-[50dvh] flex-col gap-3 overflow-y-auto">
          {reveal.pins.map((entry) => (
            <div key={`${entry.name}-${entry.phone}-${entry.pin}`} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{entry.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{entry.phone}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void onCopyPin(entry.pin)}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97]"
                >
                  복사
                </button>
              </div>
              <p className="mt-3 font-mono text-2xl font-black tracking-[0.2em] text-slate-900">{entry.pin}</p>
            </div>
          ))}
        </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
