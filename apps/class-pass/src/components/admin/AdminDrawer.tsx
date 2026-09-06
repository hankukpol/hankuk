'use client'

import * as React from 'react'
import { useId, type FormEventHandler } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AdminPortal } from './AdminPortal'
import { AdminDialogClose } from './AdminDialogClose'
import { useModalDialog } from './useModalDialog'
import { useMotionConfig, useReducedMotionDuration } from '@/lib/motion'

type SurfaceProps = {
  children: React.ReactNode
  labelledBy: string
  onClose: () => void
  closeDisabled?: boolean
  closeOnBackdrop?: boolean
  priority?: number
  onSubmit?: FormEventHandler<HTMLFormElement>
  className?: string
}

/** Mounted inside AnimatePresence: locks and focus restoration outlive the exit animation. */
export function AdminDrawerSurface({ children, labelledBy, onClose, closeDisabled = false,
  closeOnBackdrop = true, priority = 100, onSubmit, className = '' }: SurfaceProps) {
  const config = useMotionConfig()
  const duration = useReducedMotionDuration(0.2)
  const ref = useModalDialog<HTMLElement>({ open: true, onClose, closeDisabled, priority })
  const panelProps = {
    role: 'dialog', 'aria-modal': true as const, 'aria-labelledby': labelledBy,
    'aria-busy': closeDisabled, tabIndex: -1,
    className: `admin-drawer-panel absolute inset-y-0 right-0 flex flex-col overflow-hidden ${className}`,
    initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' }, transition: config.drawer,
  }
  return <motion.div className="admin-dialog-backdrop fixed inset-0" style={{ zIndex: priority }}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration }}
    onClick={event => {
      event.stopPropagation()
      if (closeOnBackdrop && !closeDisabled && event.target === event.currentTarget) onClose()
    }}>
    {onSubmit
      ? <motion.form {...panelProps} ref={ref} onSubmit={onSubmit}><>{children}</></motion.form>
      : <motion.aside {...panelProps} ref={ref}><>{children}</></motion.aside>}
  </motion.div>
}

type Props = Omit<SurfaceProps, 'labelledBy'> & {
  open: boolean
  title: string
  description?: React.ReactNode
  badge?: string
  footer?: React.ReactNode
}

/** Use under a caller's AnimatePresence when the entire editor mounts per selected record. */
export function AdminDrawerPanel({ title, description, badge, footer, children, ...props }: Omit<Props, 'open'>) {
  const titleId = useId()
  return (
    <AdminDrawerSurface key={titleId} {...props} labelledBy={titleId}>
      <header className="admin-dialog-header">
        <div className="min-w-0">
          {badge ? <p className="mb-2">{badge}</p> : null}
          <h2 id={titleId} className="admin-dialog-title">{title}</h2>
          {description ? <div className="admin-drawer-description mt-2">{description}</div> : null}
        </div>
        <AdminDialogClose disabled={props.closeDisabled} onClick={props.onClose} />
      </header>
      <div className="admin-dialog-body min-h-0 flex-1">{children}</div>
      {footer != null ? <footer className="admin-dialog-footer">{footer}</footer> : null}
    </AdminDrawerSurface>
  )
}

/** Standard controlled admin editor/detail shell. Business state stays with callers. */
export function AdminDrawer({ open, ...props }: Props) {
  return <AdminPortal><AnimatePresence>{open ? <AdminDrawerPanel {...props} /> : null}</AnimatePresence></AdminPortal>
}
