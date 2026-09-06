'use client'

import { useId } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useModalDialog } from '@/components/admin/useModalDialog'
import { AdminDialogClose } from '@/components/admin/AdminDialogClose'
import { useMotionConfig, useReducedMotionDuration } from '@/lib/motion'
import type { PinRevealState } from './students-page-types'

type PinRevealModalProps = {
  reveal: PinRevealState | null
  onClose: () => void
  onCopyPin: (pin: string) => void
}

export function PinRevealModal({ reveal, onClose, onCopyPin }: PinRevealModalProps) {
  const titleId = useId()
  const motionConfig = useMotionConfig()
  const backdropDuration = useReducedMotionDuration(0.2)
  const dialogRef = useModalDialog<HTMLDivElement>({
    open: Boolean(reveal),
    onClose,
    priority: 50,
  })

  return (
    <AnimatePresence>
      {reveal ? (
        <motion.div
          className="admin-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5 sm:backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: backdropDuration }}
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="admin-dialog-panel w-full max-w-lg bg-white"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={motionConfig.modal}
            onClick={(event) => event.stopPropagation()}
          >
        <div className="admin-dialog-header">
          <h3 id={titleId} className="admin-dialog-title min-w-0">{reveal.title}</h3>
          <AdminDialogClose onClick={onClose} />
        </div>
        <div className="admin-dialog-body">
        <p className="admin-notice admin-notice-warning">
          PIN은 지금 이 순간에만 표시됩니다. 필요하면 바로 복사해 주세요.
        </p>
        {/* 명단을 그대로 옮겨 적는 자리라 표로 읽는다. 발급 대상이 여러 명이면 세로로만 길어진다. */}
        <div className="admin-table-frame admin-pin-scroll mt-4">
          <table className="w-full">
            <thead>
              <tr>
                <th>이름</th>
                <th>연락처</th>
                <th>PIN</th>
                <th>복사</th>
              </tr>
            </thead>
            <tbody>
              {reveal.pins.map((entry) => (
                <tr key={`${entry.name}-${entry.phone}-${entry.pin}`}>
                  <td className="admin-table-name">{entry.name}</td>
                  <td>{entry.phone}</td>
                  <td className="admin-pin-code">{entry.pin}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-button"
                      aria-label={`${entry.name} PIN 복사`}
                      onClick={() => void onCopyPin(entry.pin)}
                    >
                      복사
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
